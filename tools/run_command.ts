import * as z from "zod";
import { exec } from "child_process";
import chalk from "chalk";

export const runCommand = async (args: { command: string }) => {
  const { command } = args;

  console.log(chalk.yellow(`[run_command] ${command}`));

  try {
    const { stdout, stderr } = await exec(command);

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
    name: "run_command",
    description: "运行命令",
    parameters: z
      .object({
        command: z.string().describe("命令"),
      })
      .toJSONSchema(),
  },
  callback: runCommand,
};
