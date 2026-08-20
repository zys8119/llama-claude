// import run from "./tui/cli.tsx";
// run();
import { input } from "@inquirer/prompts";
import { onSubmit } from "./openai.ts";
(async function run() {
  const question = await input({
    message: "请输入您的问题",
  });
  await onSubmit(question);
  await run();
})().catch(console.error);
