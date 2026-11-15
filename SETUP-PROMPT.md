# Setup request for your agent

Copy the text below, fill in the parts in brackets, and send it to your AI agent. The agent needs to be able to run commands, edit files and use a web browser.

Under "Sources to watch", say yes or no to each source. Google Trends, TikTok and Wikipedia are on unless you say no; YouTube search and X trends stay off unless you say yes. If a source needs something from you, your agent asks you when it gets there.

For "Use AI to explain each trend", write no unless you have an API key, a code that lets Sibyl use an AI. Some AI subscriptions include one; if yours does not, you buy credit on the AI company's website.

```text
Please set up Sibyl, a trend monitor, for me. Download it from https://github.com/upiznhec/Sibyl-System-Hotspot-Monitor and follow the instructions for agents in its AGENTS.md file.

About me:
- What I want to track: [for example: beauty trends in the US, especially sunscreen]
- Country: [US]
- Time zone: [America/New_York]
- Hours to watch: [10:00 to 22:00]
- Where to send briefings: [Slack / Discord / WeCom webhook / Telegram / none, save them as files]
- Use AI to explain each trend in one line (optional, needs a paid API key): [no / yes, I have an API key]

Sources to watch:
- Google Trends: [yes / no]
- TikTok Creative Center: [yes / no]
- Wikipedia (needs a web address or email): [yes / no]
- YouTube search (free, needs a Google key): [no / yes]
- X trends (paid, needs an X developer account): [no / yes]

Before scheduling anything, show me the sources, topics, keywords, exclude words and the category you chose on each platform, and wait for my OK.
When you need something from me, such as a login, a key or a link, stop and ask me in this chat. Tell me what it is, why it is needed, whether it costs money, and where to get it.
Never type my passwords. If a page needs a login, open it and let me log in myself.
When you are done, run the Sibyl check and a test briefing, and show me both.
```

The guide in [docs/guide.md](docs/guide.md) explains what the agent will do and what the briefings look like.
