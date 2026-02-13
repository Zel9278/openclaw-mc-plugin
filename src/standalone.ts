#!/usr/bin/env node
// Standalone mode — run the Minecraft bot directly without OpenClaw.
// Usage: pnpm start  (or node dist/standalone.js)
// Configure via .env or environment variables.

import "dotenv/config";
import { connect, disconnect, snapshot, setLogger, type McConfig } from "./mc-bot.js";
import { setupChatCommands } from "./chat-commands.js";

// ---------------------------------------------------------------------------
// Config from environment
// ---------------------------------------------------------------------------

const config: McConfig & { prefix: string; owner: string } = {
  host: process.env.MC_HOST ?? "localhost",
  port: parseInt(process.env.MC_PORT ?? "25565", 10),
  username: process.env.MC_USERNAME ?? "OpenClaw",
  version: process.env.MC_VERSION ?? "1.20.4",
  prefix: process.env.COMMAND_PREFIX ?? "!",
  owner: process.env.OWNER_USERNAME ?? "",
};

// ---------------------------------------------------------------------------
// Pretty logger
// ---------------------------------------------------------------------------

function ts(): string {
  return new Date().toLocaleTimeString("ja-JP", { hour12: false });
}

const log = {
  info: (msg: string) => console.log(`\x1b[90m${ts()}\x1b[0m \x1b[36m[INFO]\x1b[0m ${msg}`),
  warn: (msg: string) => console.log(`\x1b[90m${ts()}\x1b[0m \x1b[33m[WARN]\x1b[0m ${msg}`),
  error: (msg: string) => console.log(`\x1b[90m${ts()}\x1b[0m \x1b[31m[ERR ]\x1b[0m ${msg}`),
  ok: (msg: string) => console.log(`\x1b[90m${ts()}\x1b[0m \x1b[32m[ OK ]\x1b[0m ${msg}`),
};

setLogger(log);

// ---------------------------------------------------------------------------
// Banner
// ---------------------------------------------------------------------------

console.log(`
\x1b[36m  ╔═══════════════════════════════════════╗
  ║     🐾 OpenClaw MC Bot  v1.0.0       ║
  ║         Standalone Mode               ║
  ╚═══════════════════════════════════════╝\x1b[0m
`);

log.info(`Server: ${config.host}:${config.port}`);
log.info(`Username: ${config.username}`);
log.info(`Version: ${config.version}`);
log.info(`Command prefix: ${config.prefix}`);
if (config.owner) log.info(`Owner: ${config.owner}`);

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

async function main() {
  const state = await connect(config);
  log.ok(`Bot spawned! HP: ${state.health} | Pos: ${JSON.stringify(state.position)}`);

  // Register in-game chat commands
  const { getBot } = await import("./mc-bot.js");
  const bot = getBot()!;
  setupChatCommands(bot, config.prefix, config.owner);

  log.ok(`Ready — type '${config.prefix}help' in-game.`);

  // Reconnect logic
  bot.on("end", (reason: string) => {
    log.warn(`Disconnected: ${reason}`);
    log.info("Reconnecting in 5s...");
    setTimeout(() => main().catch(handleFatal), 5000);
  });
}

function handleFatal(err: unknown) {
  log.error(`Fatal: ${err}`);
  process.exit(1);
}

// Graceful shutdown
process.on("SIGINT", () => {
  log.info("Shutting down...");
  disconnect();
  process.exit(0);
});

process.on("uncaughtException", (err) => {
  log.error(`Uncaught: ${err.message}`);
});

main().catch(handleFatal);
