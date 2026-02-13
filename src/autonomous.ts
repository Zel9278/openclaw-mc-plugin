// Autonomous behavior system — runs continuously in the background.
// Each behavior is a named loop that ticks on its own interval.
// Behaviors can be started/stopped/configured via agent tools or chat commands.

import type { Bot } from "mineflayer";
import { createRequire } from "node:module";
import { goals } from "mineflayer-pathfinder";
import { Vec3 } from "vec3";

const require = createRequire(import.meta.url);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BehaviorState {
  enabled: boolean;
  /** Behavior-specific config / state */
  [key: string]: unknown;
}

interface BehaviorDef {
  name: string;
  description: string;
  defaultConfig: Record<string, unknown>;
  tick: (bot: Bot, config: Record<string, unknown>, log: Logger) => Promise<void> | void;
  interval: number; // ms between ticks
}

type Logger = {
  info: (msg: string) => void;
  warn: (msg: string) => void;
  error: (msg: string) => void;
};

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const behaviorDefs: BehaviorDef[] = [];
const activeTimers = new Map<string, ReturnType<typeof setInterval>>();
const behaviorStates = new Map<string, BehaviorState>();

let _bot: Bot | null = null;
let _logger: Logger = console;

export function initAutonomous(bot: Bot, logger: Logger) {
  _bot = bot;
  _logger = logger;
}

export function shutdownAutonomous() {
  for (const [name] of activeTimers) {
    stopBehavior(name);
  }
  _bot = null;
}

// ---------------------------------------------------------------------------
// Control API
// ---------------------------------------------------------------------------

export function startBehavior(name: string, configOverrides?: Record<string, unknown>): string {
  if (!_bot) throw new Error("Bot not connected.");
  const def = behaviorDefs.find((d) => d.name === name);
  if (!def) throw new Error(`Unknown behavior: ${name}. Available: ${behaviorDefs.map((d) => d.name).join(", ")}`);

  if (activeTimers.has(name)) {
    // Update config if already running
    if (configOverrides) {
      const state = behaviorStates.get(name)!;
      Object.assign(state, configOverrides);
      return `Behavior "${name}" config updated.`;
    }
    return `Behavior "${name}" is already running.`;
  }

  const state: BehaviorState = { enabled: true, ...def.defaultConfig, ...configOverrides };
  behaviorStates.set(name, state);

  const timer = setInterval(async () => {
    if (!_bot || !state.enabled) return;
    try {
      await def.tick(_bot, state as Record<string, unknown>, _logger);
    } catch (err: any) {
      _logger.warn(`[Auto:${name}] ${err.message}`);
    }
  }, def.interval);

  activeTimers.set(name, timer);
  _logger.info(`[Auto] Started behavior: ${name}`);
  return `Behavior "${name}" started.`;
}

export function stopBehavior(name: string): string {
  const timer = activeTimers.get(name);
  if (!timer) return `Behavior "${name}" is not running.`;
  clearInterval(timer);
  activeTimers.delete(name);
  const state = behaviorStates.get(name);
  if (state) state.enabled = false;
  _logger.info(`[Auto] Stopped behavior: ${name}`);
  return `Behavior "${name}" stopped.`;
}

export function listBehaviors(): { name: string; description: string; running: boolean; config: Record<string, unknown> }[] {
  return behaviorDefs.map((def) => ({
    name: def.name,
    description: def.description,
    running: activeTimers.has(def.name),
    config: (behaviorStates.get(def.name) as Record<string, unknown>) ?? def.defaultConfig,
  }));
}

export function stopAllBehaviors(): string {
  const names = [...activeTimers.keys()];
  for (const name of names) stopBehavior(name);
  return names.length > 0 ? `Stopped: ${names.join(", ")}` : "No behaviors were running.";
}

// ---------------------------------------------------------------------------
// Built-in behaviors
// ---------------------------------------------------------------------------

// ── Auto-eat: eat food when hunger drops below threshold ────────────────

let isEating = false;

const FOOD_ITEMS = [
  "cooked_beef", "cooked_porkchop", "cooked_chicken", "cooked_mutton",
  "cooked_salmon", "cooked_cod", "golden_apple", "golden_carrot",
  "baked_potato", "bread", "apple", "carrot", "melon_slice",
  "sweet_berries", "cooked_rabbit", "mushroom_stew", "beetroot_soup",
  "rabbit_stew", "pumpkin_pie", "cookie",
];

behaviorDefs.push({
  name: "auto_eat",
  description: "Automatically eat food when hunger drops below a threshold",
  defaultConfig: { threshold: 14 },
  interval: 2000,
  async tick(bot, config, log) {
    if (isEating) return;
    const threshold = (config.threshold as number) ?? 14;
    if (bot.food >= threshold) return;

    const food = bot.inventory.items().find((i) => FOOD_ITEMS.some((f) => i.name.includes(f)));
    if (!food) return;

    isEating = true;
    try {
      await bot.equip(food, "hand");
      bot.activateItem(false);
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => { bot.deactivateItem(); resolve(); }, 4000);
        bot.once("health", () => { clearTimeout(timeout); resolve(); });
      });
      log.info(`[Auto:auto_eat] Ate ${food.name} (food: ${bot.food})`);
    } catch { /* ignore */ } finally {
      isEating = false;
    }
  },
});

// ── Guard: attack hostile mobs within radius ────────────────────────────

behaviorDefs.push({
  name: "guard",
  description: "Attack hostile mobs that come within a radius",
  defaultConfig: { radius: 16 },
  interval: 500,
  tick(bot, config) {
    const radius = (config.radius as number) ?? 16;
    if (bot.health <= 0) return;

    // Don't interfere if already pathfinding for another reason
    // (only guard when idle)

    const hostiles = Object.values(bot.entities).filter((e) => {
      if (!e || e.type !== "hostile") return false;
      return e.position.distanceTo(bot.entity.position) <= radius;
    });

    if (hostiles.length === 0) return;

    hostiles.sort((a, b) =>
      a!.position.distanceTo(bot.entity.position) - b!.position.distanceTo(bot.entity.position)
    );

    const target = hostiles[0]!;
    const dist = target.position.distanceTo(bot.entity.position);

    if (dist <= 4) {
      bot.attack(target);
    } else {
      bot.pathfinder.setGoal(new goals.GoalFollow(target, 2), true);
    }
  },
});

// ── Auto-collect: continuously gather a specific block type ─────────────

behaviorDefs.push({
  name: "auto_collect",
  description: "Continuously find and mine a specific block type nearby",
  defaultConfig: { block: "oak_log", radius: 32, pauseMs: 1000 },
  interval: 3000,
  async tick(bot, config, log) {
    const blockName = config.block as string;
    const radius = (config.radius as number) ?? 32;
    if (!blockName) return;

    const mcData = require("minecraft-data")(bot.version);
    const blockType = mcData.blocksByName[blockName];
    if (!blockType) return;

    const positions: Vec3[] = bot.findBlocks({ matching: blockType.id, maxDistance: radius, count: 1 });
    if (positions.length === 0) return;

    const pos = positions[0]!;
    const block = bot.blockAt(pos);
    if (!block || block.name === "air") return;

    // Navigate to it
    const dist = bot.entity.position.distanceTo(pos);
    if (dist > 5) {
      bot.pathfinder.setGoal(new goals.GoalNear(pos.x, pos.y, pos.z, 3));
      // Wait for arrival (simplified)
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(resolve, 15000);
        bot.once("goal_reached", () => { clearTimeout(timeout); resolve(); });
        bot.once("path_stop", () => { clearTimeout(timeout); resolve(); });
      });
    }

    // Re-check block after moving
    const freshBlock = bot.blockAt(pos);
    if (!freshBlock || freshBlock.name === "air") return;

    try {
      await bot.dig(freshBlock);
      log.info(`[Auto:auto_collect] Mined ${freshBlock.name}`);
    } catch { /* skip */ }
  },
});

// ── Follow: continuously follow a player ────────────────────────────────

behaviorDefs.push({
  name: "auto_follow",
  description: "Continuously follow a specific player",
  defaultConfig: { player: "", distance: 3 },
  interval: 1000,
  tick(bot, config) {
    const playerName = config.player as string;
    const distance = (config.distance as number) ?? 3;
    if (!playerName) return;

    const player = bot.players[playerName];
    if (!player?.entity) return;

    const dist = bot.entity.position.distanceTo(player.entity.position);
    if (dist > distance + 1) {
      bot.pathfinder.setGoal(new goals.GoalFollow(player.entity, distance), true);
    }
  },
});

// ── Patrol: walk between waypoints in a loop ────────────────────────────

behaviorDefs.push({
  name: "patrol",
  description: "Walk between a list of waypoints continuously",
  defaultConfig: { waypoints: [] as { x: number; y: number; z: number }[], currentIndex: 0, waitMs: 2000 },
  interval: 3000,
  async tick(bot, config) {
    const waypoints = config.waypoints as { x: number; y: number; z: number }[];
    if (!waypoints || waypoints.length === 0) return;

    const idx = (config.currentIndex as number) ?? 0;
    const wp = waypoints[idx % waypoints.length]!;
    const target = new Vec3(wp.x, wp.y, wp.z);
    const dist = bot.entity.position.distanceTo(target);

    if (dist <= 3) {
      // Reached waypoint, move to next
      config.currentIndex = (idx + 1) % waypoints.length;
      return;
    }

    bot.pathfinder.setGoal(new goals.GoalNear(wp.x, wp.y, wp.z, 2));
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(resolve, 30000);
      bot.once("goal_reached", () => { clearTimeout(timeout); resolve(); });
      bot.once("path_stop", () => { clearTimeout(timeout); resolve(); });
    });
  },
});
