import * as readline from "readline";

export async function wsClientCommand(args: string[]) {
    const url = args[0] ?? "ws://127.0.0.1:18789";
    const token = args[1];

    console.log(`\n🔌 Connecting to ${url}...\n`);

    let seq = 0;
    const makeId = () => `cli-${++seq}`;

    const ws = new WebSocket(url);

    ws.onopen = () => {
        console.log("Connected. Sending handshake...\n");

        ws.send(JSON.stringify({
            type: "connect",
            params: {
                ...(token ? { auth: { token } } : {}),
                device: {
                    id: `cli-${crypto.randomUUID().slice(0, 8)}`,
                    name: "CLI ws-client",
                    role: "client",
                },
            },
        }));
    };

    ws.onmessage = (event) => {
        try {
            const frame = JSON.parse(event.data as string);
            console.log("←", JSON.stringify(frame, null, 2), "\n");
        } catch {
            console.log("← (raw)", event.data);
        }
    };

    ws.onerror = (err) => {
        console.error("WebSocket error:", err);
    };

    ws.onclose = (event) => {
        console.log(`\nDisconnected: ${event.code} ${event.reason}`);
        process.exit(0);
    };

    // Wait for connection before accepting input
    await new Promise<void>((resolve) => {
        const check = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
                clearInterval(check);
                resolve();
            }
        }, 50);
    });

    console.log(`Commands:`);
    console.log(`  health            — ping the gateway`);
    console.log(`  status            — gateway status`);
    console.log(`  memory            — list all memories`);
    console.log(`  ask <message>     — run the agent`);
    console.log(`  raw <json>        — send a raw frame`);
    console.log(`  exit              — disconnect\n`);

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    const prompt = () => {
        rl.question("> ", (input) => {
            const trimmed = input.trim();
            if (!trimmed) { prompt(); return; }

            if (trimmed === "exit") {
                ws.close();
                rl.close();
                return;
            }

            if (trimmed === "health") {
                ws.send(JSON.stringify({ type: "req", id: makeId(), method: "health" }));
                prompt();
                return;
            }

            if (trimmed === "status") {
                ws.send(JSON.stringify({ type: "req", id: makeId(), method: "status" }));
                prompt();
                return;
            }

            if (trimmed === "memory") {
                ws.send(JSON.stringify({ type: "req", id: makeId(), method: "memory.list" }));
                prompt();
                return;
            }

            if (trimmed.startsWith("ask ")) {
                const message = trimmed.slice(4).trim();
                ws.send(JSON.stringify({
                    type: "req",
                    id: makeId(),
                    method: "agent",
                    params: { message, idempotencyKey: crypto.randomUUID() },
                }));
                prompt();
                return;
            }

            if (trimmed.startsWith("raw ")) {
                try {
                    const raw = JSON.parse(trimmed.slice(4));
                    ws.send(JSON.stringify(raw));
                } catch {
                    console.error("Invalid JSON");
                }
                prompt();
                return;
            }

            console.log(`Unknown command: "${trimmed}"`);
            prompt();
        });
    };

    prompt();
}