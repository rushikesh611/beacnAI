export interface SessionMessage {
    role: "user" | "assistant" | "tool" | "system";
    content: string;
    tool_call_id?: string;
    name?: string;
    ts: number;
}

export interface SessionMeta {
    id: string;
    agentId: string;
    channelId: string;
    userId: string;
    createdAt: number;
    updatedAt: number;
    messageCount: number;
}