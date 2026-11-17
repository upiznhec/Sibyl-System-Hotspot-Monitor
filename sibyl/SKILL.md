---
name: sibyl
description: Sibyl trend monitor. Collects trending searches and hashtags (Google Trends, TikTok Creative Center and Wikipedia, plus YouTube search and X trends if turned on), keeps those in the user's topics, and sends instant alerts and hourly briefings to Slack, Discord, WeCom or Telegram, or saves them as files. Use it to set Sibyl up, map the user's topics, read its trend pages, show saved briefings when the user asks, or change its topics, sources, schedule or push settings.
author: Misaka Studio (Sibyl System Hotspot Monitor v1.3.20); adapted for the Social Media AI Workflow Library
license: MIT
---

# Sibyl trend monitor

Follow the full instructions in [AGENTS.md](../AGENTS.md) at the repository root. The most important points:

- Never type passwords, API keys or tokens into web pages; the person logs in, in the browser they already use wherever possible (AGENTS.md, "Keys and logins").
- Where you can work in the person's signed-in browser or apps, do the account steps yourself: all of them for Telegram, Slack and Discord; for YouTube and X, the clicks before the key, which the person makes, copies and saves. On Meta's sites the person does every click (AGENTS.md, "Who does what").
- Before you make a Discord channel or any webhook, check that you are signed in to the account the person reads. Right after you save each place, send it a test message and have them say where it appeared (AGENTS.md, "Check the account first").
- The person may know none of the terms. Ask for what you need only when you need it, one thing at a time, in plain words with the cost and the link; use a question dialog if your app has one. See "Talking to the person" in AGENTS.md.
- Before scheduling anything, show the person the sources, topics, keywords, exclude words and the category chosen on each platform (`dailyPages`), and wait for their OK. After it, keep to that plan: no new scoring, extra jobs or AI explanations unless something does not work or they ask (rule 12).
- Read the pages in `dailyPages` when they are due (`node scripts/save-pages.js --due`: Google's Trending Now every hour, the others once a day). If you have a tool that runs tasks on a schedule, make the hourly reading task with it before you report the setup as done (AGENTS.md, "The page reading"). If you read in a browser you started, the task checks it before each run and starts it again with the same profile: one window only, and no passwords. After a restart or a network drop, follow AGENTS.md, "If the computer restarts or the network drops".
- Exclude words keep a whole event out of the briefing and the alerts when one of its titles has them: use specific phrases, and check them with `node scripts/sibyl.js --print --no-push`, which lists what they keep out. Country names also name sports teams: put words such as "vs" on the country keyword itself (`{ "word": "japan", "exclude": ["vs"] }`), not on the whole topic.
- A run of the page-reading task only reads and saves; changes to the task or your reader wait for the person's OK. If the same page fails twice, compare what it shows (rows, "1–25 of 50") with what your reader expects before you blame the site or propose dropping it. Close each tab you open.
- When the person's hours end, tell them once and change nothing until they say stop; then remove the schedule and the reading task together (AGENTS.md, "When the person's hours end").
- Show saved briefings and alerts only when the person asks: `node scripts/show-briefing.js` (`--list`, `--alerts`).
- Keys and webhook addresses go in `sibyl/data/.env`, readable only by the person; the scripts read it. The person saves the ones they make with `node scripts/save-secret.js <name>` in their own terminal; a Telegram token or a Slack or Discord address that you copied for them, you pipe from the clipboard into the same command with `--from-stdin`, without showing it ("Saving a key"). Never in the chat. Do not read or copy another Sibyl folder's `data/.env` without the person's OK.
- Schedule only with `node scripts/schedule.js --install --hours=<start>-<end>`; no wrappers of your own. If your app blocks crontab, the person runs it in their own terminal (AGENTS.md, "Scheduling").
- Save the pages you read with `node scripts/save-pages.js` (one file per page in `data/daily-pages/`); never write `pages.json` yourself. Read every page of a list, not only the first 25 rows of Google's table, and give `total` (for Explore, both lists' counts added together); never leave out a field to get past a check.
- Instagram (optional) is read through the person's own Meta app: tell them first that Meta is strict about automated activity; they do every step on Meta's sites in their own browser, and save the token with `node scripts/instagram-token.js` (AGENTS.md, "Instagram").
- If your commands cannot reach the internet, stop and ask the person to allow it (AGENTS.md, rule 11).
- After any change, run `node scripts/check-deploy.js`.

The person-facing guide is [docs/guide.md](../docs/guide.md).
