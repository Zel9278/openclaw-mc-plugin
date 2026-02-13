// OpenClaw plugin entry point.
// Registers Minecraft agent tools and an optional /mc auto-reply command.

import { registerTools } from "./tools.js";
import { setLogger, connect, disconnect, snapshot, type McConfig } from "./mc-bot.js";

export const id = "minecraft";

export default function register(api: any) {
  // Provide the plugin logger to the bot core
  setLogger({
    info: (msg: string) => api.logger.info(msg),
    warn: (msg: string) => api.logger.warn(msg),
    error: (msg: string) => api.logger.error(msg),
  });

  // Helper to resolve config with defaults
  const resolveConfig = (): McConfig => {
    const cfg = api.config?.plugins?.entries?.minecraft?.config ?? {};
    return {
      host: cfg.host ?? "localhost",
      port: cfg.port ?? 25565,
      username: cfg.username ?? "OpenClaw",
      version: cfg.version ?? "1.20.4",
    };
  };

  // Register all agent tools (minecraft_connect, minecraft_move, etc.)
  registerTools(api, resolveConfig);

  // Register /mc slash command for quick status check
  api.registerCommand({
    name: "mc",
    description: "Quick Minecraft bot status",
    handler: () => {
      const state = snapshot();
      if (state.status === "disconnected") {
        return { text: "🎮 Minecraft bot is **disconnected**. Ask me to connect!" };
      }
      const pos = state.position;
      return {
        text: [
          `🎮 **Minecraft** — ${state.status}`,
          `❤️ ${state.health}/20 | 🍖 ${state.food}/20 | ⭐ XP ${state.experience}`,
          pos ? `📍 ${pos.x}, ${pos.y}, ${pos.z} (${state.dimension})` : "",
          `🎯 ${state.gameMode}`,
        ]
          .filter(Boolean)
          .join("\n"),
      };
    },
  });

  // Auto-connect if configured
  const autoConnect = api.config?.plugins?.entries?.minecraft?.config?.autoConnect;
  if (autoConnect) {
    const cfg = resolveConfig();
    connect(cfg).catch((err: Error) => {
      api.logger.error(`[MC] Auto-connect failed: ${err.message}`);
    });
  }

  // Cleanup on gateway shutdown
  api.registerService({
    id: "minecraft-lifecycle",
    start: () => api.logger.info("[MC] Minecraft plugin loaded"),
    stop: () => {
      disconnect();
      api.logger.info("[MC] Minecraft plugin unloaded");
    },
  });
}
