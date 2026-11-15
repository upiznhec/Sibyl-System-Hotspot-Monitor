# Sibyl trend monitor: user guide

This guide follows the usage manual of Sibyl System Hotspot Monitor v1.3.20 by Misaka Studio, shortened for this version. Most setup and maintenance is done by asking your AI agent; the requests to copy are in section 7.

## 1. What it does

Sibyl watches trend lists for the topics you choose. On a schedule it:

1. Collects trending searches and hashtags from Google Trends, TikTok and other sources.
2. Keeps only the items in your topics, for example "beauty" or "NBA".
3. Sends an alert, a short message that arrives straight away, when an item in your topics is near the top of Google Trends.
4. Every hour, writes a briefing: the strongest trends, grouped into events, each with a score and a short summary. The briefing goes to your chat app, or is saved as a file.

### 1.1 At a glance

| When | Who | What |
| --- | --- | --- |
| Once a day | Your agent | Reads the TikTok and Google Trends pages that have no feed, and saves them (pages.json). |
| Every 10 minutes | Script | Reads Google Trends and your other sources, adds the saved pages, and checks for alerts. |
| Every hour | Script | Groups items into events, scores them, compares them with the last hour, and writes the briefing. |
| When you ask | Your agent | Shows the latest briefing or today's alerts, and makes changes you ask for. |

### 1.2 What you can use it for

| Use | How |
| --- | --- |
| Daily trend watch | See rising searches and hashtags in your topics without checking each list yourself. |
| Content ideas | Pick the trends worth a post today. |
| Early warning | Get an alert when something in your topics jumps to the top of Google Trends. |
| Team updates | Send the hourly briefing to a team chat (Slack, Discord or WeCom). |
| Personal use | Get briefings on Telegram, or have them saved and ask your agent when you want them. |

### 1.3 Where the trends come from

| Source | What it reads | Read by | What you need | Default |
| --- | --- | --- | --- | --- |
| Google Trends | The top searches right now, about 10 per country, each with news links | Script, every 10 minutes | Nothing | On |
| Google Trends | Trending searches in your categories, and rising searches for your keywords (Explore) | Your agent, once a day | Nothing for now (see section 1.4) | On |
| TikTok Creative Center | Top hashtags by country and industry, with posts and views over 7 days | Your agent, once a day | Nothing for the top 3; a free TikTok for Business login for more | On |
| Wikipedia | The most-read pages in your country yesterday | Script | A web address or email, for Wikimedia | On |
| YouTube channels | New videos from channels you follow, with views | Script | The channels' links | Off |
| Websites and blogs | New posts from sites you follow | Script | The websites' addresses | Off |
| YouTube search (optional) | The most-viewed new videos for your keywords | Script, at most once an hour | A free key from Google | Off |
| X trends (optional) | What is trending on X in your country | Script, at most every 30 minutes | A paid X developer account | Off |

You choose the sources in the setup request (section 4.1). When a source needs something from you, your agent asks at that point, one thing at a time, and tells you what it is, what it costs and where to get it. Google Trends and TikTok are the main sources: an event must appear on one of them, or on X if you turn it on, to enter the briefing. Wikipedia and YouTube search add weight to those events. New videos and posts from the channels and sites you follow are listed apart under "From sources you follow".

Not included in this version: Instagram, Threads and Facebook have no trend list for outside apps, or need Meta's app review; Reddit's data access needs an approved account since November 2025, and commercial use needs a separate agreement; Google News search is left out because its feed allows personal feed-reader use only.

### 1.4 Good to know

- It does not catch every trend. Use it alongside your own checks, not instead of them.
- Scores and counts are a guide. Google Trends gives ranges ("20K+"), and TikTok counts cover the last 7 days.
- Summaries are taken from news headlines, or written from them by an AI model if you add one. Check the facts before you use them.
- Pages read by the agent can fail: a page may change, need a login, or load slowly. Sibyl then uses the last saved pages and reports how old they are.
- Google is replacing the classic Explore page; the new one asks you to sign in to a Google account. When that happens, you sign in yourself in your agent's browser. Your agent never types your passwords.
- Sources can change their pages or terms at any time. If one stops working, the others keep running.
- The alert limits, source weights and score levels are first settings, to be adjusted after a week of testing.

### 1.5 Cost

- The scripts are free to run.
- Your agent's usage when it reads the pages once a day, and when you ask it for briefings or changes.
- Optional: an AI model for summaries and for merging events. You use your own key; nothing is spent without one.
- Optional: YouTube search, free within Google's daily allowance.
- Optional: X trends, about US$0.01 per request. Sibyl asks at most every 30 minutes, so 10:00 to 22:00 costs about US$0.26 a day (about US$8 a month).
- The cost of a typical day will be measured during testing and added here.

### 1.6 What the messages look like

An hourly briefing (made-up example):

```markdown
# Trend Briefing

Generated: 2026-11-11 10:00 EST

---

### 1. 🧴 🆕 mineral sunscreen recall

**Score: 87/100 (Strong)**

**Signals:** Google Trends #1 20K+ searches, TikTok #2 73M views; on 2 sources; 2 search terms for the same event; first time in the briefing.

**Summary:** Brand A recalls mineral sunscreen & stick over labeling (Example News)

[Google Trends](https://trends.google.com/trends/explore?…) | [TikTok](https://www.tiktok.com/tag/sunscreenrecall)

---

### Watch list

- live tinted sunscreen: New | Google Trends #1 +50% rising with "sunscreen"
```

- **Score** is out of 100: Strong (85 to 100), Follow up (60 to 84), Watch (below 60).
- The first icon is the topic's; the second shows the change since the last briefing: 🆕 new, 🔥 rising, ⏳ holding, 👀 steady, ⬇️ cooling.
- **Signals** lists where the event was seen, its rank and count on each source, and how it changed.
- The links go to each source where the event appeared.

An alert (made-up example):

```text
🔥 Google Trends high-heat alert
━━━━━━━━━━━━━━
mineral sunscreen recall
Rank: #1 | Heat: 20K+ searches
Summary: Brand A recalls mineral sunscreen & stick over labeling (Example News)
[View details](https://trends.google.com/trends/explore?…)
━━━━━━━━━━━━━━
Trigger: heat & rank rule
Triggered at: 10:00 EST
```

## 2. How it decides what to report

### 2.1 Alerts

Alerts come only from lists the script reads every 10 minutes: Google Trends' top searches, and X if you turn it on.

| Source | An item in your topics alerts when |
| --- | --- |
| Google Trends | It is in the top 3, or has at least 20,000 searches ("20K+") |
| X (optional) | It is in the top 5, or has at least 50,000 posts |

Each item alerts at most once a day. TikTok and the other daily pages never alert; they appear in the hourly briefing.

### 2.2 The hourly briefing

An event enters the briefing when:

1. It is in one of your topics: one of the topic's keywords matches, or the list it came from was read for that topic.
2. It does not contain one of the topic's exclude words, such as "promo code".
3. Its score reaches the minimum.
4. It appears on a main source, Google Trends or TikTok. Events seen only on sources you follow are listed apart.

| Example | Alert? | Briefing? | Why |
| --- | --- | --- | --- |
| "mineral sunscreen recall" is #1 on Google Trends with 20K+ searches | Yes | Yes | Main source, top rank, in your topic |
| "#grwm" is #1 in TikTok's Beauty list, read for your Beauty topic | No | Yes | TikTok is read once a day, so it does not alert |
| A post about sunscreen on a blog you follow, and nowhere else | No | Only under "From sources you follow" | Followed sources are listed apart |
| A celebrity search that matches none of your topics | No | No | Not in your topics |

### 2.3 How the score works

- Each item gets points for its rank, its count (searches, views or posts) and the number of your keywords it matches, multiplied by how much its source and list count.
- Items about the same event are grouped together. Two titles must share words that describe the event, or a hashtag must join words of the other title (#sunscreenrecall and "sunscreen recall"). Sharing only a topic keyword, a person or a brand is not enough.
- An event gets extra points for each additional source and for a top-3 rank. The total is shown out of 100.
- Each briefing is compared with the last one: new, rising, holding, steady or cooling.

## 3. What you need

| Item | Needed? | Notes |
| --- | --- | --- |
| This repository | Yes | Your agent downloads it from GitHub. |
| Node.js 18 or later | Yes | Your agent can check this and install it. Tested with Node.js 24. |
| An AI agent | Yes | It must run commands, edit files and use a web browser. One that can also run on a schedule is best. |
| Somewhere to send briefings | Optional | A Slack, Discord or WeCom webhook, or a Telegram bot. Without one, briefings are saved as files. |
| AI summaries | Optional | A paid API key from an AI company. It is not your agent, and a ChatGPT or Claude subscription is not an API key. Without it, summaries use the first news headline. |
| Accounts | Optional | TikTok for Business (free) to see more than 3 hashtags; a Google account for the new Explore page; a key from Google for YouTube search (free); an X developer account for X trends (paid). See section 1.3. |
| A contact for Wikipedia | If Wikipedia is on | A web address or email that Sibyl sends to Wikimedia. See section 1.3. |

## 4. Setup

### 4.1 With your agent (recommended)

Copy the setup request in [SETUP-PROMPT.md](../SETUP-PROMPT.md), fill in the parts in brackets, and send it to your agent. The agent then:

1. Downloads the folder and checks Node.js.
2. Asks what you want to track, and proposes topics, keywords and exclude words, plus the matching category on each platform. It waits for your OK before saving anything.
3. Sets your country and time zone, switches on the sources you chose, and asks you for what they need (section 1.3).
4. Sets up where briefings go, or leaves them as files.
5. Opens TikTok Creative Center (and Google Trends Explore if it needs a sign-in) so that you can log in yourself, if you want to track more than the top 3 hashtags. The TikTok for Business account is free ([create one](https://ads.tiktok.com/i18n/signup)).
6. Reads the pages for the first time, runs the self-check and a first briefing, and shows you the result.
7. Schedules the work: collection and alerts every 10 minutes and a briefing every hour, during the hours you choose, plus the daily page reading.

What the agent's proposal looks like, for "beauty trends in the US":

| Platform | Proposed setting | Note |
| --- | --- | --- |
| Sources | Google Trends, TikTok, Wikipedia | As chosen in your request |
| TikTok | Industry: Beauty & Personal Care, last 7 days | The closest industry in TikTok's list |
| Google Trends | Category: Beauty and Fashion, past 24 hours; Explore for "skincare", "makeup", "sunscreen" | The category had only a few trends when checked |
| Keywords | skincare, makeup, sunscreen, SPF (only next to "sunscreen", "skin" or "UV") | You can add or remove words |
| Exclude words | promo code, coupon | Items with these words stay out of the briefing |

### 4.2 Doing it yourself

If you prefer to run the first test yourself, open a terminal (Mac: Terminal; Windows: PowerShell) and run:

```bash
git clone https://github.com/upiznhec/Sibyl-System-Hotspot-Monitor.git
cd Sibyl-System-Hotspot-Monitor/sibyl
mkdir -p data
cp scripts/config.example.json data/config.json
node scripts/check-deploy.js
node scripts/collect-snapshot.js
node scripts/sibyl.js --print --no-push
```

On Windows PowerShell, replace the `mkdir` and `cp` lines with:

```powershell
New-Item -ItemType Directory -Force data | Out-Null
Copy-Item scripts/config.example.json data/config.json
```

This runs one test with the example topic and sends nothing. The topics, sources and schedule are easier to set up with your agent.

## 5. Check that it works

Ask your agent: "Run the Sibyl check and a test briefing, and show me the results." It works when:

- The self-check shows no MISS.
- Collection ends with "Sibyl snapshot saved".
- The briefing step ends with "Sibyl briefing done", and the briefing is in `sibyl/data/report-latest.md`.

"0 candidate(s)" for alerts is normal: nothing in your topics is near the top of Google Trends at the moment.

After you set up a chat app, ask: "Send one Sibyl briefing now as a test."

## 6. Daily use

- **With a chat app:** a briefing arrives every hour during your chosen hours, and alerts arrive when they happen.
- **If you chose none:** nothing is sent. Briefings and alerts are saved in the data folder for 7 days. When you want them, ask your agent, for example:
  - "Show me the latest trend briefing."
  - "Any trend alerts today?"
  - "What were the top trends yesterday afternoon?"
- **Daily pages:** your agent reads the TikTok and Google Trends pages once a day. If it cannot do this on its own, it tells you during setup; then start each day with: "Read today's trend pages for Sibyl."

## 7. Common changes

Copy a request, change the parts in brackets, and send it to your agent.

**Add or change a topic**

```text
In Sibyl, add a topic for [running shoes]. Propose keywords, exclude words, the matching TikTok industry and Google Trends category, and Explore keywords. Wait for my OK before saving.
```

**Fix unrelated items**

```text
In Sibyl, "[item title]" appeared under [topic] but is not relevant. Add an exclude word or narrow the keyword, and show me what you changed.
```

**Keep routine items out of the briefing**

```text
In Sibyl, keep items containing "[promo code]" out of the [Beauty] briefing.
```

**Change where briefings go**

```text
Send Sibyl's hourly briefing to this [Slack] webhook: [address]. Keep the alerts where they are now, then run the Sibyl check.
```

```text
Set up a Telegram bot for Sibyl's briefings and alerts. Tell me what to do in Telegram, and store the token so it is not written in the config file.
```

**Change the briefing times**

```text
Change Sibyl's briefing to [10:00, 14:00 and 18:00] only. Keep collection and alerts every 10 minutes.
```

**Change how often it collects**

```text
Make Sibyl collect every [30] minutes instead of every 10. Do not change the briefing times.
```

**Get fewer or more alerts**

```text
Make Sibyl's alerts [stricter: only the biggest trends]. Tell me which numbers you changed.
```

**Add or remove a source**

```text
Add this YouTube channel to Sibyl: [link].
```

```text
Add this website's feed to Sibyl: [link]. Check whether the site allows its feed to be used this way first.
```

```text
In Sibyl, stop watching [Wikipedia].
```

**Turn on an optional source**

```text
Turn on [YouTube search / X trends] in Sibyl. Tell me what it costs and what I need to do, guide me one step at a time, and wait for my OK.
```

**Change the briefing layout**

```text
Change the Sibyl briefing so that [it shows 5 events instead of 10]. Keep the title, score, signals and summary lines.
```

## 8. Problems and fixes

| Problem | Likely cause | Ask your agent |
| --- | --- | --- |
| No briefing in your chat | Push not set; webhook or Telegram details wrong; the scheduled task lacks `--push` | "Run the Sibyl check and fix the push settings." |
| Alerts show 0 candidates | Nothing in your topics is near the top right now, or the alert limits are too strict | Usually nothing to fix. "Show me today's Google Trends top searches." |
| The briefing is empty | Topics or keywords too narrow, or the daily pages were not read | "Find out why the Sibyl briefing is empty and suggest a fix." |
| Unrelated items | A keyword is too broad | "Add an exclude word for [word] in Sibyl." |
| The same alert twice | Two scheduled tasks are running | "Check Sibyl's scheduled tasks for duplicates." |
| No summaries | The item came without news links and no AI model is set | Optional: "Help me add an AI model key to Sibyl." |
| TikTok or Google pages out of date | Not read today, the login expired, or the page changed | "Read today's trend pages for Sibyl and tell me if any failed." |
| A YouTube channel error | YouTube's channel feeds sometimes fail for a few hours | Wait; it usually recovers on its own. |

## 9. Before you rely on it

Ask your agent: "Run the Sibyl check, collect once, check alerts without sending, and make a test briefing." All of these should be true:

- The self-check shows no MISS.
- The snapshot is saved.
- The alert check finishes.
- The briefing file is written.

After that, the scheduled tasks keep it running.

## Credits

Sibyl System Hotspot Monitor v1.3.20 and its usage manual are by Misaka Studio (MIT License): <https://github.com/liray0919/Sibyl-System-Hotspot-Monitor>. This version keeps its briefing format and broadcast method and changes the sources, topics and language for the Social Media AI Workflow Library, a non-commercial project.
