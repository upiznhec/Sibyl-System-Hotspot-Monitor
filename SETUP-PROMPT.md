# Setup request for your agent

Copy the text below, fill in the parts in brackets, and send it to your AI agent. The agent needs to be able to run commands, edit files and use a web browser.

```text
Please set up Sibyl, a trend monitor, for me. Download it from https://github.com/upiznhec/Sibyl-System-Hotspot-Monitor and follow the instructions for agents in its AGENTS.md file.

About me:
- What I want to track: [for example: beauty trends in the US, especially sunscreen]
- Country: [US]
- Time zone: [America/New_York]
- Hours to watch: [10:00 to 22:00]
- Where to send briefings: [Slack / Discord / WeCom webhook / Telegram / none, save them as files]
- AI model for summaries: [none / I will give you an OpenAI-compatible key]

Before scheduling anything, show me the topics, keywords, exclude words and the category you chose on each platform, and wait for my OK.
Never type my passwords. If a page needs a login, open it and let me log in myself.
When you are done, run the Sibyl check and a test briefing, and show me both.
```

The guide in [docs/guide.md](docs/guide.md) explains what the agent will do and what the briefings look like.
