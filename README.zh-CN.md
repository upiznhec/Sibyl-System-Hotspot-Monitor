# Sibyl System Hotspot Monitor

[English](README.en.md) | [版本更新记录](CHANGELOG.zh-CN.md)

作者：Misaka Studio

Sibyl System Hotspot Monitor 是一个多平台热点信号聚合与趋势研判系统，面向游戏、电竞、体育、AI等垂类热点场景。它会统一采集微博、抖音、贴吧、虎扑等公开热点信号，将分散的热榜内容整理成即时预警和小时级 Markdown 综合播报。

系统的目标不是替代人工判断，而是把“平台热榜上发生了什么、是否跨平台扩散、当前趋势如何、是否值得承接”这些信息压缩成一份更适合快速阅读和运营决策的结构化报告。

## 核心能力

- 每 10 分钟统一采集微博、抖音、贴吧、虎扑热点快照。
- 对微博、抖音高热或高排名话题进行即时预警。
- 每小时生成一次“热点综合播报”。
- 按游戏、电竞、体育、AI进行大类识别和过滤。
- 将同一时间线上的不同平台话题聚合为一个热点事件，并生成具体事件标题。
- 综合排名、热度、平台覆盖、关键词命中和跨平台共振计算排序分。
- 基于上一轮状态和近 70 分钟快照判断趋势变化。
- 输出适合企业微信 Webhook 推送的 Markdown 内容。
- 在模型配置可用时，使用Agent Reach与Elixir生成经过来源校验的事件摘要。

## 适用场景

- 市场、运营、内容团队快速判断当日热点是否值得承接。
- 监控游戏、电竞、体育、AI相关话题在泛舆论场和垂类社区中的扩散。
- 将平台热榜从“人工扫榜”改造成“结构化预警 + 小时播报”。
- 在 OpenClaw 或其它定时任务环境中复用热点监控框架。

## 仓库结构

```text
.
├── sibyl/
│   ├── SKILL.md
│   └── scripts/
│       ├── collect-snapshot.js       # 统一采集多平台快照
│       ├── instant-alerts.js         # 即时预警
│       ├── sibyl.js                  # 小时综合播报
│       ├── check-deploy.js           # 部署后自检
│       ├── config.example.json       # 配置示例
│       ├── adapters/                 # 平台采集适配器
│       └── lib/                      # 分类、聚合、评分、报告生成
├── elixir-summarizer/
│   ├── SKILL.md
│   └── scripts/
│       ├── elixir-summarizer.js      # 摘要与商业过滤辅助能力
│       └── keywords.json             # 关键词库
├── docs/
│   └── Sibyl_System_产品文档.md
├── CHANGELOG.md
├── CHANGELOG.zh-CN.md
├── CHANGELOG.en.md
├── README.md
├── README.zh-CN.md
└── README.en.md
```

## 运行要求

- Node.js 18 或更高版本。
- 能访问被监控平台的公开热点页面。
- 可选：企业微信机器人 Webhook，用于推送即时预警和综合播报。
- 可选：OpenClaw 模型或兼容模型配置，用于语义事件合并和事件摘要。

当前版本核心脚本只依赖 Node.js 内置模块，不需要额外安装 npm 包。

## 快速开始

在仓库根目录执行：

```bash
cd sibyl
SIBYL_DATA_DIR=./data node scripts/collect-snapshot.js
SIBYL_DATA_DIR=./data node scripts/instant-alerts.js --no-push
SIBYL_DATA_DIR=./data node scripts/sibyl.js --print --no-push
```

使用 `SIBYL_DATA_DIR=./data` 时，本地运行数据会写入 `sibyl/data/`。该目录默认不会进入 Git。

## 配置方式

复制配置示例：

```bash
mkdir -p sibyl/data
cp sibyl/scripts/config.example.json sibyl/data/config.json
```

常用配置项：

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

Webhook 推荐用环境变量配置，避免写死在文件里：

```bash
export SIBYL_ALERT_WEBHOOK="https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=ALERT_KEY"
export SIBYL_REPORT_WEBHOOK="https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=REPORT_KEY"
```

微博智搜可选环境变量：

```bash
export SIBYL_WEIBO_APP_ID="WEIBO_APP_ID"
export SIBYL_WEIBO_APP_SECRET="WEIBO_APP_SECRET"
export SIBYL_WEIBO_WIS_AUTH_URL="https://open-im.api.weibo.com/open/auth/ws_token"
export SIBYL_WEIBO_WIS_SEARCH_URL="https://open-im.api.weibo.com/open/wis/search_query"
```

## 部署自检

部署后可以运行自检脚本，确认关键配置是否就绪：

```bash
cd sibyl
SIBYL_DATA_DIR=./data node scripts/check-deploy.js
```

自检会提示：

- 必需项：技能目录、Node.js、数据目录、即时预警 webhook、综合播报 webhook。
- 推荐项：配置文件、webhook 拆分、系统时区。
- 可选增强：微博智搜、AI 模型配置。
- 人工确认：OpenClaw `delivery.mode` 和定时任务。

## 定时部署

Sibyl 通常分成两条定时链路：

- 每 10 分钟：采集快照，并检查微博/抖音即时预警。
- 每 60 分钟：生成热点综合播报。

示例：

```bash
*/10 10-22 * * * cd /root/.openclaw/workspace/skills/sibyl && node scripts/collect-snapshot.js >> /var/log/sibyl-snapshot.log 2>&1 && node scripts/instant-alerts.js --push >> /var/log/sibyl-alerts.log 2>&1
0 10-22 * * * cd /root/.openclaw/workspace/skills/sibyl && node scripts/sibyl.js --push >> /var/log/sibyl.log 2>&1
```

默认调度窗口按北京时间设计，生产环境建议统一系统时区为 `Asia/Shanghai`。

## 输出文件

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

这些文件属于运行数据，默认被 `.gitignore` 排除。

## 设计原则

- 微博、抖音作为综合播报种子，代表泛舆论场和短视频扩散场。
- 贴吧、虎扑作为社区补充信号，不默认单独主导综合播报。
- 热度值不跨平台直接相加，综合分只作为排序指标。
- AI 摘要和建议必须保守：无可靠信息时不编造、不强行解释。
- 即时预警按自然日去重，小时播报允许复播，并在热度表现中说明变化。

## 文档

- [中文产品文档](docs/Sibyl_System_产品文档.md)
- [中文版本更新记录](CHANGELOG.zh-CN.md)
- [English README](README.en.md)
- [English Changelog](CHANGELOG.en.md)

## License

MIT License. See [LICENSE](LICENSE).
