import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from "fs";
import { resolve, dirname } from "path";
import type { SessionMessage, SessionMeta } from "./types.js";

export class Session {
    readonly meta: SessionMeta;
    private messages: SessionMessage[] = [];
    private filePath: string;

    constructor(meta: SessionMeta, workspaceDir: string) {
        this.meta = meta;
        this.filePath = resolve(workspaceDir, "sessions", `${meta.id}.jsonl`);
        this.ensureDir();
        this.load();
    }

    private ensureDir() {
        const dir = dirname(this.filePath);
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    }

    private load() {
        if (!existsSync(this.filePath)) return;

        const lines = readFileSync(this.filePath, "utf-8")
            .split("\n")
            .filter(Boolean);

        for (const line of lines) {
            try {
                this.messages.push(JSON.parse(line) as SessionMessage);
            } catch {
                // skip corrupted lines
            }
        }
    }

    addMessage(message: Omit<SessionMessage, "ts">) {
        const stamped: SessionMessage = { ...message, ts: Date.now() };
        this.messages.push(stamped);

        // Append-only write — safe, fast, no full rewrite needed
        appendFileSync(this.filePath, JSON.stringify(stamped) + "\n", "utf-8");

        // Update meta
        this.meta.updatedAt = Date.now();
        this.meta.messageCount = this.messages.length;
    }

    getMessages(): SessionMessage[] {
        return [...this.messages];
    }

    getLastN(n: number): SessionMessage[] {
        return this.messages.slice(-n);
    }

    clear() {
        this.messages = [];
        writeFileSync(this.filePath, "", "utf-8");
        this.meta.messageCount = 0;
        this.meta.updatedAt = Date.now();
    }

    // Token-budget-aware pruning — keep system + last N messages
    pruneToLimit(maxMessages: number) {
        if (this.messages.length <= maxMessages) return;

        const pruned = this.messages.slice(-maxMessages);
        this.messages = pruned;

        // Rewrite the file with pruned messages
        const content = pruned.map((m) => JSON.stringify(m)).join("\n") + "\n";
        writeFileSync(this.filePath, content, "utf-8");
    }
}