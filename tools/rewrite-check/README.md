# Rewrite check

Confirms that the refactored code gives exactly the same output as v1.3.20 on the same input.
This folder, the Chinese adapters and `sibyl/presets/zh-v1.3.20.json` are for development only
and will be removed before release.

## What it compares

- `run.js` runs `sibyl.js --no-ai --no-summary --no-push` over the saved snapshots, one step per
  snapshot, with the clock fixed to 5 minutes after each capture (`fake-clock.js`). Each step
  reuses the previous step's `state.json`, so trend and repeat-appearance logic is exercised.
- `run-alerts.js` does the same for `instant-alerts.js --no-summary --no-push`.
- `compare.js` compares the output files of two runs byte for byte.
- `check-constants.js` compares the values moved into the adapters and the preset with the
  constants hard-coded in v1.3.20.

## How to run

```bash
git archive 6727c73 | (mkdir -p /tmp/sibyl-v1.3.20 && tar -x -C /tmp/sibyl-v1.3.20)
node tools/rewrite-check/run.js --code /tmp/sibyl-v1.3.20 --out /tmp/out-original
node tools/rewrite-check/run.js --out /tmp/out-rewrite
node tools/rewrite-check/compare.js /tmp/out-original /tmp/out-rewrite
node tools/rewrite-check/check-constants.js --baseline /tmp/sibyl-v1.3.20
```

## Fixtures

`fixtures/snapshots/` holds three snapshots captured with `collect-snapshot.js` on
2026-11-11 between 02:25 and 02:30 UTC. Weibo (50 items) and Hupu (80 items) are live data.
Douyin returned HTTP 403 and Tieba failed TLS certificate verification from the capture machine,
so `build-fixtures.js` added synthetic Douyin (12) and Tieba (8) records, marked
`"synthetic": true`, built from the live titles and from titles in the repo's own tests.
`fixtures/config.json` is `sibyl/scripts/config.example.json` from v1.3.20.

## Result (2026-11-11)

- `sibyl.js`: all 12 output files identical (3 steps × report, clusters, signals, state).
- `instant-alerts.js`: console output identical in all 3 steps.
- `check-constants.js`: 15 of 15 checks pass.
- The 9 test scripts in `sibyl/scripts/` give the same output on both versions.
