import OpenAI from "openai";
import _ from "lodash";
import dayjs from "dayjs";
import fs from "fs";
import path from "path";
import chalk from "chalk";

import toolsRegister from "./tools.ts";

/**
 * =========================================================
 * OpenAI
 * =========================================================
 */

const client = new OpenAI({
  apiKey: "ollama",
  baseURL: "http://127.0.0.1:8080",
});

const MODEL = "qwen3-0.6b-q4_k_m";

const MAX_TOOL_ROUNDS = 10;

/**
 * =========================================================
 * Template
 * =========================================================
 */

_.templateSettings.interpolate = /{{([\s\S]+?)}}/g;

const projectDir = path.resolve(import.meta.dirname, "./dist");

const systemPrompt = _.template(
  fs
    .readFileSync("./system.md", "utf-8")
    .split("\n")
    .map((line) => line.trim())
    .join("\n"),
)({
  current_time: dayjs().format("YYYY-MM-DD HH:mm:ss"),

  project_dir: projectDir,
});

/**
 * =========================================================
 * Types
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

type FileItem = {
  name: string;
  path: string;
  isDirectory: boolean;
};

type CommandItem = {
  command: string;
  description: string;
};

type PickerMode = "file" | "command" | null;

/**
 * =========================================================
 * ANSI
 * =========================================================
 */

const ANSI = {
  clearLine: "\x1b[2K\r",

  clearScreen: "\x1b[2J\x1b[H",

  cursorLeft: (n: number) => `\x1b[${n}D`,

  cursorRight: (n: number) => `\x1b[${n}C`,

  cursorUp: (n: number) => `\x1b[${n}A`,

  cursorDown: (n: number) => `\x1b[${n}B`,

  hideCursor: "\x1b[?25l",

  showCursor: "\x1b[?25h",

  saveCursor: "\x1b[s",

  restoreCursor: "\x1b[u",
};

/**
 * =========================================================
 * Commands
 * =========================================================
 */

const commands: CommandItem[] = [
  {
    command: "/help",
    description: "查看帮助",
  },

  {
    command: "/clear",
    description: "清空当前会话上下文",
  },

  {
    command: "/history",
    description: "查看历史消息",
  },

  {
    command: "/exit",
    description: "退出程序",
  },

  {
    command: "/quit",
    description: "退出程序",
  },
];

/**
 * =========================================================
 * 查找 Tool
 * =========================================================
 */

function findTool(name: string) {
  return toolsRegister.find(
    (tool) => tool.type === "function" && tool.function.name === name,
  );
}

/**
 * =========================================================
 * Tool
 * =========================================================
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
    console.error(chalk.red("工具参数 JSON 解析失败"));

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

  console.log();

  console.log(chalk.cyan(`🔧 Tool: ${toolCall.function.name}`));

  console.log(chalk.gray(JSON.stringify(args, null, 2)));

  try {
    const result = await (tool as any).callback(args, userMessage);

    console.log(chalk.green("✓ Tool 执行成功"));

    return {
      role: "tool",
      tool_call_id: toolCall.id,

      content: JSON.stringify(result),
    };
  } catch (error) {
    console.error(chalk.red(`✗ Tool 执行失败: ${String(error)}`));

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
 * Stream
 * =========================================================
 */

async function collectStream(
  response: AsyncIterable<OpenAI.ChatCompletionChunk>,
) {
  const toolMap = new Map<number, ToolCall>();

  let content = "";

  let reasoningContent = "";

  for await (const chunk of response) {
    const delta = chunk.choices[0]?.delta;

    if (!delta) {
      continue;
    }

    /**
     * 普通输出
     */

    if (delta.content) {
      content += delta.content;

      process.stdout.write(delta.content);
    }

    /**
     * Reasoning
     */

    const reasoning = (delta as any).reasoning_content;

    if (reasoning) {
      reasoningContent += reasoning;

      process.stdout.write(chalk.gray(reasoning));
    }

    /**
     * Tool Call
     */

    if (delta.tool_calls) {
      for (const toolCall of delta.tool_calls) {
        const index = toolCall.index ?? 0;

        let current = toolMap.get(index);

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

          toolMap.set(index, current);

          continue;
        }

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

    toolCalls: [...toolMap.values()],
  };
}

/**
 * =========================================================
 * Agent
 * =========================================================
 */

async function runAgent(
  messages: OpenAI.ChatCompletionMessageParam[],
  userMessage: string,
): Promise<string> {
  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    console.log();

    console.log(chalk.blue(`========== Tool Round ${round + 1} ==========`));

    const response = await client.chat.completions.create({
      model: MODEL,

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
     * 最终回答
     */

    if (result.toolCalls.length === 0) {
      messages.push({
        role: "assistant",

        content: result.content,
      });

      console.log();

      console.log(chalk.green("\n========== Assistant =========="));

      console.log();

      return result.content;
    }

    /**
     * Assistant Tool Call
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
     * 执行 Tool
     */

    const toolResults = await Promise.all(
      result.toolCalls.map((toolCall) => executeTool(toolCall, userMessage)),
    );

    messages.push(...toolResults);
  }

  throw new Error(`Tool Calling 超过最大轮数 ${MAX_TOOL_ROUNDS}`);
}

/**
 * =========================================================
 * 文件扫描
 * =========================================================
 */

const IGNORE_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  ".next",
  ".nuxt",
  "coverage",
  ".cache",
]);

function getFiles(root: string, maxDepth = 8): FileItem[] {
  const result: FileItem[] = [];

  function walk(currentPath: string, depth: number) {
    if (depth > maxDepth) {
      return;
    }

    let entries: fs.Dirent[];

    try {
      entries = fs.readdirSync(currentPath, {
        withFileTypes: true,
      });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (IGNORE_DIRS.has(entry.name)) {
        continue;
      }

      const fullPath = path.join(currentPath, entry.name);

      const relativePath = path.relative(root, fullPath);

      result.push({
        name: relativePath || entry.name,

        path: fullPath,

        isDirectory: entry.isDirectory(),
      });

      if (entry.isDirectory()) {
        walk(fullPath, depth + 1);
      }
    }
  }

  walk(root, 0);

  return result;
}

/**
 * =========================================================
 * Fuzzy Search
 * =========================================================
 */

function fuzzyScore(text: string, query: string): number {
  if (!query) {
    return 0;
  }

  const source = text.toLowerCase();

  const search = query.toLowerCase();

  let position = 0;

  let score = 0;

  for (const char of search) {
    const index = source.indexOf(char, position);

    if (index === -1) {
      return -1;
    }

    if (index === position) {
      score += 10;
    } else {
      score += 1;
    }

    if (
      index === 0 ||
      source[index - 1] === "/" ||
      source[index - 1] === "\\" ||
      source[index - 1] === "." ||
      source[index - 1] === "_" ||
      source[index - 1] === "-"
    ) {
      score += 5;
    }

    position = index + 1;
  }

  score -= source.length * 0.01;

  return score;
}

/**
 * =========================================================
 * 文件过滤
 * =========================================================
 */

function filterFiles(files: FileItem[], query: string): FileItem[] {
  if (!query) {
    return files.slice(0, 15);
  }

  return files
    .map((file) => ({
      file,

      score: fuzzyScore(file.name, query),
    }))
    .filter((item) => item.score >= 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 15)
    .map((item) => item.file);
}

/**
 * =========================================================
 * 命令过滤
 * =========================================================
 */

function filterCommands(query: string): CommandItem[] {
  const normalized = query.replace(/^\//, "").toLowerCase();

  if (!normalized) {
    return commands;
  }

  return commands.filter(
    (item) =>
      item.command.toLowerCase().includes(normalized) ||
      item.description.toLowerCase().includes(normalized),
  );
}

/**
 * =========================================================
 * 清理 Picker
 * =========================================================
 */

function clearPicker(lines: number) {
  if (lines <= 0) {
    return;
  }

  for (let i = 0; i < lines; i++) {
    process.stdout.write("\x1b[2K");

    if (i < lines - 1) {
      process.stdout.write("\x1b[1A");
    }
  }

  process.stdout.write("\r");
}

/**
 * =========================================================
 * Picker
 * =========================================================
 */

function openPicker(
  mode: Exclude<PickerMode, null>,
  query: string,
): Promise<string | null> {
  let selectedIndex = 0;

  let renderedLines = 0;

  let currentQuery = query;

  process.stdin.setRawMode?.(true);

  process.stdin.resume();

  process.stdin.setEncoding("utf8");

  process.stdout.write(ANSI.hideCursor);

  const getItems = () => {
    if (mode === "file") {
      return filterFiles(getFiles(projectDir), currentQuery);
    }

    return filterCommands(currentQuery);
  };

  const render = () => {
    if (renderedLines > 0) {
      clearPicker(renderedLines);
    }

    const items = getItems();

    if (selectedIndex >= items.length) {
      selectedIndex = Math.max(0, items.length - 1);
    }

    /**
     * Header
     */

    if (mode === "file") {
      console.log(chalk.cyan(`╭─ @ ${currentQuery}`));
    } else {
      console.log(chalk.magenta(`╭─ / ${currentQuery.replace(/^\//, "")}`));
    }

    /**
     * 内容
     */

    if (items.length === 0) {
      console.log(chalk.gray("│  没有匹配项"));

      console.log(chalk.gray("╰─ ↑ ↓ 选择  Enter 确认  Esc 取消"));

      renderedLines = 3;

      return;
    }

    for (let i = 0; i < items.length; i++) {
      const selected = i === selectedIndex;

      if (mode === "file") {
        const file = items[i] as FileItem;

        const icon = file.isDirectory ? "📁" : "📄";

        const line = `${selected ? "❯" : " "} ${icon} ${file.name}`;

        console.log(selected ? chalk.black.bgWhite(line) : chalk.gray(line));
      } else {
        const command = items[i] as CommandItem;

        const line = `${selected ? "❯" : " "} ${command.command.padEnd(
          12,
        )} ${command.description}`;

        console.log(selected ? chalk.black.bgWhite(line) : chalk.gray(line));
      }
    }

    console.log(chalk.gray("╰─ ↑ ↓ 选择  Enter 确认  Esc 取消"));

    renderedLines = items.length + 2;
  };

  render();

  return new Promise((resolve) => {
    const cleanup = () => {
      process.stdin.removeListener("data", onData);

      process.stdin.setRawMode?.(false);

      process.stdin.pause();

      process.stdout.write(ANSI.showCursor);

      if (renderedLines > 0) {
        clearPicker(renderedLines);
      }
    };

    const finish = (value: string | null) => {
      cleanup();

      resolve(value);
    };

    const onData = (key: string) => {
      /**
       * Ctrl+C
       *
       * 只关闭 Picker
       * 不退出程序
       */

      if (key === "\u0003") {
        finish(null);

        return;
      }

      /**
       * Esc
       *
       * 只关闭 Picker
       */

      if (key === "\x1b") {
        finish(null);

        return;
      }

      /**
       * Enter
       */

      if (key === "\r" || key === "\n") {
        const items = getItems();

        const item = items[selectedIndex];

        if (!item) {
          return;
        }

        if (mode === "file") {
          const file = item as FileItem;

          finish(path.relative(process.cwd(), file.path));
        } else {
          const command = item as CommandItem;

          finish(command.command);
        }

        return;
      }

      /**
       * Up
       */

      if (key === "\x1b[A") {
        selectedIndex = Math.max(0, selectedIndex - 1);

        render();

        return;
      }

      /**
       * Down
       */

      if (key === "\x1b[B") {
        const items = getItems();

        selectedIndex = Math.min(
          Math.max(0, items.length - 1),
          selectedIndex + 1,
        );

        render();

        return;
      }

      /**
       * Backspace
       */

      if (key === "\x7f" || key === "\b") {
        currentQuery = currentQuery.slice(0, -1);

        selectedIndex = 0;

        render();

        return;
      }

      /**
       * 普通字符
       */

      if (key.length === 1 && key >= " ") {
        currentQuery += key;

        selectedIndex = 0;

        render();
      }
    };

    process.stdin.on("data", onData);
  });
}

/**
 * =========================================================
 * 找到当前 @ / /
 * =========================================================
 */

function findTrigger(text: string, cursor: number, trigger: "@" | "/") {
  const before = text.slice(0, cursor);

  const index = before.lastIndexOf(trigger);

  if (index === -1) {
    return null;
  }

  /**
   * 必须是：
   *
   * @xxx
   *
   * 或
   *
   * /xxx
   *
   * 前面必须是空白或者开头
   */

  if (index > 0 && !/\s/.test(text[index - 1])) {
    return null;
  }

  const query = text.slice(index + 1, cursor);

  return {
    index,
    query,
  };
}

/**
 * =========================================================
 * 输入框
 *
 * Enter:
 *   提交
 *
 * Shift + Enter:
 *   换行
 *
 * @:
 *   文件选择
 *
 * /:
 *   命令选择
 *
 * Esc:
 *   取消 Picker
 * =========================================================
 */

function readUserInput(): Promise<string | null> {
  let text = "";

  let cursor = 0;

  let pickerOpen = false;

  /**
   * =======================================================
   * Render
   * =======================================================
   */

  const render = () => {
    /**
     * 清理输入区域
     */

    process.stdout.write("\r\x1b[2K");

    /**
     * 多行输入
     */

    const lines = text.split("\n");

    for (let i = 0; i < lines.length; i++) {
      if (i === 0) {
        process.stdout.write(chalk.green("You › "));
      } else {
        process.stdout.write(chalk.green("    │ "));
      }

      process.stdout.write(lines[i]);

      if (i < lines.length - 1) {
        process.stdout.write("\n");
      }
    }

    /**
     * 光标重新定位
     *
     * 简化处理：
     * 将光标移动到最后。
     */

    const tail = text.length - cursor;

    if (tail > 0) {
      process.stdout.write(ANSI.cursorLeft(tail));
    }
  };

  /**
   * 初始
   */

  process.stdout.write(chalk.green("You › "));

  process.stdin.setRawMode?.(true);

  process.stdin.resume();

  process.stdin.setEncoding("utf8");

  /**
   * =======================================================
   * Promise
   * =======================================================
   */

  return new Promise((resolve) => {
    const cleanup = () => {
      process.stdin.removeListener("data", onData);

      process.stdin.setRawMode?.(false);

      process.stdin.pause();

      process.stdout.write(ANSI.showCursor);
    };

    const finish = (value: string | null) => {
      cleanup();

      console.log();

      resolve(value);
    };

    /**
     * ===================================================
     * 插入文本
     * ===================================================
     */

    const insertText = (value: string) => {
      text = text.slice(0, cursor) + value + text.slice(cursor);

      cursor += value.length;

      render();
    };

    /**
     * ===================================================
     * 删除当前 Trigger
     * ===================================================
     */

    const replaceTrigger = (trigger: "@" | "/", value: string) => {
      const target = findTrigger(text, cursor, trigger);

      if (!target) {
        return;
      }

      const before = text.slice(0, target.index);

      const after = text.slice(cursor);

      text = before + value + after;

      cursor = before.length + value.length;

      render();
    };

    /**
     * ===================================================
     * Data
     * ===================================================
     */

    const onData = async (key: string) => {
      /**
       * Picker 已打开
       *
       * Picker 自己接管 stdin
       */

      if (pickerOpen) {
        return;
      }

      /**
       * =================================================
       * Ctrl+C
       *
       * 不退出程序
       * 清空当前输入
       * =================================================
       */

      if (key === "\u0003") {
        text = "";

        cursor = 0;

        render();

        return;
      }

      /**
       * =================================================
       * Enter
       *
       * 普通 Enter = 提交
       *
       * =================================================
       */

      if (key === "\r") {
        if (!text.trim()) {
          return;
        }

        finish(text);

        return;
      }

      /**
       * =================================================
       * Shift + Enter
       *
       * =================================================
       *
       * 注意：
       *
       * 终端通常不会把 Shift+Enter
       * 和普通 Enter 区分成同一个标准
       * 控制字符。
       *
       * 常见终端可以通过：
       *
       * \x1b[13;2u
       *
       * 或：
       *
       * \x1b[27;2;13~
       *
       * 传递 CSI u / modifyOtherKeys。
       *
       */

      if (key === "\x1b[13;2u" || key === "\x1b[27;2;13~") {
        insertText("\n");

        return;
      }

      /**
       * 某些终端 Shift+Enter
       * 会直接发送 LF
       */

      if (key === "\n") {
        insertText("\n");

        return;
      }

      /**
       * =================================================
       * @ 文件选择
       * =================================================
       */

      if (key === "@") {
        insertText("@");

        const target = findTrigger(text, cursor, "@");

        if (!target) {
          return;
        }

        pickerOpen = true;

        const selected = await openPicker("file", target.query);

        pickerOpen = false;

        if (!selected) {
          render();

          return;
        }

        replaceTrigger("@", `@${selected}`);

        return;
      }

      /**
       * =================================================
       * / 命令选择
       * =================================================
       */

      if (key === "/") {
        insertText("/");

        const target = findTrigger(text, cursor, "/");

        if (!target) {
          return;
        }

        pickerOpen = true;

        const selected = await openPicker("command", target.query);

        pickerOpen = false;

        if (!selected) {
          render();

          return;
        }

        replaceTrigger("/", selected);

        return;
      }

      /**
       * =================================================
       * Esc
       *
       * 普通输入状态下：
       * 不退出
       * 不提交
       *
       * =================================================
       */

      if (key === "\x1b") {
        render();

        return;
      }

      /**
       * =================================================
       * Backspace
       * =================================================
       */

      if (key === "\x7f" || key === "\b") {
        if (cursor > 0) {
          text = text.slice(0, cursor - 1) + text.slice(cursor);

          cursor--;

          render();
        }

        return;
      }

      /**
       * =================================================
       * 左
       * =================================================
       */

      if (key === "\x1b[D") {
        cursor = Math.max(0, cursor - 1);

        render();

        return;
      }

      /**
       * =================================================
       * 右
       * =================================================
       */

      if (key === "\x1b[C") {
        cursor = Math.min(text.length, cursor + 1);

        render();

        return;
      }

      /**
       * =================================================
       * Home
       * =================================================
       */

      if (key === "\x1b[H") {
        cursor = 0;

        render();

        return;
      }

      /**
       * =================================================
       * End
       * =================================================
       */

      if (key === "\x1b[F") {
        cursor = text.length;

        render();

        return;
      }

      /**
       * =================================================
       * 普通字符
       * =================================================
       */

      if (key.length === 1 && key >= " ") {
        insertText(key);
      }
    };

    process.stdin.on("data", onData);
  });
}

/**
 * =========================================================
 * History
 * =========================================================
 */

const messages: OpenAI.ChatCompletionMessageParam[] = [];

/**
 * =========================================================
 * Banner
 * =========================================================
 */

function printBanner() {
  console.log();

  console.log(chalk.cyan("╔══════════════════════════════════════════════╗"));

  console.log(chalk.cyan("║              🤖 Local Agent                 ║"));

  console.log(chalk.cyan("╚══════════════════════════════════════════════╝"));

  console.log();

  console.log(chalk.gray(" @ 文件    / 命令    Shift+Enter 换行"));

  console.log(chalk.gray(" Enter 提交    Esc 取消选择"));

  console.log();
}

/**
 * =========================================================
 * Help
 * =========================================================
 */

function printHelp() {
  console.log();

  console.log(chalk.cyan("命令:"));

  console.log("  /help      查看帮助");

  console.log("  /clear     清空上下文");

  console.log("  /history   查看历史");

  console.log("  /exit      退出");

  console.log();

  console.log(chalk.cyan("输入:"));

  console.log("  @          文件选择");

  console.log("  @src       模糊搜索文件");

  console.log("  /          命令选择");

  console.log("  Shift+Enter 多行输入");

  console.log();
}

/**
 * =========================================================
 * History
 * =========================================================
 */

function printHistory() {
  console.log();

  console.log(chalk.cyan(`历史消息: ${messages.length}`));

  console.log();

  messages.forEach((message, index) => {
    console.log(chalk.gray(`[${index}] ${message.role}`));

    if ("content" in message && typeof message.content === "string") {
      console.log(message.content);
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
  printBanner();

  while (true) {
    try {
      /**
       * ===================================================
       * 输入
       * ===================================================
       */

      const userInput = await readUserInput();

      /**
       * Ctrl+C
       *
       * readUserInput 返回 null
       * 才退出
       */

      if (userInput === null) {
        break;
      }

      const text = userInput.trim();

      /**
       * 空消息
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

        console.log(chalk.yellow("\n✓ 会话上下文已清空\n"));

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
       * 用户消息
       *
       * 这里非常重要：
       *
       * 每一轮都保留 messages
       *
       * ===================================================
       */

      messages.push({
        role: "user",

        content: userInput,
      });

      /**
       * ===================================================
       * Agent
       * ===================================================
       */

      await runAgent(messages, userInput);
    } catch (error) {
      console.error();

      console.error(chalk.red(`Agent Error: ${String(error)}`));

      console.error();
    }
  }

  /**
   * =======================================================
   * Cleanup
   * =======================================================
   */

  process.stdin.setRawMode?.(false);

  process.stdin.pause();

  process.stdout.write(ANSI.showCursor);

  console.log();

  console.log(chalk.gray("Bye 👋"));
}

/**
 * =========================================================
 * 启动
 *
 * 注意：
 *
 * 这里没有顶层 await
 *
 * =========================================================
 */

main().catch((error) => {
  console.error(chalk.red(`程序异常: ${String(error)}`));

  process.exit(1);
});
