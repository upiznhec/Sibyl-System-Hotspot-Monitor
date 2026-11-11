# Rewrite check

Confirms that the refactored code gives exactly the same output as v1.3.20 on the same input.
This folder, the Chinese adapters and `sibyl/presets/zh-v1.3.20.json` are for development only
and will be removed before release.

## What it compares

- `run.js` runs `sibyl.js --no-ai --no-summary --no-push` over the saved snapshots, one step per
  snapshot, with the clock fixed to 5 minutes after each capture (`fake-clock.js`). Each step
  reuses the previous step's `state.json`, so trend and repeat-appearance logic is exercised.
- `run-alerts.js` does the same for `instant-alerts.js --no-summary --no-push`.
- `compare.js` compares the output files of two runs byte for byte. A file that neither run
  writes (for example `alerts-state.json`, which is only written when pushing) is not counted
  as a difference.
- `push-check.js` covers the push path that the two runs above leave off. It runs
  `instant-alerts.js` and `sibyl.js` with push on against a local HTTP server and checks that
  the WeCom messages equal the v1.3.20 output, that a repeated run sends nothing, that failed
  sends leave no dedupe record, and that Slack and Discord get their own payloads. Case F
  checks that, without any push target, alerts and the briefing are saved as files, once each.
- `check-constants.js` compares registry lists for the four v1.3.20 sources only; sources added
  later have no v1.3.20 values.
- `check-constants.js` compares the values moved into the adapters and the preset with the
  constants hard-coded in v1.3.20.

## How to run

```bash
git archive 6727c73 | (mkdir -p /tmp/sibyl-v1.3.20 && tar -x -C /tmp/sibyl-v1.3.20)
node tools/rewrite-check/run.js --code /tmp/sibyl-v1.3.20 --out /tmp/out-original
node tools/rewrite-check/run.js --out /tmp/out-rewrite
node tools/rewrite-check/compare.js /tmp/out-original /tmp/out-rewrite
node tools/rewrite-check/run-alerts.js --code /tmp/sibyl-v1.3.20 --out /tmp/alerts-original
node tools/rewrite-check/run-alerts.js --out /tmp/alerts-rewrite
node tools/rewrite-check/compare.js /tmp/alerts-original /tmp/alerts-rewrite --files stdout.txt,alerts-state.json
node tools/rewrite-check/check-constants.js --baseline /tmp/sibyl-v1.3.20
node tools/rewrite-check/push-check.js --original-out /tmp/out-original --original-alerts /tmp/alerts-original
```

## Fixtures

`fixtures/snapshots/` holds three snapshots captured with `collect-snapshot.js` on
2026-11-11 between 02:25 and 02:30 UTC. Weibo (50 items) and Hupu (80 items) are live data.
Douyin returned HTTP 403 and Tieba failed TLS certificate verification from the capture machine,
so `build-fixtures.js` added synthetic Douyin (12) and Tieba (8) records, marked
`"synthetic": true`, built from the live titles and from titles in the repo's own tests.
`fixtures/config.json` is `sibyl/scripts/config.example.json` from v1.3.20.

## Results

Stage 1, adapters and topic settings (2026-11-11):

- `sibyl.js`: all 12 output files identical (3 steps × report, clusters, signals, state).
- `instant-alerts.js`: console output identical in all 3 steps.
- `check-constants.js`: 15 of 15 checks pass.
- The 9 test scripts in `sibyl/scripts/` give the same output on both versions.

Stage 3, webhook push, model settings and OpenClaw removal (2026-11-11):

- `sibyl.js`: all 12 output files identical.
- `instant-alerts.js`: console output identical in all 3 steps.
- `check-constants.js`: 15 of 15 checks pass.
- `push-check.js`: 5 of 5 checks pass.
- The 6 remaining original test scripts give the same output on both versions. The 3 tests
  for Weibo intelligent search and the Agent Reach retriever were removed with those features.
  `test-webhook.js` and `test-model-config.js` were added and pass.
- The new WeCom message splitter gives the same parts as the v1.3.20 splitter on the 3 saved
  briefings and on 2,000 longer briefings built from their items (one-off check, not kept).
