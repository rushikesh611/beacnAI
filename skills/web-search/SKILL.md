---
name: web-search
description: Search the web for current information, news, and facts
triggers:
  - search
  - look up
  - find
  - current
  - latest
  - recent
  - news
  - today
  - what happened
  - price
  - score
tools: [web_search]
always: false
---

# Web Search Skill

When the user asks about current events, news, recent developments, prices,
scores, or anything that may have changed, use the `web_search` tool.

## Guidelines
- Always cite the source URL in your reply
- Prefer recent results — look for dates in snippets
- Summarize findings rather than reproducing text verbatim
- If the first search is ambiguous, search again with a refined query
- If no results are useful, say so honestly rather than guessing