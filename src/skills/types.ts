export interface SkillMeta {
    name: string;
    description: string;
    triggers: string[];
    tools?: string[]; // tool names this skill requires
    always?: boolean; // if true, always injected regardless of triggers
}

export interface Skill {
    meta: SkillMeta;
    content: string; // full markdown body after frontmatter
    filePath: string;
}