// import run from "./tui/cli.tsx";
// run();
import { input } from "@inquirer/prompts";
import { onSubmit, pullTools } from "./openai.ts";
(async function run() {
  const question = await input({
    message: ">",
  });
  await onSubmit(question);
  await run();
})().catch(console.error);
