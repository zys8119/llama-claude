import OpenAI from "openai";
import _ from "lodash";
import dayjs from "dayjs";
import fs from "fs";
import path from "path";
import chalk from "chalk";
import toolsRegister from "./tools.ts";

const client = new OpenAI({
  apiKey: "ollama",
  baseURL: "http://127.0.0.1:8080",
});

const MAX_TOOL_ROUNDS = 10;

_.templateSettings.interpolate = /{{([\s\S]+?)}}/g;

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

async function executeTool(toolCall: ToolCall, userMessage: string) {
  const tool = findTool(toolCall.function.name);

  if (!tool) {
    return {
      role: "tool" as const,
      tool_call_id: toolCall.id,
      content: JSON.stringify(`工具 ${toolCall.function.name} 不存在`),
    };
  }

  let args: any;

  try {
    args = JSON.parse(toolCall.function.arguments || "{}");
  } catch (error) {
    console.error(
      chalk.red(`工具参数解析失败: ${toolCall.function.arguments}`),
    );

    return {
      role: "tool" as const,
      tool_call_id: toolCall.id,
      content: JSON.stringify({
        success: false,
        error: "工具参数 JSON 解析失败",
        arguments: toolCall.function.arguments,
      }),
    };
  }

  console.log(chalk.cyan(`\n调用工具: ${toolCall.function.name}`));

  console.log(chalk.gray(JSON.stringify(args, null, 2)));

  try {
    const result = await (tool as any).callback(args, userMessage);

    console.log(
      chalk.green(
        `工具执行结果:${toolCall.function.name}----> ${JSON.stringify(result)}`,
      ),
    );

    return {
      role: "tool" as const,
      tool_call_id: toolCall.id,
      content: JSON.stringify(result),
    };
  } catch (error) {
    console.error(chalk.red(`工具执行失败: ${error}`));

    return {
      role: "tool" as const,
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
 * 收集 Stream Tool Calls
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
     * Qwen reasoning_content
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
 * Chat
 * =========================
 */

async function chatMessage(
  systemPrompt: string,
  userMessage: string,
  messages: OpenAI.ChatCompletionMessageParam[] = [],
  round = 0,
): Promise<string> {
  /**
   * 防止无限 Tool Calling
   */
  if (round >= MAX_TOOL_ROUNDS) {
    throw new Error(`Tool Calling 超过最大轮数 ${MAX_TOOL_ROUNDS}`);
  }

  console.log(chalk.blue(`\n========== 第 ${round + 1} 轮 ==========`));

  /**
   * 当前请求消息
   */
  const requestMessages: OpenAI.ChatCompletionMessageParam[] = [
    {
      role: "system",
      content: systemPrompt,
    },
    {
      role: "user",
      content: userMessage,
    },
    ...messages,
  ];

  /**
   * 请求模型
   */
  const response = await client.chat.completions.create({
    model: "Qwen3-0.6B-Q8_0",

    tool_choice: "auto",

    tools: toolsRegister,

    messages: requestMessages,

    stream: true,
  });

  /**
   * 收集 Stream
   */
  const result = await collectStream(response);

  /**
   * 没有 Tool Call
   *
   * 说明模型已经生成最终回答
   */
  if (result.toolCalls.length === 0) {
    console.log(chalk.green("\n\n========== 最终回答 =========="));

    return result.content;
  }

  console.log(chalk.yellow("\n\n========== Tool Calls =========="));

  console.log(JSON.stringify(result.toolCalls, null, 2));

  /**
   * =========================
   * 构造 Assistant Tool Call
   * =========================
   *
   * 这是非常关键的一步。
   *
   * 第二次请求必须告诉模型：
   *
   * "刚才是你调用了这些工具"
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

  /**
   * =========================
   * 执行所有工具
   * =========================
   */

  const toolResults = await Promise.all(
    result.toolCalls.map((toolCall) => executeTool(toolCall, userMessage)),
  );

  /**
   * =========================
   * 继续请求模型
   * =========================
   *
   * messages:
   *
   * user
   * ↓
   * assistant(tool_calls)
   * ↓
   * tool(result)
   *
   */

  return chatMessage(
    systemPrompt,
    userMessage,
    [...messages, assistantMessage, ...toolResults],
    round + 1,
  );
}

/**
 * =========================
 * 执行
 * =========================
 */

const result = await chatMessage(
  systemPrompt,
  // "创建文件test.txt，并写入内容hello world",
  "在test.ts文件中实现冒泡排序",
  // "当前项目目录路径",
);

console.log(chalk.green("\n\n最终结果:"));

console.log(result);
