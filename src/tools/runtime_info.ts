import path from "path";
export const runtimeInfo = async () => {
  return {
    os_current_time: {
      type: "string",
      description: "操作系统当前时间, 格式为 年-月-日 小时:分:秒 星期时间",
      value: new Date().toLocaleString(),
    },
    project_dir: {
      type: "string",
      description: "当前项目目录路径",
      value: path.resolve(process.cwd(), "dist"),
    },
  };
};
export default {
  type: "function",
  function: {
    name: "runtime_info",
    description:
      "获取当前项目运行时信息, 包括当前时间, 项目目录,当前目录, uname系统等问题",
  },
  callback: runtimeInfo,
};
