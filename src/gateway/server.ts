import type { AppConfig } from "../config/schema.js";
import type { ProviderRegistry } from "../providers/registry.js";
import type { SessionManager } from "../session/manager.js";
import type { Memory } from "../memory/memory.js";
import type { ToolRegistry } from "../tools/registry.js";
import type { SkillLoader } from "../skills/loader.js";
import { AgentRuntime } from "../agent/runtime.js";
import { ChannelRegistry } from "../channels/registry.js";
import { ClientRegistry } from "./client.js";
import { CronScheduler } from "../cron/scheduler.js";
import { handleRequest } from "./handlers.js";
import { globalBus } from "../bus/event-bus.js";
import type { ConnectFrame, InboundFrame } from "./protocol.js";

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
    const clientRegistry = new ClientRegistry();

    console.log("\n🔌 Starting channels...");
    const channels = new ChannelRegistry(config, runtime);
    await channels.startAll();

    console.log("\n⏰ Starting scheduler...");
    const scheduler = new CronScheduler(config, runtime, channels);
    scheduler.start();

    setupBusBridge(clientRegistry, channels, memory, providers, config);

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
                    uptime: process.uptime(),
                    clients: clientRegistry.count(),
                    channels: channels.list(),
                    cronJobs: scheduler.status(),
                });
            }

            if (server.upgrade(req)) return undefined;

            return new Response("MyAgent Gateway", { status: 200 });
        },

        websocket: {
            open(ws) {
                const client = clientRegistry.add(ws);
                console.log(`[Gateway] Client connected: ${client.id}`);
            },

            message(ws, rawMessage) {
                const client = clientRegistry.getByWs(ws);
                if (!client) return;

                let frame: InboundFrame;
                try {
                    frame = JSON.parse(rawMessage as string) as InboundFrame;
                } catch {
                    ws.close(1003, "Invalid JSON");
                    return;
                }

                if (!client.authed && frame.type !== "connect") {
                    ws.close(1008, "First frame must be connect");
                    return;
                }

                if (frame.type === "connect") {
                    handleConnect(frame, client, config, clientRegistry);
                    return;
                }

                if (frame.type === "req") {
                    handleRequest(frame, client, {
                        clientRegistry,
                        runtime,
                        channels,
                        memory,
                        providers,
                        config,
                    }).then((response) => {
                        clientRegistry.send(client, response);
                    }).catch((err) => {
                        clientRegistry.send(client, {
                            type: "res",
                            id: frame.id,
                            ok: false,
                            error: err instanceof Error ? err.message : String(err),
                        });
                    });
                    return;
                }

                clientRegistry.send(client, {
                    type: "error",
                    error: `Unknown frame type: ${(frame as { type: string }).type}`,
                });
            },

            close(ws) {
                const client = clientRegistry.getByWs(ws);
                if (client) {
                    console.log(`[Gateway] Client disconnected: ${client.id}`);
                    clientRegistry.remove(ws);
                    globalBus.emit("gateway:client:disconnect", { clientId: client.id });
                }
            },
        },
    });

    console.log(`✅ Gateway listening on ws://${host}:${port}`);
    console.log(`   Health: http://${host}:${port}/health\n`);

    const shutdown = async () => {
        console.log("\n🛑 Shutting down...");
        scheduler.stop();
        clientRegistry.broadcast({
            type: "event",
            event: "shutdown",
            payload: { ts: Date.now() },
        });
        await channels.stopAll();
        server.stop();
        process.exit(0);
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);

    setInterval(() => {
        clientRegistry.broadcast({
            type: "event",
            event: "heartbeat",
            payload: { ts: Date.now(), uptime: process.uptime() },
        });
        globalBus.emit("gateway:heartbeat", { ts: Date.now() });
    }, 30_000);
}

function handleConnect(
    frame: ConnectFrame,
    client: import("./client.js").ConnectedClient,
    config: AppConfig,
    clientRegistry: ClientRegistry
) {
    if (config.gateway.token) {
        const provided = frame.params?.auth?.token;
        if (provided !== config.gateway.token) {
            client.ws.close(1008, "Unauthorized");
            return;
        }
    }

    if (frame.params?.device) {
        client.deviceId = frame.params.device.id;
        client.deviceName = frame.params.device.name;
        client.role = frame.params.device.role ?? "client";
    }

    client.authed = true;

    console.log(
        `[Gateway] Client authed: ${client.id}` +
        (client.deviceName ? ` (${client.deviceName})` : "")
    );

    globalBus.emit("gateway:client:connect", { clientId: client.id, role: client.role });

    clientRegistry.send(client, {
        type: "event",
        event: "hello-ok",
        payload: {
            version: "0.1.0",
            ts: Date.now(),
            health: { ok: true },
            clientId: client.id,
        },
    });
}

function setupBusBridge(
    clientRegistry: ClientRegistry,
    channels: ChannelRegistry,
    memory: Memory,
    providers: ProviderRegistry,
    config: AppConfig
) {
    globalBus.on("agent:run:complete", (payload) => {
        clientRegistry.broadcast({ type: "event", event: "agent", payload });
    });

    globalBus.on("agent:tool:call", (payload) => {
        clientRegistry.broadcast({ type: "event", event: "agent:tool", payload });
    });

    globalBus.on("channel:message:incoming", (payload) => {
        clientRegistry.broadcast({
            type: "event",
            event: "chat",
            payload: { ...(payload as object), ts: Date.now() },
        });
    });

    globalBus.on("channel:message:sent", (payload) => {
        clientRegistry.broadcast({
            type: "event",
            event: "chat:sent",
            payload: { ...(payload as object), ts: Date.now() },
        });
    });

    globalBus.on("cron:job:start", (payload) => {
        clientRegistry.broadcast({ type: "event", event: "cron:start", payload });
    });

    globalBus.on("cron:job:complete", (payload) => {
        clientRegistry.broadcast({ type: "event", event: "cron:complete", payload });
    });
}