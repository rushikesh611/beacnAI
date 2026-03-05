import type { Memory } from "../memory/memory.js";
import type { Session } from "../session/session.js";
import type { AppConfig } from "../config/schema.js";

export interface AgentContext {
    agentId: string;
    channelId: string;
    userId: string;
    config: AppConfig;
    memory: Memory;
    session: Session;
}

export interface ToolDefinition {
    name: string;
    description: string;
    parameters: {
        type: "object";
        properties: Record<string, unknown>;
        required?: string[];
    };
}

export interface Tool {
    definition: ToolDefinition;
    execute(params: Record<string, unknown>, ctx: AgentContext): Promise<string>;
}