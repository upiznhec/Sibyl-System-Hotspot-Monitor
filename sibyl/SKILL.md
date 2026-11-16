---
name: sibyl
description: Sibyl trend monitor. Collects trending searches and hashtags (Google Trends, TikTok Creative Center and Wikipedia, plus YouTube search and X trends if turned on), keeps those in the user's topics, and sends instant alerts and hourly briefings to Slack, Discord, WeCom or Telegram, or saves them as files. Use it to set Sibyl up, map the user's topics, read its trend pages, show saved briefings when the user asks, or change its topics, sources, schedule or push settings.
author: Misaka Studio (Sibyl System Hotspot Monitor v1.3.20); adapted for the Social Media AI Workflow Library
license: MIT
---

# Sibyl trend monitor

Follow the full instructions in [AGENTS.md](../AGENTS.md) at the repository root. The most important points:

- Never type passwords, API keys or tokens into web pages; the person logs in, in the browser they already use wherever possible (AGENTS.md, "Keys and logins").
- The person may know none of the terms. Ask for what you need only when you need it, one thing at a time, in plain words with the cost and the link; use a question dialog if your app has one. See "Talking to the person" in AGENTS.md.
- Before scheduling anything, show the person the sources, topics, keywords, exclude words and the category chosen on each platform (`dailyPages`), and wait for their OK.
- Read the pages in `dailyPages` when they are due (`node scripts/save-pages.js --due`: Google's Trending Now every hour, the others once a day).
- Show saved briefings and alerts only when the person asks: `node scripts/show-briefing.js` (`--list`, `--alerts`).
- Keys and webhook addresses go in `sibyl/data/.env`, readable only by the person; the scripts read it. The person saves them with `node scripts/save-secret.js <name>` in their own terminal, never in the chat.
- Schedule only with `node scripts/schedule.js --install --hours=<start>-<end>`; no wrappers of your own.
- Save the pages you read with `node scripts/save-pages.js` (one file per page in `data/daily-pages/`); never write `pages.json` yourself.
- If your commands cannot reach the internet, stop and ask the person to allow it (AGENTS.md, rule 11).
- After any change, run `node scripts/check-deploy.js`.

The person-facing guide is [docs/guide.md](../docs/guide.md).
