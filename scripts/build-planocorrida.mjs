import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const projectRoot = resolve(process.cwd());
const frontendDir = resolve(projectRoot, "aer-frontend-main");
const frontendDistDir = resolve(frontendDir, "dist");
const publishDir = resolve(projectRoot, "planocorrida");

function quoteArg(arg) {
  if (arg.includes(" ")) {
    return `"${arg}"`;
  }
  return arg;
}

function runCommand(command, args, cwd, extraEnv = {}) {
  const env = { ...process.env, ...extraEnv };
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

function main() {
  console.log("[planocorrida] Installing frontend dependencies...");
  runCommand("npm", ["ci", "--no-audit", "--no-fund"], frontendDir);

  console.log("[planocorrida] Building frontend...");
  runCommand(
    "npm",
    ["run", "build"],
    frontendDir,
    {
      VITE_ROUTER_BASENAME: "/planocorrida",
      VITE_ASSET_BASE_PATH: "/planocorrida/",
    }
  );

  if (!existsSync(frontendDistDir)) {
    throw new Error("Frontend build output not found at aer-frontend-main/dist");
  }

  console.log("[planocorrida] Syncing build to /planocorrida...");
  rmSync(publishDir, { recursive: true, force: true });
  mkdirSync(publishDir, { recursive: true });
  cpSync(frontendDistDir, publishDir, { recursive: true });

  console.log("[planocorrida] Done.");
}

main();
