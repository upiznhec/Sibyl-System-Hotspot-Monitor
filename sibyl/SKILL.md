---
name: sibyl
description: Sibyl trend monitor. Collects trending searches and hashtags (Google Trends, TikTok Creative Center and Wikipedia, plus YouTube search and X trends if turned on), keeps those in the user's topics, and sends instant alerts and hourly briefings to Slack, Discord, WeCom or Telegram, or saves them as files. Use it to set Sibyl up, map the user's topics, read its daily pages, show saved briefings when the user asks, or change its topics, sources, schedule or push settings.
author: Misaka Studio (Sibyl System Hotspot Monitor v1.3.20); adapted for the Social Media AI Workflow Library
license: MIT
---

# Sibyl trend monitor

Follow the full instructions in [AGENTS.md](../AGENTS.md) at the repository root. The most important points:

- Never type passwords, API keys or tokens into web pages; ask the person to log in themselves.
- The person may know none of the terms. Ask for what you need only when you need it, one thing at a time, in plain words with the cost and the link; use a question dialog if your app has one. See "Talking to the person" in AGENTS.md.
- Before scheduling anything, show the person the sources, topics, keywords, exclude words and the category chosen on each platform (`dailyPages`), and wait for their OK.
- Read the pages in `dailyPages` once a day and save them to `sibyl/data/pages.json` (format in `scripts/lib/pages-file.js`).
- Show saved briefings and alerts only when the person asks: `node scripts/show-briefing.js` (`--list`, `--alerts`).
- After any change, run `node scripts/check-deploy.js`.

The person-facing guide is [docs/guide.md](../docs/guide.md).
