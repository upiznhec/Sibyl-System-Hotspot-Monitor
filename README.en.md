# Sibyl System Hotspot Monitor

[中文](README.zh-CN.md) | [Changelog](CHANGELOG.en.md)

Author: Misaka Studio

Sibyl System Hotspot Monitor is a multi-platform hotspot signal aggregator and trend monitor for game, esports, and sports topics. It collects public trend signals from Weibo, Douyin, Tieba, and Hupu, then turns scattered hot-board items into structured alerts and hourly Markdown briefings.

The system is designed for fast operational reading: it keeps high-heat Weibo and Douyin instant alerts, adds Tieba and Hupu as community signals, merges related events across platforms, scores trend strength, and generates concise action-oriented reports for enterprise chat workflows.

## What It Does

- Collects hotspot snapshots every 10 minutes across Weibo, Douyin, Tieba, and Hupu.
- Sends instant alerts for high-ranking or high-heat Weibo and Douyin topics.
- Builds hourly integrated hotspot briefings from the latest snapshot and recent history.
- Filters topics into game, esports, and sports categories.
- Merges alternate platform topic terms on the same timeline into semantic hotspot event threads.
- Scores topics by rank, heat, platform coverage, category matches, and cross-platform resonance.
- Tracks trend movement with previous-state and recent-snapshot comparison.
- Generates Markdown reports suitable for enterprise WeChat webhook delivery.
- Uses Agent Reach and Elixir to create source-checked event summaries when model configuration is available.

## Use Cases

- Help marketing, operations, and content teams decide whether a topic is worth same-day activation.
- Monitor game, esports, and sports topics across general public platforms and vertical communities.
- Replace manual hot-board scanning with structured alerts and hourly briefings.
- Reuse the hotspot monitoring framework in OpenClaw or other scheduled-task environments.

## Repository Layout

```text
.
├── sibyl/
│   ├── SKILL.md
│   └── scripts/
│       ├── collect-snapshot.js
│       ├── instant-alerts.js
│       ├── sibyl.js
│       ├── check-deploy.js
│       ├── config.example.json
│       ├── adapters/
│       └── lib/
├── elixir-summarizer/
│   ├── SKILL.md
│   └── scripts/
│       ├── elixir-summarizer.js
│       └── keywords.json
├── docs/
│   └── Sibyl_System_产品文档.md
├── CHANGELOG.md
├── CHANGELOG.zh-CN.md
├── CHANGELOG.en.md
├── README.md
├── README.zh-CN.md
└── README.en.md
```

## Runtime Requirements

- Node.js 18 or newer.
- Network access to the monitored public hot-board pages.
- Optional enterprise WeChat webhook for alert and report delivery.
- Optional OpenClaw model/provider configuration for semantic event merging and event summaries.

The core scripts use Node.js built-in modules only. No package installation is required for the current version.

## Quick Start

Run from the repository root:

```bash
cd sibyl
SIBYL_DATA_DIR=./data node scripts/collect-snapshot.js
SIBYL_DATA_DIR=./data node scripts/instant-alerts.js --no-push
SIBYL_DATA_DIR=./data node scripts/sibyl.js --print --no-push
```

By default, local output files are written to `sibyl/data/` when `SIBYL_DATA_DIR=./data` is used.

## Configuration

Copy the example configuration into the data directory:

```bash
mkdir -p sibyl/data
cp sibyl/scripts/config.example.json sibyl/data/config.json
```

Common settings:

```json
{
  "filters": {
    "allowedCategories": ["游戏", "电竞", "体育", "AI"],
    "minTitleLength": 4
  },
  "snapshot": {
    "maxAgeMinutes": 20,
    "trendWindowMinutes": 70
  },
  "alerts": {
    "pushWeCom": false,
    "dedupe": "daily"
  },
  "report": {
    "topN": 10,
    "minScore": 20,
    "requireSeedPlatforms": true,
    "seedPlatforms": ["weibo", "douyin"],
    "pushWeCom": false
  }
}
```

Webhook environment variables are preferred over hard-coded configuration:

```bash
export SIBYL_ALERT_WEBHOOK="https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=ALERT_KEY"
export SIBYL_REPORT_WEBHOOK="https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=REPORT_KEY"
```

Optional Weibo intelligent search environment variables:

```bash
export SIBYL_WEIBO_APP_ID="WEIBO_APP_ID"
export SIBYL_WEIBO_APP_SECRET="WEIBO_APP_SECRET"
export SIBYL_WEIBO_WIS_AUTH_URL="https://open-im.api.weibo.com/open/auth/ws_token"
export SIBYL_WEIBO_WIS_SEARCH_URL="https://open-im.api.weibo.com/open/wis/search_query"
```

## Deployment Self-Check

After deployment, run the self-check script to confirm key configuration:

```bash
cd sibyl
SIBYL_DATA_DIR=./data node scripts/check-deploy.js
```

The self-check reports:

- Required items: skill directory, Node.js, data directory, instant-alert webhook, and report webhook.
- Recommended items: config file, separate webhooks, and system time zone.
- Optional enhancements: Weibo intelligent search and AI model configuration.
- Manual confirmation items: OpenClaw `delivery.mode` and scheduled tasks.

## Scheduled Deployment

Sibyl is normally deployed with two schedules:

- Every 10 minutes: collect a snapshot and check Weibo/Douyin instant alerts.
- Every 60 minutes: generate the integrated hotspot briefing.

Example:

```bash
*/10 10-22 * * * cd /root/.openclaw/workspace/skills/sibyl && node scripts/collect-snapshot.js >> /var/log/sibyl-snapshot.log 2>&1 && node scripts/instant-alerts.js --push >> /var/log/sibyl-alerts.log 2>&1
0 10-22 * * * cd /root/.openclaw/workspace/skills/sibyl && node scripts/sibyl.js --push >> /var/log/sibyl.log 2>&1
```

Use `Asia/Shanghai` as the system time zone when deploying with the default Beijing-time operating window.

## Output Files

```text
sibyl/data/
├── snapshot-latest.json
├── snapshots/
├── alerts-state.json
├── alert-summaries.json
├── signals-latest.json
├── clusters-latest.json
├── report-latest.md
└── state.json
```

Runtime data is intentionally ignored by Git.

## Design Principles

- Weibo and Douyin are used as report seed platforms because they represent broad public attention and short-video diffusion.
- Tieba and Hupu are treated as supporting community signals and do not dominate the main report by default.
- Heat values are not directly added across platforms; the composite score is a ranking signal.
- Semantic merging and event summaries are conservative: uncertain relationships stay separate and unavailable facts are not invented.
- Instant alerts are deduplicated by natural day, while hourly reports may repeat topics only when trend movement adds value.

## Documentation

- [Chinese product document](docs/Sibyl_System_产品文档.md)
- [Chinese README](README.zh-CN.md)
- [Chinese Changelog](CHANGELOG.zh-CN.md)
- [English Changelog](CHANGELOG.en.md)

## License

MIT License. See [LICENSE](LICENSE).
