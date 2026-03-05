import type { Tool, ToolDefinition, AgentContext } from "./types.js";
import { memorySaveTool, memoryGetTool, memorySearchTool, memoryDeleteTool } from "./builtin/memory.js";
import { getTimeTool } from "./builtin/time.js";

export class ToolRegistry {
    private tools: Map<string, Tool> = new Map();

    constructor() {
        this.registerBuiltins();
    }

    private registerBuiltins() {
        this.register(memorySaveTool);
        this.register(memoryGetTool);
        this.register(memorySearchTool);
        this.register(memoryDeleteTool);
        this.register(getTimeTool);

        console.log(`  ✅ Built-in tools registered: ${[...this.tools.keys()].join(", ")}`);
    }

    register(tool: Tool) {
        if (this.tools.has(tool.definition.name)) {
            console.warn(`[ToolRegistry] Overwriting existing tool: ${tool.definition.name}`);
        }
        this.tools.set(tool.definition.name, tool);
    }

    get(name: string): Tool | undefined {
        return this.tools.get(name);
    }

    has(name: string): boolean {
        return this.tools.has(name);
    }

    list(): string[] {
        return [...this.tools.keys()];
    }

    // Export as LLM-ready schema — used when calling the provider
    toSchema(): ToolDefinition[] {
        return [...this.tools.values()].map((t) => t.definition);
    }

    // Execute a tool by name — called by the agent loop
    async execute(
        name: string,
        params: Record<string, unknown>,
        ctx: AgentContext
    ): Promise<string> {
        const tool = this.tools.get(name);

        if (!tool) {
            return `Error: Tool "${name}" not found. Available tools: ${this.list().join(", ")}`;
        }

        try {
            const result = await tool.execute(params, ctx);
            return result;
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            return `Error executing tool "${name}": ${message}`;
        }
    }
}