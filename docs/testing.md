# Testing plan (Social Media AI Workflow Library)

Tests before the task page is written, from the adaptation plan. Results are added here as they come in.

## Stage 1: rewrite check (done)

Every change up to commit 62fa3a4 was compared with v1.3.20 on saved Weibo, Douyin, Tieba and Hupu snapshots, with a fixed clock: briefings (12 of 12 files), alerts (3 of 3) and moved constants (15 of 15) were identical, and push and file delivery passed 6 checks. The Chinese sources and the check tool were then removed.

## Stage 2: page reading and Instagram

**Page reading.** On the agent chosen for testing, read the pages in `dailyPages` twice a day for 3 days (TikTok Creative Center hashtags, Google Trends Trending Now by category, Google Trends Explore rising searches). Record each read:

| Date and time | Page | Read? | Items | Time taken | Notes |
| --- | --- | --- | --- | --- | --- |
| | | | | | |

First observations (2026-11-11, read in a browser by Claude Code before the formal test):

- Trending Now, US, Beauty and Fashion, past 24 hours: the unfiltered list (518 trends) showed first and stayed for more than 5 seconds; after a longer wait the filtered list showed 6 trends. The agent must wait until the row count matches the category.
- Explore, "sunscreen", US, past 7 days (classic page, no login): 2 rising queries and 2 rising topics. The page says classic Explore is expiring; the new Explore asks for a Google sign-in.
- TikTok Creative Center, US, 7 days, no login: the top 3 hashtags with posts and views, then a login prompt for more.
- YouTube channel feeds returned HTTP 404 for every channel around 00:00 PST, after working at 19:15 PST the evening before, and worked again by 00:20 PST.

**Instagram Business Discovery.** Does it work in a Meta app that has not been through App Review? Set `SIBYL_IG_ACCESS_TOKEN` and `SIBYL_IG_USER_ID` (see the script's header for what is needed), then run:

```bash
node sibyl/scripts/try-instagram-business-discovery.js <a business or creator account>
```

If it prints the account's followers and recent posts, Business Discovery can become an optional source; if Meta returns a permission error, it stays out of this version and the task page says how to get access.

## Stage 3: calibration (7 days)

Run the default schedule for 7 days (collection every 10 minutes, a briefing every hour) for two requests written as a user would: "NBA trends" and "beauty trends". Each day, review one morning and one afternoon briefing (28 in all) and every alert: is each item on topic, and worth following up that day? List up to 5 events expected each day and count how many the briefing caught. Record failed sources, whether pushes arrived, and the agent's and model's cost.

| Measure | Target (to confirm before calibration) |
| --- | --- |
| Platform categories proposed by the agent and accepted by the reviewer | At least 9 of about 10 |
| On-topic items in the top 10 of the briefing | At least 8 of 10 |
| "Strong" items worth following up that day | At least 7 of 10 |
| Alerts worth following up at the time | At least 7 of 10 |
| Summaries with content the sources do not support | 0 (each checked) |

Then adjust the source weights, the score levels and the alert limits, and the English grouping threshold (0.5).

## Stage 4: user test

Write the task page from the tested version, with a real briefing as the example output, and run a usability test with 3 to 5 people at level 3 or below.

## Test log

### 2026-11-15: Codex (desktop app), macOS

Setup request: beauty topic, US, America/Los_Angeles, 05:00 to 22:00, no push target, YouTube search and X trends on. The copy tested was the 2026-11-14 download (commit cd38da2).

| What happened | Cause | Fix |
| --- | --- | --- |
| Google Trends RSS, YouTube search and X failed with `getaddrinfo ENOTFOUND`. Only the 7 pages the agent read in its browser (47 items) reached the test briefing, and nothing was scheduled. | Codex runs commands in a sandbox with no network unless `sandbox_workspace_write.network_access` is set. | Self-check "Internet access" line; AGENTS.md rule 11 and the Codex steps; Get set up, step 4; task page, "If it goes wrong". |
| The agent wrote its own setup and schedule scripts (a launchd job in a copy in the home folder) and asked the person to run them. Its job skipped a whole run when one source failed. | No network, the folder on the Desktop, and only cron lines in AGENTS.md. | `scripts/schedule.js`; AGENTS.md rule 10 and "Known problems from testing"; task page, "If it goes wrong". |
| "sheltered inlets" (Explore, "sunscreen") and #tonguering, #stinkybreath (TikTok, Beauty & Personal Care) were in the top 10. | Items from lists read for a topic counted without a keyword match. | They go to the watch list unless a keyword or a second source confirms them (`report.requireTopicConfirmation`). |
| Wikipedia was off. | AGENTS.md then named only Google Trends and TikTok as on by default. | Fixed in AGENTS.md (commit a64f34e). |

Fixed from commit 696420e on. Not yet re-tested with Codex.
