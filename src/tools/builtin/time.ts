import type { Tool } from "../types.js";

export const getTimeTool: Tool = {
    definition: {
        name: "get_time",
        description: "Get the current date and time in ISO format and a human-readable format.",
        parameters: {
            type: "object",
            properties: {
                timezone: {
                    type: "string",
                    description:
                        "Optional IANA timezone string e.g. 'Asia/Kolkata', 'America/New_York'. Defaults to UTC.",
                },
            },
            required: [],
        },
    },

    async execute(params): Promise<string> {
        const timezone = (params.timezone as string) ?? "UTC";

        try {
            const now = new Date();
            const formatted = now.toLocaleString("en-US", {
                timeZone: timezone,
                dateStyle: "full",
                timeStyle: "long",
            });

            return `Current time: ${formatted} (${now.toISOString()})`;
        } catch {
            // Invalid timezone — fall back to UTC
            const now = new Date();
            return `Current time: ${now.toUTCString()} (${now.toISOString()})`;
        }
    },
};