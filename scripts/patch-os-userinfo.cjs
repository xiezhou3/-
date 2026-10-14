/* eslint-disable @typescript-eslint/no-require-imports */
const os = require("node:os");

const originalUserInfo = os.userInfo;

os.userInfo = (...args) => {
  try {
    return originalUserInfo(...args);
  } catch {
    return {
      uid: -1,
      gid: -1,
      username: process.env.USERNAME || "CodexSandboxOnline",
      homedir: process.env.USERPROFILE || process.env.HOME || process.cwd(),
      shell: null,
    };
  }
};
