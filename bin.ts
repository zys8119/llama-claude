import OpenAI from "openai";
import _ from "lodash";
import dayjs from "dayjs";
import fs from "fs";
import path from "path";
import * as z from "zod";
import chalk from "chalk";
const client = new OpenAI({
  apiKey: "ollama", // This is the default and can be omitted
  baseURL: "http://127.0.0.1:8080",
});
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

const toolsRegister = [
  {
    type: "function",
    function: {
      name: "get_weather",
      description: "获取当前天气，参数为城市名称",
      parameters: z
        .object({
          city: z.string().describe("城市名称"),
        })
        .toJSONSchema(),
    },
    callback: (args: any) => {
      if (args.city) {
        return `${args.city}天气是晴天`;
      } else {
        return "无法获取天气";
      }
    },
  },
  {
    type: "function",
    function: {
      name: "current_time",
      description: "获取当前时间",
      parameters: z.object({}).toJSONSchema(),
    },
    callback: () => {
      return dayjs().format("YYYY-MM-DD HH:mm:ss");
    },
  },
  {
    type: "function",
    function: {
      name: "write_file",
      description: "写入文件",
      parameters: z
        .object({
          filename: z.string().describe("文件名"),
          filedir: z.string().describe("文件目录"),
          content: z.string().describe("文件内容"),
        })
        .toJSONSchema(),
    },
    callback: (args: any) => {
      const { filename, filedir, content } = args;
      console.log(filename, filedir, content);
      try {
        fs.mkdirSync(filedir, { recursive: true });
        fs.writeFileSync(path.resolve(filedir, filename), content);
        return `文件[${path.resolve(filedir, filename)}]已经写入成功`;
      } catch (err) {
        return `文件写入失败：${err}`;
      }
    },
  },
] as unknown as OpenAI.ChatCompletionTool[];
type DeepRequired<T> = T extends (...args: any[]) => any
  ? T
  : T extends object
    ? {
        [K in keyof T]-?: DeepRequired<T[K]>;
      }
    : T;
let bool = false;
const chatMessage = async function (systemPrompt: string, user: string) {
  console.log(chalk.blue(systemPrompt));
  const response = await client.chat.completions.create({
    model: "Qwen3-0.6B-Q8_0",
    tool_choice: "auto",
    tools: toolsRegister,
    messages: [
      {
        role: "system",
        content: systemPrompt,
      },
      {
        role: "user",
        content: user,
      },
    ],
    stream: true,
  });
  let tools: DeepRequired<OpenAI.ChatCompletionChunk.Choice.Delta.ToolCall>[] =
    [];
  for await (const chunk of response) {
    const delta = chunk.choices[0].delta;
    if (delta) {
      if (delta.content) {
        process.stdout.write(delta.content || "");
      } else if ((delta as any).reasoning_content) {
        process.stdout.write(
          chalk.gray((delta as any).reasoning_content || ""),
        );
      } else if (delta.tool_calls) {
        if (bool) {
          console.log(chalk.green(JSON.stringify(delta)));
        }
        delta.tool_calls.forEach((tool_call: any) => {
          const tool = tools.find((t) => t.index === tool_call.index);
          if (!tool) {
            tools.push(tool_call);
          } else {
            tool.function.arguments += tool_call.function.arguments;
          }
        });
      } else {
        // console.log(chunk.choices[0], 55555);
      }
    }
  }
  console.log(tools, 3333);
  const toolsResult: string[] = [];
  tools.forEach((tool) => {
    if (tool.type === "function") {
      try {
        tool.function.arguments = JSON.parse(tool.function.arguments);
      } catch (err) {
        console.log(err);
      }
    }
  });
  await Promise.allSettled(
    tools.map(async (tool) => {
      if (tool.type === "function") {
        const fun = toolsRegister.find(
          (t) =>
            t.type === "function" && t.function.name === tool.function.name,
        );
        if (!fun) {
          console.log(tool.function.name, tool.function.arguments);
          return;
        } else {
          const res = await (fun as any).callback(
            tool.function.arguments,
            user,
          );
          toolsResult.push(
            `工具【${tool.function.name}】执行调用结果：\n${res || ""}\n\n${systemPrompt}`,
          );
        }
      }
    }),
  );
  if (toolsResult.length > 0) {
    if (bool) {
      return;
    }
    bool = true;
    await chatMessage(
      `工具最新调用结果如下：\n${toolsResult.join("\n")}`,
      user,
    );
  }
};
await chatMessage(systemPrompt, "创建文件test.txt，并写入内容hello world");
