import { OpenAI } from "openai";
import { search } from "@inquirer/prompts";
import chalk from "chalk";
import { ref } from "./effect.ts";
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
export const chatMessageLists = ref([]);
export const chat = async ({
  text,
  controller,
}: {
  text: string;
  controller: AbortController;
}) => {
  const response = await openai.chat.completions.create(
    {
      model: model,
      messages: [
        {
          role: "user",
          content: text,
        },
      ],
      stream: true,
    },
    {
      signal: controller.signal,
    },
  );
  for await (const chunk of response) {
    let assistantMessage = chatMessageLists.value.find(
      (e) => e.id && e.id === chunk.id,
    );
    if (!assistantMessage) {
      assistantMessage = chunk;
      chatMessageLists.value.push(assistantMessage);
    }
    assistantMessage.type = "assistant";
    assistantMessage.reasoning_content =
      assistantMessage.reasoning_content || "";
    assistantMessage.content = assistantMessage.content || "";
    const delta = chunk.choices[0]
      .delta as unknown as (typeof chunk.choices)[number]["delta"] & {
      reasoning_content?: string;
    };
    if (delta.reasoning_content) {
      assistantMessage.reasoning_content += delta?.reasoning_content || "";
    } else {
      assistantMessage.content += delta?.content || "";
    }
  }
};
export const controllerCache = [] as AbortController[];
export const abortAllChat = () => {
  controllerCache.forEach((e) => e.abort());
  controllerCache.length = 0;
};

export const onSubmit = (text: string) => {
  chatMessageLists.value.push({
    role: "user",
    content: text,
  });
  const controller = new AbortController();
  controllerCache.push(controller);
  chat({
    text,
    controller,
  })
    .catch((err) => {
      console.error("请求失败:", err.message);
    })
    .finally(() => {
      controllerCache.splice(controllerCache.indexOf(controller), 1);
    });

  return {
    abort: () => {
      controller.abort();
    },
  };
};
