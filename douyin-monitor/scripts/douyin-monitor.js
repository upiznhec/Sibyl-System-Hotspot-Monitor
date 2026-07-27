#!/usr/bin/env node
/**
 * 兼容入口：抖音高热即时预警已整合进 Sibyl System。
 *
 * 保留这个文件是为了兼容旧的 OpenClaw/cron 调用。实际逻辑由
 * sibyl/scripts/instant-alerts.js 执行：优先读取 Sibyl 统一快照，快照过期时
 * 自动触发一次统一采集，然后只检查抖音平台的即时高热预警。
 */

const path = require('path');
const { spawnSync } = require('child_process');

const sibylInstantAlerts = path.resolve(__dirname, '../../sibyl/scripts/instant-alerts.js');
const args = [
  sibylInstantAlerts,
  '--platform=douyin',
  '--collect-if-stale',
  '--push',
  ...process.argv.slice(2)
];

const result = spawnSync(process.execPath, args, {
  stdio: 'inherit',
  env: process.env
});

if (result.error) {
  console.error('❌ 启动 Sibyl 抖音即时预警失败:', result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
