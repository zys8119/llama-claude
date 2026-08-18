import OpenAI from "openai";
import _ from "lodash";
import dayjs from "dayjs";
import fs from "fs";
import path from "path";
import chalk from "chalk";
import { createInterface } from "readline/promises";
import { stdin as input, stdout as output } from "process";

import toolsRegister from "./tools.ts";

const client = new OpenAI({
  apiKey: "ollama",
  baseURL: "http://127.0.0.1:8080",
});

const MAX_TOOL_ROUNDS = 10;

_.templateSettings.interpolate = /{{([\s\S]+?)}}/g;

/**
 * =========================
 * System Prompt
 * =========================
 */

const systemPrompt = _.template(
  fs
    .readFileSync("./system.md", "utf-8")
    .split("\n")
    .map((line) => line.trim())
    .join("\n"),
)({
  current_time: dayjs().format("YYYY-MM-DD HH:mm:ss"),
  project_dir: path.resolve(import.meta.dirname, "./dist"),
});

/**
 * =========================
 * 类型
 * =========================
 */

type ToolCall = {
  index: number;
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
};

/**
 * =========================
 * 查找工具
 * =========================
 */

function findTool(name: string) {
  return toolsRegister.find(
    (tool) => tool.type === "function" && tool.function.name === name,
  );
}

/**
 * =========================
 * 执行工具
 * =========================
 */

async function executeTool(
  toolCall: ToolCall,
  userMessage: string,
): Promise<OpenAI.ChatCompletionToolMessageParam> {
  const tool = findTool(toolCall.function.name);

  if (!tool) {
    return {
      role: "tool",
      tool_call_id: toolCall.id,
      content: JSON.stringify({
        success: false,
        error: `工具 ${toolCall.function.name} 不存在`,
      }),
    };
  }

  let args: any;

  try {
    args = JSON.parse(toolCall.function.arguments || "{}");
  } catch {
    console.error(
      chalk.red(`\n工具参数解析失败: ${toolCall.function.arguments}`),
    );

    return {
      role: "tool",
      tool_call_id: toolCall.id,
      content: JSON.stringify({
        success: false,
        error: "工具参数 JSON 解析失败",
        arguments: toolCall.function.arguments,
      }),
    };
  }

  console.log(chalk.cyan(`\n\n调用工具: ${toolCall.function.name}`));

  console.log(chalk.gray(JSON.stringify(args, null, 2)));

  try {
    const result = await (tool as any).callback(args, userMessage);

    console.log(chalk.green(`工具执行结果: ${toolCall.function.name}`));

    console.log(chalk.gray(JSON.stringify(result, null, 2)));

    return {
      role: "tool",
      tool_call_id: toolCall.id,
      content: JSON.stringify(result),
    };
  } catch (error) {
    console.error(chalk.red(`工具执行失败: ${String(error)}`));

    return {
      role: "tool",
      tool_call_id: toolCall.id,
      content: JSON.stringify({
        success: false,
        error: String(error),
      }),
    };
  }
}

/**
 * =========================
 * Stream
 * =========================
 */

async function collectStream(
  response: AsyncIterable<OpenAI.ChatCompletionChunk>,
) {
  const tools = new Map<number, ToolCall>();

  let content = "";
  let reasoningContent = "";

  for await (const chunk of response) {
    const delta = chunk.choices[0]?.delta;

    if (!delta) {
      continue;
    }

    /**
     * 普通文本
     */
    if (delta.content) {
      content += delta.content;

      process.stdout.write(delta.content);
    }

    /**
     * Qwen reasoning
     */
    const reasoning = (delta as any).reasoning_content;

    if (reasoning) {
      reasoningContent += reasoning;

      process.stdout.write(chalk.gray(reasoning));
    }

    /**
     * Tool Calls
     */
    if (delta.tool_calls) {
      for (const toolCall of delta.tool_calls) {
        const index = toolCall.index ?? 0;

        let current = tools.get(index);

        /**
         * 第一个 chunk
         */
        if (!current) {
          current = {
            index,
            id: toolCall.id || "",
            type: "function",

            function: {
              name: toolCall.function?.name || "",

              arguments: toolCall.function?.arguments || "",
            },
          };

          tools.set(index, current);

          continue;
        }

        /**
         * 后续 chunk
         */

        if (toolCall.id) {
          current.id += toolCall.id;
        }

        if (toolCall.function?.name) {
          current.function.name += toolCall.function.name;
        }

        if (toolCall.function?.arguments) {
          current.function.arguments += toolCall.function.arguments;
        }
      }
    }
  }

  return {
    content,
    reasoningContent,
    toolCalls: [...tools.values()],
  };
}

/**
 * =========================
 * Agent
 *
 * 一次用户输入可能触发多轮 Tool Calling
 * =========================
 */

async function runAgent(
  messages: OpenAI.ChatCompletionMessageParam[],
  userMessage: string,
): Promise<string> {
  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    console.log(chalk.blue(`\n========== Tool Round ${round + 1} ==========`));

    const response = await client.chat.completions.create({
      model: "qwen3-0.6b-q4_k_m",

      messages: [
        {
          role: "system",
          content: systemPrompt,
        },
        ...messages,
      ],

      tools: toolsRegister,

      tool_choice: "auto",

      stream: true,
    });

    const result = await collectStream(response);

    /**
     * =========================
     * 没有 Tool Call
     *
     * 说明模型已经最终回答
     * =========================
     */

    if (result.toolCalls.length === 0) {
      /**
       * 非常重要：
       *
       * 把 Assistant 最终回答保存到历史
       */

      messages.push({
        role: "assistant",
        content: result.content,
      });

      console.log(chalk.green("\n\n========== Assistant =========="));

      return result.content;
    }

    /**
     * =========================
     * Tool Calls
     * =========================
     */

    console.log(chalk.yellow("\n\n========== Tool Calls =========="));

    console.log(JSON.stringify(result.toolCalls, null, 2));

    /**
     * =========================
     * 保存 Assistant Tool Call
     * =========================
     */

    const assistantMessage: OpenAI.ChatCompletionAssistantMessageParam = {
      role: "assistant",

      content: result.content || null,

      tool_calls: result.toolCalls.map((toolCall) => ({
        id: toolCall.id,

        type: "function",

        function: {
          name: toolCall.function.name,

          arguments: toolCall.function.arguments,
        },
      })),
    };

    messages.push(assistantMessage);

    /**
     * =========================
     * 执行 Tool
     * =========================
     */

    const toolResults = await Promise.all(
      result.toolCalls.map((toolCall) => executeTool(toolCall, userMessage)),
    );

    /**
     * =========================
     * 保存 Tool Result
     * =========================
     */

    messages.push(...toolResults);

    /**
     * 下一轮继续请求模型
     */
  }

  throw new Error(`Tool Calling 超过最大轮数 ${MAX_TOOL_ROUNDS}`);
}

/**
 * =========================
 * CLI
 * =========================
 */

const rl = createInterface({
  input,
  output,

  terminal: true,
});

/**
 * 整个会话历史
 *
 * 这里非常重要。
 *
 * 不要每次用户输入都重新创建。
 */

const messages: OpenAI.ChatCompletionMessageParam[] = [];

/**
 * 当前会话
 */

async function main() {
  console.log(chalk.cyan("\n╔══════════════════════════════════════╗"));

  console.log(chalk.cyan("║        Local AI Agent CLI            ║"));

  console.log(chalk.cyan("╚══════════════════════════════════════╝"));

  console.log(chalk.gray("\n输入 /help 查看命令"));

  while (true) {
    try {
      /**
       * =========================
       * 等待用户输入
       * =========================
       */

      const userMessage = await rl.question(chalk.green("\nYou › "));

      const text = userMessage.trim();

      /**
       * 空输入
       */

      if (!text) {
        continue;
      }

      /**
       * =========================
       * CLI 命令
       * =========================
       */

      if (text === "/exit" || text === "/quit") {
        break;
      }

      /**
       * 清空历史
       */

      if (text === "/clear") {
        messages.length = 0;

        console.log(chalk.yellow("✓ 会话历史已清空"));

        continue;
      }

      /**
       * 查看历史数量
       */

      if (text === "/history") {
        console.log(chalk.gray(`当前历史消息: ${messages.length}`));

        continue;
      }

      /**
       * 帮助
       */

      if (text === "/help") {
        console.log(`
${chalk.cyan("可用命令：")}

  /help      查看帮助
  /clear     清空当前会话
  /history   查看历史消息数量
  /exit      退出
        `);

        continue;
      }

      /**
       * =========================
       * 保存用户消息
       * =========================
       */

      messages.push({
        role: "user",
        content: text,
      });

      /**
       * =========================
       * Agent
       * =========================
       */

      await runAgent(messages, text);
    } catch (error) {
      console.error(chalk.red(`\nAgent Error: ${String(error)}`));
    }
  }

  rl.close();

  console.log(chalk.gray("\nBye 👋"));
}
(async () => {
  await main();
})();
