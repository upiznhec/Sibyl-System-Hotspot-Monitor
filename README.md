# Sibyl trend monitor

Based on [Sibyl System Hotspot Monitor](https://github.com/liray0919/Sibyl-System-Hotspot-Monitor) v1.3.20 by Misaka Studio (MIT License), adapted for the Social Media AI Workflow Library, a non-commercial project.

Sibyl watches trend lists for the topics you choose: Google Trends, TikTok Creative Center and Wikipedia, plus YouTube search and X trends if you turn them on. It sends an alert when something in your topics reaches the top of Google Trends, and every hour it writes a briefing of the strongest trends, grouped into events, each with a score and a short summary. Briefings go to Slack, Discord, WeCom or Telegram, or are saved as files that your AI agent shows you when you ask.

## Start here

- **People:** read the [guide](docs/guide.md), then send the [setup request](SETUP-PROMPT.md) to your AI agent.
- **AI agents:** follow [AGENTS.md](AGENTS.md).

## What changed from v1.3.20

Kept from v1.3.20, because it was tested in use: the alert and briefing layouts (score, signals, summary), the schedule (collection and alerts every 10 minutes, a briefing every hour), the scoring, the rules for merging events, and pushing to a group chat.

Changed:

- **Sources.** Weibo, Douyin, Tieba and Hupu are replaced by Google Trends (its RSS feed on every run; the Trending Now page for chosen categories, read every hour, and Explore's rising searches, read once a day, both by the user's agent), TikTok Creative Center hashtags (read by the agent), Wikipedia's most-read pages, and YouTube channels and websites the user follows. X trends and YouTube search are optional and need the user's own key. Each source is a file in `sibyl/scripts/adapters/` that declares its own label, weights and links.
- **Topics.** The fixed games, esports, sports and AI keywords are replaced by topics the user sets with their agent, with keywords, exclude words and the matching category on each platform.
- **Language and time.** Briefings and alerts are in English; times follow the user's time zone; counts use K, M and B.
- **Grouping.** English titles are grouped by the words that describe the event. Sharing only a topic keyword, a person or a brand does not merge two events, and a hashtag matches the words it joins (#sunscreenrecall and "sunscreen recall").
- **Push.** Slack, Discord and Telegram are added; WeCom stays. With no push target, nothing is sent: briefings and alerts are saved for 7 days and shown when the user asks their agent.
- **AI model.** Optional, with the user's own OpenAI-compatible key; without one, the rule-based fallback runs, as in v1.3.20. Summaries are written from the news links that come with Google Trends items.
- **Running.** `scripts/schedule.js` sets up the schedule for every agent the same way (the crontab, or the Task Scheduler settings on Windows); keys and webhook addresses live in `sibyl/data/.env`; the self-check also tests internet access. Items from lists read for a topic lead the briefing only with a keyword match or a second source.
- **Removed.** The parts that needed OpenClaw or the original team's setup: Weibo intelligent search, the Agent Reach retriever and its health table, and the OpenClaw paths and model settings.
- **Checked.** Until the Chinese sources were removed, every change was compared with v1.3.20 on saved Weibo, Douyin, Tieba and Hupu snapshots; briefings, alerts and constants stayed identical (last check at commit 62fa3a4). The git history keeps the check tool.

The full list is in the [changelog](CHANGELOG.en.md). The alert limits, source weights and score levels are first settings, to be adjusted after a week of testing.

## Documents

- [Guide](docs/guide.md): what Sibyl does, setup, daily use, common changes, problems and fixes
- [Setup request](SETUP-PROMPT.md): what to send your agent
- [AGENTS.md](AGENTS.md): instructions for AI agents
- [Changelog](CHANGELOG.en.md)
- [中文说明](README.zh-CN.md)

## License

MIT. Copyright (c) 2026 Misaka Studio; see [LICENSE](LICENSE).
