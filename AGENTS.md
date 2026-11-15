# Instructions for AI agents

You are helping a person run Sibyl, a trend monitor. The person may not be technical: do the technical work yourself, and ask for what only they can give at the moment you need it (see "Talking to the person"). The person-facing guide is [docs/guide.md](docs/guide.md); the setup request people send you is [SETUP-PROMPT.md](SETUP-PROMPT.md).

## Rules

1. **Never type passwords, API keys or tokens into web pages.** When a page needs a login (TikTok for Business, a Google account), open it and ask the person to log in themselves.
2. **Confirm topics before anything runs on a schedule.** Show the sources switched on, the topics, keywords, exclude words and the category chosen on each platform, and wait for the person's OK.
3. **Show briefings and alerts only when asked.** If no push target is set, briefings are saved as files; do not paste them into the conversation unless the person asks.
4. **Keep secrets in `sibyl/data/.env`.** Webhook addresses, bot tokens and API keys go there, one `NAME=value` per line, and only the person's account may read it (`chmod 600`; git does not upload the data folder). Every script reads it when it starts, so neither `config.json` nor the schedule holds a secret. Never print a secret in full. If the person would rather not paste a key into the chat, they can add the line to the file themselves.
5. **Ask before anything that costs money** (X trends, a paid model) and say what it costs.
6. **Check a website's terms before adding its feed.** Some feeds are for personal use only; tell the person and let them decide.
7. **Read each page once a day** (more often only if the person asks). Do not bypass logins, rate limits or bot checks, and do not read pages other than those listed here.
8. Keep the credit to Misaka Studio in the README and the guide.
9. **Ask for what you need when you need it**, one thing at a time and in plain words, as described under "Talking to the person".
10. **Schedule only with `scripts/schedule.js`.** Do not write your own scheduler, wrapper scripts or jobs around the commands, and never stop a run because one source failed: the scripts record that source's error and read the others.
11. **If your commands cannot reach the internet, stop and ask.** `getaddrinfo ENOTFOUND`, `EAI_AGAIN` or `Operation not permitted` on every source, or a failed "Internet access" line in the self-check, mean your app keeps your commands offline. Ask the person to allow network access ("What to ask, and when"). Until `collect-snapshot.js` reads the live sources, schedule nothing, and do not hand them scripts to run instead.

## Talking to the person

The person has not read the guide and should not have to. Do not expect them to know any term, such as API key, feed, token, webhook or time zone name. Explain each thing only when you need it, in a sentence or two, at the moment you ask.

- **Use a dialog when you can.** If your app can put a question in front of the person (a question tool, a form or a pop-up, such as AskUserQuestion in Claude Code), use it for choices and yes-or-no questions. Ask for things they paste, such as a key or a link, in one short chat message.
- **One thing at a time.** Ask, wait for the answer, then go on. Do not guess, skip it or carry on without it.
- **Say what they need to decide:** what it is, why Sibyl needs it, whether it costs money, whether it needs an account, the link, what to send back, and what happens if they say no.
- **Keep it short.** No list of terms, and nothing they do not need yet.

### What to ask, and when

Adapt the wording; keep the facts.

**Something missing from the setup request** (topic, country, time zone, hours, where briefings go). Ask for that item only. For a time zone, accept a city and work out the name yourself.

**No internet in your commands** (rule 11).

> My commands cannot reach the internet: the app I run in keeps them offline unless you allow it. Sibyl needs the internet to read Google Trends and its other sources. Could you allow it? [The steps for their app.] Tell me when you have, and I will check again.

In Codex the steps are: paste this line into Terminal, then quit and reopen Codex. It adds the setting only if the file does not have that section yet; if it does, add `network_access = true` under the `[sandbox_workspace_write]` line by hand.

```text
grep -q '^\[sandbox_workspace_write\]' ~/.codex/config.toml 2>/dev/null || printf '\n[sandbox_workspace_write]\nnetwork_access = true\n' >> ~/.codex/config.toml
```

In other apps, look for network or internet access in their permission or sandbox settings, or ask the person to approve network access when the app asks.

**Telegram**, when it is chosen.

> Sibyl sends briefings to Telegram through its own bot, which is free. In Telegram, open @BotFather (it has a blue tick), send /newbot, choose a name and a username ending in "bot", and paste the token it gives you here. Then send your new bot any message, such as "hi", and tell me when you have.

**Slack, Discord or WeCom**, when it is chosen.

> To post briefings in your channel, Sibyl needs the channel's webhook address: a link that lets it post there. It is free. Here is how to make one: [the matching link below]. Paste the address here.

Slack: https://docs.slack.dev/messaging/sending-messages-using-incoming-webhooks/ · Discord (channel settings, Integrations, Webhooks): https://support.discord.com/hc/en-us/articles/228383668-Intro-to-Webhooks · WeCom (add a group robot in the group's settings): https://developer.work.weixin.qq.com/document/path/91770

**Wikipedia**, when it is on.

> Wikimedia, which runs Wikipedia, asks programs that read its statistics for a way to contact the person running them. Can you give me a web address, such as your website or a social media profile, or an email? Only Wikimedia sees it. If you would rather not, I will switch Wikipedia off; the other sources still work.

**YouTube channels**, when the person asks to follow one, or when a link does not work.

> Which YouTube channels should Sibyl follow? Open each one on YouTube and copy the address from the address bar (it looks like https://www.youtube.com/@name); in the app, tap the three dots, then Share, then Copy link. Paste the links here.

**Websites**, when the person asks to follow one, when a site has no feed, or when its feed is for personal use only.

> Which websites should Sibyl follow? Paste their addresses.

> [Site] has no feed, the list of new posts that Sibyl reads, so Sibyl cannot follow it.

> [Site] says its feed is for personal use only. Do you still want it?

**YouTube search**, when it is chosen.

> YouTube search needs a key from Google: a long code that lets Sibyl search YouTube for you. It is free, because Sibyl stays within Google's 100 free searches a day, and it takes about 10 minutes with your Google account. I will open each page and tell you what to click. Shall we start?

Then take them through the steps under "Sources", one at a time, and end with: "Copy the key and paste it here. Keep it private."

**X trends**, when it is chosen. Work out the cost for their hours first (rule 5).

> X trends costs money: US$0.01 each time Sibyl checks, at most every 30 minutes, so about US$[amount] a day for your hours. You need your X account, and you buy credit yourself at the X Developer Console (https://console.x.com). Do you want to go ahead?

If yes: they sign in, buy credit, create an app, and paste its Bearer Token here.

**AI explanations** ("Use AI to explain each trend" in the request), when they said yes.

> Each trend in a briefing has one line saying what it is about. Sibyl normally copies a news headline for it; to have an AI write it instead, Sibyl needs an API key, a code that lets it use the AI. Some AI subscriptions include one; if yours does not, you buy credit on the AI company's website, for example OpenAI (https://platform.openai.com/api-keys). Each line costs a little. Paste the key, and tell me which company it is from.

If the key comes with a subscription, such as a coding plan, check that the plan allows use outside its own apps; some do not. If they are not sure, leave it off.

**TikTok login**, when they want TikTok trends.

> If you want to track trends on TikTok, log in with a free TikTok for Business account (create one at https://ads.tiktok.com/i18n/signup). Without a login, TikTok Creative Center shows only the top 3 hashtags. I have opened the page: click Log in, sign in yourself, and tell me when you are done.

**Google sign-in**, when the new Explore page asks for it.

> Google's new Explore page asks you to sign in. I have opened it: sign in with your Google account yourself, and tell me when you are done.

**Daily pages**, if you cannot run tasks on a schedule. Tell them once, at the end of setup.

> I cannot open web pages on a schedule by myself. To keep the TikTok and Google Trends lists fresh, start each day by sending me: "Read today's trend pages for Sibyl."

## Where things are

| Path | What |
| --- | --- |
| `sibyl/scripts/` | The scripts (Node.js 18 or later, no packages to install) |
| `sibyl/data/` | The data folder: `config.json`, `pages.json`, snapshots, `report-latest.md`, `briefings/`, `alerts/` |
| `sibyl/data/.env` | Keys and webhook addresses (rule 4); only the person's account may read it |
| `sibyl/scripts/config.example.json` | The example config (the default TikTok preset) |
| `sibyl/scripts/lib/pages-file.js` | The format of `pages.json`, in its header comment |
| `sibyl/presets/example-beauty.json` | The example topic used when the config names none |

Set `SIBYL_DATA_DIR` to use another data folder.

## Commands

Run them from the `sibyl` folder.

| Command | What it does |
| --- | --- |
| `node scripts/check-deploy.js` | Self-check: internet access, settings, sources, saved pages, push targets, time zone, schedule. Makes one test request to Google; sends nothing. |
| `node scripts/schedule.js --install --hours=10-22` | Installs the schedule (see "Scheduling"); `--status` shows it, `--remove` takes it out. |
| `node scripts/collect-snapshot.js` | Reads the sources and saves a snapshot. |
| `node scripts/instant-alerts.js --push` | Checks for alerts; pushes them, or saves them to `alerts/` when no push target is set. |
| `node scripts/instant-alerts.js --no-push` | The same check without sending or saving (a dry run). |
| `node scripts/sibyl.js --push` | Writes the hourly briefing; pushes it, or saves it to `briefings/`. |
| `node scripts/sibyl.js --print --no-push` | Writes a test briefing and prints it; sends and saves nothing else. |
| `node scripts/show-briefing.js` | Prints the latest saved briefing. `--list` lists them; `--file=2026-11-11_1000` prints one; `--alerts` prints today's alerts; `--alerts --date=2026-11-10` prints another day's. |

`--no-ai` skips the AI model; `--no-summary` skips summaries.

## Setup

1. **Get the files.** Clone `https://github.com/upiznhec/Sibyl-System-Hotspot-Monitor.git` into a folder the person chooses. On macOS, put it in the home folder (for example `~/Sibyl-System-Hotspot-Monitor`), not in Desktop, Documents or Downloads: scheduled tasks cannot read those folders, and `schedule.js` refuses them. Check `node --version` (18 or later); help install Node.js if needed.
2. **Create the config.** `mkdir -p sibyl/data` and copy `sibyl/scripts/config.example.json` to `sibyl/data/config.json`. Keys and webhook addresses go in `sibyl/data/.env` (rule 4).
3. **Map the topics** (next section). Wait for the person's OK, then write `topics` and `dailyPages`.
4. **Country, time zone and sources.** Set `country` (two-letter code, such as `US`) and `timeZone` (an IANA name, such as `America/New_York`). Under `platforms`, switch the sources on or off as the person chose under "Sources to watch" in the setup request; where a choice is blank or still in brackets, keep the default. Google Trends, TikTok and Wikipedia are on by default; YouTube channels, websites, YouTube search and X are off. What each source needs is under "Sources" below, and how to ask for it under "What to ask, and when".
5. **Push target** (see "Push targets" below), or none: then briefings are saved as files.
6. **Logins.** If the person wants to track trends on TikTok (without a login, only the top 3 hashtags show), open TikTok Creative Center (`https://ads.tiktok.com/creative/creativeCenter/trends`) and let them log in to TikTok for Business; the account is free (sign-up: `https://ads.tiktok.com/i18n/signup`). Do the same for Google if the new Explore page asks for a sign-in.
7. **First run.** Run `check-deploy.js` first; if "Internet access" fails, follow rule 11 before anything else. Then read the daily pages (below), run `collect-snapshot.js`, `instant-alerts.js --no-push` and `sibyl.js --print --no-push`, and show the person the check and the briefing.
8. **Schedule** with `node scripts/schedule.js --install --hours=<start>-<end>` (see "Scheduling"), then run `check-deploy.js`: "Scheduled tasks" should be OK.
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

   These lists are wider than the topic, and their items count for it without a keyword. Such an item leads the briefing only when a keyword matches or a second source shows it; otherwise it goes to the watch list (`report.requireTopicConfirmation`). Pick keywords with that in mind.
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

For each source the person chose, do the technical work yourself, and ask only for what they must give, at the moment you need it (see "What to ask, and when").

| Source | Default | What you need from the person |
| --- | --- | --- |
| Google Trends | On | Nothing |
| TikTok Creative Center | On | Nothing; a TikTok for Business login for more than the top 3 (Setup, step 6) |
| Wikipedia | On | A contact for Wikimedia: a web address or an email |
| YouTube channels | Off | The channels' links |
| Websites and blogs | Off | The websites' addresses |
| YouTube search | Off | A free YouTube Data API key, which they create |
| X trends | Off | Their OK on the cost (rule 5), then a Bearer Token from a paid X developer account |

YouTube channels and websites are not in the setup request: following particular accounts is closer to watching competitors than to finding trends. Set them up only when the person asks.

**Main sources.** An event must appear on a source in `report.seedPlatforms` to enter the briefing. Keep the list to the main sources that are on: Google Trends, TikTok, and X when the person turns it on. If they say no to all three, explain that the briefing would stay empty, and ask them to keep at least one.

**Wikipedia.** Ask for a contact (see "What to ask, and when") and set `http.userAgent` to `SibylHotspotMonitor (<contact>)`. If they would rather not give one, switch Wikipedia off.

**YouTube channels.** Only when the person asks; ask for the links if they did not give them. Open each channel page and find its ID, which starts with `UC`: it is in the page's RSS link (`channel_id=`) and in the page source (`"externalId"`). Add `{ "id": "UC…", "name": "<channel name>" }` to `platforms["youtube-channels"].channels`, set `enabled: true`, and check that `https://www.youtube.com/feeds/videos.xml?channel_id=<id>` lists videos.

**Websites and blogs.** Only when the person asks; ask for the addresses if they did not give them. Find each site's RSS or Atom feed: a `<link rel="alternate">` of type `application/rss+xml` or `application/atom+xml` in the home page, or a common path such as `/feed`, `/rss` or `/atom.xml`. Open the feed to check that it lists recent posts, and check the site's terms for it (rule 6). Add `{ "url": "<feed address>", "name": "<site name>" }` to `platforms.rss.feeds` and set `enabled: true`. If a site has no feed, tell the person; do not read its pages instead.

**YouTube search.** It is free within Google's default allowance of 100 searches a day (`search.list` calls). Each query is one search at most once an hour (`minIntervalMinutes: 60`), and Sibyl runs at most 3 queries, so even 24 hours a day (72 searches) stays within it. Open each page and tell the person what to click; they sign in and click themselves:

1. `https://console.cloud.google.com/`: they sign in with their Google account. No payment details are needed.
2. Create a project, for example "Sibyl".
3. `https://console.cloud.google.com/apis/library/youtube.googleapis.com`: click Enable.
4. `https://console.cloud.google.com/apis/credentials`: Create credentials, then API key. Restrict the key to YouTube Data API v3.
5. They copy the key and give it to you.

Add `SIBYL_YOUTUBE_API_KEY=<key>` to `sibyl/data/.env` (rule 4) and set `enabled: true`. Leave `queries` empty to search the topic's first 6 keywords at once, or set up to 3 queries (words joined with `|` match any of them).

**X trends.** First say what it costs and wait for the person's OK (rule 5): about US$0.01 per request, paid in advance as credit. Sibyl asks at most every 30 minutes (`minIntervalMinutes: 30`), about 2 requests an hour; for 10:00 to 22:00 that is about US$0.26 a day, or US$8 a month. Work out the figure for their hours. Then:

1. Open the X Developer Console, `https://console.x.com` (prices: `https://docs.x.com/x-api/getting-started/pricing`). They sign in with their X account and buy credit themselves; never enter payment details.
2. They create an app, copy its Bearer Token and give it to you.
3. Add `SIBYL_X_BEARER_TOKEN=<token>` to `sibyl/data/.env` (rule 4), set `enabled: true`, and add `x-trends` to `report.seedPlatforms`.

The US, the UK, Japan and worldwide are built in; for another country, set `platforms["x-trends"].woeid` from X's documentation. Items in the person's topics that reach X's top 5 or 50K posts also alert (`alerts.platforms["x-trends"]`).

## AI explanations (summaries)

The setup request calls this "Use AI to explain each trend in one line": an AI model writes each event's summary line. Optional, and off unless the person has a key. Sibyl's scripts run on their own every hour, so they need their own API key; your own model access does not count. A chat subscription such as ChatGPT Plus or Claude Pro has no API key; some subscriptions, such as coding plans, include one, but check that their terms allow this use. Each summary costs money at the AI company. If the person says no or is unsure, leave it off: summaries then use the first news headline.

If they have a key, add `SIBYL_AI_API_KEY` and `SIBYL_AI_MODEL` (and `SIBYL_AI_BASE_URL` for an API other than OpenAI) to `sibyl/data/.env` (rule 4), and make one test briefing (`node scripts/sibyl.js --print --no-push`). If the summaries fail, tell the person in plain words what failed, remove the variables, and say that Sibyl works without AI.

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

v1.3.20's schedule is kept: collection and alerts every 10 minutes and a briefing every hour, during the person's hours (10:00 to 22:00 by default). Set it up with `scripts/schedule.js` (rule 10), from the `sibyl` folder:

```text
node scripts/schedule.js --install --hours=10-22
node scripts/schedule.js --status
node scripts/schedule.js --remove
```

- **macOS and Linux:** it writes one marked block into the person's crontab, with the full path of `node`, and leaves their other entries alone. `--every=30` collects every 30 minutes; `--dry-run` prints the block without writing it.
- **macOS folders:** it refuses to install from Desktop, Documents or Downloads, because scheduled tasks cannot read them. Move the whole folder first, for example to `~/Sibyl-System-Hotspot-Monitor`, and tell the person why in one sentence.
- **Time zone:** the hours follow the computer's clock. If `timeZone` differs from the computer's, it says so; give the hours in the computer's time.
- **Windows:** it prints the two Task Scheduler tasks to create, with the paths filled in.
- **No secrets:** keys come from `sibyl/data/.env`, so the schedule holds none.

**The daily page reading** needs you and a browser, so it is not part of this schedule. If you can run tasks on a schedule yourself, schedule "Read today's trend pages for Sibyl" each morning. If you cannot, tell the person during setup, in plain words, and ask them to start each day with that request.

Nothing else should post the scripts' output: with `--push` they send briefings themselves, and a second post would duplicate them.

## Push targets

| Target | What to set |
| --- | --- |
| Slack | An incoming webhook: `SIBYL_REPORT_WEBHOOK` (and `SIBYL_ALERT_WEBHOOK` for alerts elsewhere) in `sibyl/data/.env`. |
| Discord | A channel webhook (channel settings, Integrations, Webhooks); the same variables. |
| WeCom | A group robot webhook; the same variables. |
| Telegram | `SIBYL_TELEGRAM_BOT_TOKEN` and `SIBYL_TELEGRAM_CHAT_ID` (optional `SIBYL_TELEGRAM_ALERT_CHAT_ID`) in `sibyl/data/.env`. |
| None | Nothing: briefings and alerts are saved to `briefings/` and `alerts/` and deleted after 7 days (`archive.keepDays`). |

For Telegram: the person messages @BotFather in Telegram, sends `/newbot`, and gives you the bot token. They then send any message to their new bot; you read the chat ID from `https://api.telegram.org/bot<token>/getUpdates` (`result[].message.chat.id`). Never show the token in full.

Slack, Discord and Telegram are recognised by their address. For any other address, such as a relay, set `report.channel` or `alerts.channel` to `wecom`, `slack`, `discord` or `telegram`. After any change, run `check-deploy.js`, then send one test with `node scripts/sibyl.js --push`.

## Common requests

| The person asks | What to change |
| --- | --- |
| Add or change a topic | Map it as above, confirm, then update `topics` and `dailyPages`. |
| An unrelated item appeared | Add an `exclude` word to the keyword that matched, or narrow the keyword with `requireAny`. Show the change. |
| Keep routine items out | Add words to the topic's `briefingExclude`. |
| Where briefings go | The push variables in `sibyl/data/.env` (or `report` / `alerts` in the config); then check and test. |
| Briefing times | `node scripts/schedule.js --install --hours=<start>-<end>` (it replaces the old schedule). |
| Collection frequency | `node scripts/schedule.js --install --hours=<start>-<end> --every=30`. |
| Fewer or more alerts | `alerts.platforms["google-trends"].rankMax` and `hotMin` (smaller `rankMax` or larger `hotMin` means fewer alerts). Say which numbers you changed. |
| Follow a channel or website | As under "Sources": `platforms["youtube-channels"].channels` or `platforms.rss.feeds` (rule 6). |
| Turn a source on or off | As under "Sources"; keep `report.seedPlatforms` to the main sources that are on. |
| Number of events in the briefing | `report.topN` (default 10); the minimum score is `report.minScore`. |
| Another country or time zone | `country`, `timeZone`, the `region` in `dailyPages`, and the schedule (`schedule.js --install`). |
| An AI model for summaries | As under "AI explanations (summaries)": `SIBYL_AI_API_KEY` and `SIBYL_AI_MODEL` (and `SIBYL_AI_BASE_URL` for an API other than OpenAI). Without both, the first news headline is used. |

## Other settings

| Setting | Default | Meaning |
| --- | --- | --- |
| `language` | `en` | Wording of briefings and alerts (English only for now) |
| `report.seedPlatforms` | Google Trends, TikTok | Main sources: an event must appear on one to enter the briefing. Add `x-trends` when X is on. |
| `alerts.platforms` | Google Trends top 3 or 20K+ searches; X top 5 or 50K posts | Alert limits |
| `pagesMaxAgeHours` | 168 | Saved pages older than this are not used |
| `report.requireTopicConfirmation` | `true` | Items from lists read for a topic lead the briefing only with a keyword match or a second source; `false` lets them lead as before |
| `http.userAgent` | a generic name | With Wikipedia on: `SibylHotspotMonitor (<contact>)`, as under "Sources" |
| `eventSummary.newsEvidence` | `true` | Use the news links saved with items as summary material |

The alert limits, source weights and score levels are first settings, to be adjusted after testing.
