import OpenAI from "openai";
import _ from "lodash";
import dayjs from "dayjs";
import fs from "fs";
import path from "path";
import chalk from "chalk";
import { createInterface } from "readline/promises";
import { stdin as input, stdout as output } from "process";

import toolsRegister from "./tools.ts";

/**
 * =========================================================
 * OpenAI Client
 * =========================================================
 */

const client = new OpenAI({
  apiKey: "ollama",
  baseURL: "http://127.0.0.1:8080",
});

/**
 * Tool Calling 最大轮数
 */
const MAX_TOOL_ROUNDS = 10;

/**
 * =========================================================
 * Lodash Template
 * =========================================================
 */

_.templateSettings.interpolate = /{{([\s\S]+?)}}/g;

/**
 * =========================================================
 * System Prompt
 * =========================================================
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
 * =========================================================
 * Tool Call 类型
 * =========================================================
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
 * =========================================================
 * 查找工具
 * =========================================================
 */

function findTool(name: string) {
  return toolsRegister.find(
    (tool) => tool.type === "function" && tool.function.name === name,
  );
}

/**
 * =========================================================
 * 执行 Tool
 * =========================================================
 */

async function executeTool(
  toolCall: ToolCall,
  userMessage: string,
): Promise<OpenAI.ChatCompletionToolMessageParam> {
  /**
   * 查找工具
   */

  const tool = findTool(toolCall.function.name);

  /**
   * 工具不存在
   */

  if (!tool) {
    console.error(chalk.red(`\n工具不存在: ${toolCall.function.name}`));

    return {
      role: "tool",

      tool_call_id: toolCall.id,

      content: JSON.stringify({
        success: false,

        error: `工具 ${toolCall.function.name} 不存在`,
      }),
    };
  }

  /**
   * =====================================================
   * 解析参数
   * =====================================================
   */

  let args: any;

  try {
    args = JSON.parse(toolCall.function.arguments || "{}");
  } catch (error) {
    console.error(chalk.red(`\n工具参数解析失败:`));

    console.error(chalk.gray(toolCall.function.arguments));

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

  /**
   * =====================================================
   * 打印 Tool
   * =====================================================
   */

  console.log();

  console.log(chalk.cyan("┌──────────────────────────────────────"));

  console.log(chalk.cyan(`│ 🔧 Tool: ${toolCall.function.name}`));

  console.log(chalk.cyan("└──────────────────────────────────────"));

  console.log(chalk.gray(JSON.stringify(args, null, 2)));

  /**
   * =====================================================
   * 执行 Tool
   * =====================================================
   */

  try {
    const result = await (tool as any).callback(args, userMessage);

    /**
     * 打印结果
     */

    console.log(chalk.green(`\n✓ Tool 执行成功: ${toolCall.function.name}`));

    console.log(chalk.gray(JSON.stringify(result, null, 2)));

    /**
     * 返回 Tool Message
     */

    return {
      role: "tool",

      tool_call_id: toolCall.id,

      content: JSON.stringify(result),
    };
  } catch (error) {
    /**
     * Tool 执行失败
     */

    console.error(chalk.red(`\n✗ Tool 执行失败: ${toolCall.function.name}`));

    console.error(chalk.red(String(error)));

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
 * =========================================================
 * 收集 Stream
 *
 * 处理：
 *
 * content
 * reasoning_content
 * tool_calls
 * =========================================================
 */

async function collectStream(
  response: AsyncIterable<OpenAI.ChatCompletionChunk>,
) {
  /**
   * Tool Calls
   *
   * key = tool index
   */

  const tools = new Map<number, ToolCall>();

  /**
   * 普通文本
   */

  let content = "";

  /**
   * Reasoning
   */

  let reasoningContent = "";

  /**
   * =====================================================
   * Stream
   * =====================================================
   */

  for await (const chunk of response) {
    const delta = chunk.choices[0]?.delta;

    if (!delta) {
      continue;
    }

    /**
     * ===================================================
     * 普通文本
     * ===================================================
     */

    if (delta.content) {
      content += delta.content;

      process.stdout.write(delta.content);
    }

    /**
     * ===================================================
     * Reasoning
     * ===================================================
     */

    const reasoning = (delta as any).reasoning_content;

    if (reasoning) {
      reasoningContent += reasoning;

      process.stdout.write(chalk.gray(reasoning));
    }

    /**
     * ===================================================
     * Tool Calls
     * ===================================================
     */

    if (delta.tool_calls) {
      for (const toolCall of delta.tool_calls) {
        /**
         * Tool index
         */

        const index = toolCall.index ?? 0;

        /**
         * 当前 Tool
         */

        let current = tools.get(index);

        /**
         * =================================================
         * 第一个 Chunk
         * =================================================
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
         * =================================================
         * 后续 Chunk
         * =================================================
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

  /**
   * =====================================================
   * 返回
   * =====================================================
   */

  return {
    content,

    reasoningContent,

    toolCalls: [...tools.values()],
  };
}

/**
 * =========================================================
 * Agent
 *
 * 一次用户输入可能触发：
 *
 * User
 * ↓
 * Assistant Tool Call
 * ↓
 * Tool
 * ↓
 * Assistant Tool Call
 * ↓
 * Tool
 * ↓
 * Assistant 最终回答
 * =========================================================
 */

async function runAgent(
  messages: OpenAI.ChatCompletionMessageParam[],
  userMessage: string,
): Promise<string> {
  /**
   * =====================================================
   * Tool Calling Loop
   * =====================================================
   */

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    console.log();

    console.log(chalk.blue(`========== Tool Round ${round + 1} ==========`));

    /**
     * ===================================================
     * 请求模型
     * ===================================================
     */

    const response = await client.chat.completions.create({
      model: "qwen3-0.6b-q4_k_m",

      /**
       * 非常重要：
       *
       * system 只放一次
       * 后面的 messages 是完整历史
       */

      messages: [
        {
          role: "system",

          content: systemPrompt,
        },

        ...messages,
      ],

      /**
       * Tools
       */

      tools: toolsRegister,

      /**
       * 自动决定是否调用 Tool
       */

      tool_choice: "auto",

      /**
       * Stream
       */

      stream: true,
    });

    /**
     * ===================================================
     * 收集 Stream
     * ===================================================
     */

    const result = await collectStream(response);

    /**
     * ===================================================
     * 没有 Tool Call
     *
     * 说明模型已经完成回答
     * ===================================================
     */

    if (result.toolCalls.length === 0) {
      /**
       * 保存 Assistant 最终回答
       *
       * 这是实现多轮上下文最关键的一步
       */

      messages.push({
        role: "assistant",

        content: result.content,
      });

      console.log();

      console.log(chalk.green("\n========== Assistant =========="));

      return result.content;
    }

    /**
     * ===================================================
     * Tool Calls
     * ===================================================
     */

    console.log();

    console.log(chalk.yellow("\n========== Tool Calls =========="));

    console.log(JSON.stringify(result.toolCalls, null, 2));

    /**
     * ===================================================
     * 构造 Assistant Tool Call
     * ===================================================
     *
     * OpenAI Tool Calling 的消息顺序必须是：
     *
     * assistant
     * ↓
     * tool
     *
     * 不能直接把 tool 丢给模型。
     */

    const assistantMessage: OpenAI.ChatCompletionAssistantMessageParam = {
      role: "assistant",

      /**
       * 如果模型同时产生普通文本
       * 也要保留
       */

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

    /**
     * ===================================================
     * 保存 Assistant Tool Call
     * ===================================================
     */

    messages.push(assistantMessage);

    /**
     * ===================================================
     * 并行执行 Tool
     * ===================================================
     */

    const toolResults = await Promise.all(
      result.toolCalls.map((toolCall) => executeTool(toolCall, userMessage)),
    );

    /**
     * ===================================================
     * 保存 Tool Result
     * ===================================================
     */

    messages.push(...toolResults);

    /**
     * ===================================================
     * 下一轮
     * ===================================================
     */
  }

  /**
   * =====================================================
   * 超过最大 Tool Calling
   * =====================================================
   */

  throw new Error(`Tool Calling 超过最大轮数 ${MAX_TOOL_ROUNDS}`);
}

/**
 * =========================================================
 * CLI
 * =========================================================
 */

const rl = createInterface({
  input,

  output,

  terminal: true,
});

/**
 * =========================================================
 * 会话历史
 *
 * 整个程序生命周期只创建一次
 *
 * 所有用户输入都保存在这里
 * =========================================================
 */

const messages: OpenAI.ChatCompletionMessageParam[] = [];

/**
 * =========================================================
 * 打印 Banner
 * =========================================================
 */

function printBanner() {
  console.log();

  console.log(chalk.cyan("╔════════════════════════════════════════════╗"));

  console.log(chalk.cyan("║                                            ║"));

  console.log(chalk.cyan("║          🤖 Local AI Agent CLI             ║"));

  console.log(chalk.cyan("║                                            ║"));

  console.log(chalk.cyan("╚════════════════════════════════════════════╝"));

  console.log();

  console.log(chalk.gray("输入 /help 查看帮助"));
}

/**
 * =========================================================
 * Help
 * =========================================================
 */

function printHelp() {
  console.log();

  console.log(chalk.cyan("可用命令:"));

  console.log();

  console.log(chalk.gray("  /help"), "      查看帮助");

  console.log(chalk.gray("  /clear"), "     清空当前会话");

  console.log(chalk.gray("  /history"), "   查看历史消息");

  console.log(chalk.gray("  /exit"), "      退出程序");

  console.log(chalk.gray("  /quit"), "      退出程序");

  console.log();
}

/**
 * =========================================================
 * 打印历史
 * =========================================================
 */

function printHistory() {
  console.log();

  console.log(chalk.cyan(`当前共有 ${messages.length} 条消息`));

  console.log();

  messages.forEach((message, index) => {
    console.log(chalk.gray(`[${index}]`), chalk.yellow(message.role));

    /**
     * Assistant Tool Calls
     */

    if (
      message.role === "assistant" &&
      "tool_calls" in message &&
      message.tool_calls
    ) {
      console.log(chalk.gray(JSON.stringify(message.tool_calls, null, 2)));

      return;
    }

    /**
     * 普通 Content
     */

    if ("content" in message) {
      console.log(
        chalk.gray(
          typeof message.content === "string"
            ? message.content
            : JSON.stringify(message.content),
        ),
      );
    }

    console.log();
  });
}

/**
 * =========================================================
 * Main
 * =========================================================
 */

async function main() {
  /**
   * Banner
   */

  printBanner();

  /**
   * =======================================================
   * 无限等待用户输入
   * =======================================================
   */

  while (true) {
    try {
      /**
       * ===================================================
       * 输入
       * ===================================================
       */

      const userInput = await rl.question(chalk.green("\nYou › "));

      const text = userInput.trim();

      /**
       * ===================================================
       * 空输入
       * ===================================================
       */

      if (!text) {
        continue;
      }

      /**
       * ===================================================
       * Exit
       * ===================================================
       */

      if (text === "/exit" || text === "/quit") {
        break;
      }

      /**
       * ===================================================
       * Help
       * ===================================================
       */

      if (text === "/help") {
        printHelp();

        continue;
      }

      /**
       * ===================================================
       * Clear
       * ===================================================
       */

      if (text === "/clear") {
        messages.length = 0;

        console.log();

        console.log(chalk.yellow("✓ 会话历史已清空"));

        continue;
      }

      /**
       * ===================================================
       * History
       * ===================================================
       */

      if (text === "/history") {
        printHistory();

        continue;
      }

      /**
       * ===================================================
       * 保存 User Message
       * ===================================================
       *
       * 注意：
       *
       * 这里保存一次。
       *
       * runAgent 内部不要再保存 User。
       */

      messages.push({
        role: "user",

        content: text,
      });

      /**
       * ===================================================
       * 执行 Agent
       * ===================================================
       */

      await runAgent(messages, text);
    } catch (error) {
      /**
       * ===================================================
       * 单轮错误
       *
       * 不退出整个 CLI
       * ===================================================
       */

      console.error();

      console.error(chalk.red("Agent Error:"));

      console.error(chalk.red(String(error)));
    }
  }

  /**
   * =======================================================
   * 关闭 readline
   * =======================================================
   */

  rl.close();

  console.log();

  console.log(chalk.gray("Bye 👋"));
}

/**
 * =========================================================
 * 启动程序
 *
 * 注意：
 *
 * 这里没有顶层 await
 * =========================================================
 */

main().catch((error) => {
  console.error();

  console.error(chalk.red("程序异常:"));

  console.error(chalk.red(String(error)));

  process.exit(1);
});
