import * as z from "zod";
import chalk from "chalk";
import fs from "fs";
import path from "path";

export const readFile = async (args: { filename: string; filedir: string }) => {
  const { filename, filedir } = args;

  console.log(chalk.yellow(`[read_file] ${filename} ${filedir}`));

  try {
    fs.mkdirSync(filedir, {
      recursive: true,
    });

    const filePath = path.resolve(filedir, filename);

    const fileContent = fs.readFileSync(filePath, "utf-8");

    return `文件[${filePath}]内容如下：\n${fileContent}`;
  } catch (err) {
    return `文件读取失败：${err}`;
  }
};

export default {
  type: "function",
  function: {
    name: "read_file",
    description: "读取文件",
    parameters: z
      .object({
        filename: z.string().describe("文件名"),
        filedir: z.string().describe("文件目录"),
      })
      .toJSONSchema(),
  },

  callback: readFile,
};
