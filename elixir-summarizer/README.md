# Elixir summarizer

Writes the short event summaries in Sibyl's briefings and alerts. It is a module of Sibyl, not a separate tool.

- With an AI model (the user's own OpenAI-compatible key: `SIBYL_AI_API_KEY` and `SIBYL_AI_MODEL`), it first checks whether the topic is advertising, then writes a summary of at most two sentences and 50 words from the material, using only facts the material states.
- Without a model, the first line of the material (usually a news headline and its source) is the summary.

From Sibyl System Hotspot Monitor v1.3.20 by Misaka Studio (Elixir v3.7.0, MIT License); the prompts are translated and the model settings moved to `sibyl/scripts/lib/model-config.js`.
