---
name: douyin-monitor
description: Sibyl System 的抖音即时预警兼容入口。旧调用会转到 Sibyl 统一快照与抖音高热即时预警，不再单独抓取和汇总。
version: 1.3.20
author: Misaka Studio
license: MIT
tags:
  - douyin
  - hot-search
  - monitor
  - sibyl
---

# 抖音监控兼容入口

抖音高热即时预警已经整合进 **Sibyl System**。保留 `douyin-monitor` 是为了兼容旧的 OpenClaw 技能入口和历史 cron 调用。

## 当前行为

运行：

```bash
node scripts/douyin-monitor.js
```

等价于调用：

```bash
cd /root/.openclaw/workspace/skills/sibyl
node scripts/instant-alerts.js --platform=douyin --collect-if-stale --push
```

逻辑说明：
- 优先读取 Sibyl 最近10分钟统一快照。
- 快照缺失或过期时，会自动触发一次 Sibyl 统一采集。
- 只检查抖音平台高热即时预警。
- 同一话题词按自然日只触发一次高热即时预警。
- 兼容入口默认尝试推送；手动测试可追加 `--no-push`。

## 推荐部署

新部署不建议再单独配置 `douyin-monitor` cron，统一使用 Sibyl：

```bash
*/10 10-22 * * * cd /root/.openclaw/workspace/skills/sibyl && node scripts/collect-snapshot.js >> /var/log/sibyl-snapshot.log 2>&1 && node scripts/instant-alerts.js --push >> /var/log/sibyl-alerts.log 2>&1
0 10-22 * * * cd /root/.openclaw/workspace/skills/sibyl && node scripts/sibyl.js --push >> /var/log/sibyl.log 2>&1
```
