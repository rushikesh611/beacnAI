import * as readline from "readline";
import { type AppConfig } from "../config/schema.js";
import type { ProviderRegistry } from "../providers/registry.js";
import type { SessionManager } from "../session/manager.js";
import type { Memory } from "../memory/memory.js";
import type { ToolRegistry } from "../tools/registry.js";
import type { SkillLoader } from "../skills/loader.js";

export async function startChat(config: AppConfig, providers: ProviderRegistry, sessions: SessionManager, memory: Memory, tools: ToolRegistry, skills: SkillLoader) {
    console.log("💬 Chat mode — type your message, Ctrl+C to exit\n");
    console.log("(TODO:Agent loop — this is the CLI shell)\n");

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    const prompt = () => {
        rl.question("You: ", async (input) => {
            const trimmed = input.trim();
            if (!trimmed) {
                prompt();
                return;
            }

            console.log(`Agent: [Agent loop not yet implemented]`);
            console.log(`       (You said: "${trimmed}")\n`);

            prompt();
        });
    };

    prompt();

    rl.on("close", () => {
        console.log("\nBye 👋");
        process.exit(0);
    });
}