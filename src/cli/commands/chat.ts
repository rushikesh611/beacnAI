import * as readline from "readline";
import type { AppConfig } from "../../config/schema.js";
import type { AgentRuntime } from "../../agent/runtime.js";
import type { SessionManager } from "../../session/manager.js";
import type { Memory } from "../../memory/memory.js";
import type { SkillLoader } from "../../skills/loader.js";

export async function chatCommand(
    config: AppConfig,
    runtime: AgentRuntime,
    sessions: SessionManager,
    memory: Memory,
    skills: SkillLoader
) {
    const session = sessions.get("default", "cli", "local-user");

    console.log("\n💬 Chat mode — Ctrl+C to exit");
    console.log(`   Session:  ${session.meta.id} (${session.getMessages().length} messages)`);
    console.log(`   Memory:   ${memory.list().length} entries`);
    console.log(`   Skills:   ${skills.list().map((s) => s.meta.name).join(", ") || "none"}`);
    console.log(`   Agent:    ${config.agents["default"]?.provider ?? "default"}`);
    console.log(`   Model:    ${config.agents["default"]?.model ?? "provider default"}`);
    console.log(`\n   Commands: /reset  /memory  /skills  /status  /help\n`);

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

            // ── Built-in CLI commands ──────────────────────────────────────────────
            if (trimmed === "/help") {
                console.log(`
Commands:
  /reset          Clear current session history
  /memory         List all saved memories
  /memory <key>   Show a specific memory by key
  /forget <key>   Delete a memory by key
  /skills         List loaded skills and their triggers
  /status         Show current session and config info
  /help           Show this help
`);
                prompt();
                return;
            }

            if (trimmed === "/reset") {
                sessions.reset("default", "cli", "local-user");
                console.log("✅ Session cleared.\n");
                prompt();
                return;
            }

            if (trimmed === "/memory") {
                const entries = memory.list();
                if (entries.length === 0) {
                    console.log("No memories saved.\n");
                } else {
                    console.log("\nMemories:");
                    for (const e of entries) {
                        const tags = e.tags.length ? ` [${e.tags.join(", ")}]` : "";
                        console.log(`  ${e.key}${tags}: ${e.content}`);
                    }
                    console.log();
                }
                prompt();
                return;
            }

            if (trimmed.startsWith("/memory ")) {
                const key = trimmed.slice(8).trim();
                const entry = memory.get(key);
                if (!entry) {
                    console.log(`No memory found for key: "${key}"\n`);
                } else {
                    console.log(`\n  ${entry.key}: ${entry.content}`);
                    if (entry.tags.length) console.log(`  Tags: ${entry.tags.join(", ")}`);
                    console.log(`  Updated: ${new Date(entry.updatedAt).toLocaleString()}\n`);
                }
                prompt();
                return;
            }

            if (trimmed.startsWith("/forget ")) {
                const key = trimmed.slice(8).trim();
                const deleted = memory.delete(key);
                console.log(deleted ? `✅ Deleted: "${key}"\n` : `No memory found: "${key}"\n`);
                prompt();
                return;
            }

            if (trimmed === "/skills") {
                const list = skills.list();
                if (list.length === 0) {
                    console.log("No skills loaded.\n");
                } else {
                    console.log("\nLoaded skills:");
                    for (const s of list) {
                        console.log(`  ${s.meta.name}: ${s.meta.description}`);
                        if (s.meta.triggers.length) {
                            console.log(`    Triggers: ${s.meta.triggers.join(", ")}`);
                        }
                        if (s.meta.tools?.length) {
                            console.log(`    Tools: ${s.meta.tools.join(", ")}`);
                        }
                    }
                    console.log();
                }
                prompt();
                return;
            }

            if (trimmed === "/status") {
                const currentSession = sessions.get("default", "cli", "local-user");
                console.log(`
Status:
  Session:  ${currentSession.meta.id}
  Messages: ${currentSession.getMessages().length}
  Memory:   ${memory.list().length} entries
  Skills:   ${skills.list().length} loaded
  Agent:    ${config.agents["default"]?.provider}
  Model:    ${config.agents["default"]?.model ?? "provider default"}
`);
                prompt();
                return;
            }

            // ── Agent run ──────────────────────────────────────────────────────────
            process.stdout.write("\nAgent: ");

            try {
                const result = await runtime.run({
                    agentId: "default",
                    channelId: "cli",
                    userId: "local-user",
                    message: trimmed,
                    onChunk: (chunk) => process.stdout.write(chunk),
                });

                if (!result.response && !result.toolCallsMade.length) {
                    process.stdout.write("_(no response)_");
                }

                const meta: string[] = [];
                if (result.toolCallsMade.length) meta.push(`tools: ${result.toolCallsMade.join(", ")}`);
                meta.push(`${result.inputTokens}↑ ${result.outputTokens}↓ tokens`);

                console.log(`\n\n   [${meta.join(" · ")}]\n`);
            } catch (err) {
                console.error(`\n❌ Error: ${err instanceof Error ? err.message : err}\n`);
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