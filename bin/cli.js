#!/usr/bin/env node

import { resolve, dirname } from "path";
import { spawnPromise } from "spawn-rx";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  // Parse command line arguments
  const args = process.argv.slice(2);
  const envVars = {};
  const mcpServerArgs = [];
  let command = null;
  let parsingFlags = true;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (parsingFlags && arg === "--") {
      parsingFlags = false;
      continue;
    }

    if (parsingFlags && arg === "-e" && i + 1 < args.length) {
      const envVar = args[++i];
      const equalsIndex = envVar.indexOf("=");

      if (equalsIndex !== -1) {
        const key = envVar.substring(0, equalsIndex);
        const value = envVar.substring(equalsIndex + 1);
        envVars[key] = value;
      } else {
        envVars[envVar] = "";
      }
    } else if (!command) {
      command = arg;
    } else {
      mcpServerArgs.push(arg);
    }
  }

  const inspectorServerPath = resolve(
    __dirname,
    "..",
    "server",
    "build",
    "index.js",
  );

  // Path to the client entry point
  const inspectorClientPath = resolve(
    __dirname,
    "..",
    "client",
    "bin",
    "cli.js",
  );

  const CLIENT_PORT = process.env.CLIENT_PORT ?? "5173";
  const SERVER_PORT = process.env.SERVER_PORT ?? "3000";

  console.log("Starting MCP Debug inspector...");

  const abort = new AbortController();

  let cancelled = false;
  process.on("SIGINT", () => {
    cancelled = true;
    abort.abort();
  });

  const server = spawnPromise(
    "node",
    [
      inspectorServerPath,
      ...(command ? [`--env`, command] : []),
      ...(mcpServerArgs.length > 0 ? [`--args=${mcpServerArgs.join(" ")}`] : []),
    ],
    {
      env: {
        ...process.env,
        PORT: SERVER_PORT,
        MCP_ENV_VARS: JSON.stringify(envVars),
      },
      signal: abort.signal,
      echoOutput: true,
    },
  );

  const client = spawnPromise("node", [inspectorClientPath], {
    env: { ...process.env, PORT: CLIENT_PORT },
    signal: abort.signal,
    echoOutput: true,
  });

  // Make sure our server/client didn't immediately fail
  await Promise.any([server, client, delay(2 * 1000)]);
  const portParam = SERVER_PORT === "3000" ? "" : `?proxyPort=${SERVER_PORT}`;
  console.log(
    `\n🔍 MCP Debug Inspector is up and running at http://127.0.0.1:${CLIENT_PORT}${portParam} 🚀`,
  );

  try {
    await Promise.any([server, client]);
  } catch (e) {
    if (!cancelled || process.env.DEBUG) throw e;
  }

  return 0;
}

main()
  .then((_) => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
