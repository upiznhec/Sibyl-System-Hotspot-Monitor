const fs = require('fs');
const path = require('path');

const { makeSignal, normalizeForCompare, platformLabel } = require('./signals');

function getDataDir() {
  if (process.env.SIBYL_DATA_DIR) return process.env.SIBYL_DATA_DIR;
  return path.resolve(__dirname, '..', '..', 'data');
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function readJson(file, fallback) {
  try {
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    }
  } catch (e) {
    console.error(`读取JSON失败 ${file}:`, e.message);
  }
  return fallback;
}

function writeJsonAtomic(file, data) {
  ensureDir(path.dirname(file));
  const tmpFile = `${file}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2));
  fs.renameSync(tmpFile, file);
}

function mergeConfig(base, override) {
  if (!override || typeof override !== 'object') return base;
  const result = Array.isArray(base) ? [...base] : { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      result[key] = mergeConfig(base?.[key] || {}, value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

function snapshotDir(dataDir = getDataDir()) {
  return path.join(dataDir, 'snapshots');
}

function latestSnapshotFile(dataDir = getDataDir()) {
  return path.join(dataDir, 'snapshot-latest.json');
}

function snapshotFileName(capturedAt) {
  return `${capturedAt.replace(/[:.]/g, '-')}.json`;
}

function snapshotFilePath(capturedAt, dataDir = getDataDir()) {
  const datePart = capturedAt.slice(0, 10);
  return path.join(snapshotDir(dataDir), datePart, snapshotFileName(capturedAt));
}

function signalToRecord(signal, capturedAt) {
  const topic = signal.title || '';
  return {
    platform: signal.platform,
    platformLabel: signal.platformLabel || platformLabel(signal.platform),
    capturedAt,
    topic,
    normalizedTopic: signal.normalizedTitle || normalizeForCompare(topic),
    rank: signal.rank || null,
    heat: Number(signal.heat) || 0,
    heatText: signal.heatText || '',
    url: signal.url || '',
    sourceType: signal.sourceType || 'hot',
    board: signal.board || null,
    ...(signal.evidence?.length ? { evidence: signal.evidence } : {})
  };
}

function recordToSignal(record) {
  return makeSignal({
    platform: record.platform,
    sourceType: record.sourceType || 'hot',
    board: record.board || null,
    title: record.topic || record.title || '',
    rank: record.rank || null,
    heat: record.heat || 0,
    heatText: record.heatText || undefined,
    url: record.url || '',
    capturedAt: record.capturedAt,
    evidence: record.evidence
  });
}

function saveSnapshot(signals, meta = {}) {
  const dataDir = meta.dataDir || getDataDir();
  const capturedAt = meta.capturedAt || new Date().toISOString();
  const records = signals.map(signal => signalToRecord(signal, capturedAt));
  const counts = records.reduce((acc, record) => {
    acc[record.platform] = (acc[record.platform] || 0) + 1;
    return acc;
  }, {});
  const snapshot = {
    version: 1,
    capturedAt,
    createdAt: new Date().toISOString(),
    platforms: [...new Set(records.map(record => record.platform))],
    counts,
    errors: meta.errors || [],
    records
  };

  writeJsonAtomic(latestSnapshotFile(dataDir), snapshot);
  writeJsonAtomic(snapshotFilePath(capturedAt, dataDir), snapshot);
  return snapshot;
}

function snapshotAgeMinutes(snapshot, now = new Date()) {
  if (!snapshot?.capturedAt) return Infinity;
  return (now.getTime() - new Date(snapshot.capturedAt).getTime()) / 60000;
}

function loadLatestSnapshot(options = {}) {
  const dataDir = options.dataDir || getDataDir();
  const snapshot = readJson(latestSnapshotFile(dataDir), null);
  if (!snapshot) return null;
  if (options.maxAgeMinutes && snapshotAgeMinutes(snapshot) > options.maxAgeMinutes) {
    return null;
  }
  return snapshot;
}

function listSnapshotFiles(dataDir = getDataDir()) {
  const root = snapshotDir(dataDir);
  if (!fs.existsSync(root)) return [];
  const files = [];
  for (const dateDir of fs.readdirSync(root)) {
    const fullDateDir = path.join(root, dateDir);
    if (!fs.statSync(fullDateDir).isDirectory()) continue;
    for (const file of fs.readdirSync(fullDateDir)) {
      if (file.endsWith('.json')) files.push(path.join(fullDateDir, file));
    }
  }
  return files.sort();
}

function loadRecentSnapshots(options = {}) {
  const dataDir = options.dataDir || getDataDir();
  const minutes = options.minutes || 70;
  const cutoff = Date.now() - minutes * 60000;
  return listSnapshotFiles(dataDir)
    .map(file => readJson(file, null))
    .filter(Boolean)
    .filter(snapshot => new Date(snapshot.capturedAt).getTime() >= cutoff)
    .sort((a, b) => new Date(a.capturedAt) - new Date(b.capturedAt));
}

function snapshotToSignals(snapshot) {
  return (snapshot?.records || []).map(recordToSignal).filter(signal => signal.title);
}

module.exports = {
  ensureDir,
  getDataDir,
  latestSnapshotFile,
  loadLatestSnapshot,
  loadRecentSnapshots,
  mergeConfig,
  readJson,
  saveSnapshot,
  snapshotAgeMinutes,
  snapshotToSignals,
  writeJsonAtomic
};
