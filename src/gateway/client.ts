import type { ServerWebSocket } from "bun";
import type { OutboundFrame } from "./protocol.js";

export interface ConnectedClient {
    id: string;
    ws: ServerWebSocket<unknown>;
    deviceId?: string;
    deviceName?: string;
    role: "client" | "node";
    connectedAt: number;
    authed: boolean;
}

export class ClientRegistry {
    private clients: Map<string, ConnectedClient> = new Map();
    private seq = 0;

    add(ws: ServerWebSocket<unknown>): ConnectedClient {
        const id = crypto.randomUUID();
        const client: ConnectedClient = {
            id,
            ws,
            role: "client",
            connectedAt: Date.now(),
            authed: false,
        };
        this.clients.set(id, client);
        return client;
    }

    remove(ws: ServerWebSocket<unknown>) {
        for (const [id, client] of this.clients) {
            if (client.ws === ws) {
                this.clients.delete(id);
                return;
            }
        }
    }

    getByWs(ws: ServerWebSocket<unknown>): ConnectedClient | undefined {
        for (const client of this.clients.values()) {
            if (client.ws === ws) return client;
        }
        return undefined;
    }

    // Send a frame to a single client
    send(client: ConnectedClient, frame: OutboundFrame) {
        try {
            client.ws.send(JSON.stringify(frame));
        } catch (err) {
            console.error(`[ClientRegistry] Failed to send to client ${client.id}:`, err);
        }
    }

    // Broadcast an event to all authed clients
    broadcast(frame: OutboundFrame) {
        const withSeq = "event" in frame
            ? { ...frame, seq: ++this.seq }
            : frame;

        for (const client of this.clients.values()) {
            if (client.authed) {
                this.send(client, withSeq);
            }
        }
    }

    // Broadcast to all clients with a specific role
    broadcastToRole(role: "client" | "node", frame: OutboundFrame) {
        for (const client of this.clients.values()) {
            if (client.authed && client.role === role) {
                this.send(client, frame);
            }
        }
    }

    count(): number {
        return this.clients.size;
    }

    list(): ConnectedClient[] {
        return [...this.clients.values()];
    }
}