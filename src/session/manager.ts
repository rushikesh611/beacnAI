import { existsSync, mkdirSync, writeFileSync, readFileSync } from "fs";
import { resolve } from "path";
import { Session } from "./session.js";
import type { SessionMeta } from "./types.js";

export class SessionManager {
    private sessions: Map<string, Session> = new Map();
    private workspaceDir: string;
    private metaPath: string;

    constructor(workspaceDir: string) {
        this.workspaceDir = workspaceDir;
        this.metaPath = resolve(workspaceDir, "sessions", "index.json");
        this.ensureDir();
    }

    private ensureDir() {
        const dir = resolve(this.workspaceDir, "sessions");
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    }

    // Key format: agentId:channelId:userId
    private makeKey(agentId: string, channelId: string, userId: string): string {
        return `${agentId}:${channelId}:${userId}`;
    }

    private makeId(agentId: string, channelId: string, userId: string): string {
        // Deterministic ID — same inputs always produce same session file
        return `${agentId}_${channelId}_${userId}`
            .replace(/[^a-zA-Z0-9_-]/g, "-")
            .slice(0, 80);
    }

    get(agentId: string, channelId: string, userId: string): Session {
        const key = this.makeKey(agentId, channelId, userId);

        if (this.sessions.has(key)) {
            return this.sessions.get(key)!;
        }

        const id = this.makeId(agentId, channelId, userId);
        const meta: SessionMeta = this.loadMeta(id) ?? {
            id,
            agentId,
            channelId,
            userId,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            messageCount: 0,
        };

        const session = new Session(meta, this.workspaceDir);
        this.sessions.set(key, session);
        this.saveMeta(meta);

        return session;
    }

    reset(agentId: string, channelId: string, userId: string): Session {
        const key = this.makeKey(agentId, channelId, userId);
        const existing = this.sessions.get(key);
        if (existing) {
            existing.clear();
            return existing;
        }
        return this.get(agentId, channelId, userId);
    }

    private loadMeta(id: string): SessionMeta | null {
        if (!existsSync(this.metaPath)) return null;
        try {
            const index = JSON.parse(readFileSync(this.metaPath, "utf-8")) as Record<string, SessionMeta>;
            return index[id] ?? null;
        } catch {
            return null;
        }
    }

    private saveMeta(meta: SessionMeta) {
        let index: Record<string, SessionMeta> = {};
        if (existsSync(this.metaPath)) {
            try {
                index = JSON.parse(readFileSync(this.metaPath, "utf-8"));
            } catch { /* start fresh */ }
        }
        index[meta.id] = meta;
        writeFileSync(this.metaPath, JSON.stringify(index, null, 2), "utf-8");
    }
}