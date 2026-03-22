import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const projectRoot = resolve(process.cwd());
const frontendDir = resolve(projectRoot, "aer-frontend-main");

function quoteArg(arg) {
  if (arg.includes(" ")) {
    return `"${arg}"`;
  }
  return arg;
}

function runCommand(command, args, cwd, extraEnv = {}) {
  const env = {
    ...process.env,
    ...extraEnv,
  };

  const result = process.platform === "win32"
    ? spawnSync(
        "cmd.exe",
        ["/d", "/s", "/c", `${command} ${args.map(quoteArg).join(" ")}`],
        {
          cwd,
          stdio: "inherit",
          env,
        }
      )
    : spawnSync(command, args, {
        cwd,
        stdio: "inherit",
        env,
      });

  if (result.status !== 0) {
    if (result.error) {
      throw result.error;
    }
    throw new Error(`Command failed: ${command} ${args.join(" ")}`);
  }
}

console.log("[planocorrida:dev] Starting Vite dev server for /planocorrida...");
runCommand(
  "npm",
  ["run", "dev", "--", "--host", "127.0.0.1", "--port", "5173"],
  frontendDir,
  {
    VITE_ROUTER_BASENAME: "/planocorrida",
    VITE_ASSET_BASE_PATH: "/planocorrida/",
  }
);