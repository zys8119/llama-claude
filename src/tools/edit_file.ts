import * as z from "zod";
import chalk from "chalk";
import fs from "fs";
import path from "path";

export const editFile = async (args: {
  filename: string;
  filedir: string;
  content: string;
}) => {
  const { filename, filedir, content } = args;

  console.log(chalk.yellow(`[edit_file] ${filename} ${filedir}`));

  try {
    fs.mkdirSync(filedir, {
      recursive: true,
    });

    const filePath = path.resolve(filedir, filename);

    fs.writeFileSync(filePath, content, "utf-8");

    return `文件[${filePath}]已经编辑成功`;
  } catch (err) {
    return `文件编辑失败：${err}`;
  }
};

export default {
  type: "function",
  function: {
    name: "edit_file",
    description: "编辑文件",
    parameters: z
      .object({
        filename: z.string().describe("文件名"),
        filedir: z.string().describe("文件目录"),
        content: z.string().describe("文件内容"),
      })
      .toJSONSchema(),
  },

  callback: editFile,
};
