---
name: minecraft
description: Control a Minecraft Java Edition bot — connect, move, mine, build, fight, craft, and manage inventory.
metadata: { "openclaw": { "requires": { "config": ["plugins.entries.minecraft.enabled"] }, "emoji": "🎮" } }
---

# Minecraft Bot Skill

You have access to a set of `minecraft_*` tools that let you control a Minecraft
Java Edition bot running on a server via the mineflayer library.

## Workflow

1. **Connect first.** Always call `minecraft_connect` before any other tool.
   You can optionally pass `host`, `port`, `username`, and `version` to override
   the defaults from the plugin config.
2. **Check status.** Use `minecraft_status` to see health, food, position,
   dimension, XP, and game mode.
3. **Perform actions.** Use the tools below.
4. **Disconnect** when done via `minecraft_disconnect`.

## Available tools

| Tool | Purpose |
|---|---|
| `minecraft_connect` | Connect to a Minecraft server |
| `minecraft_disconnect` | Disconnect from the server |
| `minecraft_status` | Bot health / food / position / XP |
| `minecraft_chat` | Send a chat message |
| `minecraft_move` | Pathfind to x/y/z coordinates |
| `minecraft_follow` | Follow a player by name |
| `minecraft_stop` | Stop all current actions |
| `minecraft_dig` | Dig a block at x/y/z |
| `minecraft_place` | Place the held block at x/y/z |
| `minecraft_collect` | Find and mine nearby blocks by type |
| `minecraft_inventory` | List inventory contents |
| `minecraft_equip` | Equip an item to a slot |
| `minecraft_toss` | Drop an item |
| `minecraft_craft` | Craft an item (needs crafting table nearby for complex recipes) |
| `minecraft_attack` | Attack a mob/player (or nearest hostile) |
| `minecraft_players` | List online players |
| `minecraft_time` | Current in-game time |
| `minecraft_weather` | Current in-game weather |
| `minecraft_behavior_start` | Start a continuous background behavior |
| `minecraft_behavior_stop` | Stop a behavior (or all) |
| `minecraft_behavior_list` | List all behaviors and their status |

## Background Behaviors

These run continuously in the background without repeated tool calls:

| Behavior | Description | Config |
|---|---|---|
| `auto_eat` | Eat food when hunger falls below threshold | `threshold` (default 14) |
| `guard` | Attack hostile mobs within radius | `radius` (default 16) |
| `auto_collect` | Mine a specific block type nearby | `block` (e.g. "oak_log"), `radius` (default 32) |
| `auto_follow` | Follow a player continuously | `player` (name), `distance` (default 3) |
| `patrol` | Walk between waypoints in a loop | `waypoints` ([{x,y,z}, ...]) |

### Examples
- "Keep me safe" → `minecraft_behavior_start` with `behavior: "guard"`
- "Collect 木" → `minecraft_behavior_start` with `behavior: "auto_collect"`, `config: {"block": "oak_log"}`
- "Follow me" → `minecraft_behavior_start` with `behavior: "auto_follow"`, `config: {"player": "<username>"}`
- "Patrol these points" → `minecraft_behavior_start` with `behavior: "patrol"`, `config: {"waypoints": [...]}`
- "Stop everything" → `minecraft_behavior_stop` (no behavior param = stop all)

## Tips

- Block and item names use Minecraft's internal IDs: `oak_log`, `diamond_ore`,
  `cooked_beef`, `iron_pickaxe`, etc.
- The bot uses A* pathfinding. Complex terrain may take time.
- Crafting complex items requires a `crafting_table` within 32 blocks (bot will
  pathfind to it).
- When the user says "come here" or "follow me", use `minecraft_follow` with
  their player name for one-time, or `minecraft_behavior_start` with
  `auto_follow` for continuous following.
- Always check `minecraft_status` after risky actions (combat, mining) to report
  health changes.
- For long-running tasks (mining, guarding, following), prefer background
  behaviors over repeated tool calls. They run autonomously until stopped.
