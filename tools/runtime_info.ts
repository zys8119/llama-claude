import path from "path";
export const runtimeInfo = async () => {
  return {
    current_time: new Date().toLocaleString(),
    project_dir: path.resolve(process.cwd(), "dist"),
    uname: process.platform,
  };
};
export default {
  type: "function",
  function: {
    name: "runtime_info",
    description: "获取当前运行时信息, 包括当前时间, 项目目录, uname系统",
  },
  callback: runtimeInfo,
};
