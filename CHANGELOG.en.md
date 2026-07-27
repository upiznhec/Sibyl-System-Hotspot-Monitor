# Changelog

[中文](CHANGELOG.zh-CN.md) | [English README](README.en.md)

Author: Misaka Studio

All notable changes to Sibyl System Hotspot Monitor are recorded here.

## 1.3.20 - 2026-07-27

- Added positive esports context and exclusions for `Cat`, `Fly`, `Hero`, `TT`, `AG`, and `WE` to prevent exam, flight, movie, voice-app, brand, and song false positives.
- Added AI terms covering artificial general intelligence, generative AI, context windows, Vibe Coding, and its Chinese equivalent.
- Expanded model and product coverage for DeepSeek's Chinese name, Mistral, Perplexity, ModelBest, Apple Intelligence, Microsoft Copilot, Scale AI, and Vidu.
- Added H100 and B200 plus contextual GPU, AMD, TSMC, and chip-restriction rules.
- Added Sam Altman, Geoffrey Hinton, Chinese name variants, and an AI-contextual Elon Musk entry.
- Added AI-event terms including WAIC, the World Artificial Intelligence Conference, BAAI Conference, NVIDIA GTC, NeurIPS, and OpenAI DevDay, with AI context required for broader technology conferences.
- Added regression coverage for the expanded AI terms, contextual rules, and short English esports false positives.
- Upgraded the shared keyword library to 1.2.1 with 618 entries.

## 1.3.19 - 2026-07-27

- Added `requireAny` positive-context rules to keyword objects and unified them with existing `exclude` handling.
- Allowed Chinese entities of three or more characters to match inside continuous Chinese titles.
- Fixed the duplicate plain-string `花海` entry that bypassed its exclusion rules.
- Tightened ambiguous terms across AI, games, esports, and sports.
- Added AI coding and agents, AI science, AI safety and governance, and `ai_key_person` keyword groups.
- Expanded model, product, generative media, infrastructure, robotics, and key-person coverage.
- Retained existing LPL, LCK, and KPL abbreviations while adding stable full club names.
- Included AI phones, PCs, glasses, and other AI technology devices while retaining low-relevance marketing exclusions.
- Added regression coverage for context requirements, exclusions, people, short brands, full team names, and existing categories.
- Upgraded the shared keyword library to 1.2.0.

## 1.3.18 - 2026-07-27

- Added AI as a first-class monitoring category alongside games, esports, and sports while retaining the existing Weibo, Douyin, Tieba, and Hupu sources.
- Added five AI keyword groups covering general concepts, models and products, generative content, compute and chips, and embodied intelligence and robotics.
- Allowed AI topics in both ranked reports and instant alerts, with a dedicated category icon.
- Extended Elixir summary and commercial-filter prompts so AI industry developments are treated as target content.
- Added consumer-product and marketing exclusions for the broad AI keyword to reduce false positives.
- Added regression coverage for AI classification, existing-category compatibility, noise exclusion, and report rendering.
- Upgraded Elixir to 3.7.0 and the shared keyword library to 1.1.0.

## 1.3.17 - 2026-07-03

- Removed collection, filtering, event-count, seed-hit, and trend statistics from the report header.
- Started the ranked report immediately after the broadcast timestamp.
- Kept category, title, score, and community heat in Community Watch while removing the redundant seed-platform miss suffix.
- Added a report-format regression test.

## 1.3.16 - 2026-07-03

- Added native Douyin hot-list context by collecting related same-category and same-keyword topics from the current snapshot.
- Made Douyin context the first instant-summary source instead of querying Weibo first.
- Reused already collected snapshot data without extra network or OpenClaw browser requirements.
- Added an optional Douyin topic-page parser while disabling direct page requests by default because real pages return a JavaScript challenge.
- Added `douyin-hot-context-elixir` cache provenance and evidence counts.

## 1.3.15 - 2026-07-03

- Added structured event fingerprints for competition, stage, discipline, and factual anchors.
- Added deterministic merging for strongly matching match fingerprints when summaries or model grouping are incomplete.
- Made discipline conflicts a hard split, preventing singles and mixed doubles from merging on a shared athlete.
- Normalized equivalent round-of-16 and qualification wording.
- Added controlled coverage for merging groups 1+2+6 and 3+4 while keeping group 5 separate.

## 1.3.14 - 2026-07-03

- Replaced full-board semantic merge calls with focused candidate batches of at most eight events.
- Grouped candidates using both shared entities and factual-summary anchors, including differently titled topics from the same match.
- Added bounded post-first-pass summaries before rebuilding match-focused convergence groups.
- Reduced partial merges caused by long candidate lists and per-member evidence exhausting model output.
- Extended convergence coverage to verify that a ball-chip topic joins the related Ronaldo match event without a shared title entity.

## 1.3.13 - 2026-07-03

- Limited pre-merge factual summaries to likely same-entity groups, with bounded candidate, retrieval, and time budgets.
- Added a second convergence merge for remaining group-to-group and group-to-topic fragments.
- Allowed title-only fallback after the pre-summary deadline instead of blocking the full report.
- Added explicit Weibo intelligent-search diagnostics for credentials, rejection, empty results, invalid responses, request errors, and timeouts.
- Reused one authentication check per instant-alert run and logged per-topic fallback reasons.
- Added a convergence regression test covering match results, in-match incidents, and direct aftermath.

## 1.3.12 - 2026-07-03

- Generated factual summaries for initial event clusters before semantic event merging.
- Supplied both topic titles and factual summaries to the merge model, improving short, emotional, and post-match topic matching.
- Preserved member summaries in merged events and synthesized the final event summary through Elixir.
- Avoided duplicate network retrieval when all member summaries are available and invalidated final-summary caches when member evidence changes.
- Added a no-push regression test covering result, embrace, and tears topics from the same match.

## 1.3.11 - 2026-07-02

- Added post-clustering game-event nature classification.
- Filtered routine updates, maintenance, launches, official campaigns, benefits, and promotion.
- Restored controversy, incidents, failures, refunds, penalties, infringement, and genuine organic breakouts.
- Stopped treating ordinary version discussion or cross-platform presence as breakout evidence.
- Added auditable relevance and filtering metadata without changing report formatting.

## 1.3.10 - 2026-07-02

- Required a concrete shared event anchor and explicit relation type for semantic merging.
- Required per-member evidence linking every topic to the shared event.
- Rejected generic keyword, category, and same-entity justifications.
- Prevented model-reported high confidence from bypassing deterministic validation.
- Persisted merge anchors, relation types, and evidence for auditing.

## 1.3.9 - 2026-07-02

- Extracted the proven Weibo intelligent-search HTTP integration into a shared module.
- Added cache, direct Weibo search, Elixir, and dedicated-browser fallback ordering.
- Removed OpenClaw `weibo_search/weibo_status` from the default summary route.
- Stopped querying aliases after the first successful Weibo result.
- Limited the dedicated retriever to browser and web-fetch fallback work.
- Added a no-push single-topic Weibo summary test.

## 1.3.8 - 2026-07-02

- Added `weibo_status` polling for asynchronous `weibo_search` tasks.
- Limited polling to three checks and 15 seconds before browser fallback.
- Treated pending analysis as non-tripping health state.
- Excluded pending analysis from the 30-minute failure cache.
- Required simplified query variants after an exact-topic miss.

## 1.3.7 - 2026-07-02

- Moved retrieval to a dedicated `sibyl-retriever` OpenClaw agent.
- Removed ineffective session-id isolation and the requirement to read Agent Reach files.
- Added `weibo_search` with `browser + web_fetch` fallback routing.
- Normalized Sina Weibo deep links into HTTPS detail URLs.
- Counted distinct Weibo publishers conservatively and capped Weibo-only confidence at medium.
- Separated dedicated-agent health from historical main-agent health.
- Added dedicated-agent deployment checks.

## 1.3.6 - 2026-07-01

- Added query planning across entities, actions, stages, dates, aliases, and bilingual terms.
- Added timeline-aware evidence checks for sports, esports, and game updates.
- Rejected redirect and aggregation pages while requiring fallback routing after irrelevant results.
- Added supported, partially supported, contradicted, and unresolved claim states.
- Allowed conservative summaries from verified subsets without restating unsupported claims.
- Added a 30-minute negative retrieval cache.

## 1.3.5 - 2026-07-01

- Serialized OpenClaw Agent subprocesses to avoid concurrent exit-code-1 failures.
- Added one delayed retry for Agent exit code 1.
- Allowed one confirmation call while Agent health is `suspect`.
- Kept Elixir work concurrent while requiring two real failures before circuit opening.

## 1.3.4 - 2026-07-01

- Added a trusted single-source exception while retaining strict handling for ordinary single sources.
- Added specific evidence rejection reasons.
- Added two-worker report-summary retrieval with a 180-second round budget.
- Prevented concurrent health-state updates from overwriting one another.
- Added a short configurable timeout for deployment smoke tests.

## 1.3.3 - 2026-07-01

- Prevented `agent_json_unparseable` from opening the Agent transport circuit.
- Separated successful Agent process execution from output and evidence validation.
- Allowed automatic recovery from legacy parse-triggered open states.
- Improved extraction from mixed logs, multiple JSON objects, and nested payload text.

## 1.3.2 - 2026-07-01

- Separated Agent availability, retrieval-route validation, and evidence acceptance.
- Normalized Agent Reach route aliases such as `web-search-skill`.
- Recorded successful Agent transport and JSON parsing before evidence validation.
- Added exact route identifier and confidence-level instructions to the retrieval prompt.
- Kept the minimum accepted evidence confidence at `medium`.

## 1.3.1 - 2026-07-01

- Fixed an Elixir request-options naming conflict that interrupted summary generation.
- Strengthened Agent Reach JSON-only output requirements.
- Added compatibility fallback between OpenClaw `--session-id` and `--session-key`.
- Persisted successful retrieval health before downstream summarization.
- Isolated per-event summary failures and incrementally saved successful summaries.
- Raised the default per-report retrieval limit from 6 to 10.
- Upgraded Elixir to 3.6.1.

## 1.3.0 - 2026-07-01

- Replaced topic-term reporting with semantic hotspot event threads.
- Merged alternate descriptions, direct outcomes, responses, aftermath, and dependent discussion on the same timeline.
- Added concrete canonical titles built from a core fact and representative follow-up fact.
- De-duplicated same-platform alias scoring while keeping a capped alias bonus.
- Added stable event identity across changing topic terms.
- Combined selection basis, platform performance, and trend into one `热度表现` field.
- Removed action suggestions and replaced them with sourced event summaries.
- Upgraded Elixir to 3.6.

## 1.2.8 - 2026-07-01

- Added an `openclaw agent --json` bridge for Agent Reach retrieval when Weibo intelligent search has no content.
- Limited each retrieval task to one primary and one fallback capability.
- Required at least two independent sources and medium confidence before passing evidence to Elixir.
- Added retrieval route, confidence, and source URLs to the summary cache.
- Disabled the ungrounded plain-model "AI search summary" fallback by default.
- Upgraded Elixir to 3.5 with multi-source evidence support and conflict omission.

## 1.2.7 - 2026-07-01

- Added `scripts/retrieval-health.js` for retrieval capability state management.
- Added persistent `retrieval-health.json` states for healthy, suspect, open, half-open, and disabled capabilities.
- Added 48-hour circuit breaks for confirmed ordinary failures and 96-hour breaks for failed recovery, authentication, or anti-bot failures.
- Topic misses and single-page failures no longer trip an entire retrieval backend.
- Added retrieval capability status to the deployment self-check.

## 1.2.6 - 2026-06-22

- Fixed webhook self-checks to distinguish current process environment variables from OpenClaw task payload injection.
- Added task command inspection through `--task-command`, `SIBYL_OPENCLAW_TASK_COMMANDS`, or deployment configuration.

## 1.2.5 - 2026-06-22

- Added `scripts/check-deploy.js` for post-deployment self-checks.
- The self-check covers webhooks, Weibo intelligent search, AI model configuration, system time zone, data directory, and manual confirmation items.
- The self-check only prints configured/missing status and does not expose real webhooks, AppSecrets, or model keys.

## 1.2.4 - 2026-06-22

- Added environment-variable support for Weibo intelligent search credentials and endpoints.
- Added `alerts.weiboAI` configuration for appId, appSecret, authUrl, and searchUrl.
- Kept `/root/.openclaw/openclaw.json` `channels.weibo` as a backward-compatible fallback.

## 1.2.3 - 2026-06-22

- Simplified public report score labels into three reader-facing levels: `观察`, `关注后续`, and `强热点`.
- Clarified that report scores are ranking indicators, not absolute cross-platform heat totals.
- Prepared the project for GitHub publication as `Sibyl System Hotspot Monitor`.

## 1.2.2 - 2026-06-22

- Added deployment guidance for explicit webhook environment variable injection in scheduled tasks.
- Added system time zone consistency checks for the Beijing-time reporting window.
- Clarified OpenClaw delivery mode expectations to avoid duplicate pushes.

## 1.2.1 - 2026-06-18

- Added the internal product document for Sibyl System.
- Documented product goals, user scenarios, architecture diagrams, data flow, deployment, reuse guidance, and risks.
- Added sharing notes for product and operational review contexts.

## 1.2.0 - 2026-06-18

- Added independent webhook configuration for instant alerts and hourly reports.
- Improved the alert summary chain with cache, legacy summary reuse, Weibo intelligent search, Elixir summarization, and AI search fallback.
- Added business-category filtering and conservative summary behavior for non-target topics.
- Added AI-assisted handling suggestions for hourly reports with rule-based fallback.

## 1.1.0 - 2026-06-18

- Upgraded to a unified snapshot architecture.
- Added shared 10-minute snapshots for instant alerts and hourly reports.
- Integrated Weibo and Douyin instant alerts into the Sibyl data flow.
- Added recent-snapshot trend analysis for hourly reports.
- Added Tieba and Hupu as supporting community signals.

## 1.0.0 - 2026-06-16

- Initial Sibyl implementation.
- Added multi-platform signal collection from Weibo, Douyin, Tieba, and Hupu.
- Added topic classification, event clustering, scoring, and Markdown report generation.
- Added enterprise WeChat report delivery support.
