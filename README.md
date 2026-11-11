# Sibyl System Hotspot Monitor

Author: Misaka Studio

> **This is a fork.** Based on [Sibyl System Hotspot Monitor](https://github.com/liray0919/Sibyl-System-Hotspot-Monitor) v1.3.20 by Misaka Studio (MIT License). It is being adapted for the Social Media AI Workflow Library, a non-commercial project, so that users can choose their own topics and sources. The original briefing format and broadcast method stay the same.
>
> 本仓库是 fork，基于 Misaka Studio 的 [Sibyl System Hotspot Monitor](https://github.com/liray0919/Sibyl-System-Hotspot-Monitor) v1.3.20（MIT License），为非商业项目 Social Media AI Workflow Library 改造：用户可以自选领域和来源，原版的播报格式和播报方式保持不变。
>
> Changes so far:
>
> - Each platform adapter declares its own label, weights, display order, role (main or community source) and link rule; `sibyl/scripts/lib/source-registry.js` reads them.
> - Topic categories, keywords, priority, board hints, icons and noise rules moved from the code into settings (`sibyl/scripts/lib/topic-settings.js`, preset `sibyl/presets/zh-v1.3.20.json`).
> - Briefings and alerts can be pushed to WeCom (企业微信, as in v1.3.20), Slack or Discord. The service is read from the webhook address or set with `channel` (`sibyl/scripts/lib/webhook.js`). The switch is now called `push`; the old name `pushWeCom` still works.
> - People without a work chat app can get briefings and alerts through a Telegram bot (`SIBYL_TELEGRAM_BOT_TOKEN`, `SIBYL_TELEGRAM_CHAT_ID`). With no push set at all, nothing is sent: briefings and alerts are saved as files in the data folder (`briefings/`, `alerts/`) and deleted after 7 days. They are shown only when the user asks their agent, for example "Show me the latest trend briefing"; the agent runs `node scripts/show-briefing.js`.
> - The optional AI steps use the user's own OpenAI-compatible API key and model (`SIBYL_AI_API_KEY`, `SIBYL_AI_MODEL`, `SIBYL_AI_BASE_URL`, or `ai` in the config file). Without both a key and a model, the rule-based fallback runs, as in v1.3.20.
> - Removed Weibo intelligent search and the parts that depend on OpenClaw: the Agent Reach retriever and its health table, the OpenClaw file paths and the OpenClaw model settings. The deploy self-check (`sibyl/scripts/check-deploy.js`) now checks the webhooks, the detected service and the model settings.
> - `tools/rewrite-check/` confirms that the output is identical to v1.3.20 on the same snapshots.
> - The other documents (README.zh-CN.md, README.en.md and the SKILL.md files) still describe v1.3.20 and will be updated in a later step.

Choose a language:

- [中文说明](README.zh-CN.md)
- [English README](README.en.md)

## Documents

- [中文版本更新记录](CHANGELOG.zh-CN.md)
- [English Changelog](CHANGELOG.en.md)
- [中文产品文档](docs/Sibyl_System_产品文档.md)

## Short Summary

Sibyl System Hotspot Monitor is a multi-platform hotspot signal aggregator and trend monitor for game, esports, and sports topics. It collects public trend signals from Weibo, Douyin, Tieba, and Hupu, then turns scattered hot-board items into structured alerts and hourly Markdown briefings.

Sibyl System Hotspot Monitor 是一个多平台热点信号聚合与趋势研判系统，面向游戏、电竞、体育、AI等垂类热点场景。它会统一采集微博、抖音、贴吧、虎扑等公开热点信号，将分散的热榜内容整理成即时预警和小时级 Markdown 综合播报。
