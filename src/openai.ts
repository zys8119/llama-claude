import { OpenAI } from "openai";
import { search } from "@inquirer/prompts";
import chalk from "chalk";
const openai = new OpenAI({
  apiKey: "sk-",
  baseURL: "http://127.0.0.1:8080/v1",
});
export function stdinResume() {
  process.stdin.setRawMode(true);
  process.stdin.resume();
}
export const models = (await openai.models.list()).data.map((e) => e.id);
export const model = await search({
  message: "请选择模型",
  source: (input) => (input ? models.filter((e) => e.includes(input)) : models),
});
stdinResume();
console.log(chalk.green(`✅ 已选择模型: ${model}`));
export default openai;
export const onSubmit = async (text: string) => {
  console.log(chalk.green(`✅ 已发送文本: ${text}`));
  console.log(text);
  const response = await openai.chat.completions.create({
    model: model,
    messages: [
      {
        role: "user",
        content: text,
      },
    ],
    stream: true,
  });
  for await (const chunk of response) {
    process.stdout.write(chunk.choices[0].delta.content || "");
  }
};
