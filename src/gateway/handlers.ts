import type { ClientRegistry, ConnectedClient } from "./client.js";
import type {
    RequestFrame,
    ResponseFrame,
    AgentParams,
    SendParams,
    HealthPayload,
} from "./protocol.js";
import type { AgentRuntime } from "../agent/runtime.js";
import type { ChannelRegistry } from "../channels/registry.js";
import type { Memory } from "../memory/memory.js";
import type { ProviderRegistry } from "../providers/registry.js";
import type { AppConfig } from "../config/schema.js";

// Idempotency cache — prevents duplicate side-effects on retry
const idempotencyCache = new Map<string, ResponseFrame>();
const IDEMPOTENCY_TTL_MS = 5 * 60 * 1000; // 5 minutes

function cacheIdempotent(key: string, frame: ResponseFrame) {
    idempotencyCache.set(key, frame);
    setTimeout(() => idempotencyCache.delete(key), IDEMPOTENCY_TTL_MS);
}

export async function handleRequest(
    frame: RequestFrame,
    client: ConnectedClient,
    deps: {
        clientRegistry: ClientRegistry;
        runtime: AgentRuntime;
        channels: ChannelRegistry;
        memory: Memory;
        providers: ProviderRegistry;
        config: AppConfig;
    }
): Promise<ResponseFrame> {
    const { id, method, params } = frame;

    // Check idempotency cache for side-effecting methods
    const idempotencyKey = (params as Record<string, unknown>)?.idempotencyKey as string | undefined;
    if (idempotencyKey && idempotencyCache.has(idempotencyKey)) {
        return idempotencyCache.get(idempotencyKey)!;
    }

    switch (method) {
        case "health":
            return handleHealth(id, deps);

        case "status":
            return handleStatus(id, deps);

        case "send":
            return handleSend(id, params as unknown as SendParams, deps, idempotencyKey);

        case "agent":
            return handleAgent(id, params as unknown as AgentParams, client, deps, idempotencyKey);

        case "memory.list":
            return handleMemoryList(id, deps);

        case "memory.get":
            return handleMemoryGet(id, params as unknown as { key: string }, deps);

        case "session.reset":
            return handleSessionReset(id, params as unknown as { agentId?: string; channelId: string; userId: string }, deps);

        default:
            return { type: "res", id, ok: false, error: `Unknown method: ${method}` };
    }
}

function handleHealth(id: string, deps: { providers: ProviderRegistry; channels: ChannelRegistry; memory: Memory; config: AppConfig }): ResponseFrame {
    const payload: HealthPayload = {
        ok: true,
        ts: Date.now(),
        uptime: process.uptime(),
        providers: deps.providers.list(),
        channels: deps.channels.list(),
        memoryCount: deps.memory.list().length,
    };
    return { type: "res", id, ok: true, payload };
}

function handleStatus(id: string, deps: { config: AppConfig; channels: ChannelRegistry }): ResponseFrame {
    return {
        type: "res", id, ok: true,
        payload: {
            version: "0.1.0",
            uptime: process.uptime(),
            agents: Object.keys(deps.config.agents),
            channels: deps.channels.list(),
        },
    };
}

async function handleSend(
    id: string,
    params: SendParams,
    deps: { channels: ChannelRegistry },
    idempotencyKey?: string
): Promise<ResponseFrame> {
    if (!params?.channelId || !params?.content) {
        return { type: "res", id, ok: false, error: "Missing channelId or content" };
    }

    try {
        const channel = deps.channels.get(params.channelId)
            ?? [...deps.channels.list()].map(name => deps.channels.get(name)).find(Boolean);

        if (!channel) {
            return { type: "res", id, ok: false, error: "No channel available" };
        }

        await channel.send({ channelId: params.channelId, content: params.content });

        const res: ResponseFrame = { type: "res", id, ok: true, payload: { sent: true } };
        if (idempotencyKey) cacheIdempotent(idempotencyKey, res);
        return res;
    } catch (err) {
        return {
            type: "res", id, ok: false,
            error: err instanceof Error ? err.message : String(err),
        };
    }
}

async function handleAgent(
    id: string,
    params: AgentParams,
    client: ConnectedClient,
    deps: { runtime: AgentRuntime; clientRegistry: ClientRegistry },
    idempotencyKey?: string
): Promise<ResponseFrame> {
    if (!params?.message) {
        return { type: "res", id, ok: false, error: "Missing message" };
    }

    const agentId = params.agentId ?? "default";
    const channelId = params.channelId ?? "ws";
    const userId = params.userId ?? client.id;

    try {
        const result = await deps.runtime.run({
            agentId,
            channelId,
            userId,
            message: params.message,
            onChunk: (chunk) => {
                deps.clientRegistry.send(client, {
                    type: "event",
                    event: "agent:chunk",
                    payload: { id, chunk },
                });
            },
        });

        const res: ResponseFrame = {
            type: "res", id, ok: true,
            payload: {
                response: result.response,
                toolCallsMade: result.toolCallsMade,
                inputTokens: result.inputTokens,
                outputTokens: result.outputTokens,
            },
        };
        if (idempotencyKey) cacheIdempotent(idempotencyKey, res);
        return res;
    } catch (err) {
        return {
            type: "res", id, ok: false,
            error: err instanceof Error ? err.message : String(err),
        };
    }
}

function handleMemoryList(id: string, deps: { memory: Memory }): ResponseFrame {
    const entries = deps.memory.list().map((e) => ({
        key: e.key,
        content: e.content,
        tags: e.tags,
        updatedAt: e.updatedAt,
    }));
    return { type: "res", id, ok: true, payload: { entries } };
}

function handleMemoryGet(
    id: string,
    params: { key: string },
    deps: { memory: Memory }
): ResponseFrame {
    if (!params?.key) {
        return { type: "res", id, ok: false, error: "Missing key" };
    }
    const entry = deps.memory.get(params.key);
    if (!entry) {
        return { type: "res", id, ok: false, error: `Memory not found: ${params.key}` };
    }
    return { type: "res", id, ok: true, payload: entry };
}

function handleSessionReset(
    id: string,
    params: { agentId?: string; channelId: string; userId: string },
    deps: { config: AppConfig }
): ResponseFrame {
    if (!params?.channelId || !params?.userId) {
        return { type: "res", id, ok: false, error: "Missing channelId or userId" };
    }
    // Session reset is handled by the runtime in a future operation
    // For now acknowledge it
    return { type: "res", id, ok: true, payload: { reset: true } };
}