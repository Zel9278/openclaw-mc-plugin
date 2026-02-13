// In-game chat command handler for standalone mode.
// Responds to messages like "!help", "!status", "!come", etc.

import type { Bot } from "mineflayer";
import * as mc from "./mc-bot.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChatCommand {
  name: string;
  aliases?: string[];
  description: string;
  usage: string;
  ownerOnly?: boolean;
  execute: (bot: Bot, sender: string, args: string[], reply: (msg: string) => void) => void | Promise<void>;
}

// ---------------------------------------------------------------------------
// Command registry
// ---------------------------------------------------------------------------

const commands: ChatCommand[] = [
  // ── Info ──────────────────────────────────────────────────────────────
  {
    name: "help",
    aliases: ["h", "?"],
    description: "List commands or show details for one",
    usage: "!help [command]",
    execute(_bot, _sender, args, reply) {
      if (args[0]) {
        const cmd = commands.find((c) => c.name === args[0] || c.aliases?.includes(args[0]!));
        if (!cmd) { reply(`Unknown command: ${args[0]}`); return; }
        reply(`${cmd.name}: ${cmd.description} | ${cmd.usage}`);
        return;
      }
      reply(`Commands: ${commands.map((c) => c.name).join(", ")} | !help <cmd> for details`);
    },
  },
  {
    name: "status",
    aliases: ["stat", "info"],
    description: "Show bot status",
    usage: "!status",
    execute(_bot, _sender, _args, reply) {
      const s = mc.snapshot();
      const pos = s.position;
      reply(`HP: ${s.health}/20 | Food: ${s.food}/20 | XP: ${s.experience} | Pos: ${pos ? `${pos.x}, ${pos.y}, ${pos.z}` : "?"}`);
    },
  },
  {
    name: "players",
    aliases: ["who", "online"],
    description: "List online players",
    usage: "!players",
    execute(_bot, _sender, _args, reply) {
      const p = mc.listPlayers();
      reply(`Online (${p.length}): ${p.join(", ")}`);
    },
  },
  {
    name: "time",
    description: "Show in-game time",
    usage: "!time",
    execute(_bot, _sender, _args, reply) {
      const t = mc.getTime();
      reply(`Time: ${t.display} (${t.period})`);
    },
  },
  {
    name: "weather",
    description: "Show weather",
    usage: "!weather",
    execute(_bot, _sender, _args, reply) {
      reply(`Weather: ${mc.getWeather()}`);
    },
  },

  // ── Movement ─────────────────────────────────────────────────────────
  {
    name: "come",
    aliases: ["here"],
    description: "Move to the sender",
    usage: "!come",
    async execute(bot, sender, _args, reply) {
      const player = bot.players[sender];
      if (!player?.entity) { reply("I can't see you!"); return; }
      reply(`Coming to you, ${sender}!`);
      await mc.moveTo(player.entity.position.x, player.entity.position.y, player.entity.position.z);
    },
  },
  {
    name: "goto",
    aliases: ["go", "move"],
    description: "Move to coordinates",
    usage: "!goto <x> <y> <z>",
    async execute(_bot, _sender, args, reply) {
      const [x, y, z] = args.map(Number);
      if (isNaN(x!) || isNaN(y!) || isNaN(z!)) { reply("Usage: !goto <x> <y> <z>"); return; }
      reply(`Moving to ${x}, ${y}, ${z}...`);
      await mc.moveTo(x!, y!, z!);
    },
  },
  {
    name: "follow",
    aliases: ["stalk"],
    description: "Follow a player",
    usage: "!follow [player]",
    async execute(_bot, sender, args, reply) {
      const target = args[0] ?? sender;
      try {
        reply(await mc.followPlayer(target));
      } catch (e: any) {
        reply(e.message);
      }
    },
  },
  {
    name: "stop",
    aliases: ["halt", "cancel"],
    description: "Stop all actions",
    usage: "!stop",
    execute(_bot, _sender, _args, reply) {
      reply(mc.stopActions());
    },
  },
  {
    name: "jump",
    description: "Jump",
    usage: "!jump",
    execute(bot, _sender, _args, reply) {
      bot.setControlState("jump", true);
      setTimeout(() => bot.setControlState("jump", false), 500);
      reply("Jumped!");
    },
  },
  {
    name: "look",
    description: "Look at a player",
    usage: "!look [player]",
    async execute(bot, sender, args, reply) {
      const target = args[0] ?? sender;
      const player = bot.players[target];
      if (!player?.entity) { reply(`Can't see ${target}!`); return; }
      await bot.lookAt(player.entity.position.offset(0, 1.6, 0));
      reply(`Looking at ${target}.`);
    },
  },

  // ── Mining ───────────────────────────────────────────────────────────
  {
    name: "dig",
    aliases: ["mine", "break"],
    description: "Dig the block you're looking at",
    usage: "!dig",
    async execute(bot, _sender, _args, reply) {
      const block = bot.blockAtCursor(5);
      if (!block) { reply("No block in range."); return; }
      reply(`Digging ${block.name}...`);
      await bot.dig(block);
      reply(`Done digging ${block.name}.`);
    },
  },
  {
    name: "digat",
    description: "Dig a block at coordinates",
    usage: "!digat <x> <y> <z>",
    async execute(_bot, _sender, args, reply) {
      const [x, y, z] = args.map(Number);
      if (isNaN(x!) || isNaN(y!) || isNaN(z!)) { reply("Usage: !digat <x> <y> <z>"); return; }
      try {
        reply(await mc.digAt(x!, y!, z!));
      } catch (e: any) {
        reply(e.message);
      }
    },
  },
  {
    name: "collect",
    aliases: ["gather"],
    description: "Collect nearby blocks by type",
    usage: "!collect <block> [count]",
    async execute(_bot, _sender, args, reply) {
      if (!args[0]) { reply("Usage: !collect <block> [count]"); return; }
      const count = parseInt(args[1] ?? "1", 10);
      try {
        reply(await mc.collectBlock(args[0], count));
      } catch (e: any) {
        reply(e.message);
      }
    },
  },
  {
    name: "place",
    description: "Place the held block",
    usage: "!place <x> <y> <z>",
    async execute(_bot, _sender, args, reply) {
      const [x, y, z] = args.map(Number);
      if (isNaN(x!) || isNaN(y!) || isNaN(z!)) { reply("Usage: !place <x> <y> <z>"); return; }
      try {
        reply(await mc.placeBlock(x!, y!, z!));
      } catch (e: any) {
        reply(e.message);
      }
    },
  },

  // ── Inventory ────────────────────────────────────────────────────────
  {
    name: "inventory",
    aliases: ["inv", "items"],
    description: "List inventory",
    usage: "!inventory",
    execute(_bot, _sender, _args, reply) {
      reply(mc.listInventory());
    },
  },
  {
    name: "equip",
    description: "Equip an item",
    usage: "!equip <item> [hand|head|torso|legs|feet]",
    async execute(_bot, _sender, args, reply) {
      if (!args[0]) { reply("Usage: !equip <item> [slot]"); return; }
      try {
        reply(await mc.equipItem(args[0], args[1] ?? "hand"));
      } catch (e: any) {
        reply(e.message);
      }
    },
  },
  {
    name: "toss",
    aliases: ["drop", "throw"],
    description: "Toss an item",
    usage: "!toss <item> [count]",
    async execute(_bot, _sender, args, reply) {
      if (!args[0]) { reply("Usage: !toss <item>"); return; }
      try {
        reply(await mc.tossItem(args[0]));
      } catch (e: any) {
        reply(e.message);
      }
    },
  },
  {
    name: "hold",
    aliases: ["select"],
    description: "Hold an item in hand",
    usage: "!hold <item>",
    async execute(_bot, _sender, args, reply) {
      if (!args[0]) { reply("Usage: !hold <item>"); return; }
      try {
        reply(await mc.equipItem(args[0], "hand"));
      } catch (e: any) {
        reply(e.message);
      }
    },
  },
  {
    name: "craft",
    description: "Craft an item",
    usage: "!craft <item> [count]",
    async execute(_bot, _sender, args, reply) {
      if (!args[0]) { reply("Usage: !craft <item> [count]"); return; }
      const count = parseInt(args[1] ?? "1", 10);
      try {
        reply(await mc.craftItem(args[0], count));
      } catch (e: any) {
        reply(e.message);
      }
    },
  },

  // ── Combat ───────────────────────────────────────────────────────────
  {
    name: "attack",
    aliases: ["fight", "kill"],
    description: "Attack a player or nearest hostile",
    usage: "!attack [target]",
    async execute(_bot, _sender, args, reply) {
      try {
        if (args[0]) {
          reply(await mc.attackEntity(args[0]));
        } else {
          reply(await mc.attackNearest());
        }
      } catch (e: any) {
        reply(e.message);
      }
    },
  },
  {
    name: "flee",
    aliases: ["run"],
    description: "Run away from danger",
    usage: "!flee [distance]",
    execute(bot, _sender, args, reply) {
      const distance = parseInt(args[0] ?? "20", 10);
      const hostile = bot.nearestEntity((e) => e.type === "hostile");
      if (!hostile) { reply("No threats nearby."); return; }
      const dir = bot.entity.position.minus(hostile.position).normalize().scale(distance);
      const target = bot.entity.position.plus(dir);
      mc.moveTo(target.x, target.y, target.z);
      reply(`Fleeing ${distance} blocks!`);
    },
  },

  // ── Chat ─────────────────────────────────────────────────────────────
  {
    name: "say",
    aliases: ["chat"],
    description: "Send a chat message",
    usage: "!say <message>",
    async execute(_bot, _sender, args, reply) {
      const msg = args.join(" ");
      if (!msg) { reply("Usage: !say <message>"); return; }
      await mc.chat(msg);
    },
  },

  // ── Admin ────────────────────────────────────────────────────────────
  {
    name: "disconnect",
    aliases: ["quit", "dc"],
    description: "Disconnect the bot (owner only)",
    usage: "!disconnect",
    ownerOnly: true,
    execute(_bot, _sender, _args, reply) {
      reply("Goodbye!");
      setTimeout(() => {
        mc.disconnect();
        process.exit(0);
      }, 1000);
    },
  },
];

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

export function setupChatCommands(bot: Bot, prefix: string, owner: string) {
  // Build alias map
  const aliasMap = new Map<string, string>();
  for (const cmd of commands) {
    if (cmd.aliases) {
      for (const alias of cmd.aliases) {
        aliasMap.set(alias, cmd.name);
      }
    }
  }

  const handleMessage = (sender: string, message: string, whisper: boolean) => {
    if (sender === bot.username) return;
    if (!message.startsWith(prefix)) return;

    const parts = message.slice(prefix.length).trim().split(/\s+/);
    const name = parts[0]?.toLowerCase();
    if (!name) return;

    const resolved = aliasMap.get(name) ?? name;
    const cmd = commands.find((c) => c.name === resolved);
    if (!cmd) {
      reply(`Unknown command: ${name}`);
      return;
    }

    if (cmd.ownerOnly && owner && sender !== owner) {
      reply("Permission denied.");
      return;
    }

    const args = parts.slice(1);

    function reply(msg: string) {
      if (whisper) {
        bot.whisper(sender, msg);
      } else {
        bot.chat(msg);
      }
    }

    try {
      const result = cmd.execute(bot, sender, args, reply);
      if (result instanceof Promise) {
        result.catch((err: any) => reply(`Error: ${err.message ?? err}`));
      }
    } catch (err: any) {
      reply(`Error: ${err.message ?? err}`);
    }
  };

  bot.on("chat", (username, message) => handleMessage(username, message, false));
  bot.on("whisper", (username, message) => handleMessage(username, message, true));
}
