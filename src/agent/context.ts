import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import type { Memory } from "../memory/memory.js";
import type { Session } from "../session/session.js";
import type { AgentConfig } from "../config/schema.js";
import type { SkillLoader } from "../skills/loader.js";
import type { Message } from "../providers/types.js";

export function buildSystemPrompt(
    agentConfig: AgentConfig,
    memory: Memory,
    skillLoader: SkillLoader,
    userMessage: string,        // needed so skills can match against it
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

    // 4. Skill instructions — only injected when relevant
    const skillContext = skillLoader.buildSkillContext(userMessage);
    if (skillContext) {
        parts.push(`## Active Skills\n\n${skillContext}`);
    }

    // 5. Current date/time
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