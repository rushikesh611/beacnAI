import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync, unlinkSync } from "fs";
import { resolve } from "path";

export interface MemoryEntry {
    key: string;
    content: string;
    tags: string[];
    createdAt: number;
    updatedAt: number;
}

export class Memory {
    private memoryDir: string;

    constructor(workspaceDir: string) {
        this.memoryDir = resolve(workspaceDir, "memory");
        this.ensureDir();
    }

    private ensureDir() {
        if (!existsSync(this.memoryDir)) {
            mkdirSync(this.memoryDir, { recursive: true });
        }
    }

    private filePath(key: string): string {
        // Sanitize key → safe filename
        const safe = key.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 100);
        return resolve(this.memoryDir, `${safe}.md`);
    }

    save(key: string, content: string, tags: string[] = []): MemoryEntry {
        const now = Date.now();
        const existing = this.get(key);

        const entry: MemoryEntry = {
            key,
            content,
            tags,
            createdAt: existing?.createdAt ?? now,
            updatedAt: now,
        };

        // Store as Markdown with frontmatter — OpenClaw-compatible format
        const frontmatter = [
            "---",
            `key: ${key}`,
            `tags: [${tags.join(", ")}]`,
            `createdAt: ${entry.createdAt}`,
            `updatedAt: ${entry.updatedAt}`,
            "---",
            "",
            content,
        ].join("\n");

        writeFileSync(this.filePath(key), frontmatter, "utf-8");
        return entry;
    }

    get(key: string): MemoryEntry | null {
        const path = this.filePath(key);
        if (!existsSync(path)) return null;

        try {
            const raw = readFileSync(path, "utf-8");
            return this.parse(raw);
        } catch {
            return null;
        }
    }

    search(query: string): MemoryEntry[] {
        const all = this.list();
        const q = query.toLowerCase();

        return all.filter((entry) => {
            return (
                entry.key.toLowerCase().includes(q) ||
                entry.content.toLowerCase().includes(q) ||
                entry.tags.some((t) => t.toLowerCase().includes(q))
            );
        });
    }

    list(): MemoryEntry[] {
        const files = readdirSync(this.memoryDir).filter((f) => f.endsWith(".md"));
        const entries: MemoryEntry[] = [];

        for (const file of files) {
            try {
                const raw = readFileSync(resolve(this.memoryDir, file), "utf-8");
                const entry = this.parse(raw);
                if (entry) entries.push(entry);
            } catch { /* skip corrupted */ }
        }

        return entries.sort((a, b) => b.updatedAt - a.updatedAt);
    }

    delete(key: string): boolean {
        const path = this.filePath(key);
        if (!existsSync(path)) return false;
        unlinkSync(path);
        return true;
    }

    // Format all memories into a single string for context injection
    toContextString(): string {
        const entries = this.list();
        if (entries.length === 0) return "";

        return [
            "## Memories",
            ...entries.map((e) => `- **${e.key}**: ${e.content}`),
        ].join("\n");
    }

    private parse(raw: string): MemoryEntry | null {
        // Parse markdown frontmatter manually — avoids gray-matter dep at runtime
        const fmMatch = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
        if (!fmMatch) return null;

        const fm = fmMatch[1] ?? "";
        const content = fmMatch[2]?.trim() ?? "";

        const key = fm.match(/^key: (.+)$/m)?.[1]?.trim() ?? "";
        const tagsRaw = fm.match(/^tags: \[([^\]]*)\]$/m)?.[1] ?? "";
        const tags = tagsRaw.split(",").map((t) => t.trim()).filter(Boolean);
        const createdAt = parseInt(fm.match(/^createdAt: (\d+)$/m)?.[1] ?? "0");
        const updatedAt = parseInt(fm.match(/^updatedAt: (\d+)$/m)?.[1] ?? "0");

        if (!key) return null;
        return { key, content, tags, createdAt, updatedAt };
    }
}