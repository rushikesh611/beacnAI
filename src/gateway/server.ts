import { type AppConfig } from "../config/schema";
import { globalBus } from "../bus/event-bus";
import type { ProviderRegistry } from "../providers/registry";

type GatewayWebSocketData = {
    ip: string | null;
}

export async function startGateway(config: AppConfig, providers: ProviderRegistry) {
    const { host, port } = config.gateway;

    console.log(`🚀 Starting gateway on ws://${host}:${port}`);

    const server = Bun.serve({
        hostname: host,
        port,

        fetch(req, server) {
            const url = new URL(req.url);

            // Health check
            if (url.pathname === "/health") {
                return Response.json({ ok: true, ts: Date.now() });
            }

            // Upgrade to WebSocket
            if (server.upgrade(req, { data: { ip: req.headers.get("x-forwarded-for") } })) {
                return undefined;
            }

            return new Response("MyAgent Gateway — connect via WebSocket", { status: 200 });
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
                    handleFrame(ws, frame, config);
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

    // Graceful shutdown
    process.on("SIGINT", () => {
        console.log("\n🛑 Shutting down gateway...");
        server.stop();
        process.exit(0);
    });

    // Heartbeat
    setInterval(() => {
        globalBus.emit("gateway:heartbeat", { ts: Date.now() });
    }, 30_000);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function handleFrame(ws: any, frame: any, config: AppConfig) {
    // OpenClaw wire protocol 
    if (!frame.type) {
        ws.send(JSON.stringify({ type: "error", error: "Missing frame type" }));
        return;
    }

    switch (frame.type) {
        case "connect": {
            // Verify token if configured
            if (config.gateway.token) {
                const provided = frame.params?.auth?.token;
                if (provided !== config.gateway.token) {
                    ws.close(1008, "Unauthorized");
                    return;
                }
            }

            ws.send(
                JSON.stringify({
                    type: "event",
                    event: "hello-ok",
                    payload: {
                        version: "0.1.0",
                        ts: Date.now(),
                        health: { ok: true },
                    },
                })
            );
            break;
        }

        case "req": {
            handleRequest(ws, frame);
            break;
        }

        default:
            ws.send(
                JSON.stringify({
                    type: "res",
                    id: frame.id,
                    ok: false,
                    error: `Unknown frame type: ${frame.type}`,
                })
            );
    }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function handleRequest(ws: any, frame: any) {
    const { id, method } = frame;

    switch (method) {
        case "health":
            ws.send(
                JSON.stringify({
                    type: "res",
                    id,
                    ok: true,
                    payload: { ok: true, ts: Date.now() },
                })
            );
            break;

        case "status":
            ws.send(
                JSON.stringify({
                    type: "res",
                    id,
                    ok: true,
                    payload: { version: "0.1.0", uptime: process.uptime() },
                })
            );
            break;

        default:
            ws.send(
                JSON.stringify({
                    type: "res",
                    id,
                    ok: false,
                    error: `Unknown method: ${method}.`,
                })
            );
    }
}
