// Minecraft bot wrapper that manages the mineflayer connection lifecycle.
// Each OpenClaw gateway process holds at most one active bot instance.

import mineflayer, { type Bot } from "mineflayer";
import { createRequire } from "node:module";
import { pathfinder, Movements, goals } from "mineflayer-pathfinder";
import { Vec3 } from "vec3";
import { initAutonomous, shutdownAutonomous } from "./autonomous.js";

const require = createRequire(import.meta.url);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface McConfig {
  host: string;
  port: number;
  username: string;
  version: string;
}

export type BotStatus = "disconnected" | "connecting" | "connected";

export interface BotState {
  status: BotStatus;
  health: number;
  food: number;
  position: { x: number; y: number; z: number } | null;
  dimension: string | null;
  experience: number;
  gameMode: string;
}

// ---------------------------------------------------------------------------
// Singleton bot manager
// ---------------------------------------------------------------------------

let bot: Bot | null = null;
let currentStatus: BotStatus = "disconnected";
let logger: { info: (msg: string) => void; warn: (msg: string) => void; error: (msg: string) => void } = console;

export function setLogger(l: typeof logger) {
  logger = l;
}

export function getBot(): Bot | null {
  return bot;
}

export function getBotOrThrow(): Bot {
  if (!bot) throw new Error("Minecraft bot is not connected. Use minecraft_connect first.");
  return bot;
}

export function getStatus(): BotStatus {
  return currentStatus;
}

// ---------------------------------------------------------------------------
// Connect / disconnect
// ---------------------------------------------------------------------------

export function connect(cfg: McConfig): Promise<BotState> {
  return new Promise((resolve, reject) => {
    if (bot) {
      resolve(snapshot());
      return;
    }

    currentStatus = "connecting";
    logger.info(`[MC] Connecting to ${cfg.host}:${cfg.port} as ${cfg.username} (v${cfg.version})...`);

    const b = mineflayer.createBot({
      host: cfg.host,
      port: cfg.port,
      username: cfg.username,
      version: cfg.version,
    });

    b.loadPlugin(pathfinder);

    b.once("spawn", () => {
      bot = b;
      currentStatus = "connected";

      // Set up pathfinder movements
      try {
        const mcData = require("minecraft-data")(b.version);
        const movements = new Movements(b);
        movements.canOpenDoors = true;
        b.pathfinder.setMovements(movements);
      } catch {
        // non-fatal — pathfinder still usable with defaults
      }

      logger.info(`[MC] Bot spawned as ${b.username}`);
      initAutonomous(b, logger);
      resolve(snapshot());
    });

    b.on("error", (err: Error) => {
      logger.error(`[MC] Error: ${err.message}`);
      if (currentStatus === "connecting") {
        currentStatus = "disconnected";
        reject(err);
      }
    });

    b.on("end", (reason: string) => {
      logger.warn(`[MC] Disconnected: ${reason}`);
      shutdownAutonomous();
      bot = null;
      currentStatus = "disconnected";
    });

    b.on("kicked", (reason: string) => {
      logger.warn(`[MC] Kicked: ${reason}`);
    });
  });
}

export function disconnect(): string {
  if (!bot) return "Already disconnected.";
  shutdownAutonomous();
  bot.quit();
  bot = null;
  currentStatus = "disconnected";
  return "Disconnected.";
}

// ---------------------------------------------------------------------------
// State snapshot
// ---------------------------------------------------------------------------

export function snapshot(): BotState {
  if (!bot) {
    return {
      status: "disconnected",
      health: 0,
      food: 0,
      position: null,
      dimension: null,
      experience: 0,
      gameMode: "unknown",
    };
  }
  const pos = bot.entity?.position;
  return {
    status: currentStatus,
    health: Math.round((bot.health ?? 0) * 10) / 10,
    food: bot.food ?? 0,
    position: pos ? { x: Math.round(pos.x * 10) / 10, y: Math.round(pos.y * 10) / 10, z: Math.round(pos.z * 10) / 10 } : null,
    dimension: (bot.game as any)?.dimension ?? null,
    experience: bot.experience?.level ?? 0,
    gameMode: (bot.game as any)?.gameMode ?? "unknown",
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Wait for the bot to reach a goal (with timeout). */
function waitForGoal(b: Bot, timeout = 30000): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      b.pathfinder.stop();
      reject(new Error("Pathfinding timed out."));
    }, timeout);

    b.once("goal_reached", () => { clearTimeout(timer); resolve(); });
    b.once("path_stop", () => { clearTimeout(timer); resolve(); });
  });
}

/** Navigate to a position and wait until arrival. */
async function navigateTo(b: Bot, pos: Vec3, range = 2): Promise<void> {
  const dist = b.entity.position.distanceTo(pos);
  if (dist <= range + 1) return; // already in range
  b.pathfinder.setGoal(new goals.GoalNear(pos.x, pos.y, pos.z, range));
  await waitForGoal(b);
}

// ---------------------------------------------------------------------------
// Actions (used by agent tools)
// ---------------------------------------------------------------------------

export async function chat(message: string): Promise<string> {
  const b = getBotOrThrow();
  b.chat(message);
  return `Sent: ${message}`;
}

export async function moveTo(x: number, y: number, z: number): Promise<string> {
  const b = getBotOrThrow();
  const target = new Vec3(x, y, z);
  b.pathfinder.setGoal(new goals.GoalNear(x, y, z, 1));
  await waitForGoal(b);
  const dist = Math.round(b.entity.position.distanceTo(target) * 10) / 10;
  return `Arrived near ${x}, ${y}, ${z} (distance: ${dist}).`;
}

export async function followPlayer(name: string): Promise<string> {
  const b = getBotOrThrow();
  const player = b.players[name];
  if (!player?.entity) throw new Error(`Cannot see player "${name}".`);
  const { GoalFollow } = goals;
  b.pathfinder.setGoal(new GoalFollow(player.entity, 3), true);
  return `Following ${name}.`;
}

export function stopActions(): string {
  const b = getBotOrThrow();
  b.pathfinder.stop();
  try { b.stopDigging(); } catch { /* ignore */ }
  return "Stopped all actions.";
}

export async function digAt(x: number, y: number, z: number): Promise<string> {
  const b = getBotOrThrow();
  const target = new Vec3(x, y, z);
  const block = b.blockAt(target);
  if (!block || block.name === "air") throw new Error("No solid block at that position.");

  // Move close enough to dig (reach ~4.5 blocks)
  await navigateTo(b, target, 4);

  await b.dig(block);
  return `Dug ${block.name} at ${x}, ${y}, ${z}.`;
}

export async function placeBlock(x: number, y: number, z: number): Promise<string> {
  const b = getBotOrThrow();
  const target = new Vec3(x, y, z);
  const refBlock = b.blockAt(target);
  if (!refBlock) throw new Error("No reference block at that position.");

  // Move close enough to place
  await navigateTo(b, target, 4);

  const faceVec = b.entity.position.minus(refBlock.position).normalize();
  await b.placeBlock(refBlock, faceVec);
  return "Block placed.";
}

export async function collectBlock(blockName: string, count: number): Promise<string> {
  const b = getBotOrThrow();
  const mcData = require("minecraft-data")(b.version);
  const blockType = mcData.blocksByName[blockName];
  if (!blockType) throw new Error(`Unknown block type: ${blockName}`);

  const positions = b.findBlocks({ matching: blockType.id, maxDistance: 64, count });
  if (positions.length === 0) throw new Error(`No ${blockName} found within 64 blocks.`);

  let collected = 0;
  for (const pos of positions) {
    const block = b.blockAt(pos);
    if (!block || block.name === "air") continue;

    try {
      // Navigate close to the block first
      await navigateTo(b, pos, 4);

      // Re-fetch the block after moving (chunks may have changed)
      const freshBlock = b.blockAt(pos);
      if (!freshBlock || freshBlock.name === "air") continue;

      await b.dig(freshBlock);
      collected++;
      logger.info(`[MC] Collected ${freshBlock.name} (${collected}/${count})`);
    } catch (err: any) {
      logger.warn(`[MC] Failed to collect at ${pos}: ${err.message}`);
    }
  }
  return `Collected ${collected}/${positions.length} ${blockName}.`;
}

export function listInventory(): string {
  const b = getBotOrThrow();
  const items = b.inventory.items();
  if (items.length === 0) return "Inventory is empty.";
  return items.map((i) => `${i.name} x${i.count}`).join(", ");
}

export async function equipItem(itemName: string, destination: string): Promise<string> {
  const b = getBotOrThrow();
  const item = b.inventory.items().find((i) => i.name.includes(itemName));
  if (!item) throw new Error(`No "${itemName}" in inventory.`);
  await b.equip(item, destination as any);
  return `Equipped ${item.name} to ${destination}.`;
}

export async function tossItem(itemName: string, count?: number): Promise<string> {
  const b = getBotOrThrow();
  const item = b.inventory.items().find((i) => i.name.includes(itemName));
  if (!item) throw new Error(`No "${itemName}" in inventory.`);
  await b.tossStack(item);
  return `Tossed ${item.name}.`;
}

export async function craftItem(itemName: string, count: number): Promise<string> {
  const b = getBotOrThrow();
  const mcData = require("minecraft-data")(b.version);
  const itemType = mcData.itemsByName[itemName];
  if (!itemType) throw new Error(`Unknown item: ${itemName}`);

  // First try without a crafting table (2x2 recipes)
  let craftingTable = null;
  let recipes = b.recipesFor(itemType.id, null, 1, null);

  if (recipes.length === 0) {
    // Need a crafting table — find one nearby or within 32 blocks
    const tableBlock = b.findBlock({
      matching: mcData.blocksByName["crafting_table"]?.id,
      maxDistance: 32,
    });

    if (!tableBlock) {
      throw new Error(`No available recipe for ${itemName}. No crafting table nearby (need one within 32 blocks for complex recipes).`);
    }

    // Navigate to the crafting table
    await navigateTo(b, tableBlock.position, 3);

    craftingTable = tableBlock;
    recipes = b.recipesFor(itemType.id, null, 1, craftingTable);

    if (recipes.length === 0) {
      throw new Error(`No available recipe for ${itemName} (missing materials?).`);
    }
  }

  await b.craft(recipes[0]!, count, craftingTable ?? undefined);
  return `Crafted ${itemName} x${count}.`;
}

/** Continuously attack an entity until it's dead or gone. */
async function attackUntilDead(b: Bot, entity: any): Promise<string> {
  const name = entity.name ?? (entity as any).username ?? "entity";

  return new Promise((resolve) => {
    const attackInterval = setInterval(() => {
      // Entity is dead or removed
      if (!entity.isValid) {
        clearInterval(attackInterval);
        b.pathfinder.stop();
        resolve(`Killed ${name}.`);
        return;
      }

      const dist = b.entity.position.distanceTo(entity.position);

      if (dist > 4) {
        // Chase the target
        b.pathfinder.setGoal(new goals.GoalFollow(entity, 2), true);
      } else {
        b.attack(entity);
      }
    }, 400); // attack cooldown ~0.4s

    // Safety timeout (60s)
    setTimeout(() => {
      clearInterval(attackInterval);
      b.pathfinder.stop();
      resolve(`Stopped attacking ${name} (timeout).`);
    }, 60000);
  });
}

export async function attackNearest(): Promise<string> {
  const b = getBotOrThrow();
  const hostile = b.nearestEntity((e) => e.type === "hostile" || e.type === "mob");
  if (!hostile) throw new Error("No hostile mobs nearby.");
  return attackUntilDead(b, hostile);
}

export async function attackEntity(name: string): Promise<string> {
  const b = getBotOrThrow();
  const player = b.players[name];
  if (player?.entity) {
    return attackUntilDead(b, player.entity);
  }
  // Try finding by entity name
  const entity = b.nearestEntity((e) => e.name === name || (e as any).username === name);
  if (!entity) throw new Error(`Cannot find entity "${name}".`);
  return attackUntilDead(b, entity);
}

export function listPlayers(): string[] {
  const b = getBotOrThrow();
  return Object.keys(b.players);
}

export function getTime(): { ticks: number; display: string; period: string } {
  const b = getBotOrThrow();
  const ticks = b.time.timeOfDay;
  const hours = (Math.floor(ticks / 1000) + 6) % 24;
  const minutes = Math.floor(((ticks % 1000) / 1000) * 60);
  const period = ticks >= 12000 ? "Night" : "Day";
  return {
    ticks,
    display: `${hours}:${minutes.toString().padStart(2, "0")}`,
    period,
  };
}

export function getWeather(): string {
  const b = getBotOrThrow();
  return b.isRaining ? "Rainy" : "Clear";
}

// Re-export goals for convenience
export { goals };
