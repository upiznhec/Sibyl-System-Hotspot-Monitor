#!/usr/bin/env node
// Runs sibyl.js from one code tree over saved snapshots, one step per snapshot,
// with AI, summaries and push turned off and the clock fixed per step.
//
// Usage:
//   node tools/rewrite-check/run.js --code <repo root> --out <output dir> [--fixtures <dir>]
//
// Each step N gets a fresh data folder with snapshots 1..N, snapshot N as the latest,
// and state.json from step N-1. The clock is set to 5 minutes after snapshot N.

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

function argValue(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  return process.argv[index + 1];
}

const toolDir = __dirname;
const codeRoot = path.resolve(argValue('--code', path.resolve(toolDir, '..', '..')));
const outDir = path.resolve(argValue('--out', path.join(toolDir, 'out')));
const fixturesDir = path.resolve(argValue('--fixtures', path.join(toolDir, 'fixtures')));
const configFile = path.join(fixturesDir, 'config.json');
const outputs = ['report-latest.md', 'clusters-latest.json', 'signals-latest.json', 'state.json'];

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function snapshotFiles() {
  const dir = path.join(fixturesDir, 'snapshots');
  return fs.readdirSync(dir)
    .filter(file => file.endsWith('.json'))
    .map(file => path.join(dir, file))
    .map(file => ({ file, snapshot: readJson(file) }))
    .sort((a, b) => Date.parse(a.snapshot.capturedAt) - Date.parse(b.snapshot.capturedAt));
}

function copyFile(from, to) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
}

function storedSnapshotPath(dataDir, capturedAt) {
  const fileName = `${capturedAt.replace(/[:.]/g, '-')}.json`;
  return path.join(dataDir, 'snapshots', capturedAt.slice(0, 10), fileName);
}

function main() {
  const snapshots = snapshotFiles();
  if (snapshots.length === 0) {
    throw new Error(`No snapshots in ${path.join(fixturesDir, 'snapshots')}`);
  }

  fs.rmSync(outDir, { recursive: true, force: true });
  snapshots.forEach(({ file, snapshot }, index) => {
    const step = index + 1;
    const stepDir = path.join(outDir, `step-${step}`);
    const dataDir = path.join(stepDir, 'data');
    fs.mkdirSync(dataDir, { recursive: true });

    copyFile(configFile, path.join(dataDir, 'config.json'));
    snapshots.slice(0, step).forEach(item => {
      copyFile(item.file, storedSnapshotPath(dataDir, item.snapshot.capturedAt));
    });
    copyFile(file, path.join(dataDir, 'snapshot-latest.json'));
    if (step > 1) {
      copyFile(path.join(outDir, `step-${step - 1}`, 'data', 'state.json'), path.join(dataDir, 'state.json'));
    }

    const fakeNow = new Date(Date.parse(snapshot.capturedAt) + 5 * 60000).toISOString();
    const result = spawnSync(process.execPath, [
      '-r', path.join(toolDir, 'fake-clock.js'),
      path.join(codeRoot, 'sibyl', 'scripts', 'sibyl.js'),
      '--no-ai', '--no-summary', '--no-push'
    ], {
      cwd: path.join(codeRoot, 'sibyl'),
      env: { ...process.env, SIBYL_DATA_DIR: dataDir, FAKE_NOW: fakeNow, SIBYL_CONFIG: '' },
      encoding: 'utf8'
    });

    fs.writeFileSync(path.join(stepDir, 'log.txt'), `${result.stdout || ''}\n${result.stderr || ''}`);
    if (result.status !== 0) {
      throw new Error(`Step ${step} failed (exit ${result.status}). See ${path.join(stepDir, 'log.txt')}`);
    }

    const missing = outputs.filter(name => !fs.existsSync(path.join(dataDir, name)));
    console.log(`step ${step}: snapshot ${snapshot.capturedAt}, clock ${fakeNow}` +
      (missing.length ? `, missing ${missing.join(', ')}` : ''));
  });
}

main();
