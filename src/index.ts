import { loadConfig } from "./config/loader";

const command = process.argv[2] ?? "gateway";

async function main() {
    console.log(`\n🗼 BeacnAI — OpenClaw-compatible agent\n`);

    let config;

    try {
        config = loadConfig()
        console.log(`✅ Config loaded`);
    } catch (err) {
        console.error(`❌ ${err instanceof Error ? err.message : err}`);
        process.exit(1);
    }
    switch (command) {
        case "gateway": {
            const { ProviderRegistry } = await import("./providers/registry.js");
            const { startGateway } = await import("./gateway/server.js");

            console.log("\n📦 Loading providers...");
            const providerRegistry = new ProviderRegistry(config);

            await startGateway(config, providerRegistry);
            break;
        }

        case "chat": {
            const { startChat } = await import("./cli/chat.js");
            await startChat(config);
            break;
        }

        case "status": {
            printStatus(config);
            break;
        }

        default:
            console.error(`Unknown command: ${command}`);
            console.log(`Usage: bun run src/index.ts <gateway|chat|status>`);
            process.exit(1);
    }
}

function printStatus(config: ReturnType<typeof loadConfig>) {
    console.log("=== Status ===");
    console.log(`Gateway: ${config.gateway.host}:${config.gateway.port}`);
    console.log(`Providers: ${Object.keys(config.providers).join(", ")}`);
    console.log(`Agents: ${Object.keys(config.agents).join(", ")}`);
    console.log(`Channels: ${Object.keys(config.channels).join(", ") || "none"}`);
    console.log(`Skills dir: ${config.skillsDir}`);
    console.log(`Workspace: ${config.workspaceDir}`);
}

main().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
});