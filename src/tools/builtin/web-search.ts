import type { Tool } from "../types.js";

interface DDGResult {
    RelatedTopics?: Array<{
        Text?: string;
        FirstURL?: string;
        Topics?: Array<{ Text?: string; FirstURL?: string }>;
    }>;
    AbstractText?: string;
    AbstractURL?: string;
    AbstractSource?: string;
    Answer?: string;
}

export const webSearchTool: Tool = {
    definition: {
        name: "web_search",
        description:
            "Search the web for current information, news, facts, prices, or anything that may have changed recently. Returns a list of relevant results with URLs.",
        parameters: {
            type: "object",
            properties: {
                query: {
                    type: "string",
                    description: "The search query — be specific for better results",
                },
                max_results: {
                    type: "number",
                    description: "Max number of results to return. Default 5, max 10.",
                },
            },
            required: ["query"],
        },
    },

    async execute(params): Promise<string> {
        const query = params.query as string;
        const maxResults = Math.min((params.max_results as number) ?? 5, 10);

        try {
            // DuckDuckGo Instant Answer API — no key needed
            const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_redirect=1&no_html=1&skip_disambig=1`;
            const res = await fetch(url, {
                headers: { "User-Agent": "MyAgent/0.1.0" },
            });

            if (!res.ok) {
                return `Search failed: HTTP ${res.status}`;
            }

            const data = (await res.json()) as DDGResult;
            const results: string[] = [];

            // Instant answer (e.g. calculations, definitions)
            if (data.Answer) {
                results.push(`**Answer:** ${data.Answer}`);
            }

            // Abstract (Wikipedia-style summary)
            if (data.AbstractText && data.AbstractURL) {
                results.push(
                    `**${data.AbstractSource ?? "Summary"}:** ${data.AbstractText}\nSource: ${data.AbstractURL}`
                );
            }

            // Related topics
            const topics = data.RelatedTopics ?? [];
            for (const topic of topics) {
                if (results.length >= maxResults) break;

                // Some topics are grouped — flatten them
                if (topic.Topics) {
                    for (const sub of topic.Topics) {
                        if (results.length >= maxResults) break;
                        if (sub.Text && sub.FirstURL) {
                            results.push(`- ${sub.Text}\n  ${sub.FirstURL}`);
                        }
                    }
                } else if (topic.Text && topic.FirstURL) {
                    results.push(`- ${topic.Text}\n  ${topic.FirstURL}`);
                }
            }

            if (results.length === 0) {
                return `No results found for: "${query}". Try rephrasing the query.`;
            }

            return `Search results for "${query}":\n\n${results.join("\n\n")}`;
        } catch (err) {
            return `Search error: ${err instanceof Error ? err.message : String(err)}`;
        }
    },
};