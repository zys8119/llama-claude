import * as z from "zod";
import { execSync } from "child_process";
import chalk from "chalk";

export const runCommand = async (args: { command: string; cwd: string }) => {
  const { command, cwd } = args;

  console.log(chalk.yellow(`[run_command] ${command} ${cwd}`));

  try {
    const output = execSync(command, { cwd }).toString();

    return {
      output,
    };
  } catch (err) {
    return `命令执行失败：${err}`;
  }
};

export default {
  type: "function",
  function: {
    name: "run_command",
    description: "运行命令",
    parameters: z
      .object({
        command: z.string().describe("命令"),
        cwd: z.string().describe("工作目录"),
      })
      .toJSONSchema(),
  },
  callback: runCommand,
};
