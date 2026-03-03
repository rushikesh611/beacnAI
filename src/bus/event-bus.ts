type EventHandler<T = unknown> = (payload: T) => void | Promise<void>;

interface Subscription {
    id: string;
    event: string;
    handler: EventHandler;
}

export class EventBus {
    private subscriptions: Map<string, Subscription[]> = new Map();
    private seq = 0;

    on<T = unknown>(event: string, handler: EventHandler<T>): () => void {
        const id = `sub_${++this.seq}`;
        const sub: Subscription = { id, event, handler: handler as EventHandler };

        if (!this.subscriptions.has(event)) {
            this.subscriptions.set(event, []);
        }
        this.subscriptions.get(event)!.push(sub);

        // Return unsubscribe fn
        return () => {
            const subs = this.subscriptions.get(event) ?? [];
            this.subscriptions.set(
                event,
                subs.filter((s) => s.id !== id)
            );
        };
    }

    async emit<T = unknown>(event: string, payload: T): Promise<void> {
        const subs = this.subscriptions.get(event) ?? [];
        const wildcardSubs = this.subscriptions.get("*") ?? [];

        for (const sub of [...subs, ...wildcardSubs]) {
            try {
                await sub.handler(payload);
            } catch (err) {
                console.error(`[EventBus] Error in handler for "${event}":`, err);
            }
        }
    }

    once<T = unknown>(event: string, handler: EventHandler<T>): void {
        const unsub = this.on<T>(event, (payload) => {
            unsub();
            handler(payload);
        });
    }
}

// Singleton global bus
export const globalBus = new EventBus();