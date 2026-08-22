import path from "path";
export const runtimeInfo = async () => {
  return {
    current_time: {
      type: "string",
      description: "当前时间",
      value: new Date().toLocaleString(),
    },
    project_dir: {
      type: "string",
      description: "当前项目目录路径",
      value: path.resolve(process.cwd(), "dist"),
    },
    uname: {
      type: "string",
      description: "uname系统",
      value: process.platform,
    },
  };
};
export default {
  type: "function",
  function: {
    name: "runtime_info",
    description:
      "当前运行时信息, 包括当前时间, 项目目录,当前目录, uname系统等问题",
  },
  callback: runtimeInfo,
};
