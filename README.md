# @openclaw/minecraft

OpenClaw plugin for controlling a Minecraft Java Edition bot via [mineflayer](https://github.com/PrismarineJS/mineflayer).

The plugin registers **18 agent tools** (`minecraft_*`) so the AI assistant can
connect to a Minecraft server, move around, mine, build, fight, craft, and
manage inventory — all through natural language.

## Install

```bash
# From npm (when published)
openclaw plugins install @openclaw/minecraft

# Local development
openclaw plugins install -l ./path/to/openclaw-mc-plugin
```

## Configure

Add to `~/.openclaw/openclaw.json`:

```jsonc
{
  "plugins": {
    "entries": {
      "minecraft": {
        "enabled": true,
        "config": {
          "host": "localhost",
          "port": 25565,
          "username": "OpenClaw",
          "version": "1.20.4",
          "autoConnect": false
        }
      }
    }
  }
}
```

## Usage

Once enabled, just talk to your OpenClaw assistant:

> "Minecraftサーバーに接続して"
> "ダイヤモンドを掘って"
> "位置 100, 64, -200 に移動して"
> "インベントリを見せて"
> "木を10本集めて"

The `/mc` slash command shows a quick status summary.

## Available tools

| Tool | Description |
|---|---|
| `minecraft_connect` | Connect to a MC server |
| `minecraft_disconnect` | Disconnect |
| `minecraft_status` | Health, food, position, XP |
| `minecraft_chat` | Send a chat message |
| `minecraft_move` | Pathfind to x/y/z |
| `minecraft_follow` | Follow a player |
| `minecraft_stop` | Stop all actions |
| `minecraft_dig` | Dig a block at x/y/z |
| `minecraft_place` | Place a block |
| `minecraft_collect` | Find and mine blocks by type |
| `minecraft_inventory` | List inventory |
| `minecraft_equip` | Equip an item |
| `minecraft_toss` | Drop an item |
| `minecraft_craft` | Craft an item |
| `minecraft_attack` | Attack mob/player |
| `minecraft_players` | List online players |
| `minecraft_time` | In-game time |
| `minecraft_weather` | In-game weather |

## Development

```bash
pnpm install
pnpm build          # compile TypeScript → dist/
pnpm dev            # watch mode

# Link for local testing
openclaw plugins install -l .
```

## Project structure

```
openclaw-mc-plugin/
├── openclaw.plugin.json   # Plugin manifest (id, config schema, skills)
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts           # Plugin entry — registers tools + /mc command
│   ├── tools.ts           # Agent tool definitions (18 tools)
│   └── mc-bot.ts          # mineflayer bot wrapper (singleton)
└── skills/
    └── minecraft/
        └── SKILL.md       # AgentSkills-compatible skill file
```

## License

MIT
