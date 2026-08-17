import * as z from "zod";

export const getWeather = async (args: { city: string }) => {
  if (args.city) {
    return `${args.city}天气是晴天`;
  }

  return "无法获取天气";
};
export default {
  type: "function",
  function: {
    name: "get_weather",
    description: "获取当前天气，参数为城市名称",
    parameters: z
      .object({
        city: z.string().describe("城市名称"),
      })
      .toJSONSchema(),
  },

  callback: getWeather,
};
