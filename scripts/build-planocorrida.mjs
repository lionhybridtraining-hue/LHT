import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const projectRoot = resolve(process.cwd());
const frontendDir = resolve(projectRoot, "aer-frontend-main");
const frontendDistDir = resolve(frontendDir, "dist");

function quoteArg(arg) {
  if (arg.includes(" ")) {
    return `"${arg}"`;
  }
  return arg;
}

function runCommand(command, args, cwd, extraEnv = {}) {
  const result = process.platform === "win32"
    ? spawnSync(
        "cmd.exe",
        ["/d", "/s", "/c", `${command} ${args.map(quoteArg).join(" ")}`],
        {
          cwd,
          stdio: "inherit",
          env: { ...process.env, ...extraEnv },
        }
      )
    : spawnSync(command, args, {
        cwd,
        stdio: "inherit",
        env: { ...process.env, ...extraEnv },
      });

  if (result.status !== 0) {
    if (result.error) {
      throw result.error;
    }
    throw new Error(`Command failed: ${command} ${args.join(" ")}`);
  }
}

function buildAndCopy(routerBasename, assetBasePath, publishDir) {
  const label = routerBasename;
  console.log(`[${label}] Building frontend...`);
  runCommand("npm", ["run", "build"], frontendDir, {
    VITE_ROUTER_BASENAME: routerBasename,
    VITE_ASSET_BASE_PATH: assetBasePath,
  });

  if (!existsSync(frontendDistDir)) {
    throw new Error("Frontend build output not found at aer-frontend-main/dist");
  }

  console.log(`[${label}] Syncing build to ${publishDir}...`);
  rmSync(publishDir, { recursive: true, force: true });
  mkdirSync(publishDir, { recursive: true });
  cpSync(frontendDistDir, publishDir, { recursive: true });

  console.log(`[${label}] Done.`);
}

function main() {
  console.log("[build] Installing frontend dependencies...");
  runCommand("npm", ["ci", "--no-audit", "--no-fund"], frontendDir);

  buildAndCopy(
    "/planocorrida",
    "/planocorrida/",
    resolve(projectRoot, "planocorrida")
  );

  buildAndCopy(
    "/planogratuito",
    "/planogratuito/",
    resolve(projectRoot, "planogratuito")
  );
}

main();
