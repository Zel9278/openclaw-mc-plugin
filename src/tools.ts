// Agent tools — each tool is registered with the OpenClaw plugin API and
// exposed to the LLM as a callable function during agent runs.

import { Type } from "@sinclair/typebox";
import * as mc from "./mc-bot.js";
import * as auto from "./autonomous.js";

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function text(msg: string) {
  return { content: [{ type: "text" as const, text: msg }] };
}

function json(obj: unknown) {
  return text(JSON.stringify(obj, null, 2));
}

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

export function registerTools(api: any, resolveConfig: () => mc.McConfig) {
  // ── Connect ──────────────────────────────────────────────────────────
  api.registerTool({
    name: "minecraft_connect",
    description: "Connect the Minecraft bot to a server. Returns the bot's status after connecting.",
    parameters: Type.Object({
      host: Type.Optional(Type.String({ description: "Server host (default from plugin config)" })),
      port: Type.Optional(Type.Integer({ description: "Server port (default from plugin config)" })),
      username: Type.Optional(Type.String({ description: "Bot username (default from plugin config)" })),
      version: Type.Optional(Type.String({ description: "MC version (default from plugin config)" })),
    }),
    async execute(_id: string, params: Record<string, unknown>) {
      const cfg = resolveConfig();
      const merged: mc.McConfig = {
        host: (params.host as string) ?? cfg.host,
        port: (params.port as number) ?? cfg.port,
        username: (params.username as string) ?? cfg.username,
        version: (params.version as string) ?? cfg.version,
      };
      const state = await mc.connect(merged);
      return json(state);
    },
  });

  // ── Disconnect ───────────────────────────────────────────────────────
  api.registerTool({
    name: "minecraft_disconnect",
    description: "Disconnect the Minecraft bot from the server.",
    parameters: Type.Object({}),
    execute() {
      return text(mc.disconnect());
    },
  });

  // ── Status ───────────────────────────────────────────────────────────
  api.registerTool({
    name: "minecraft_status",
    description: "Get the bot's current status: health, food, position, dimension, XP, and game mode.",
    parameters: Type.Object({}),
    execute() {
      return json(mc.snapshot());
    },
  });

  // ── Chat ─────────────────────────────────────────────────────────────
  api.registerTool({
    name: "minecraft_chat",
    description: "Send a chat message in the Minecraft server.",
    parameters: Type.Object({
      message: Type.String({ description: "Message to send" }),
    }),
    async execute(_id: string, params: { message: string }) {
      return text(await mc.chat(params.message));
    },
  });

  // ── Move to coordinates ──────────────────────────────────────────────
  api.registerTool({
    name: "minecraft_move",
    description: "Move the bot to specific x/y/z coordinates using pathfinding.",
    parameters: Type.Object({
      x: Type.Number({ description: "X coordinate" }),
      y: Type.Number({ description: "Y coordinate" }),
      z: Type.Number({ description: "Z coordinate" }),
    }),
    async execute(_id: string, params: { x: number; y: number; z: number }) {
      return text(await mc.moveTo(params.x, params.y, params.z));
    },
  });

  // ── Follow player ────────────────────────────────────────────────────
  api.registerTool({
    name: "minecraft_follow",
    description: "Follow a player by name.",
    parameters: Type.Object({
      player: Type.String({ description: "Player name to follow" }),
    }),
    async execute(_id: string, params: { player: string }) {
      return text(await mc.followPlayer(params.player));
    },
  });

  // ── Stop ─────────────────────────────────────────────────────────────
  api.registerTool({
    name: "minecraft_stop",
    description: "Stop all current bot actions (movement, digging, etc.).",
    parameters: Type.Object({}),
    execute() {
      return text(mc.stopActions());
    },
  });

  // ── Dig at ───────────────────────────────────────────────────────────
  api.registerTool({
    name: "minecraft_dig",
    description: "Dig/mine a block at specific coordinates.",
    parameters: Type.Object({
      x: Type.Number(),
      y: Type.Number(),
      z: Type.Number(),
    }),
    async execute(_id: string, params: { x: number; y: number; z: number }) {
      return text(await mc.digAt(params.x, params.y, params.z));
    },
  });

  // ── Place block ──────────────────────────────────────────────────────
  api.registerTool({
    name: "minecraft_place",
    description: "Place the currently held block at the specified coordinates.",
    parameters: Type.Object({
      x: Type.Number(),
      y: Type.Number(),
      z: Type.Number(),
    }),
    async execute(_id: string, params: { x: number; y: number; z: number }) {
      return text(await mc.placeBlock(params.x, params.y, params.z));
    },
  });

  // ── Collect blocks ───────────────────────────────────────────────────
  api.registerTool({
    name: "minecraft_collect",
    description: "Find and dig nearby blocks of a given type.",
    parameters: Type.Object({
      block: Type.String({ description: "Block name (e.g. oak_log, diamond_ore)" }),
      count: Type.Optional(Type.Integer({ description: "How many to collect (default 1)", minimum: 1 })),
    }),
    async execute(_id: string, params: { block: string; count?: number }) {
      return text(await mc.collectBlock(params.block, params.count ?? 1));
    },
  });

  // ── Inventory ────────────────────────────────────────────────────────
  api.registerTool({
    name: "minecraft_inventory",
    description: "List all items in the bot's inventory.",
    parameters: Type.Object({}),
    execute() {
      return text(mc.listInventory());
    },
  });

  // ── Equip ────────────────────────────────────────────────────────────
  api.registerTool({
    name: "minecraft_equip",
    description: "Equip an item from inventory to a slot.",
    parameters: Type.Object({
      item: Type.String({ description: "Item name (partial match)" }),
      slot: Type.Optional(Type.Union([
        Type.Literal("hand"),
        Type.Literal("off-hand"),
        Type.Literal("head"),
        Type.Literal("torso"),
        Type.Literal("legs"),
        Type.Literal("feet"),
      ], { description: "Equipment slot (default: hand)" })),
    }),
    async execute(_id: string, params: { item: string; slot?: string }) {
      return text(await mc.equipItem(params.item, params.slot ?? "hand"));
    },
  });

  // ── Toss ─────────────────────────────────────────────────────────────
  api.registerTool({
    name: "minecraft_toss",
    description: "Drop an item from inventory.",
    parameters: Type.Object({
      item: Type.String({ description: "Item name (partial match)" }),
      count: Type.Optional(Type.Integer({ description: "Number of items to drop" })),
    }),
    async execute(_id: string, params: { item: string; count?: number }) {
      return text(await mc.tossItem(params.item, params.count));
    },
  });

  // ── Craft ────────────────────────────────────────────────────────────
  api.registerTool({
    name: "minecraft_craft",
    description: "Craft an item (requires a nearby crafting table for complex recipes).",
    parameters: Type.Object({
      item: Type.String({ description: "Item name to craft" }),
      count: Type.Optional(Type.Integer({ description: "Quantity (default 1)", minimum: 1 })),
    }),
    async execute(_id: string, params: { item: string; count?: number }) {
      return text(await mc.craftItem(params.item, params.count ?? 1));
    },
  });

  // ── Attack ───────────────────────────────────────────────────────────
  api.registerTool({
    name: "minecraft_attack",
    description: "Attack a specific entity/player or the nearest hostile mob. Continuously attacks until the target is dead.",
    parameters: Type.Object({
      target: Type.Optional(Type.String({ description: "Entity or player name. Omit to attack nearest hostile." })),
    }),
    async execute(_id: string, params: { target?: string }) {
      if (params.target) return text(await mc.attackEntity(params.target));
      return text(await mc.attackNearest());
    },
  });

  // ── Players ──────────────────────────────────────────────────────────
  api.registerTool({
    name: "minecraft_players",
    description: "List all online players on the server.",
    parameters: Type.Object({}),
    execute() {
      const players = mc.listPlayers();
      return text(`Online (${players.length}): ${players.join(", ")}`);
    },
  });

  // ── Time ─────────────────────────────────────────────────────────────
  api.registerTool({
    name: "minecraft_time",
    description: "Get the current in-game time and day/night period.",
    parameters: Type.Object({}),
    execute() {
      return json(mc.getTime());
    },
  });

  // ── Weather ──────────────────────────────────────────────────────────
  api.registerTool({
    name: "minecraft_weather",
    description: "Get the current in-game weather.",
    parameters: Type.Object({}),
    execute() {
      return text(`Weather: ${mc.getWeather()}`);
    },
  });

  // ── Autonomous behaviors ─────────────────────────────────────────────
  api.registerTool({
    name: "minecraft_behavior_start",
    description: [
      "Start a continuous background behavior. Available behaviors:",
      "- auto_eat: Eat food when hunger drops below threshold (config: threshold)",
      "- guard: Attack hostile mobs within radius (config: radius)",
      "- auto_collect: Continuously mine a block type (config: block, radius)",
      "- auto_follow: Follow a player continuously (config: player, distance)",
      "- patrol: Walk between waypoints in a loop (config: waypoints [{x,y,z}...])",
    ].join("\n"),
    parameters: Type.Object({
      behavior: Type.String({ description: "Behavior name: auto_eat, guard, auto_collect, auto_follow, patrol" }),
      config: Type.Optional(Type.Record(Type.String(), Type.Unknown(), { description: "Behavior-specific config overrides (e.g. {\"block\": \"oak_log\", \"radius\": 32})" })),
    }),
    execute(_id: string, params: { behavior: string; config?: Record<string, unknown> }) {
      return text(auto.startBehavior(params.behavior, params.config));
    },
  });

  api.registerTool({
    name: "minecraft_behavior_stop",
    description: "Stop a running background behavior, or stop all behaviors if name is omitted.",
    parameters: Type.Object({
      behavior: Type.Optional(Type.String({ description: "Behavior name to stop. Omit to stop all." })),
    }),
    execute(_id: string, params: { behavior?: string }) {
      if (params.behavior) return text(auto.stopBehavior(params.behavior));
      return text(auto.stopAllBehaviors());
    },
  });

  api.registerTool({
    name: "minecraft_behavior_list",
    description: "List all available behaviors and their running status.",
    parameters: Type.Object({}),
    execute() {
      return json(auto.listBehaviors());
    },
  });
}
