import OpenAI from "openai";
import getWeather from "./tools/get_weather.ts";
import getCurrentTime from "./tools/current_time.ts";
import writeFile from "./tools/write_file.ts";
import { sync } from "glob";
import fsExtra from "fs-extra";
console.log(
  sync(["./tools/**"], { absolute: true }).map((file) =>
    fsExtra.readFileSync(file),
  ),
);
export const toolsRegister = [
  getWeather,
  getCurrentTime,
  writeFile,
] as unknown as OpenAI.ChatCompletionTool[];
export default toolsRegister;
