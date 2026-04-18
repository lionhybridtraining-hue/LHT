import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const projectRoot = resolve(process.cwd());
const frontendDir = resolve(projectRoot, "aer-frontend-main");
const frontendDistDir = resolve(frontendDir, "dist");
const publishDir = resolve(projectRoot, "planocorrida");

function parseEnvFile(filePath) {
  if (!existsSync(filePath)) {
    return {};
  }

  const content = readFileSync(filePath, "utf8");
  const parsed = {};

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    parsed[key] = value;
  }

  return parsed;
}

function loadBuildEnv() {
  const mode = process.env.NODE_ENV || "production";
  const files = [
    resolve(projectRoot, ".env"),
    resolve(projectRoot, ".env.local"),
    resolve(projectRoot, `.env.${mode}`),
    resolve(projectRoot, `.env.${mode}.local`),
    resolve(frontendDir, ".env"),
    resolve(frontendDir, ".env.local"),
    resolve(frontendDir, `.env.${mode}`),
    resolve(frontendDir, `.env.${mode}.local`),
  ];

  return files.reduce((accumulator, filePath) => {
    return { ...accumulator, ...parseEnvFile(filePath) };
  }, {});
}

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
  const buildEnv = loadBuildEnv();

  console.log("[planocorrida] Installing frontend dependencies...");
  runCommand("npm", ["ci", "--no-audit", "--no-fund"], frontendDir);

  console.log("[planocorrida] Building frontend...");
  runCommand(
    "npm",
    ["run", "build"],
    frontendDir,
    {
      ...buildEnv,
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
