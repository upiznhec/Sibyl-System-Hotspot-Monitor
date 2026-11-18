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

Result (2026-11-15, in Graph API Explorer, with the person's own app in development mode and no App Review). The app used the "Manage messaging & content on Instagram" use case with the Facebook login setup, the permissions `instagram_basic`, `instagram_manage_insights`, `pages_show_list`, `pages_read_engagement` and `business_management`, and the Instagram Public Content Access feature, all marked "Ready for testing". The token was approved for the person's Facebook Page and its linked Instagram professional account.

| Request | Result |
| --- | --- |
| `me/accounts?fields=name,instagram_business_account` | Empty until the Page was chosen in the approval pop-up; then the Page and its Instagram account ID. |
| `<ig-user-id>?fields=business_discovery.username(nba){followers_count,media_count,media.limit(5){caption,like_count,comments_count,view_count,timestamp,permalink}}` | Works: 87,915,984 followers, 109,055 posts, and the latest posts with caption, likes, comments, time and link (in 0.7 s). |
| `ig_hashtag_search?user_id=<ig-user-id>&q=sunscreen` | Works: the hashtag's ID. Each account may look up 30 different hashtags in 7 days. |
| `<hashtag-id>/top_media?user_id=<ig-user-id>&fields=caption,like_count,comments_count,media_type,permalink,timestamp` | Works: the hashtag's top posts with caption, counts, type and link (in 3.8 s). |

So both Business Discovery and hashtag search work for the app's own users without App Review. Not yet checked: `view_count` on a Reel, `recent_media`, and a long-lived token for scheduled runs (the Explorer's token lasts about an hour).

When the agent created the app and changed its permissions in its own browser, Facebook logged the person out of that browser, then of Chrome and their phone, until a known device approved the login. The person then did every Meta step in their own Chrome. Have the person do Meta steps in the browser they normally use.

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

### 2026-11-15: Claude (desktop app, Code tab), macOS

Same setup request as the Codex test. The copy tested was commit fc6afc8. A first run with Fable 5.2 was stopped by the person at the YouTube key, which the agent asked them to paste into the chat; the full run used Sonnet 5.5. Both sessions ran in Auto mode, so approving each command was not tested.

Result: installed, configured and scheduled in about 64 minutes, about 25 of them the person's own steps (TikTok login 4, YouTube key 14, X token 5). All four sources were read live (319 items), the self-check had no required item missing, and the test briefing had 15 events. Cron ran on its own from 15:20 and wrote the 16:00 briefing. A daily page-reading task in the Claude app, built afterwards, refreshed all six pages in a test run. X cost US$0.02 in tests and about US$0.27 to 0.36 a day after; YouTube was free. The setup session used about 0.9M new input tokens, 67M cached input tokens and 0.37M output tokens; each daily reading run uses about 1.7M input tokens, mostly cached.

| What happened | Cause | Fix |
| --- | --- | --- |
| The agent asked the person to paste the YouTube key into the chat | AGENTS.md asked for keys, tokens and webhook addresses in the chat in nine places, and CLAUDE.md said to ask for keys in a chat message | `scripts/save-secret.js` (commit ca5e7c1): the person pastes at a hidden prompt in their own terminal. AGENTS.md "Keys and logins", CLAUDE.md, the guide and the setup request. |
| Signed in to TikTok in Safari, the person had to sign in again in the agent's browser; they would not sign in to Google there, and the agent could only look at Safari | AGENTS.md had the agent open every login page in its own browser | AGENTS.md "Keys and logins": one-time account steps in the person's own browser; for daily pages, their browser or the sign-in brought over first. Task page: request, step 4, "If it goes wrong". |
| X returned trend names only, so X counts are 0 and the 50K-posts alert cannot fire | The pay-per-use trends endpoint returns no post counts | X items rank by position; the count stays unknown and is not shown as 0; AGENTS.md says the 50K limit does not apply. |
| Generic Explore topics ("Brand", "Why Would You?") and #routine led the briefing after sharing a word with a YouTube video | Topic confirmation counted a supporting source as a second source and its keywords | Only main sources confirm list items (`confirmedForTopic`). |
| Only 2 of 10 events in the first briefing were about sunscreen, the person's focus | Explore items are scored by percentage rise, and a keyword adds little | Open; needs a decision on weighting |
| 11 of 15 events read "No reliable summary yet" without AI | Explore items carry no news links | Open |
| The first scheduled briefing marked every event "also in the previous briefing" | `sibyl.js --print --no-push` updated the history | A dry run leaves the history alone. |
| The agent wrote its own page extractor and a checker that writes `pages.json` safely and keeps yesterday's section when a page fails | "Reading the daily pages" had no tool and no failure path; in a narrow window Google serves a mobile layout whose table holds the unfiltered list | `scripts/save-pages.js` checks each page and keeps the last list when one fails; AGENTS.md says how to read the pages. |
| The self-check warned about push targets with files only, and always about the daily reading | `check-deploy.js` | Files only gives one OK line; the daily reading line says which pages are out of date. |
Also found: X was asked about every 40 minutes instead of 30, because a cached result counted as fresh a few seconds too long; the cache now counts from the request's start and is due 2 minutes early.

Afterwards (2026-11-15), the reading intervals were set per page: Google's Trending Now every hour, TikTok and Explore once a day (`everyHours`; `save-pages.js --due`), X every 10 minutes, YouTube search every hour, Wikipedia once a day when Wikimedia publishes the list. TikTok stayed daily because its list was identical in two reads 100 minutes apart (14:35 and 16:14): the same 100 hashtags, ranks and view counts.

After this test Instagram became an optional source: `adapters/instagram-adapter.js` (hashtags and accounts, about once an hour) and `scripts/instagram-token.js` (turns the Explorer's token into a lasting one in `data/.env`). Tested against a fake Graph API (`test-instagram.js`); the first live run is part of the sports test.

### 2026-11-16: briefing push to Telegram, Discord and Slack (Claude desktop app, macOS)

The copy tested was commit 08906f6, with a test data folder (`sibyl/data`) made from `config.example.json`. The topic was changed to Sports and `report.requireSeedPlatforms` was turned off, so that the test briefing had items (UFC 334 and one watch-list item). The person made a Discord server and a Slack workspace (free plan) for the test and used their own Telegram account. The agent worked in the Telegram, Discord and Slack desktop apps through computer use, and in the person's Chrome through the Claude extension; the person pasted each secret at a `save-secret.js` prompt.

Result: `sibyl.js --push` reached all three, one at a time, between 23:52 and 00:22. Telegram: the agent made the bot in BotFather and left that chat as soon as it had sent the username, so the token was not in its screenshots; the person copied the token. Discord: the #general settings, Integrations, Webhooks, Create Webhook, renamed Sibyl, Copy Webhook URL (Discord does not show the address). Slack: the desktop app cannot make a webhook, so the agent made an app on api.slack.com with only the `incoming-webhook` scope. "Create and Install" did not finish; Add New Webhook on the app's Incoming Webhooks page opened the consent page in the same tab. That page shows the address after Allow, so the agent did not look at it and the person clicked Copy. The messages then appear in every Slack app. Bold text, links and the watch list were right in all three. About 20 minutes were lost because Claude Code's auto-mode safety check returned no verdict about 15 times; the person then turned Auto mode off.

| What happened | Cause | Fix |
| --- | --- | --- |
| getUpdates returned nothing for the /start that the Start button sent a minute after the bot was made; a "hi" sent later was returned | Not known | AGENTS.md already has the person send any message, such as "hi"; it now says why. |
| The person reported the Discord address saved while the prompt was still waiting for the paste | `save-secret.js` showed nothing after a paste | A line under the question counts the characters received and asks for Return (`lib/prompt.js`); tested in a pseudo-terminal. |
| A second, accidental run of `save-secret.js webhook` waited at the prompt; pasting the wrong text there would have replaced the saved Discord address | `save-secret.js` saved any value and only warned when it did not look right | A value that does not look right no longer replaces one that does unless the person types y; `slack` and `discord` check the address. |
| Discord showed `---` as text and added a Wikipedia preview card under the briefing | Discord has no horizontal rule, and webhook messages show link previews | Discord gets a drawn line, and messages go with link previews off and no mentions (`flags: 4`, `allowed_mentions`); seen in Discord at 01:08. |
| With Telegram as the channel, the self-check still warned about webhooks in the scheduled task and about separate alert and briefing webhooks | `check-deploy.js` checked webhooks whatever the channel | One "Briefing push" line names every place and one "Alert push" line says where alerts go; the task-command lines appear only when no place is saved; "No double pushes" is OK with the schedule from `schedule.js`. |
| A saved webhook replaced Telegram as the briefing target; briefings go to one place only | `reportTarget` picked one target | Briefings go to every place saved (`save-secret.js slack`, `discord`, `telegram`, `webhook`), alerts too unless `alert-webhook` is saved; `--remove` stops one. `sibyl.js` reports "Pushed: yes (Slack, Telegram)" or which place failed. |
| For Slack, the agent first pointed to a save prompt still waiting in the terminal instead of giving the command | The agent's mistake; AGENTS.md says to give the command each time | AGENTS.md now says to give the command each time, even if an earlier one may still be waiting. |

Also found while fixing these: alerts did not go to a briefing webhook saved in `data/.env` (only to one in `config.json`), although AGENTS.md said they did; they now go to every briefing place. Fixed after the test, 2026-11-16; then one `sibyl.js --push` reached Discord, Slack and Telegram together ("Pushed: yes (Discord, Slack, Telegram)"), and the Discord address was saved at the new prompt, which counted the characters.

### 2026-11-16 to 17: sports for 24 hours (Claude desktop app, Code tab), macOS

Setup request: "10 of the main sports" in the US (the person changed it from NFL and NBA), America/Los_Angeles, all day from 10:00 on 16 November to 10:00 on 17 November, briefings to Telegram, Slack and Discord, no AI, all six sources. The copy tested was commit c21e6c1. The agent finished the setup at 14:30; the person's guidance during setup and its fixes are in commit 9a80445 and in AGENTS.md, "Known problems from testing". A scheduled task in the Claude app (Sonnet 5.5, in the app's browser pane) read Google's Trending Now list every hour; TikTok and the ten Explore pages were read once, during setup. All times below are America/Los_Angeles.

Result: collection ran 137 of 137 times from 11:10, when the schedule started, to 10:00, and every snapshot from 14:30 held all six sources. A briefing reached all three places every hour from 14:00 (the 12:00 and 13:00 briefings came before the places were saved). Of 35 alerts, 32 were pushed (the other 3 came before the places were saved), and 34 were on topic (the other was the video game NBA 2K27). The page task ran 25 times, once an hour, including at 23:41, just after the computer restarted at 23:40, and every run saved the list. Each reading used a median of about 0.94M tokens, almost all of them for re-reading its instructions and earlier steps.

| What happened | Cause | Fix |
| --- | --- | --- |
| When Google's list was longer than 25 rows (34, 85 and 89 rows in the evening), the task saved only the first 25 | The list shows 25 rows a page, and `save-pages.js` did not check the total | `save-pages.js` refuses a Trending Now list without `total`, and AGENTS.md says to read every page (commit c373bea). Not yet re-tested. |

### 2026-11-16 to 17: world affairs for 24 hours (DeepSeek Harness desktop app 0.2.1-rc.2), macOS

Setup request: international politics and world affairs in the US (wars and conflicts, diplomacy, elections and leaders abroad), America/Los_Angeles, until 10:00 on 17 November, a new Telegram bot and new Slack and Discord channels, no AI, all six sources. The copy tested was commit 9a80445. The model was deepseek-flash, with DeepSeek Harness's own sandbox preset (writes only in the workspace, asks before other actions). The first session was archived by mistake after 6 minutes; the second ran in a new workspace in the home folder, ~/SibylWorld, from 17:14 to 19:52. Its sandbox cannot use crontab, so the person ran the install command in Terminal at 19:50. The setup findings and their fixes are in commits 507b6ad and c373bea and in AGENTS.md, "Known problems from testing". The agent read the pages in its own Chrome window through a debugging port, with scripts it wrote, prompted by a reminder in its session every hour at :45.

Result: collection ran 84 of 85 times from 19:50 to 10:00 (the 23:40 run stopped when the computer restarted), and every snapshot held all six sources. All 16 hourly briefings, 20:00 to 11:00, reached all three places. All 12 alerts were pushed, but only 2 were on topic ("trump-xi summit" and "yemen"); 9 were sports matches, such as "japan vs paraguay" and "tanzania vs nigeria". Of the 14 hourly page readings, Politics was saved in 10 (and once more after the person's message at 23:47) and Law and Government in 3 (and twice more after the person's messages). The readings ran in one long conversation and used a median of about 3.3M tokens each, about 1 to 2 US cents on deepseek-flash.

| What happened | Cause | Fix |
| --- | --- | --- |
| Law and Government was not saved from 02:45 to 08:45, seven runs in a row, and the briefings used the 01:48 list. The agent said Google did not apply the category, proposed dropping the page at 02:53, 03:52 and 04:48, and still blamed Google when the person asked at 08:48 | At 03:48 the agent wrote a new reader that waited until the rows on screen equalled the footer total, which a list longer than 25 rows (Law had about 50) never reaches. It compared the page's footer with its code only after the person said at 08:54 that the page worked in their browser, and then found the cause within a minute | AGENTS.md, "Reading the trend pages": after two failed reads of a page, compare what the page shows with what the reader expects before blaming the site or proposing to drop the page. |
| At 03:52 the agent changed its reminder's text and its reader scripts during a scheduled run, although the reminder said not to change the schedule | AGENTS.md says nothing about changing the page-reading task during a run | AGENTS.md, "The page reading": a run only reads and saves; the agent changes the task only after the person agrees. |
| After the hours ended, the agent ran `schedule.js --remove` at 10:45 without being asked (its sandbox stopped it) while saying it would not remove anything, and at 11:45 it deleted its reminder. Briefings went on every hour, but the page lists were no longer read | The request said "I will ask you to stop it then"; AGENTS.md says how to stop Sibyl but not when | AGENTS.md, "When the person's hours end": tell the person once, change nothing until they say stop, then stop the schedule and the page-reading task together. No end time was added to `schedule.js`. |
| Its fix at 08:55 still saved only the first 25 of about 50 rows | The fix accepts the first page | `save-pages.js` refuses a Trending Now list without `total` (commit c373bea). Not yet re-tested. |
| Eight tabs were open in its window at 08:55 | Its retries opened tabs without closing them | AGENTS.md, "Logins and browsers": close each tab after reading it. |

### Found in both 24-hour tests

| What happened | Cause | Fix |
| --- | --- | --- |
| Most items in each hourly briefing had been in the one before: on average 68% (sports) and 89% (world affairs). Five world items were in all 17 world briefings, and four sports items in 22 to 27 of the 27 sports briefings | The Explore and TikTok lists are read once a day and used for up to 7 days (`pagesMaxAgeHours`), and their items score high every hour. An item already reported is marked "also in the previous briefing" but keeps its score | Open: lower the score of items reported in earlier briefings, or list them in one "still trending" line |
| Single common words led events: "them" (in 11 world briefings) and "found" | A Trending Now query that is a common word joins any post that contains the word | A one-word title that is a common word joins only items with the same title (`lib/clusterer.js`; the word list is in `lib/lang/en.js`). Replayed on the 12:00 snapshot of 17 November, "them" left the world briefing. |
| Post captions became event titles, such as "Thank you so much merab.dvalishvili…" | An event with no search term takes its title from a post | An event takes its name from a search term in it (Google Trends, X or Wikipedia), or else from a caption with its emoji, links and closing hashtags removed, cut at 80 characters (`lib/clusterer.js`, `lib/english-words.js`). |
| Topic-wide exclude words did not apply to alerts | Only the briefing reads `briefingExclude` (`lib/event-relevance.js`); `instant-alerts.js` does not | `instant-alerts.js` skips an item with one of its topic's exclude words (tested in `test-sources.js`). |
| In world affairs, country names as keywords matched sports matches ("japan vs paraguay"), while "vs" as a topic-wide exclude word had dropped the real event "iran attacks bahrain" | A topic-wide exclude word drops the whole event | AGENTS.md, "Mapping topics": exclude words on the country keyword itself, such as `{ "word": "japan", "exclude": ["vs"] }`; they match whole words and stop only that keyword. |

Both tests were stopped at 12:06 on 17 November: both schedules were removed and the Claude task was deleted (its run sessions were archived). DeepSeek had deleted its own reminder at 11:45.

### 2026-11-17: AI and technology, setup and the first hour (Codex in the ChatGPT desktop app 26.1111), macOS

Setup request: AI and technology trends in the US (AI models and products, AI companies, chips, gadgets), America/Los_Angeles, one hour only after setup, briefings to a new Telegram bot and new private Slack and Discord channels, no AI, all six sources. Instagram read accounts only, because the account's 30 hashtag searches for the week had been used in the 24-hour tests. The copy tested was commit e80b107. Codex ran in "Approve for me" mode, the only mode the app offered besides "Full access": "Ask for approval" was greyed out, and there was no "Custom (config.toml)".

Result: Codex downloaded Sibyl, had its plan approved and finished the setup in 58 minutes (14:59 to 15:57), about 18 of them the person's own steps (the YouTube key, the X Bearer Token, the Meta app and token, Slack's Allow, and confirming each test message). Each command that needed the internet or the crontab ran outside the sandbox after Codex asked with a one-line reason, and the automatic review approved every one of these requests. Codex asked before choosing each account, checked the Discord account and the channel ID, and put a placeholder on the clipboard before and after copying each key, so none stayed there. The 16:00 briefing reached Telegram, Slack and Discord, and 9 of its 10 events were on topic. The person then sent the task page's "Remove Sibyl" request: Codex ran the check, removed the schedule, deleted the folder, confirmed that nothing was left, and listed the bots, apps, webhooks and keys still in the person's accounts with how to delete each. The chat used 25.1M tokens, 99% of them cached input.

| What happened | Cause | Fix |
| --- | --- | --- |
| A first try, sent in the app's ChatGPT mode, ran 35 minutes and could not download Sibyl: the automatic review refused `git clone` because "this session disallows command escalation", and Chrome blocked the ZIP | Chats in ChatGPT mode cannot run commands outside the sandbox; chats in Codex mode can | Setup page, Codex step 2: check that the top of the sidebar says Codex before sending. AGENTS.md, "Known problems from testing". |
| `git clone` failed inside the sandbox | The sandbox has no internet and keeps `.git` folders read-only | Codex asked to run it outside the sandbox, as AGENTS.md rule 11 now says (commit e80b107), and the review approved it within 9 seconds |
| The setup used the last 34% of the account's 5-hour Plus window in 36 minutes; Codex then spent the account's purchased credits, 17.47 to 0 in 3 minutes, and stopped with "You've hit your usage limit". When the person typed "continue" a minute later, the window showed 0% used and Codex went on | Other Codex work had used 66% of the window that day; purchased credits are spent automatically when a limit is reached | Setup page, costs: credits are used automatically. AGENTS.md: tell the person before a Codex setup. |
| The automatic review refused Codex's hourly page-reading task as "a persistent daily Codex automation, exceeding the user's narrow request" | The request asked for one hour only | No change needed for a one-hour trial (the pages read at setup covered it). AGENTS.md: if a review refuses the task, tell the person and ask them. |
| The person copied the Telegram token in BotFather | Telegram's Mac app did not let Codex click the copy button | AGENTS.md already lets the person copy it |
| "pfizer stock" reached the top 10 from Explore's rising searches for "semiconductor" | Explore's rising searches are wider than the keyword | Open: check in a longer test |

Also seen: Google Cloud opened in a Chrome profile with a school account and showed its sign-in page, and Codex asked which account to use, as AGENTS.md says; X refused a new app at its limit for the project, and the person deleted an old app first.
