import { OpenAI } from "openai";

const openai = new OpenAI({
  apiKey: "sk-",
  baseURL: "http://127.0.0.1:8080/v1",
});
const models = await openai.models.list();
console.log(models.data.map((e) => e.id));
