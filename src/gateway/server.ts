import type { AppConfig } from "../config/schema.js";
import type { ProviderRegistry } from "../providers/registry.js";
import type { SessionManager } from "../session/manager.js";
import type { Memory } from "../memory/memory.js";
import type { ToolRegistry } from "../tools/registry.js";
import type { SkillLoader } from "../skills/loader.js";
import { AgentRuntime } from "../agent/runtime.js";
import { ChannelRegistry } from "../channels/registry.js";
import { globalBus } from "../bus/event-bus.js";

type GatewayWebSocketData = {
    ip: string | null;
}

export async function startGateway(
    config: AppConfig,
    providers: ProviderRegistry,
    sessions: SessionManager,
    memory: Memory,
    tools: ToolRegistry,
    skills: SkillLoader
) {
    const { host, port } = config.gateway;

    const runtime = new AgentRuntime(config, providers, sessions, memory, tools, skills);

    // Start channels
    console.log("\n🔌 Starting channels...");
    const channels = new ChannelRegistry(config, runtime);
    await channels.startAll();

    console.log(`\n🚀 Starting gateway on ws://${host}:${port}`);

    const server = Bun.serve({
        hostname: host,
        port,

        fetch(req, server) {
            const url = new URL(req.url);

            if (url.pathname === "/health") {
                return Response.json({
                    ok: true,
                    ts: Date.now(),
                    channels: channels.list(),
                });
            }

            if (server.upgrade(req, { data: { ip: req.headers.get("x-forwarded-for") } })) {
                return undefined;
            }

            return new Response("MyAgent Gateway", { status: 200 });
        },

        websocket: {
            data: {} as GatewayWebSocketData,
            open(ws) {
                console.log(`[Gateway] Client connected`);
                globalBus.emit("gateway:client:connect", { ws });
            },

            message(ws, message) {
                try {
                    const frame = JSON.parse(message as string);
                    handleFrame(ws, frame, config, runtime);
                } catch {
                    ws.close(1003, "Invalid JSON");
                }
            },

            close(ws) {
                console.log(`[Gateway] Client disconnected`);
                globalBus.emit("gateway:client:disconnect", { ws });
            },
        },
    });

    console.log(`✅ Gateway listening on ws://${host}:${port}`);
    console.log(`   Health: http://${host}:${port}/health\n`);

    // Graceful shutdown — stop channels cleanly before exit
    const shutdown = async () => {
        console.log("\n🛑 Shutting down...");
        await channels.stopAll();
        server.stop();
        process.exit(0);
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);

    setInterval(() => {
        globalBus.emit("gateway:heartbeat", { ts: Date.now() });
    }, 30_000);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleFrame(ws: any, frame: any, config: AppConfig, runtime: AgentRuntime) {
    if (!frame.type) {
        ws.send(JSON.stringify({ type: "error", error: "Missing frame type" }));
        return;
    }

    switch (frame.type) {
        case "connect": {
            if (config.gateway.token) {
                const provided = frame.params?.auth?.token;
                if (provided !== config.gateway.token) {
                    ws.close(1008, "Unauthorized");
                    return;
                }
            }
            ws.send(JSON.stringify({
                type: "event",
                event: "hello-ok",
                payload: { version: "0.1.0", ts: Date.now(), health: { ok: true } },
            }));
            break;
        }

        case "req":
            await handleRequest(ws, frame, runtime);
            break;

        default:
            ws.send(JSON.stringify({
                type: "res",
                id: frame.id,
                ok: false,
                error: `Unknown frame type: ${frame.type}`,
            }));
    }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleRequest(ws: any, frame: any, runtime: AgentRuntime) {
    const { id, method, params } = frame;

    switch (method) {
        case "health":
            ws.send(JSON.stringify({
                type: "res", id, ok: true,
                payload: { ok: true, ts: Date.now() },
            }));
            break;

        case "status":
            ws.send(JSON.stringify({
                type: "res", id, ok: true,
                payload: { version: "0.1.0", uptime: process.uptime() },
            }));
            break;

        case "agent": {
            const { agentId = "default", channelId = "ws", userId = "ws-user", message } = params ?? {};

            if (!message) {
                ws.send(JSON.stringify({ type: "res", id, ok: false, error: "Missing message" }));
                return;
            }

            try {
                const result = await runtime.run({
                    agentId,
                    channelId,
                    userId,
                    message,
                    onChunk: (chunk) => {
                        ws.send(JSON.stringify({
                            type: "event",
                            event: "agent:chunk",
                            payload: { id, chunk },
                        }));
                    },
                });

                ws.send(JSON.stringify({
                    type: "res", id, ok: true,
                    payload: {
                        response: result.response,
                        toolCallsMade: result.toolCallsMade,
                        inputTokens: result.inputTokens,
                        outputTokens: result.outputTokens,
                    },
                }));
            } catch (err) {
                ws.send(JSON.stringify({
                    type: "res", id, ok: false,
                    error: err instanceof Error ? err.message : String(err),
                }));
            }
            break;
        }

        default:
            ws.send(JSON.stringify({
                type: "res", id, ok: false,
                error: `Unknown method: ${method}`,
            }));
    }
}