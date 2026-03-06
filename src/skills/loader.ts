import { existsSync, readdirSync, readFileSync } from "fs";
import { resolve } from "path";
import type { Skill, SkillMeta } from "./types.js";

export class SkillLoader {
    private skills: Map<string, Skill> = new Map();
    private skillsDir: string;

    constructor(skillsDir: string) {
        this.skillsDir = resolve(skillsDir);
        this.load();
    }

    private load() {
        if (!existsSync(this.skillsDir)) {
            console.warn(`[SkillLoader] Skills dir not found: ${this.skillsDir}`);
            return;
        }

        // Each subdirectory is a skill — e.g. skills/web-search/SKILL.md
        const entries = readdirSync(this.skillsDir, { withFileTypes: true });

        for (const entry of entries) {
            if (!entry.isDirectory()) continue;

            const skillFile = resolve(this.skillsDir, entry.name, "SKILL.md");
            if (!existsSync(skillFile)) continue;

            try {
                const skill = this.parseSkillFile(skillFile);
                this.skills.set(skill.meta.name, skill);
                console.log(`  ✅ Skill loaded: ${skill.meta.name}`);
            } catch (err) {
                console.warn(`[SkillLoader] Failed to load skill at ${skillFile}:`, err);
            }
        }
    }

    private parseSkillFile(filePath: string): Skill {
        const raw = readFileSync(filePath, "utf-8").replace(/\r\n/g, "\n");

        // Parse frontmatter manually — same approach as memory.ts
        const fmMatch = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
        if (!fmMatch) {
            throw new Error(`Missing or malformed frontmatter in ${filePath}`);
        }

        const fm = fmMatch[1] ?? "";
        const content = (fmMatch[2] ?? "").trim();

        const meta = this.parseFrontmatter(fm, filePath);

        return { meta, content, filePath };
    }

    private parseFrontmatter(fm: string, filePath: string): SkillMeta {
        const name = fm.match(/^name:\s*(.+)$/m)?.[1]?.trim();
        const description = fm.match(/^description:\s*(.+)$/m)?.[1]?.trim();

        if (!name) throw new Error(`Missing "name" in frontmatter at ${filePath}`);
        if (!description) throw new Error(`Missing "description" in frontmatter at ${filePath}`);

        // Parse triggers array — supports two YAML formats:
        // triggers: [one, two, three]
        // triggers:
        //   - one
        //   - two
        const inlineTriggers = fm.match(/^triggers:\s*\[([^\]]*)\]$/m)?.[1];
        const blockTriggers = [...fm.matchAll(/^  - (.+)$/gm)].map((m) => m[1]?.trim() ?? "");

        const triggers = inlineTriggers
            ? inlineTriggers.split(",").map((t) => t.trim()).filter(Boolean)
            : blockTriggers;

        // Parse optional tools array — same two formats
        const inlineTools = fm.match(/^tools:\s*\[([^\]]*)\]$/m)?.[1];
        const tools = inlineTools
            ? inlineTools.split(",").map((t) => t.trim()).filter(Boolean)
            : undefined;

        // Parse optional always flag
        const alwaysRaw = fm.match(/^always:\s*(.+)$/m)?.[1]?.trim();
        const always = alwaysRaw === "true";

        return { name, description, triggers, tools, always };
    }

    get(name: string): Skill | undefined {
        return this.skills.get(name);
    }

    list(): Skill[] {
        return [...this.skills.values()];
    }

    // Given a user message, return all skills whose triggers match
    // Plus any skills marked always: true
    match(userMessage: string): Skill[] {
        const lower = userMessage.toLowerCase();
        const matched: Skill[] = [];

        for (const skill of this.skills.values()) {
            if (skill.meta.always) {
                matched.push(skill);
                continue;
            }

            const hits = skill.meta.triggers.some((trigger) =>
                lower.includes(trigger.toLowerCase())
            );

            if (hits) matched.push(skill);
        }

        return matched;
    }

    // Inject matching skill content into the system prompt
    buildSkillContext(userMessage: string): string {
        const matched = this.match(userMessage);
        if (matched.length === 0) return "";

        return matched
            .map((s) => `## Skill: ${s.meta.name}\n\n${s.content}`)
            .join("\n\n---\n\n");
    }

    // Return all tool names required by currently active skills
    getRequiredTools(userMessage: string): string[] {
        const matched = this.match(userMessage);
        const toolNames = new Set<string>();

        for (const skill of matched) {
            for (const tool of skill.meta.tools ?? []) {
                toolNames.add(tool);
            }
        }

        return [...toolNames];
    }
}