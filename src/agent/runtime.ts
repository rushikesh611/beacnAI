import type { AppConfig, AgentConfig } from "../config/schema.js";
import type { ProviderRegistry } from "../providers/registry.js";
import type { SessionManager } from "../session/manager.js";
import type { Memory } from "../memory/memory.js";
import type { ToolRegistry } from "../tools/registry.js";
import type { SkillLoader } from "../skills/loader.js";
import type { AgentContext } from "../tools/types.js";
import type { Message, ToolCall } from "../providers/types.js";
import { buildSystemPrompt, buildMessages } from "./context.js";
import { globalBus } from "../bus/event-bus.js";

export interface RunOptions {
    agentId: string;
    channelId: string;
    userId: string;
    message: string;
    onChunk?: (chunk: string) => void;
}

export interface RunResult {
    response: string;
    toolCallsMade: string[];
    inputTokens: number;
    outputTokens: number;
}

export class AgentRuntime {
    private config: AppConfig;
    private providers: ProviderRegistry;
    private sessions: SessionManager;
    private memory: Memory;
    private tools: ToolRegistry;
    private skills: SkillLoader;
    private runningSessions: Set<string> = new Set();

    constructor(
        config: AppConfig,
        providers: ProviderRegistry,
        sessions: SessionManager,
        memory: Memory,
        tools: ToolRegistry,
        skills: SkillLoader
    ) {
        this.config = config;
        this.providers = providers;
        this.sessions = sessions;
        this.memory = memory;
        this.tools = tools;
        this.skills = skills;
    }

    async run(options: RunOptions): Promise<RunResult> {
        const { agentId, channelId, userId } = options;
        const sessionKey = `${agentId}:${channelId}:${userId}`;

        if (this.runningSessions.has(sessionKey)) {
            return {
                response: "I'm still thinking about your last message — please wait.",
                toolCallsMade: [],
                inputTokens: 0,
                outputTokens: 0,
            };
        }

        this.runningSessions.add(sessionKey);
        try {
            return await this.executeLoop(options);
        } finally {
            this.runningSessions.delete(sessionKey);
        }
    }

    private async executeLoop(options: RunOptions): Promise<RunResult> {
        const { agentId, channelId, userId, message, onChunk } = options;

        const agentConfig = this.getAgentConfig(agentId);
        const provider = this.providers.get(agentConfig.provider);
        const session = this.sessions.get(agentId, channelId, userId);

        const ctx: AgentContext = {
            agentId,
            channelId,
            userId,
            config: this.config,
            memory: this.memory,
            session,
        };

        // Add user message to session
        session.addMessage({ role: "user", content: message });

        await globalBus.emit("agent:run:start", { agentId, channelId, userId, message });

        const toolCallsMade: string[] = [];
        let totalInputTokens = 0;
        let totalOutputTokens = 0;
        let finalResponse = "";

        // Determine which tools to expose based on skill triggers
        const requiredToolNames = this.skills.getRequiredTools(message);
        const builtinTools = ["memory_save", "memory_get", "memory_search", "memory_delete", "get_time"];
        const allToolNames = [...new Set([...builtinTools, ...requiredToolNames])];
        const toolSchemas = this.tools.toSchemaFor(allToolNames);

        // Seed messages from session history, excluding the message we just added
        let messages: Message[] = buildMessages(session).slice(0, -1);
        messages.push({ role: "user", content: message });

        let depth = 0;
        const maxDepth = agentConfig.maxToolCallDepth;

        while (depth < maxDepth) {
            depth++;

            const systemPrompt = buildSystemPrompt(
                agentConfig,
                this.memory,
                this.skills,
                message
            );

            // Only stream on turns where no tool calls have happened yet
            // Tool call intermediate turns don't stream — avoids garbage output
            const hasToolCallsInFlight = messages.some(
                (m) => Array.isArray(m.content) && m.content.some((b) => b.type === "tool_use")
            );

            const response = await provider.chat(messages, {
                model: agentConfig.model,
                temperature: agentConfig.temperature,
                systemPrompt,
                tools: toolSchemas.length > 0 ? toolSchemas : undefined,
                onChunk: hasToolCallsInFlight ? undefined : onChunk,
            });

            totalInputTokens += response.inputTokens;
            totalOutputTokens += response.outputTokens;

            // No tool calls — agent is done
            if (response.toolCalls.length === 0 || response.stopReason === "end_turn") {
                finalResponse = response.content;

                session.addMessage({ role: "assistant", content: finalResponse });

                await globalBus.emit("agent:run:complete", {
                    agentId,
                    channelId,
                    userId,
                    response: finalResponse,
                    toolCallsMade,
                    inputTokens: totalInputTokens,
                    outputTokens: totalOutputTokens,
                });

                break;
            }

            // Has tool calls — execute each one, then loop back
            // Step 1: append the assistant message that contains the tool_use blocks
            messages.push({
                role: "assistant",
                content: response.toolCalls.map((tc) => ({
                    type: "tool_use" as const,
                    id: tc.id,
                    name: tc.name,
                    input: tc.input,
                })),
            });

            // Step 2: execute tools and append each result as a tool role message
            const toolResultMessages = await this.executeToolCalls(
                response.toolCalls,
                ctx,
                toolCallsMade
            );

            for (const result of toolResultMessages) {
                messages.push(result);
            }

            await globalBus.emit("agent:tool:executed", {
                agentId,
                toolCallsMade: [...toolCallsMade],
            });
        }

        if (depth >= maxDepth && !finalResponse) {
            finalResponse = "I reached the maximum number of steps. Please try a simpler request.";
            session.addMessage({ role: "assistant", content: finalResponse });
        }

        return {
            response: finalResponse,
            toolCallsMade,
            inputTokens: totalInputTokens,
            outputTokens: totalOutputTokens,
        };
    }

    private async executeToolCalls(
        toolCalls: ToolCall[],
        ctx: AgentContext,
        toolCallsMade: string[]
    ): Promise<Message[]> {
        const results: Message[] = [];

        for (const tc of toolCalls) {
            toolCallsMade.push(tc.name);

            console.log(`  🔧 Tool call: ${tc.name}`, JSON.stringify(tc.input));

            await globalBus.emit("agent:tool:call", {
                name: tc.name,
                input: tc.input,
                agentId: ctx.agentId,
            });

            const result = await this.tools.execute(tc.name, tc.input, ctx);

            console.log(`  ✅ Tool result: ${result.slice(0, 120)}${result.length > 120 ? "..." : ""}`);

            results.push({
                role: "tool",
                content: result,
                tool_call_id: tc.id,
                name: tc.name,
            });
        }

        return results;
    }

    private getAgentConfig(agentId: string): AgentConfig {
        const agentConfig = this.config.agents[agentId];
        if (!agentConfig) {
            throw new Error(
                `Agent "${agentId}" not found. Available: ${Object.keys(this.config.agents).join(", ")}`
            );
        }
        return agentConfig;
    }
}