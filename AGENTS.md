# Instructions for AI agents

You are helping a person run Sibyl, a trend monitor. The person may not be technical: explain in plain words, ask before choices that are theirs, and do the technical work yourself. The person-facing guide is [docs/guide.md](docs/guide.md); the setup request people send you is [SETUP-PROMPT.md](SETUP-PROMPT.md).

## Rules

1. **Never type passwords, API keys or tokens into web pages.** When a page needs a login (TikTok for Business, a Google account), open it and ask the person to log in themselves.
2. **Confirm topics before anything runs on a schedule.** Show the sources switched on, the topics, keywords, exclude words and the category chosen on each platform, and wait for the person's OK.
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
4. **Country, time zone and sources.** Set `country` (two-letter code, such as `US`) and `timeZone` (an IANA name, such as `America/New_York`). Under `platforms`, switch the sources on or off as the person chose under "Sources to watch" in the setup request; where a choice is blank or still in brackets, keep the default. Google Trends, TikTok and Wikipedia are on by default; YouTube channels, websites, YouTube search and X are off. What each source needs, and how to ask for it, is under "Sources" below.
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

## Sources

The person may never have used a feed or an API key. For each source they chose, say in plain words what it adds and what you need from them, ask for one thing at a time, and do the technical work yourself. The guide explains the same to them, under "What each source needs from you".

| Source | Default | What you need from the person |
| --- | --- | --- |
| Google Trends | On | Nothing |
| TikTok Creative Center | On | Nothing; a TikTok for Business login for more than the top 3 (Setup, step 6) |
| Wikipedia | On | A contact for Wikimedia: a web address or an email |
| YouTube channels | Off | The channels' links |
| Websites and blogs | Off | The websites' addresses |
| YouTube search | Off | A free YouTube Data API key, which they create |
| X trends | Off | Their OK on the cost (rule 5), then a Bearer Token from a paid X developer account |

**Main sources.** An event must appear on a source in `report.seedPlatforms` to enter the briefing. Keep the list to the main sources that are on: Google Trends, TikTok, and X when the person turns it on. If they say no to all three, explain that the briefing would stay empty, and ask them to keep at least one.

**Wikipedia.** Explain that Wikimedia, which runs Wikipedia, asks automated tools to say who runs them, so that it can reach them about a problem. Ask for a web address (their website or a social media profile) or an email address, and set `http.userAgent` to `SibylHotspotMonitor (<contact>)`. If they would rather not give one, switch Wikipedia off.

**YouTube channels.** Ask for each channel's link, such as `https://www.youtube.com/@name` (in the YouTube app: the channel's three-dot menu, Share, Copy link). Open the channel page and find its ID, which starts with `UC`: it is in the page's RSS link (`channel_id=`) and in the page source (`"externalId"`). Add `{ "id": "UC…", "name": "<channel name>" }` to `platforms["youtube-channels"].channels`, set `enabled: true`, and check that `https://www.youtube.com/feeds/videos.xml?channel_id=<id>` lists videos.

**Websites and blogs.** Ask for each website's address. Find its RSS or Atom feed: a `<link rel="alternate">` of type `application/rss+xml` or `application/atom+xml` in the home page, or a common path such as `/feed`, `/rss` or `/atom.xml`. Open the feed to check that it lists recent posts, and check the site's terms for it (rule 6). Add `{ "url": "<feed address>", "name": "<site name>" }` to `platforms.rss.feeds` and set `enabled: true`. If a site has no feed, tell the person; do not read its pages instead.

**YouTube search.** It is free within Google's daily quota of 10,000 units. Each query is one search (100 units) at most once an hour (`minIntervalMinutes: 60`), and Sibyl runs at most 3 queries, so even 24 hours a day stays within the quota. Open each page and tell the person what to click; they sign in and click themselves:

1. `https://console.cloud.google.com/`: they sign in with their Google account. No payment details are needed.
2. Create a project, for example "Sibyl".
3. APIs & Services, then Library: find "YouTube Data API v3" and click Enable.
4. APIs & Services, then Credentials: Create credentials, then API key. Restrict the key to YouTube Data API v3.
5. They copy the key and give it to you.

Set `SIBYL_YOUTUBE_API_KEY` in the scheduled tasks' environment (rule 4) and `enabled: true`. Leave `queries` empty to search the topic's first 6 keywords at once, or set up to 3 queries (words joined with `|` match any of them).

**X trends.** First say what it costs and wait for the person's OK (rule 5): about US$0.01 per request, paid in advance as credit. Sibyl asks at most every 30 minutes (`minIntervalMinutes: 30`), about 2 requests an hour; for 10:00 to 22:00 that is about US$0.26 a day, or US$8 a month. Work out the figure for their hours. Then:

1. Open `https://developer.x.com`. They sign in with their X account and buy credit themselves; never enter payment details.
2. They create an app, copy its Bearer Token and give it to you.
3. Set `SIBYL_X_BEARER_TOKEN` in the scheduled tasks' environment (rule 4), set `enabled: true`, and add `x-trends` to `report.seedPlatforms`.

The US, the UK, Japan and worldwide are built in; for another country, set `platforms["x-trends"].woeid` from X's documentation. Items in the person's topics that reach X's top 5 or 50K posts also alert (`alerts.platforms["x-trends"]`).

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
| Follow a channel or website | As under "Sources": `platforms["youtube-channels"].channels` or `platforms.rss.feeds` (rule 6). |
| Turn a source on or off | As under "Sources"; keep `report.seedPlatforms` to the main sources that are on. |
| Number of events in the briefing | `report.topN` (default 10); the minimum score is `report.minScore`. |
| Another country or time zone | `country`, `timeZone`, the `region` in `dailyPages`, and the scheduled hours. |
| An AI model for summaries | `SIBYL_AI_API_KEY` and `SIBYL_AI_MODEL` (and `SIBYL_AI_BASE_URL` for an API other than OpenAI). Without both, the first news headline is used. |

## Other settings

| Setting | Default | Meaning |
| --- | --- | --- |
| `language` | `en` | Wording of briefings and alerts (English only for now) |
| `report.seedPlatforms` | Google Trends, TikTok | Main sources: an event must appear on one to enter the briefing. Add `x-trends` when X is on. |
| `alerts.platforms` | Google Trends top 3 or 20K+ searches; X top 5 or 50K posts | Alert limits |
| `pagesMaxAgeHours` | 168 | Saved pages older than this are not used |
| `http.userAgent` | a generic name | With Wikipedia on: `SibylHotspotMonitor (<contact>)`, as under "Sources" |
| `eventSummary.newsEvidence` | `true` | Use the news links saved with items as summary material |

The alert limits, source weights and score levels are first settings, to be adjusted after testing.
