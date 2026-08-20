import { OpenAI } from "openai";
import { search } from "@inquirer/prompts";
import chalk from "chalk";
import { ref, computed, effect } from "./effect.ts";
const openai = new OpenAI({
  apiKey: "sk-",
  baseURL: "http://127.0.0.1:8080/v1",
});
export function stdinResume() {
  process.stdin.setRawMode(true);
  process.stdin.resume();
}
export const models = (await openai.models.list()).data.map((e) => e.id);
export const model =
  "Qwen3-0.6B-Q8_0" ||
  (await search({
    message: "请选择模型",
    source: (input) =>
      input ? models.filter((e) => e.includes(input)) : models,
  }));
stdinResume();
console.log(chalk.green(`✅ 已选择模型: ${model}`));
export default openai;
export const chatMessageLists = ref([]);
export const chatMessagesData = computed(() =>
  chatMessageLists.value.map((e: any) => {
    switch (e.type) {
      case "user":
        return {
          role: "user",
          content: e.content,
        };
      case "assistant":
        return {
          role: "assistant",
          content: e.content,
        };
      default:
        return e;
    }
  }),
);

export function pullSystemPrompt() {
  return [
    {
      role: "system",
      content: "你是一个专业的助手，你的任务是回答用户的问题。",
    },
  ];
}
type ChatMessages = Parameters<
  typeof openai.chat.completions.create
>[0]["messages"];
export const chat = async ({ controller }: { controller: AbortController }) => {
  console.log(chalk.blue(chatMessagesData.value.at(-1).content));
  const systemPrompt = await pullSystemPrompt();
  const response = await openai.chat.completions.create(
    {
      model: model,
      messages: systemPrompt.concat(chatMessagesData.value) as ChatMessages,
      stream: true,
    },
    {
      signal: controller.signal,
    },
  );
  for await (const chunk of response) {
    let assistantMessage = chatMessageLists.value.find(
      (e: any) => e.id && e.id === chunk.id,
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
      process.stdout.write(chalk.gray(delta?.reasoning_content || ""));
      assistantMessage.reasoning_content += delta?.reasoning_content || "";
    } else {
      process.stdout.write(chalk.green(delta?.content || ""));
      assistantMessage.content += delta?.content || "";
    }
  }
  process.stdout.write("\n");
};
export const controllerCache = [] as AbortController[];
export const abortAllChat = () => {
  controllerCache.forEach((e) => e.abort());
  controllerCache.length = 0;
};

export const onSubmit = async (text: string) => {
  chatMessageLists.value.push({
    role: "user",
    content: text,
  });
  const controller = new AbortController();
  controllerCache.push(controller);
  await chat({
    controller,
  })
    .catch((err) => {
      console.error("请求失败:", err.message);
    })
    .finally(() => {
      controllerCache.splice(controllerCache.indexOf(controller), 1);
    });
};
