import OpenAI from "openai";
import getWeather from "./tools/get_weather.ts";
import getCurrentTime from "./tools/current_time.ts";
import writeFile from "./tools/write_file.ts";
import readFile from "./tools/read_file.ts";
import runtimeInfo from "./tools/runtime_info.ts";
export const toolsRegister = [
  getWeather,
  getCurrentTime,
  writeFile,
  readFile,
  runtimeInfo,
] as unknown as OpenAI.ChatCompletionTool[];
export default toolsRegister;
