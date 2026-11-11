# Instructions for AI agents

You are helping a person run Sibyl, a trend monitor. The person may not be technical: explain in plain words, ask before choices that are theirs, and do the technical work yourself. The person-facing guide is [docs/guide.md](docs/guide.md); the setup request people send you is [SETUP-PROMPT.md](SETUP-PROMPT.md).

## Rules

1. **Never type passwords, API keys or tokens into web pages.** When a page needs a login (TikTok for Business, a Google account), open it and ask the person to log in themselves.
2. **Confirm topics before anything runs on a schedule.** Show the topics, keywords, exclude words and the category chosen on each platform, and wait for the person's OK.
3. **Show briefings and alerts only when asked.** If no push target is set, briefings are saved as files; do not paste them into the conversation unless the person asks.
4. **Keep secrets out of shared files.** Put webhook addresses, bot tokens and API keys in the scheduled tasks' environment. Use the config file only if the person prefers, and never print a secret in full.
5. **Ask before anything that costs money** (X trends, a paid model) and say what it costs.
6. **Check a website's terms before adding its feed.** Some feeds are for personal use only; tell the person and let them decide.
7. **Read each page once a day** (more often only if the person asks). Do not bypass logins, rate limits or bot checks, and do not read pages other than those listed here.
8. Keep the credit to Misaka Studio in the README and the guide.

## Where things are

| Path | What |
| --- | --- |
| `sibyl/scripts/` | The scripts (Node.js 18 or later, no packages to install) |
| `sibyl/data/` | The data folder: `config.json`, `pages.json`, snapshots, `report-latest.md`, `briefings/`, `alerts/` |
| `sibyl/scripts/config.example.json` | The example config (the default TikTok preset) |
| `sibyl/scripts/lib/pages-file.js` | The format of `pages.json`, in its header comment |
| `sibyl/presets/example-beauty.json` | The example topic used when the config names none |

Set `SIBYL_DATA_DIR` to use another data folder.

## Commands

Run them from the `sibyl` folder.

| Command | What it does |
| --- | --- |
| `node scripts/check-deploy.js` | Self-check: settings, sources, saved pages, push targets, time zone. Sends nothing. |
| `node scripts/collect-snapshot.js` | Reads the sources and saves a snapshot. |
| `node scripts/instant-alerts.js --push` | Checks for alerts; pushes them, or saves them to `alerts/` when no push target is set. |
| `node scripts/instant-alerts.js --no-push` | The same check without sending or saving (a dry run). |
| `node scripts/sibyl.js --push` | Writes the hourly briefing; pushes it, or saves it to `briefings/`. |
| `node scripts/sibyl.js --print --no-push` | Writes a test briefing and prints it; sends and saves nothing else. |
| `node scripts/show-briefing.js` | Prints the latest saved briefing. `--list` lists them; `--file=2026-11-11_1000` prints one; `--alerts` prints today's alerts; `--alerts --date=2026-11-10` prints another day's. |

`--no-ai` skips the AI model; `--no-summary` skips summaries.

## Setup

1. **Get the files.** Clone `https://github.com/upiznhec/Sibyl-System-Hotspot-Monitor.git` into a folder the person chooses. On macOS, avoid Desktop, Documents and Downloads: scheduled tasks (cron) cannot read those folders without extra permission. Check `node --version` (18 or later); help install Node.js if needed.
2. **Create the config.** `mkdir -p sibyl/data` and copy `sibyl/scripts/config.example.json` to `sibyl/data/config.json`.
3. **Map the topics** (next section). Wait for the person's OK, then write `topics` and `dailyPages`.
4. **Country, time zone and sources.** Set `country` (two-letter code, such as `US`) and `timeZone` (an IANA name, such as `America/New_York`). Under `platforms`, switch on the sources the person wants. Google Trends and TikTok are on by default; YouTube channels and websites need `channels` or `feeds`; YouTube search and X need a key (rule 5).
5. **Push target** (see "Push targets" below), or none: then briefings are saved as files.
6. **Logins.** If the person wants more than TikTok's top 3 hashtags, open TikTok Creative Center and let them log in to TikTok for Business. Do the same for Google if the new Explore page asks for a sign-in.
7. **First run.** Read the daily pages (below), then run `check-deploy.js`, `collect-snapshot.js`, `instant-alerts.js --no-push` and `sibyl.js --print --no-push`. Show the person the check and the briefing.
8. **Schedule** (below), then run `check-deploy.js --task-command="<the task commands>"` to confirm.
9. **Tell the person how to read briefings.** If no push target is set, say that briefings are kept for 7 days and shown only when asked, and give examples: "Show me the latest trend briefing", "Any trend alerts today?", "What were the top trends yesterday afternoon?"

## Mapping topics

1. Ask what the person wants to track, in their own words.
2. Draft the topics for `config.topics`:

   ```json
   [
     {
       "name": "Beauty",
       "icon": "🧴",
       "keywords": [
         "skincare", "makeup", "sunscreen",
         { "word": "SPF", "requireAny": ["sunscreen", "skin", "UV"] },
         { "word": "Brand A", "exclude": ["Brand A Motors"] }
       ],
       "briefingExclude": ["promo code", "coupon"]
     }
   ]
   ```

   - `keywords`: 5 to 20 words or phrases. Use `requireAny` for a word that is ambiguous alone (the item must also contain one of the listed words) and `exclude` for known confusions. Matching is by whole words, ignoring case.
   - `briefingExclude`: words that keep routine items of this topic out of the main briefing.
   - The order of topics decides which topic wins when an item matches two equally.
3. Choose what to read on each platform. Open the menus and pick the closest options; do not guess from memory, since the lists change.
   - TikTok Creative Center: one industry per topic (such as "Beauty & Personal Care").
   - Google Trends Trending Now: one category per topic (such as "Beauty and Fashion", category 2; "Sports" is 17). Note how many trends the category has: narrow categories can have only a few.
   - Google Trends Explore: 3 to 5 of the topic's keywords whose rising searches are worth reading.
   - YouTube channels or websites only if the person names them.
4. Show the person a table (platform, setting, note) with the keywords and exclude words, and wait for their OK.
5. Write `topics`, and write the reading list as `dailyPages` in the config:

   ```json
   "dailyPages": [
     { "source": "tiktok-creative-center", "region": "US", "industry": "Beauty & Personal Care", "topic": "Beauty" },
     { "source": "google-trends", "view": "trending", "region": "US", "category": "Beauty and Fashion", "categoryId": 2, "topic": "Beauty" },
     { "source": "google-trends", "view": "explore", "region": "US", "keyword": "sunscreen", "topic": "Beauty" }
   ]
   ```

   The scripts do not read `dailyPages`; it is the list you read each day, and the self-check reports any page on it that is missing or older than 30 hours.

## Reading the daily pages

Once a day (before the person's first hour, or when asked: "Read today's trend pages for Sibyl"), read every page in `dailyPages` in a browser and write `sibyl/data/pages.json`. The format is in the header of `sibyl/scripts/lib/pages-file.js`. Each section copies the page's `source`, `view`, `region`, `industry` / `category` / `keyword` and `topic` from `dailyPages`, adds `readAt` (the time you read it, with time zone) and `url`, and lists the items.

**TikTok Creative Center hashtags**

- Open `https://ads.tiktok.com/creative/creativeCenter/trends/hashtag?region=US&period=7` (change `region`), and choose the industry in the page's industry filter.
- For each row save `rank`, `title` (the hashtag), `posts` and `views` as shown (for example "43.7K" and "325.3M").
- Without a login the page shows the top 3 and then "View more", which needs a login.

**Google Trends, Trending Now by category**

- Open `https://trends.google.com/trending?geo=US&category=2&hours=24` (change `geo` and `category`).
- The unfiltered list appears first and can stay for more than 5 seconds. Wait until the row count under the table ("1–6 of 6") matches the chosen category before reading.
- For each row save `rank`, `title`, `searchVolume` (such as "2K+") and `rise` (such as "200%").

**Google Trends Explore, rising searches**

- Open `https://trends.google.com/trends/explore?date=now%207-d&geo=US&q=sunscreen` (change `geo` and `q`).
- Under "Related queries" and "Related topics", with "Rising" selected, save each row's `rank`, `title`, `rise` (such as "+350%" or "Breakout") and `kind` (`query` or `topic`). Topics show as "Reef Safe - Topic"; save the name only.
- Google is replacing this classic page. If it is gone and the new Explore asks for a sign-in, ask the person to sign in.

**If a page fails** (a login expired, the page changed, nothing loads after a minute): keep that page's section from the last `pages.json` as it was, with its old `readAt`, and tell the person which page failed and why. The scripts use the last saved items and report their age.

## Scheduling

v1.3.20's schedule is kept: collection and alerts every 10 minutes and a briefing every hour, during the person's hours (10:00 to 22:00 by default). Scheduled tasks run on the computer's time zone; if `timeZone` differs, convert the hours.

**macOS and Linux (cron).** Use the full path of `node` (`command -v node`), because cron's PATH is minimal, and put the push secrets at the top of the crontab:

```text
SIBYL_REPORT_WEBHOOK=<briefing webhook>
SIBYL_ALERT_WEBHOOK=<alert webhook>
*/10 10-22 * * * cd /path/to/Sibyl-System-Hotspot-Monitor/sibyl && /path/to/node scripts/collect-snapshot.js >> data/collect.log 2>&1 && /path/to/node scripts/instant-alerts.js --push >> data/alerts.log 2>&1
0 10-22 * * * cd /path/to/Sibyl-System-Hotspot-Monitor/sibyl && /path/to/node scripts/sibyl.js --push >> data/briefing.log 2>&1
```

**Windows (Task Scheduler).** Create two tasks with the same timing (repeat every 10 minutes and every hour, for the person's hours). Action: start `node` with arguments `scripts\collect-snapshot.js` (then a second action `scripts\instant-alerts.js --push`), or `scripts\sibyl.js --push`, starting in the `sibyl` folder. Set the push secrets as user environment variables.

**Your own scheduler.** If you can run tasks on a schedule, you may run the same commands that way, and also schedule the daily page reading. If you cannot, ask the person to start each day with "Read today's trend pages for Sibyl".

Your scheduler should only run the commands. Do not post their output anywhere: with `--push` the scripts send briefings themselves, and a second post would duplicate them.

## Push targets

| Target | What to set |
| --- | --- |
| Slack | An incoming webhook; set `SIBYL_REPORT_WEBHOOK` (and `SIBYL_ALERT_WEBHOOK` for alerts elsewhere). |
| Discord | A channel webhook (channel settings, Integrations, Webhooks); the same variables. |
| WeCom | A group robot webhook; the same variables. |
| Telegram | `SIBYL_TELEGRAM_BOT_TOKEN` and `SIBYL_TELEGRAM_CHAT_ID` (optional `SIBYL_TELEGRAM_ALERT_CHAT_ID`). |
| None | Nothing: briefings and alerts are saved to `briefings/` and `alerts/` and deleted after 7 days (`archive.keepDays`). |

For Telegram: the person messages @BotFather in Telegram, sends `/newbot`, and gives you the bot token. They then send any message to their new bot; you read the chat ID from `https://api.telegram.org/bot<token>/getUpdates` (`result[].message.chat.id`). Never show the token in full.

Slack, Discord and Telegram are recognised by their address. For any other address, such as a relay, set `report.channel` or `alerts.channel` to `wecom`, `slack`, `discord` or `telegram`. After any change, run `check-deploy.js`, then send one test with `node scripts/sibyl.js --push`.

## Common requests

| The person asks | What to change |
| --- | --- |
| Add or change a topic | Map it as above, confirm, then update `topics` and `dailyPages`. |
| An unrelated item appeared | Add an `exclude` word to the keyword that matched, or narrow the keyword with `requireAny`. Show the change. |
| Keep routine items out | Add words to the topic's `briefingExclude`. |
| Where briefings go | The push variables in the scheduled tasks (or `report` / `alerts` in the config); then check and test. |
| Briefing times | The hourly task's schedule only. |
| Collection frequency | The 10-minute task's schedule only. |
| Fewer or more alerts | `alerts.platforms["google-trends"].rankMax` and `hotMin` (smaller `rankMax` or larger `hotMin` means fewer alerts). Say which numbers you changed. |
| Follow a channel or website | `platforms["youtube-channels"].channels` (IDs start with `UC`) or `platforms.rss.feeds` (rule 6). |
| Turn on YouTube search or X | Rule 5; then `SIBYL_YOUTUBE_API_KEY` or `SIBYL_X_BEARER_TOKEN`, and `enabled: true`. |
| Number of events in the briefing | `report.topN` (default 10); the minimum score is `report.minScore`. |
| Another country or time zone | `country`, `timeZone`, the `region` in `dailyPages`, and the scheduled hours. |
| An AI model for summaries | `SIBYL_AI_API_KEY` and `SIBYL_AI_MODEL` (and `SIBYL_AI_BASE_URL` for an API other than OpenAI). Without both, the first news headline is used. |

## Other settings

| Setting | Default | Meaning |
| --- | --- | --- |
| `language` | `en` | Wording of briefings and alerts (English only for now) |
| `report.seedPlatforms` | Google Trends, TikTok | Main sources: an event must appear on one to enter the briefing |
| `alerts.platforms` | Google Trends top 3 or 20K+ searches; X top 5 or 50K posts | Alert limits |
| `pagesMaxAgeHours` | 168 | Saved pages older than this are not used |
| `http.userAgent` | a generic name | Add a contact (website or email) when Wikipedia is on; Wikimedia asks for it |
| `eventSummary.newsEvidence` | `true` | Use the news links saved with items as summary material |

The alert limits, source weights and score levels are first settings, to be adjusted after testing.
