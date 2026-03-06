import * as readline from "readline";
import type { AppConfig } from "../config/schema.js";
import type { ProviderRegistry } from "../providers/registry.js";
import type { SessionManager } from "../session/manager.js";
import type { Memory } from "../memory/memory.js";
import type { ToolRegistry } from "../tools/registry.js";
import type { SkillLoader } from "../skills/loader.js";
import { AgentRuntime } from "../agent/runtime.js";

export async function startChat(
    config: AppConfig,
    providers: ProviderRegistry,
    sessions: SessionManager,
    memory: Memory,
    tools: ToolRegistry,
    skills: SkillLoader
) {
    const runtime = new AgentRuntime(config, providers, sessions, memory, tools, skills);

    const session = sessions.get("default", "cli", "local-user");
    console.log("\n💬 Chat mode — Ctrl+C to exit");
    console.log(`   Session: ${session.meta.id}`);
    console.log(`   Memory:  ${memory.list().length} entries`);
    console.log(`   Skills:  ${skills.list().map((s) => s.meta.name).join(", ") || "none"}`);
    console.log(`   Model:   ${config.agents["default"]?.provider ?? "default"}\n`);

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

            // Handle built-in CLI commands
            if (trimmed === "/reset") {
                sessions.reset("default", "cli", "local-user");
                console.log("Session cleared.\n");
                prompt();
                return;
            }

            if (trimmed === "/memory") {
                const entries = memory.list();
                if (entries.length === 0) {
                    console.log("No memories saved.\n");
                } else {
                    console.log("\nMemories:");
                    for (const e of entries) console.log(`  ${e.key}: ${e.content}`);
                    console.log();
                }
                prompt();
                return;
            }

            if (trimmed === "/help") {
                console.log("\nCommands: /reset  /memory  /help\n");
                prompt();
                return;
            }

            process.stdout.write("\nAgent: ");

            try {
                const result = await runtime.run({
                    agentId: "default",
                    channelId: "cli",
                    userId: "local-user",
                    message: trimmed,
                    onChunk: (chunk) => process.stdout.write(chunk),
                });

                // If no streaming happened (tool-only response), print the final response
                if (!result.response.length) {
                    process.stdout.write("[no response]");
                }

                console.log(`\n\n   [${result.toolCallsMade.length > 0 ? `tools: ${result.toolCallsMade.join(", ")} · ` : ""}${result.inputTokens}↑ ${result.outputTokens}↓ tokens]\n`);
            } catch (err) {
                console.error(`\nError: ${err instanceof Error ? err.message : err}\n`);
            }

            prompt();
        });
    };

    prompt();

    rl.on("close", () => {
        console.log("\nBye 👋");
        process.exit(0);
    });
}