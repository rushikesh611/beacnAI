import { loadConfig } from "./config/loader.js";
import { ProviderRegistry } from "./providers/registry.js";
import { SessionManager } from "./session/manager.js";
import { Memory } from "./memory/memory.js";
import { ToolRegistry } from "./tools/registry.js";
import { SkillLoader } from "./skills/loader.js";
import { AgentRuntime } from "./agent/runtime.js";

const [command, ...args] = process.argv.slice(2);

async function main() {
    console.log(`\n🗼 BeacnAI — OpenClaw-compatible agent\n`);

    // ── Commands that don't need config ─────────────────────────────────────────
    if (command === "help" || command === "--help" || command === "-h" || !command) {
        printHelp();
        return;
    }

    if (command === "connect") {
        const { wsClientCommand } = await import("./cli/commands/ws-client.js");
        await wsClientCommand(args);
        return;
    }

    // ── Commands that need config ────────────────────────────────────────────────
    let config;
    try {
        config = loadConfig(args.find((a) => a.startsWith("--config="))?.split("=")[1]);
        console.log(`✅ Config loaded`);
    } catch (err) {
        console.error(`❌ ${err instanceof Error ? err.message : err}`);
        process.exit(1);
    }

    console.log(`\n📦 Loading providers...`);
    const providers = new ProviderRegistry(config);

    console.log(`\n🗂️  Initializing session manager...`);
    const sessions = new SessionManager(config.workspaceDir);

    console.log(`\n🧠 Initializing memory...`);
    const memory = new Memory(config.workspaceDir);
    console.log(`   ${memory.list().length} memories loaded`);

    console.log(`\n🔧 Registering tools...`);
    const tools = new ToolRegistry();

    console.log(`\n📖 Loading skills...`);
    const skills = new SkillLoader(config.skillsDir);
    console.log(`   ${skills.list().length} skills loaded`);

    // ── Route command ────────────────────────────────────────────────────────────
    switch (command) {
        case "gateway":
        case "start": {
            const { startGateway } = await import("./gateway/server.js");
            await startGateway(config, providers, sessions, memory, tools, skills);
            break;
        }

        case "chat": {
            const runtime = new AgentRuntime(config, providers, sessions, memory, tools, skills);
            const { chatCommand } = await import("./cli/commands/chat.js");
            await chatCommand(config, runtime, sessions, memory, skills);
            break;
        }

        case "status": {
            const { statusCommand } = await import("./cli/commands/status.js");
            statusCommand(config, memory, tools, skills, providers);
            break;
        }

        case "memory": {
            const { memoryCommand } = await import("./cli/commands/memory.js");
            memoryCommand(args, memory);
            break;
        }

        default:
            console.error(`❌ Unknown command: "${command}"`);
            console.log(`Run "bun run src/index.ts help" for usage.\n`);
            process.exit(1);
    }
}

function printHelp() {
    console.log(`Usage: bun run src/index.ts <command> [options]

Commands:
  gateway              Start the gateway daemon (WebSocket + channels)
  chat                 Interactive chat in the terminal
  status               Show config, tools, skills, and memory summary
  memory <sub>         Manage agent memory
  connect [url]        Connect to a running gateway via WebSocket

Memory subcommands:
  memory list          List all memories
  memory get <key>     Get a memory by key
  memory set <key>     Set a memory manually
  memory delete <key>  Delete a memory
  memory search <q>    Search memories by keyword

Options:
  --config=<path>      Path to config file (default: openclaw.json)

Examples:
  bun run src/index.ts gateway
  bun run src/index.ts chat
  bun run src/index.ts memory list
  bun run src/index.ts memory set user-name "Hrushikesh"
  bun run src/index.ts connect ws://127.0.0.1:18789
`);
}

main().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
});