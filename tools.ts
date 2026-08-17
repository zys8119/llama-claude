import OpenAI from "openai";
import * as z from "zod";
import dayjs from "dayjs";
import chalk from "chalk";
import fs from "fs";
import path from "path";
export const toolsRegister = [
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

    callback: async (args: { city: string }) => {
      if (args.city) {
        return `${args.city}天气是晴天`;
      }

      return "无法获取天气";
    },
  },

  {
    type: "function",
    function: {
      name: "current_time",
      description: "获取当前时间",
      parameters: z.object({}).toJSONSchema(),
    },

    callback: async () => {
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

    callback: async (args: {
      filename: string;
      filedir: string;
      content: string;
    }) => {
      const { filename, filedir, content } = args;

      console.log(chalk.yellow(`[write_file] ${filename} ${filedir}`));

      try {
        fs.mkdirSync(filedir, {
          recursive: true,
        });

        const filePath = path.resolve(filedir, filename);

        fs.writeFileSync(filePath, content, "utf-8");

        return `文件[${filePath}]已经写入成功`;
      } catch (err) {
        return `文件写入失败：${err}`;
      }
    },
  },
] as unknown as OpenAI.ChatCompletionTool[];
export default toolsRegister;
