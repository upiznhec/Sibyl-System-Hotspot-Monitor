---
name: sibyl
description: Sibyl 是多平台热点信号聚合与趋势研判系统，以微博、抖音热搜作为播报种子，聚合贴吧、虎扑补充信号，按统一模型做事件合并、综合评分、趋势判断和Markdown简报生成，可选推送企业微信。
version: 1.3.20
author: Misaka Studio
license: MIT
tags:
  - hot-trend
  - aggregator
  - social-media
  - weibo
  - douyin
  - tieba
  - hupu
---

# Sibyl

## 定位

`Sibyl` 是 Misaka Studio 的多平台热点信号聚合与趋势研判系统。名字取义为“预判与洞察”：它统一采集微博、抖音、贴吧、虎扑等热点信号，保留微博/抖音高热即时预警，并以微博、抖音热搜作为综合播报种子，把贴吧、虎扑等社区信号合并到同一事件里，判断跨平台共振、持续性和升降温趋势，最终生成简洁的热点综合播报。

微博、抖音旧脚本现在是兼容入口；实际采集、快照、即时预警和综合研判都由 `Sibyl` 负责。

## 核心逻辑

```text
每10分钟统一采集
  微博 / 抖音 / 贴吧 / 虎扑
      ↓
统一快照
  平台 / 时间 / 话题词 / 位次 / 热度值
      ↓
微博/抖音即时预警
  高热话题按自然日去重
      ↓
统一 HotSignal
      ↓
大类识别：游戏 / 电竞 / 体育 / AI
      ↓
关键词精筛与加分
      ↓
事件聚合 TopicCluster
  同对象 + 同动作/同事件表达
      ↓
播报门槛：必须命中微博或抖音
      ↓
综合评分和趋势判断
      ↓
Markdown 综合简报
```

## 数据来源

| 平台 | 类型 | 说明 |
|------|------|------|
| 微博 | 热搜榜 | 抓取微博热搜，适合作为泛平台主要来源 |
| 抖音 | 热榜 | 抓取抖音热榜，适合判断短视频扩散 |
| 贴吧 | 热议榜 | 抓取贴吧热议榜，适合发现社区讨论峰值 |
| 虎扑 | 重点板块热帖 | 抓取步行街、英雄联盟、NBA、国际足球等板块，适合作为体育/电竞补充来源 |

## 使用方式

```bash
cd /root/.openclaw/workspace/skills/sibyl
node scripts/collect-snapshot.js
node scripts/instant-alerts.js --no-push
node scripts/sibyl.js --print --no-push
```

输出文件默认位于：

```text
/root/.openclaw/workspace/data/sibyl/
├── snapshot-latest.json     # 最新10分钟快照
├── snapshots/               # 历史快照，用于小时内趋势
├── alerts-state.json        # 微博/抖音即时预警去重状态
├── signals-latest.json      # 最新统一信号
├── clusters-latest.json     # 最新聚合话题
├── report-latest.md         # 最新综合播报
├── report-summaries.json    # 综合播报事件摘要缓存
├── report-retrieval-failures.json # 取材失败短缓存
├── retrieval-health.json    # 联网检索能力状态与熔断记录
└── state.json               # 上一轮状态，用于计算趋势
```

本地调试时可用：

```bash
SIBYL_DATA_DIR=./data node scripts/sibyl.js --print --no-push
```

## 配置

复制 `scripts/config.example.json` 到数据目录：

```bash
mkdir -p /root/.openclaw/workspace/data/sibyl
cp scripts/config.example.json /root/.openclaw/workspace/data/sibyl/config.json
```

常用配置：

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
  "eventMerge": {
    "enabled": true,
    "candidateLimit": 36,
    "minConfidence": 0.8
  },
  "eventSummary": {
    "enabled": true,
    "cacheTtlHours": 6,
    "retrievalLimit": 10,
    "concurrency": 2,
    "timeBudgetSeconds": 180,
    "failureCacheTtlMinutes": 30
  },
  "eventFilter": {
    "enabled": true,
    "minConfidence": 0.75
  },
  "retrieval": {
    "health": {
      "confirmationDelayMinutes": 30,
      "firstOpenHours": 48,
      "repeatOpenHours": 96,
      "recoverySuccessesRequired": 2
    },
    "capabilities": [
      "openclaw.agent.sibyl-retriever",
      "browser.search",
      "web_fetch.read"
    ]
  },
  "alerts": {
    "pushWeCom": false,
    "webhook": "",
    "dedupe": "daily",
    "summaries": true,
    "agentReachSummary": {
      "enabled": true,
      "command": "openclaw",
      "agent": "sibyl-retriever",
      "sessionFlag": "none",
      "timeoutSeconds": 90,
      "minSources": 2,
      "minConfidence": "medium",
      "capabilities": [
        "browser.search"
      ]
    },
    "aiSearchSummary": {
      "enabled": false,
      "maxChars": 110
    }
  },
  "report": {
    "topN": 10,
    "minScore": 20,
    "requireSeedPlatforms": true,
    "seedPlatforms": ["weibo", "douyin"],
    "pushWeCom": false,
    "webhook": ""
  }
}
```

说明：
- `allowedCategories` 是硬门槛，只有命中游戏、电竞、体育、AI之一的话题才会进入播报。
- `requireSeedPlatforms: true` 是播报门槛：话题必须至少命中微博或抖音之一，才会进入热点综合播报；虎扑、贴吧只作为补充来源和加分来源。
- `seedPlatforms` 默认是 `["weibo", "douyin"]`，用于定义哪些平台能作为播报种子。
- 关键词库用于两层判断：先判断大类，再作为具体关键词给综合分加权。
- 字符串关键词直接匹配；对象关键词可用 `requireAny` 要求至少一个正向语境词，并用 `exclude` 排除明确误报语境。
- 三字以上中文实体允许在连续中文标题中匹配；两字泛词仍保留边界限制。
- 综合播报以“热点事件线”为单位：同一事实的不同表达，以及同一时间线上的结果、回应、赛后/上线后动态和直接衍生讨论可以合并；仅主体相同的无关内容保持拆分。
- 语义合并必须给出具体共同事件锚点、关系类型和每个成员的关系证据；“关键词匹配、品类一致、同一人物”不能通过后处理校验。
- 游戏事件在聚合后判断事件性质。例行版本、维护、官方活动、福利和商业宣发默认不进入主榜；只有争议事故或明确的玩家自发破圈事件可以恢复。
- 游戏关键词仅作为事件性质线索，不直接删除信号；过滤原因和恢复原因保存在聚合数据中，不显示在播报正文。
- 语义事件线只判断能否形成一段具体、连贯的叙述，不维护体育、电竞、游戏各自的固定字段模板。
- 合并标题采用“核心事实 + 最具代表性的衍生事实”，禁止使用“相关动态、持续升温、引发关注”等空泛事件标题。
- `事件摘要`优先复用即时预警摘要；缺失或发生合并时，通过专用`sibyl-retriever`取材并交给Elixir生成。原`处理建议`不再生成。
- 企业微信 Webhook 推荐使用环境变量，不要硬编码到脚本。即时预警优先读取 `SIBYL_ALERT_WEBHOOK`，小时综合播报优先读取 `SIBYL_REPORT_WEBHOOK`；未配置时都会回退到旧的 `WECOM_WEBHOOK` 和配置文件里的 `webhook`。
- 微博智搜用于即时预警摘要补全，配置优先级为：环境变量 → `alerts.weiboAI` → `/root/.openclaw/openclaw.json` 的 `channels.weibo` → 默认 endpoint。建议凭据继续放在 OpenClaw 环境或配置里，不要写入技能源码。
- 联网取材前应先用 `scripts/retrieval-health.js select` 选择健康能力，调用后回写真实结果。状态表不会自行联网，也不会把“无搜索结果”误判为后端故障。
- 即时预警和综合播报共用微博智搜HTTP模块。没有缓存时先直连微博智搜并交给Elixir；无内容时才调用专用Agent的`browser + web_fetch`站外兜底。
- 微博智搜在第一组查询获得内容后立即停止；精确标题无内容时才尝试事件别名，避免重复请求。

检索能力状态与熔断：

```bash
node scripts/retrieval-health.js status --json
node scripts/retrieval-health.js select browser.search --json
node scripts/retrieval-health.js failure browser.search --type=timeout --reason=request_timeout --json
node scripts/retrieval-health.js success browser.search --latency-ms=1200 --json
node scripts/retrieval-health.js probe-due --json
node scripts/retrieval-health.js reset browser.search --json
node scripts/test-retrieval-summary.js --topic="测试话题" --platform=douyin --category=体育
```

连续两次普通故障会熔断48小时；恢复探测再次失败、鉴权失败或明确风控会熔断96小时。`not_configured` 会停用能力，直到配置变化后手动 `reset`；`no_results`、`topic_miss` 和单页 `page_error` 不会触发整条能力熔断。

Webhook 示例：

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

OpenClaw 定时任务运行时不一定会继承交互式 shell 的环境变量。正式部署时，必须在任务命令中显式提供 webhook，或在 crontab 顶部声明环境变量，避免脚本运行成功但推送失败。

部署后可运行自检，确认 webhook、微博智搜、时区和数据目录是否就绪：

```bash
cd /root/.openclaw/workspace/skills/sibyl
node scripts/check-deploy.js
```

如果 webhook 写在 OpenClaw 定时任务 payload 中，而不是系统环境变量中，自检脚本手动运行时可能读不到。可以用 `--task-command` 传入任务命令做辅助检查：

```bash
node scripts/check-deploy.js --task-command='export SIBYL_REPORT_WEBHOOK=... && node scripts/sibyl.js --push'
```

## 播报格式

```md
### 1. ⚽ 🔥 哈兰德助挪威晋级，赛后纽约逛街成为热点

**综合分：92/100（强热点）**

**热度表现：** 微博#8 50万、抖音#12 80万；2个平台共同出现；同一事件覆盖3个话题词；当前热度上升中。

**事件摘要：** 哈兰德帮助挪威晋级世界杯16强，赛后在纽约逛街的相关内容随后成为社交平台热点。

[查看微博话题](https://s.weibo.com/weibo?q=Faker) ｜ [查看抖音话题](https://www.douyin.com/search/Faker) ｜ [查看虎扑热帖](https://bbs.hupu.com/xxx.html)

### 社区观察

- 电竞 ｜ DOTA2新版本肉山刷新点吵翻了 ｜ 综合分 54/100（观察） ｜ 虎扑/步行街#2 ｜ 未命中微博/抖音
```

说明：
- 标题前缀使用“品类 emoji + 状态 emoji”。品类包括：游戏 `🕹️`、电竞 `🎮`、篮球 `🏀`、足球 `⚽`、体育 `🏅`、AI `🤖`。
- `热度表现`统一承载原入选依据、平台表现和趋势变化，不展示具体命中关键词，也不计算跨平台累计热度。
- `社区观察` 只列未命中微博/抖音的虎扑、贴吧话题，不进入主榜排序，用于保留垂类早期信号。
- 微博、抖音链接命中本平台热搜/话题词时，文案为“查看微博话题”“查看抖音话题”。
- 虎扑链接命中本平台帖子时，文案为“查看虎扑热帖”。
- 任一平台没有本平台命中内容时，使用核心关键词或短实体词搜索兜底，文案改为“搜索微博关键词”“搜索抖音关键词”“搜索虎扑关键词”，避免把搜索结果误写成详情页。

## 综合分计算

综合分用于排序，分数越高，说明这个话题越值得优先看。它不是绝对热度，而是把平台排名、平台热度、关键词命中和跨平台情况放在一起计算。

报告中展示的是百分制综合分，例如 `86/100（强热点）`；内部仍保留原始分用于排序和趋势计算。

```text
综合分 = 各平台信号分之和 + 跨平台加分 + 高排名加分
```

单条平台信号分：

```text
平台信号分 = (排名分 + 热度分 + 关键词加分 + 社区板块加分)
           × 平台权重
           × 来源类型权重
```

具体规则：
- 排名分：排名越靠前越高，主要看前35名。
- 热度分：按热度取对数，避免超大平台热度把其他平台完全压住。
- 关键词加分：命中游戏、电竞、体育、AI等关键词会加分，最多加12分。
- 社区板块加分：虎扑等垂类社区热帖会有少量补充加分。
- 平台权重：微博、抖音权重最高；虎扑权重为 0.6，作为垂类社区补充来源；贴吧权重为 0.5，仅作为弱补充信号。
- 来源类型权重：热搜/热榜高于普通板块热帖。
- 跨平台加分：同一话题每多覆盖1个平台，加22分。
- 高排名加分：任一平台进入前3名，额外加12分。

报告展示分按原始分做分段映射：

```text
20  → 30/100
50  → 50/100
80  → 65/100
120 → 75/100
180 → 85/100
250 → 92/100
350 → 97/100
```

展示等级：
- 0-59：观察
- 60-84：关注后续
- 85-100：强热点

## 定时任务

Sibyl 分为两类定时任务：

- 每 10 分钟统一采集一次快照，并检查微博/抖音高热即时预警。
- 每 60 分钟生成一次“热点综合播报”，运行时间为北京时间 10:00 到 22:00。

```bash
SIBYL_ALERT_WEBHOOK=https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=ALERT_KEY
SIBYL_REPORT_WEBHOOK=https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=REPORT_KEY

*/10 10-22 * * * cd /root/.openclaw/workspace/skills/sibyl && node scripts/collect-snapshot.js >> /var/log/sibyl-snapshot.log 2>&1 && node scripts/instant-alerts.js --push >> /var/log/sibyl-alerts.log 2>&1
0 10-22 * * * cd /root/.openclaw/workspace/skills/sibyl && node scripts/sibyl.js --push >> /var/log/sibyl.log 2>&1
```

OpenClaw 任务投递设置：
- `Sibyl热点综合播报` 的 `delivery.mode` 必须设为 `none`。
- `Sibyl快照采集与即时预警` 的 `delivery.mode` 必须设为 `none`。
- 原因：Sibyl 脚本会通过 `--push` 自行调用企业微信 webhook；OpenClaw 任务层只负责调度，不再二次投递任务结果，避免重复推送或因缺少 `target <userId>` 推送失败。

OpenClaw 定时任务环境检查：
- 任务命令必须能读取到 `SIBYL_REPORT_WEBHOOK` 和 `SIBYL_ALERT_WEBHOOK`。如果 OpenClaw 不继承 shell 环境变量，可以把变量写在 crontab 顶部，或在任务命令前显式声明。
- 系统时区必须统一为 `Asia/Shanghai`。至少检查 `date`、`/etc/timezone`、`/etc/localtime` 三者是否一致，避免 `10:00-22:00` 的北京时间调度窗口被错误解释。

重复播报原则：
- 首次命中微博或抖音并达到分数门槛时进入播报。
- 后续仍在主榜时可以继续出现，状态变化通过 `热度表现` 体现。
- 常见复播原因包括：综合分明显上升或下降、新增平台信号、最高排名上升、覆盖平台增加、持续在榜但变化不大；这些原因会保留在聚合数据中，默认不在播报正文展示。

## 与旧监控的关系

- `weibo-monitor` 和 `douyin-monitor` 目录仍保留，但脚本已改为调用 Sibyl 的即时预警兼容入口。
- 新部署建议只配置 Sibyl 的统一采集和即时预警 cron，避免微博/抖音重复抓取。
- `elixir-summarizer` 和关键词库继续被复用，用于即时预警摘要、关键词增强和后续 AI 摘要扩展。
