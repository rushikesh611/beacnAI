// ─── Inbound frames (client → gateway) ───────────────────────────────────────

export interface ConnectFrame {
    type: "connect";
    params?: {
        auth?: {
            token?: string;
        };
        device?: {
            id: string;
            name?: string;
            role?: "client" | "node";
        };
    };
}

export interface RequestFrame {
    type: "req";
    id: string;
    method: string;
    params?: Record<string, unknown>;
}

export type InboundFrame = ConnectFrame | RequestFrame;

// ─── Outbound frames (gateway → client) ──────────────────────────────────────

export interface ResponseFrame {
    type: "res";
    id: string;
    ok: boolean;
    payload?: unknown;
    error?: string;
}

export interface EventFrame {
    type: "event";
    event: string;
    payload: unknown;
    seq?: number;
    stateVersion?: number;
}

export interface ErrorFrame {
    type: "error";
    error: string;
}

export type OutboundFrame = ResponseFrame | EventFrame | ErrorFrame;

// ─── Method params ────────────────────────────────────────────────────────────

export interface SendParams {
    channelId: string;
    content: string;
}

export interface AgentParams {
    agentId?: string;
    channelId?: string;
    userId?: string;
    message: string;
    idempotencyKey?: string;
}

export interface StatusParams {
    // no params
}

// ─── Event payloads ───────────────────────────────────────────────────────────

export interface HelloOkPayload {
    version: string;
    ts: number;
    health: { ok: boolean };
    deviceToken?: string;
}

export interface AgentChunkPayload {
    id: string;
    chunk: string;
}

export interface AgentCompletePayload {
    id: string;
    response: string;
    toolCallsMade: string[];
    inputTokens: number;
    outputTokens: number;
}

export interface ChatEventPayload {
    channelId: string;
    userId: string;
    content: string;
    ts: number;
}

export interface PresencePayload {
    channelId: string;
    userId: string;
    status: "online" | "offline" | "typing";
    ts: number;
}

export interface HeartbeatPayload {
    ts: number;
    uptime: number;
}

export interface HealthPayload {
    ok: boolean;
    ts: number;
    uptime: number;
    providers: string[];
    channels: string[];
    memoryCount: number;
}