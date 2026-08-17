import dayjs from "dayjs";
import * as z from "zod";
export const getCurrentTime = async () => {
  return dayjs().format("YYYY-MM-DD HH:mm:ss");
};
export default {
  type: "function",
  function: {
    name: "current_time",
    description: "获取当前时间",
    parameters: z.object({}).toJSONSchema(),
  },

  callback: getCurrentTime,
};
