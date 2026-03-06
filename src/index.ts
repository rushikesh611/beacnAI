import { loadConfig } from "./config/loader.js";
import { ProviderRegistry } from "./providers/registry.js";
import { SessionManager } from "./session/manager.js";
import { Memory } from "./memory/memory.js";
import { ToolRegistry } from "./tools/registry.js";
import { SkillLoader } from "./skills/loader.js";

const command = process.argv[2] ?? "gateway";

async function main() {
    console.log(`\n🗼 BeacnAI — OpenClaw-compatible agent\n`);

    const config = loadConfig();
    console.log(`✅ Config loaded`);

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

    switch (command) {
        case "gateway": {
            const { startGateway } = await import("./gateway/server.js");
            await startGateway(config, providers, sessions, memory, tools, skills);
            break;
        }

        case "chat": {
            const { startChat } = await import("./cli/chat.js");
            await startChat(config, providers, sessions, memory, tools, skills);
            break;
        }

        case "status": {
            printStatus(config, memory, tools, skills);
            break;
        }

        default:
            console.error(`Unknown command: ${command}`);
            process.exit(1);
    }
}

function printStatus(
    config: ReturnType<typeof loadConfig>,
    memory: Memory,
    tools: ToolRegistry,
    skills: SkillLoader
) {
    console.log("\n=== Status ===");
    console.log(`Gateway:   ${config.gateway.host}:${config.gateway.port}`);
    console.log(`Providers: ${Object.keys(config.providers).join(", ")}`);
    console.log(`Agents:    ${Object.keys(config.agents).join(", ")}`);
    console.log(`Channels:  ${Object.keys(config.channels).join(", ") || "none"}`);
    console.log(`Memories:  ${memory.list().length} entries`);
    console.log(`Tools:     ${tools.list().join(", ")}`);
    console.log(`Skills:    ${skills.list().map((s) => s.meta.name).join(", ") || "none"}`);
}

main().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
});