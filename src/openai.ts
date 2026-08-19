import { OpenAI } from "openai";
const openai = new OpenAI({
  apiKey: "sk-",
  baseURL: "http://127.0.0.1:8080/v1",
});
export const models = await openai.models.list();
export default openai;
export const onSubmit = async (text: string) => {
  await openai.chat.completions.create({
    model: "llama2",
    messages: [
      {
        role: "user",
        content: text,
      },
    ],
  });
};
