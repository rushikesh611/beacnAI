import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import type { Session } from "../session/session.js";
import type { AgentConfig } from "../config/schema.js";
import type { Message } from "../providers/types.js";
import type { Memory } from "../memory/memory.js";

export function buildSystemPrompt(
    agentConfig: AgentConfig,
    memory: Memory,
    workspaceDir: string
): string {
    const parts: string[] = [];

    // 1. SOUL.md — agent identity
    const soulPath = resolve(agentConfig.systemPromptFile);
    if (existsSync(soulPath)) {
        parts.push(readFileSync(soulPath, "utf-8").trim());
    }

    // 2. USER.md — user profile
    const userPath = resolve(agentConfig.userFile);
    if (existsSync(userPath)) {
        const userContent = readFileSync(userPath, "utf-8").trim();
        parts.push(`## User Profile\n${userContent}`);
    }

    // 3. Memories
    const memoryContext = memory.toContextString();
    if (memoryContext) {
        parts.push(memoryContext);
    }

    // 4. Current date/time — always useful for the agent
    parts.push(`## Current Time\n${new Date().toISOString()}`);

    return parts.join("\n\n");
}

export function buildMessages(session: Session): Message[] {
    return session.getMessages().map((m) => ({
        role: m.role,
        content: m.content,
        tool_call_id: m.tool_call_id,
        name: m.name,
    }));
}