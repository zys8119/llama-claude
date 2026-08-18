import * as z from "zod";
import { exec } from "child_process";
import chalk from "chalk";

export const searchFiles = async (args: { query: string }) => {
  const { query } = args;

  console.log(chalk.yellow(`[search_files] ${query}`));

  try {
    // 执行查询字符串，返回匹配的文件列表
    const { stdout, stderr } = await exec(`grep -r "${query}"`);

    return {
      stdout,
      stderr,
    };
  } catch (err) {
    return `命令执行失败：${err}`;
  }
};

export default {
  type: "function",
  function: {
    name: "search_files",
    description: "搜索文件",
    parameters: z
      .object({
        query: z.string().describe("查询字符串"),
      })
      .toJSONSchema(),
  },
  callback: searchFiles,
};
