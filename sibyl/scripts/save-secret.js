#!/usr/bin/env node

// Saves one key, token or webhook address in sibyl/data/.env, so that it never passes through a
// chat with an agent. The person runs this in their own terminal and pastes at a prompt that shows
// nothing; the agent never sees the value. Running it again replaces the old value; other lines are
// kept, and only the person's account can read the file.
//
// Usage: node scripts/save-secret.js <name>
//   youtube        SIBYL_YOUTUBE_API_KEY     YouTube search
//   x              SIBYL_X_BEARER_TOKEN      X trends
//   ai             SIBYL_AI_API_KEY          AI explanations
//   telegram       SIBYL_TELEGRAM_BOT_TOKEN  Telegram bot
//   webhook        SIBYL_REPORT_WEBHOOK      Slack, Discord or WeCom: briefings
//   alert-webhook  SIBYL_ALERT_WEBHOOK       alerts in another channel
//   SIBYL_...      any other Sibyl variable
// It needs a terminal, so an agent cannot run it in the person's place. For scripts and tests,
// --from-stdin reads the first line of standard input instead.

const { envFilePath, writeEnvValue } = require('./lib/env-file');
const { readHidden, readLine } = require('./lib/prompt');
const { getDataDir } = require('./lib/snapshot-store');

const WEBHOOK = /^https:\/\/\S+$/;
const SECRETS = {
  youtube: { name: 'SIBYL_YOUTUBE_API_KEY', label: 'YouTube key', shape: /^AIza[0-9A-Za-z_-]{30,}$/, hint: 'Google keys start with "AIza".' },
  x: { name: 'SIBYL_X_BEARER_TOKEN', label: 'X Bearer Token', shape: /^AAAA\S{20,}$/, hint: 'X Bearer Tokens start with "AAAA".' },
  ai: { name: 'SIBYL_AI_API_KEY', label: 'AI API key', shape: /^\S{16,}$/, hint: 'An API key is one long code with no spaces.' },
  telegram: { name: 'SIBYL_TELEGRAM_BOT_TOKEN', label: 'Telegram bot token', shape: /^\d+:[A-Za-z0-9_-]{20,}$/, hint: 'Bot tokens look like 123456789:AA… .' },
  webhook: { name: 'SIBYL_REPORT_WEBHOOK', label: 'webhook address for briefings', shape: WEBHOOK, hint: 'Webhook addresses start with "https://".' },
  'alert-webhook': { name: 'SIBYL_ALERT_WEBHOOK', label: 'webhook address for alerts', shape: WEBHOOK, hint: 'Webhook addresses start with "https://".' }
};

function resolveSecret(arg) {
  const key = String(arg || '').trim();
  if (SECRETS[key.toLowerCase()]) return SECRETS[key.toLowerCase()];
  if (/^SIBYL_[A-Z0-9_]+$/.test(key)) {
    return Object.values(SECRETS).find(entry => entry.name === key) || { name: key, label: key, shape: null, hint: '' };
  }
  return null;
}

async function main() {
  const args = process.argv.slice(2);
  const fromStdin = args.includes('--from-stdin');
  const secret = resolveSecret(args.find(arg => !arg.startsWith('--')));
  if (!secret) {
    console.log('Usage: node scripts/save-secret.js <youtube | x | ai | telegram | webhook | alert-webhook | SIBYL_NAME>');
    process.exit(2);
  }
  if (!fromStdin && !process.stdin.isTTY) {
    console.log('Run this in your own terminal: it asks you to paste the value there, so that it never goes through a chat.');
    process.exit(2);
  }

  const dataDir = getDataDir();
  process.stdout.write(`Paste your ${secret.label}, then press Return. It will not show on screen: `);
  let value;
  try {
    value = fromStdin ? await readLine(process.stdin) : await readHidden(process.stdin, process.stdout);
  } catch (error) {
    console.log('Cancelled. Nothing was saved.');
    process.exit(1);
  }
  if (fromStdin) process.stdout.write('\n');
  value = String(value || '').trim();
  if (!value) {
    console.log('Nothing was pasted, so nothing was saved.');
    process.exit(1);
  }

  writeEnvValue(dataDir, secret.name, value);
  console.log(`Saved as ${secret.name} in ${envFilePath(dataDir)}. Only your account can read that file.`);
  if (secret.shape && !secret.shape.test(value)) {
    console.log(`Check: this does not look like a ${secret.label}. ${secret.hint} If it is wrong, run this command again.`);
  }
  console.log('Now tell your agent that it is saved. Do not paste the value into the chat.');
}

if (require.main === module) main();

module.exports = { SECRETS, resolveSecret };
