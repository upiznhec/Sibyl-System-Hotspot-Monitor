#!/usr/bin/env node
// Runs instant-alerts.js from one code tree over the saved snapshots, one step per snapshot,
// with summaries and push turned off and the clock fixed per step. Alert state carries over
// between steps, so the once-a-day dedupe is exercised.
//
// Usage: node tools/rewrite-check/run-alerts.js --code <repo root> --out <output dir> [--fixtures <dir>]
// Compare with: node tools/rewrite-check/compare.js <a> <b> --files stdout.txt,alerts-state.json

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const { writeCheckConfig } = require('./check-config');

function argValue(name, fallback) {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1];
}

const toolDir = __dirname;
const codeRoot = path.resolve(argValue('--code', path.resolve(toolDir, '..', '..')));
const outDir = path.resolve(argValue('--out', path.join(toolDir, 'out-alerts')));
const fixturesDir = path.resolve(argValue('--fixtures', path.join(toolDir, 'fixtures')));

const snapshots = fs.readdirSync(path.join(fixturesDir, 'snapshots'))
  .filter(file => file.endsWith('.json'))
  .map(file => path.join(fixturesDir, 'snapshots', file))
  .map(file => ({ file, snapshot: JSON.parse(fs.readFileSync(file, 'utf8')) }))
  .sort((a, b) => Date.parse(a.snapshot.capturedAt) - Date.parse(b.snapshot.capturedAt));

fs.rmSync(outDir, { recursive: true, force: true });
snapshots.forEach(({ file, snapshot }, index) => {
  const step = index + 1;
  const dataDir = path.join(outDir, `step-${step}`, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  writeCheckConfig(fixturesDir, path.join(dataDir, 'config.json'));
  fs.copyFileSync(file, path.join(dataDir, 'snapshot-latest.json'));
  const previousState = path.join(outDir, `step-${step - 1}`, 'data', 'alerts-state.json');
  if (step > 1 && fs.existsSync(previousState)) {
    fs.copyFileSync(previousState, path.join(dataDir, 'alerts-state.json'));
  }

  const fakeNow = new Date(Date.parse(snapshot.capturedAt) + 5 * 60000).toISOString();
  const result = spawnSync(process.execPath, [
    '-r', path.join(toolDir, 'fake-clock.js'),
    path.join(codeRoot, 'sibyl', 'scripts', 'instant-alerts.js'),
    '--no-summary', '--no-push'
  ], {
    cwd: path.join(codeRoot, 'sibyl'),
    env: { ...process.env, SIBYL_DATA_DIR: dataDir, FAKE_NOW: fakeNow, SIBYL_CONFIG: '' },
    encoding: 'utf8'
  });

  fs.writeFileSync(path.join(dataDir, 'stdout.txt'), `${result.stdout || ''}\n${result.stderr || ''}`);
  if (result.status !== 0) {
    throw new Error(`Step ${step} failed (exit ${result.status}). See ${path.join(dataDir, 'stdout.txt')}`);
  }
  console.log(`step ${step}: clock ${fakeNow}, state file ${fs.existsSync(path.join(dataDir, 'alerts-state.json')) ? 'written' : 'missing'}`);
});
