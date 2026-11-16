# Instructions for AI agents

You are helping a person run Sibyl, a trend monitor. The person may not be technical: do the technical work yourself, and ask for what only they can give at the moment you need it (see "Talking to the person"). The person-facing guide is [docs/guide.md](docs/guide.md); the setup request people send you is [SETUP-PROMPT.md](SETUP-PROMPT.md).

## Rules

1. **Never type passwords, API keys or tokens into web pages.** Logins are the person's to do, in the browser they already use wherever possible (see "Keys and logins").
2. **Confirm topics before anything runs on a schedule.** Show the sources switched on, the topics, keywords, exclude words and the category chosen on each platform, and wait for the person's OK.
3. **Show briefings and alerts only when asked.** If no push target is set, briefings are saved as files; do not paste them into the conversation unless the person asks.
4. **Keep secrets in `sibyl/data/.env`.** Webhook addresses, bot tokens and API keys go there, one `NAME=value` per line, and only the person's account may read it (`chmod 600`; git does not upload the data folder). Every script reads it when it starts, so neither `config.json` nor the schedule holds a secret. Never ask the person to paste a secret into the chat, and never print one: they save it with `scripts/save-secret.js` in their own terminal (see "Keys and logins").
5. **Ask before anything that costs money** (X trends, a paid model) and say what it costs.
6. **Check a website's terms before adding its feed.** Some feeds are for personal use only; tell the person and let them decide.
7. **Read each page once a day** (more often only if the person asks). Do not bypass logins, rate limits or bot checks, and do not read pages other than those listed here.
8. Keep the credit to Misaka Studio in the README and the guide.
9. **Ask for what you need when you need it**, one thing at a time and in plain words, as described under "Talking to the person".
10. **Schedule only with `scripts/schedule.js`.** Do not write your own scheduler, wrapper scripts or jobs around the commands, and never stop a run because one source failed: the scripts record that source's error and read the others. Never ask the person to run a setup script you wrote.
11. **If your commands cannot reach the internet, stop and ask.** `getaddrinfo ENOTFOUND`, `EAI_AGAIN` or `Operation not permitted` on every source, or a failed "Internet access" line in the self-check, mean your app keeps your commands offline. Ask the person to allow network access ("What to ask, and when"). Until `collect-snapshot.js` reads the live sources, schedule nothing, and do not hand them scripts to run instead.

## Talking to the person

The person has not read the guide and should not have to. Do not expect them to know any term, such as API key, feed, token, webhook or time zone name. Explain each thing only when you need it, in a sentence or two, at the moment you ask.

- **Use a dialog when you can.** If your app can put a question in front of the person (a question tool, a form or a pop-up, such as AskUserQuestion in Claude Code), use it for choices and yes-or-no questions. Ask for things they paste, such as a link, in one short chat message. Keys, tokens and webhook addresses never go in the chat (see "Keys and logins").
- **One thing at a time.** Ask, wait for the answer, then go on. Do not guess, skip it or carry on without it.
- **Say what they need to decide:** what it is, why Sibyl needs it, whether it costs money, whether it needs an account, the link, what to send back, and what happens if they say no.
- **Keep it short.** No list of terms, and nothing they do not need yet.

### Keys and logins

**Saving a key.** A key, token or webhook address never goes through the chat. When Sibyl needs one, say what it is, why Sibyl needs it, what it costs and where to get it, as usual, then give the person this command to run in their own terminal, with the full path to their Sibyl folder:

```text
node "<full path>/sibyl/scripts/save-secret.js" youtube
```

The last word is `youtube`, `x`, `ai`, `telegram`, `webhook` (briefings) or `alert-webhook` (alerts in another channel). The command asks them to paste the value, shows nothing as they paste, and writes it to `sibyl/data/.env`, which only their account can read; running it again replaces the old value. If your app can run a command in a terminal at the person's click, offer that; otherwise tell them how to open one (macOS: Terminal, in Applications, Utilities; Windows: PowerShell). Do not run it yourself: it needs them to paste, and it refuses to run without a terminal. When they say it is saved, run `check-deploy.js`, which shows whether the value is set without showing it. If they paste a secret into the chat anyway, do not repeat it, and suggest they make a new one and save that with the command, because the chat keeps a copy.

**Logins and browsers.** Use the browser the person already uses wherever you can. Signing in again in another browser is tiring, and some people will not sign in to Google there.

- **One-time account steps**, such as making the YouTube key, buying X credit or making a Telegram bot or a webhook, happen in their own browser. Give the link and what to click, one step at a time. Do not open these pages in your browser.
- **Pages you read every day** (TikTok Creative Center, and Google's Explore if it asks for a sign-in) need the sign-in in the browser you read them with. First, if you can work in their own browser, where they are already signed in (for example with Claude's Chrome extension), use it. Second, if your browser can bring one site's sign-in over from theirs (in the Claude app, the browser pane's ⋮ menu offers this when it can), ask them to do that for that site only. Otherwise ask them to sign in once in your browser. A sign-in usually stays: ask again only when the page shows they are signed out.
- **If they cannot or would rather not sign in**, go on without it and say what they lose (TikTok: the top 3 hashtags only).

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

> Sibyl sends briefings to Telegram through its own bot, which is free. In Telegram, open @BotFather (it has a blue tick), send /newbot, and choose a name and a username ending in "bot". It gives you a token, a code that lets Sibyl post as the bot. Do not send it to me; save it by running this in your terminal: [the save-secret command for `telegram`]. Then send your new bot any message, such as "hi", and tell me when you have.

**Slack, Discord or WeCom**, when it is chosen.

> To post briefings in your channel, Sibyl needs the channel's webhook address: a link that lets it post there. It is free. Here is how to make one: [the matching link below]. Anyone with the address can post in your channel, so do not send it to me; save it by running this in your terminal: [the save-secret command for `webhook`].

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

> YouTube search needs a key from Google: a long code that lets Sibyl search YouTube for you. It is free, because Sibyl stays within Google's 100 free searches a day, and it takes about 10 minutes with your Google account, in the browser you normally use. I will give you each link and tell you what to click. Shall we start?

Then take them through the steps under "Sources", one at a time, and end with the save-secret command for `youtube`.

**X trends**, when it is chosen. Work out the cost for their hours first (rule 5).

> X trends costs money: US$0.01 each time Sibyl checks, about every 30 minutes, so about US$[amount] a day for your hours. You need your X account, and you buy credit yourself at the X Developer Console (https://console.x.com). Do you want to go ahead?

If yes: in their own browser they sign in, buy credit and create an app, then save its Bearer Token with the save-secret command for `x`.

**AI explanations** ("Use AI to explain each trend" in the request), when they said yes.

> Each trend in a briefing has one line saying what it is about. Sibyl normally copies a news headline for it; to have an AI write it instead, Sibyl needs an API key, a code that lets it use the AI. Some AI subscriptions include one; if yours does not, you buy credit on the AI company's website, for example OpenAI (https://platform.openai.com/api-keys). Each line costs a little. Tell me which company your key is from, then save the key by running this in your terminal: [the save-secret command for `ai`].

If the key comes with a subscription, such as a coding plan, check that the plan allows use outside its own apps; some do not. If they are not sure, leave it off.

**TikTok login**, when they want TikTok trends.

> If you want to track trends on TikTok, you need to be logged in to a free TikTok for Business account (create one at https://ads.tiktok.com/i18n/signup) in the browser I read the page with. Without a login, TikTok Creative Center shows only the top 3 hashtags. [Whichever applies, as under "Keys and logins": I can use your own browser, where you may already be logged in. / You can bring your TikTok login over from your own browser: (how). / I have opened the page in my browser: click Log in and sign in yourself.] You only need to do this once. Tell me when you are done.

**Google sign-in**, when the new Explore page asks for it.

> Google's new Explore page asks you to sign in. [As for TikTok: your own browser, bringing the sign-in over, or signing in once in mine.] If you would rather not sign in to Google this way, I will leave Explore out; the other lists still work.

**Daily pages**, if you cannot run tasks on a schedule. Tell them once, at the end of setup.

> I cannot open web pages on a schedule by myself. To keep the TikTok and Google Trends lists fresh, start each day by sending me: "Read today's trend pages for Sibyl."

## Known problems from testing

Seen when Codex and Claude set Sibyl up on a Mac (November 2026); expect them in other agents too. Each is yours to handle. The task page tells the person only what they must do themselves.

| What happened | What you do |
| --- | --- |
| The commands had no internet (Codex's default), so every source failed with `getaddrinfo ENOTFOUND`, and the agent wrote scripts for the person to run instead | Rule 11: stop, ask the person to allow network access (the Codex steps are under "What to ask, and when"), then run the self-check again. |
| The agent wrote its own schedule script, which skipped a whole run when one source failed, and asked the person to run it | Rule 10: install the schedule with `scripts/schedule.js`. Never ask the person to run a script you wrote. |
| The folder was on the Desktop, which scheduled tasks on macOS cannot read | Before installing the schedule, move the folder to the person's home folder with their OK; `schedule.js` refuses Desktop, Documents and Downloads. |
| Unrelated items led the briefing: "sheltered inlets" from Explore's rising searches for "sunscreen", and oral-care hashtags from TikTok's Beauty & Personal Care | The scripts now keep such items in the watch list unless a keyword or a second source confirms them. After the first briefing, point out anything unrelated that still leads and offer an exclude word. |
| Wikipedia was switched off, because these instructions then named only Google Trends and TikTok as on by default | Wikipedia is on by default; keep it on unless the person says no. |
| The agent asked the person to paste the YouTube key into the chat, as these instructions then said; the person stopped the setup | Rule 4 and "Keys and logins": give them the `save-secret.js` command. A secret never goes through the chat. |
| A narrow browser window made Google serve its mobile layout, whose table held the unfiltered list of 660 trends, and the agent wrote its own checker before saving | Read pages in a window at least 1280 px wide, write each page to `data/daily-pages/`, and save with `scripts/save-pages.js`, which refuses such lists. |
| YouTube videos that shared one word with Explore's "Brand" and TikTok's #routine made them lead | Fixed in the scripts: only main sources confirm an item from a list read for the topic. If something unrelated still leads, offer an exclude word. |
| Signed in to TikTok and Google in their own browser, the person had to sign in to TikTok again in the agent's browser, and would not sign in to Google there | "Keys and logins": one-time account steps happen in their own browser; for pages you read daily, use their browser or bring the sign-in over before asking for a new one. |

## Where things are

| Path | What |
| --- | --- |
| `sibyl/scripts/` | The scripts (Node.js 18 or later, no packages to install) |
| `sibyl/data/` | The data folder: `config.json`, `pages.json`, snapshots, `report-latest.md`, `briefings/`, `alerts/` |
| `sibyl/data/.env` | Keys and webhook addresses (rule 4); only the person's account may read it. The person writes secrets with `sibyl/scripts/save-secret.js`. |
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
| `node scripts/sibyl.js --print --no-push` | Writes a test briefing and prints it. It sends nothing, keeps no copy and leaves the history alone, so the next real briefing compares with the last real one. |
| `node scripts/save-pages.js` | Saves the pages you read today (files in `data/daily-pages/`) into `pages.json`, checking each; a page that fails keeps its last saved list (see "Reading the daily pages"). |
| `node scripts/save-secret.js <name>` | For the person to run in their own terminal: saves a key, token or webhook address in `data/.env` (see "Keys and logins"). |
| `node scripts/show-briefing.js` | Prints the latest saved briefing. `--list` lists them; `--file=2026-11-11_1000` prints one; `--alerts` prints today's alerts; `--alerts --date=2026-11-10` prints another day's. |

`--no-ai` skips the AI model; `--no-summary` skips summaries.

## Setup

1. **Get the files.** Clone `https://github.com/upiznhec/Sibyl-System-Hotspot-Monitor.git` into a folder the person chooses. On macOS, put it in the home folder (for example `~/Sibyl-System-Hotspot-Monitor`), not in Desktop, Documents or Downloads: scheduled tasks cannot read those folders, and `schedule.js` refuses them. If the person already put it there, ask before you move it. Check `node --version` (18 or later); help install Node.js if needed.
2. **Create the config.** `mkdir -p sibyl/data` and copy `sibyl/scripts/config.example.json` to `sibyl/data/config.json`. The person saves keys and webhook addresses in `sibyl/data/.env` with `save-secret.js` (rule 4).
3. **Map the topics** (next section). Wait for the person's OK, then write `topics` and `dailyPages`.
4. **Country, time zone and sources.** Set `country` (two-letter code, such as `US`) and `timeZone` (an IANA name, such as `America/New_York`). Under `platforms`, switch the sources on or off as the person chose under "Sources to watch" in the setup request; where a choice is blank or still in brackets, keep the default. Google Trends, TikTok and Wikipedia are on by default; YouTube channels, websites, YouTube search and X are off. What each source needs is under "Sources" below, and how to ask for it under "What to ask, and when".
5. **Push target** (see "Push targets" below), or none: then briefings are saved as files.
6. **Logins.** If the person wants to track trends on TikTok (without a login, only the top 3 hashtags show), they need a free TikTok for Business account (sign-up: `https://ads.tiktok.com/i18n/signup`) signed in where you read TikTok Creative Center (`https://ads.tiktok.com/creative/creativeCenter/trends`). Follow "Keys and logins": their own browser first, then bringing the sign-in over, then one sign-in in your browser. The same goes for Google if the new Explore page asks for a sign-in.
7. **First run.** Run `check-deploy.js` first; if "Internet access" fails, follow rule 11 before anything else. Then read the daily pages (below), run `collect-snapshot.js`, `instant-alerts.js --no-push` and `sibyl.js --print --no-push`, and show the person the check and the briefing. If an item that leads the briefing has nothing to do with their topic, offer an exclude word.
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

**Wikipedia.** Ask for a contact (see "What to ask, and when") and set `http.userAgent` to `SibylHotspotMonitor (<contact>)`. Sibyl sends it only with its requests to Wikimedia; every other site gets a plain name without it. If they would rather not give one, switch Wikipedia off.

**YouTube channels.** Only when the person asks; ask for the links if they did not give them. Open each channel page and find its ID, which starts with `UC`: it is in the page's RSS link (`channel_id=`) and in the page source (`"externalId"`). Add `{ "id": "UC…", "name": "<channel name>" }` to `platforms["youtube-channels"].channels`, set `enabled: true`, and check that `https://www.youtube.com/feeds/videos.xml?channel_id=<id>` lists videos.

**Websites and blogs.** Only when the person asks; ask for the addresses if they did not give them. Find each site's RSS or Atom feed: a `<link rel="alternate">` of type `application/rss+xml` or `application/atom+xml` in the home page, or a common path such as `/feed`, `/rss` or `/atom.xml`. Open the feed to check that it lists recent posts, and check the site's terms for it (rule 6). Add `{ "url": "<feed address>", "name": "<site name>" }` to `platforms.rss.feeds` and set `enabled: true`. If a site has no feed, tell the person; do not read its pages instead.

**YouTube search.** It is free within Google's default allowance of 100 searches a day (`search.list` calls). Each query is one search at most once an hour (`minIntervalMinutes: 60`), and Sibyl runs at most 3 queries, so even 24 hours a day (72 searches) stays within it. Give the person each link and tell them what to click; they do it in their own browser:

1. `https://console.cloud.google.com/`: they sign in with their Google account. No payment details are needed; if Google offers a free trial or asks for a card, they can skip it.
2. Create a project, for example "Sibyl".
3. `https://console.cloud.google.com/apis/library/youtube.googleapis.com`: click Enable.
4. `https://console.cloud.google.com/apis/credentials`: Create credentials, then API key. Restrict the key to YouTube Data API v3.
5. They copy the key and save it with `node scripts/save-secret.js youtube` (see "Keys and logins").

That writes `SIBYL_YOUTUBE_API_KEY` to `sibyl/data/.env`. Check it with `check-deploy.js`, then set `enabled: true`. Leave `queries` empty to search the topic's first 6 keywords at once, or set up to 3 queries (words joined with `|` match any of them).

**X trends.** First say what it costs and wait for the person's OK (rule 5): about US$0.01 per request, paid in advance as credit. Sibyl asks about every 30 minutes (`minIntervalMinutes: 30`), 2 requests an hour; for 10:00 to 22:00 that is about US$0.26 a day, or US$8 a month. Work out the figure for their hours. Then:

1. Give them the X Developer Console, `https://console.x.com` (prices: `https://docs.x.com/x-api/getting-started/pricing`), to open in their own browser. They sign in with their X account and buy credit themselves; never enter payment details.
2. They create an app, copy its Bearer Token and save it with `node scripts/save-secret.js x`.
3. Check it with `check-deploy.js`, set `enabled: true`, and add `x-trends` to `report.seedPlatforms`.

The US, the UK, Japan and worldwide are built in; for another country, set `platforms["x-trends"].woeid` from X's documentation. Items in the person's topics that reach X's top 5 also alert (`alerts.platforms["x-trends"]`). X's trends endpoint gives names only, with no post counts (tested 2026-11-15), so X items rank by position and the 50K-posts limit does not apply.

## AI explanations (summaries)

The setup request calls this "Use AI to explain each trend in one line": an AI model writes each event's summary line. Optional, and off unless the person has a key. Sibyl's scripts run on their own every hour, so they need their own API key; your own model access does not count. A chat subscription such as ChatGPT Plus or Claude Pro has no API key; some subscriptions, such as coding plans, include one, but check that their terms allow this use. Each summary costs money at the AI company. If the person says no or is unsure, leave it off: summaries then use the first news headline.

If they have a key, they save it with `node scripts/save-secret.js ai`; you add `SIBYL_AI_MODEL` (and `SIBYL_AI_BASE_URL` for an API other than OpenAI), which are not secret, to `sibyl/data/.env`, and make one test briefing (`node scripts/sibyl.js --print --no-push`). If the summaries fail, tell the person in plain words what failed, remove the variables, and say that Sibyl works without AI.

## Reading the daily pages

Once a day (before the person's first hour, or when asked: "Read today's trend pages for Sibyl"), read every page in `dailyPages` in a browser. Write each page you read as one JSON file in `sibyl/data/daily-pages/` (any name ending in `.json`): a section in the format in the header of `sibyl/scripts/lib/pages-file.js`, with the page's `source`, `view`, `region` and `industry` / `category` / `keyword` copied from `dailyPages`, `readAt` (the time you read it, with time zone), `url` and the items. Then run `node scripts/save-pages.js`. It saves every page that passes its checks into `pages.json` in one step and keeps the last saved list for any page that does not. Never write `pages.json` yourself: the scheduled runs read it every 10 minutes and could catch it half written.

Add these fields when you can, so that the checks can catch a bad read:

- `shown`: the filter or keyword the page shows, such as the industry in TikTok's filter. A different one means a click picked the wrong item.
- `total`: the row count the page shows, such as "1–6 of 6".
- `checksum`: computed in the browser over the rows you read, with the function below, so that a row changed on its way to the file is caught.
- `noData: true`, with no items, when Explore says there is not enough data.

```js
function rowsChecksum(items) { const t = JSON.stringify(items.map(i => [Number(i.rank), String(i.title)])); let h = 5381; for (let i = 0; i < t.length; i++) h = ((h * 33) ^ t.charCodeAt(i)) >>> 0; return h; }
```

Before reading, make the browser window at least 1280 px wide: in a narrow window Google switches to a mobile layout whose table holds the unfiltered list. Google's pages can take a minute or two to settle, so wait and look again instead of reading early.

**TikTok Creative Center hashtags**

- Open `https://ads.tiktok.com/creative/creativeCenter/trends/hashtag?region=US&period=7` (change `region`), and choose the industry in the page's industry filter.
- For each row save `rank`, `title` (the hashtag), `posts` and `views` as shown (for example "43.7K" and "325.3M").
- Without a login the page shows the top 3 and then "View more", which needs a login. After logging in, the site may open its home page: open the hashtag page again.
- The industry menu opens with an animation: wait for it, and check that the filter shows the industry before reading.
- The list loads as you scroll and keeps only about 14 rows in the page at a time, so collect the rows while scrolling.

**Google Trends, Trending Now by category**

- Open `https://trends.google.com/trending?geo=US&category=2&hours=24` (change `geo` and `category`).
- The unfiltered list appears first and can stay for more than 5 seconds. Wait until the row count under the table ("1–6 of 6") matches the chosen category before reading.
- For each row save `rank`, `title`, `searchVolume` (such as "2K+") and `rise` (such as "200%").
- A category has fewer than 100 rows. Hundreds of rows mean the filter has not applied yet, or the window is too narrow.

**Google Trends Explore, rising searches**

- Open `https://trends.google.com/trends/explore?date=now%207-d&geo=US&q=sunscreen` (change `geo` and `q`).
- Under "Related queries" and "Related topics", with "Rising" selected, save each row's `rank`, `title`, `rise` (such as "+350%" or "Breakout") and `kind` (`query` or `topic`). Topics show with a type after a dash, such as "Reef Safe - Topic" or "Hilton - Brand"; save the name only. Each list shows 5 rows at a time, with a button for the next 5.
- Google is replacing this classic page. If it is gone and the new Explore asks for a sign-in, ask the person to sign in.

**If a page fails** (a login expired, the page changed, nothing loads after a minute): write no file for it; `save-pages.js` keeps that page's last list with its old `readAt`. Tell the person which page failed and why. The scripts use the last saved items and report their age.

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

**The daily page reading** needs you and a browser, so it is not part of this schedule. If you can run tasks on a schedule yourself, schedule "Read today's trend pages for Sibyl" each morning. Such a task usually runs as a new session that does not remember this one, so its instructions must hold everything: the pages, the steps under "Reading the daily pages" and `save-pages.js`. In the Claude app, a scheduled task runs only while the app is open and the computer is awake, may start a few minutes late, and keeps the permission mode of the session that made it; tell the person. If you cannot, tell the person during setup, in plain words, and ask them to start each day with that request.

Nothing else should post the scripts' output: with `--push` they send briefings themselves, and a second post would duplicate them.

## Push targets

| Target | What to set |
| --- | --- |
| Slack | An incoming webhook: `SIBYL_REPORT_WEBHOOK` (and `SIBYL_ALERT_WEBHOOK` for alerts elsewhere) in `sibyl/data/.env`, saved by the person with `save-secret.js webhook` (and `alert-webhook`). |
| Discord | A channel webhook (channel settings, Integrations, Webhooks); the same variables. |
| WeCom | A group robot webhook; the same variables. |
| Telegram | `SIBYL_TELEGRAM_BOT_TOKEN` and `SIBYL_TELEGRAM_CHAT_ID` (optional `SIBYL_TELEGRAM_ALERT_CHAT_ID`) in `sibyl/data/.env`. |
| None | Nothing: briefings and alerts are saved to `briefings/` and `alerts/` and deleted after 7 days (`archive.keepDays`). |

For Telegram: the person messages @BotFather in Telegram, sends `/newbot`, and saves the bot token with `node scripts/save-secret.js telegram`. They then send any message to their new bot; you read the chat ID from `https://api.telegram.org/bot<token>/getUpdates` (`result[].message.chat.id`), taking the token from `sibyl/data/.env` inside your command so that it is never shown.

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
| `alerts.platforms` | Google Trends top 3 or 20K+ searches; X top 5 (X gives no post counts) | Alert limits |
| `pagesMaxAgeHours` | 168 | Saved pages older than this are not used |
| `report.requireTopicConfirmation` | `true` | Items from lists read for a topic lead the briefing only with a keyword match or a second source; `false` lets them lead as before |
| `http.userAgent` | empty | With Wikipedia on: `SibylHotspotMonitor (<contact>)`, as under "Sources". Sent to Wikimedia only; other sites get a generic name. |
| `eventSummary.newsEvidence` | `true` | Use the news links saved with items as summary material |

The alert limits, source weights and score levels are first settings, to be adjusted after testing.
