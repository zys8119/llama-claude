import OpenAI from "openai";
import getWeather from "./tools/get_weather.ts";
import getCurrentTime from "./tools/current_time.ts";
import writeFile from "./tools/write_file.ts";
import readFile from "./tools/read_file.ts";
import runtimeInfo from "./tools/runtime_info.ts";
import runCommand from "./tools/run_command.ts";
export const toolsRegister = [
  getWeather,
  runCommand,
  getCurrentTime,
  writeFile,
  readFile,
  runtimeInfo,
] as unknown as OpenAI.ChatCompletionTool[];
export default toolsRegister;
