#!/usr/bin/env node

// Saves one key, token or webhook address in sibyl/data/.env, so that it never passes through a
// chat with an agent. The person runs this in their own terminal and pastes at a prompt that does not
// show the value, only how many characters arrived; the agent never sees it. Running it again
// replaces the old value, except that a value which does not look right does not replace one that
// does without the person's yes. Other lines are kept, and only the person's account can read the file.
//
// Usage: node scripts/save-secret.js <name>
//   youtube        SIBYL_YOUTUBE_API_KEY     YouTube search
//   x              SIBYL_X_BEARER_TOKEN      X trends
//   ai             SIBYL_AI_API_KEY          AI explanations
//   slack          SIBYL_SLACK_WEBHOOK       a Slack channel
//   discord        SIBYL_DISCORD_WEBHOOK     a Discord channel
//   telegram       SIBYL_TELEGRAM_BOT_TOKEN  a Telegram bot
//   webhook        SIBYL_REPORT_WEBHOOK      WeCom, or any other webhook
//   alert-webhook  SIBYL_ALERT_WEBHOOK       alerts in a separate place
//   SIBYL_...      any other Sibyl variable
// Briefings go to every place that is saved; alerts go there too unless alert-webhook is saved.
// --remove deletes a saved value, for example to stop sending to a place. It asks for nothing, so an
// agent may run it. Saving needs a terminal, so an agent cannot answer the prompt in the person's
// place. --from-stdin reads the first line of standard input instead: for tests, and for an agent
// that set up Telegram, Slack or Discord for the person and pipes the copied token or address from
// the clipboard without showing it (AGENTS.md, "Saving a key").

const { envFilePath, readEnvValues, removeEnvValue, writeEnvValue } = require('./lib/env-file');
const { readHidden, readLine, readVisible } = require('./lib/prompt');
const { getDataDir } = require('./lib/snapshot-store');

const WEBHOOK = /^https:\/\/\S+$/;
const SECRETS = {
  youtube: { name: 'SIBYL_YOUTUBE_API_KEY', label: 'YouTube key', shape: /^AIza[0-9A-Za-z_-]{30,}$/, hint: 'Google keys start with "AIza".' },
  x: { name: 'SIBYL_X_BEARER_TOKEN', label: 'X Bearer Token', shape: /^AAAA\S{20,}$/, hint: 'X Bearer Tokens start with "AAAA".' },
  ai: { name: 'SIBYL_AI_API_KEY', label: 'AI API key', shape: /^\S{16,}$/, hint: 'An API key is one long code with no spaces.' },
  slack: { name: 'SIBYL_SLACK_WEBHOOK', label: 'Slack webhook address', shape: /^https:\/\/hooks\.slack\.com\/\S+$/, hint: 'Slack webhook addresses start with "https://hooks.slack.com/".' },
  discord: { name: 'SIBYL_DISCORD_WEBHOOK', label: 'Discord webhook address', shape: /^https:\/\/(discord|discordapp)\.com\/api\/webhooks\/\S+$/, hint: 'Discord webhook addresses start with "https://discord.com/api/webhooks/".' },
  telegram: { name: 'SIBYL_TELEGRAM_BOT_TOKEN', label: 'Telegram bot token', shape: /^\d+:[A-Za-z0-9_-]{20,}$/, hint: 'Bot tokens look like 123456789:AA… .' },
  webhook: { name: 'SIBYL_REPORT_WEBHOOK', label: 'webhook address', shape: WEBHOOK, hint: 'Webhook addresses start with "https://".' },
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

function looksRight(secret, value) {
  return !secret.shape || secret.shape.test(value);
}

async function main() {
  const args = process.argv.slice(2);
  const fromStdin = args.includes('--from-stdin');
  const secret = resolveSecret(args.find(arg => !arg.startsWith('--')));
  if (!secret) {
    console.log('Usage: node scripts/save-secret.js <youtube | x | ai | slack | discord | telegram | webhook | alert-webhook | SIBYL_NAME> [--remove]');
    process.exit(2);
  }
  const dataDir = getDataDir();

  if (args.includes('--remove')) {
    console.log(removeEnvValue(dataDir, secret.name)
      ? `Removed ${secret.name} from ${envFilePath(dataDir)}.`
      : `${secret.name} was not saved, so there was nothing to remove.`);
    return;
  }
  if (!fromStdin && !process.stdin.isTTY) {
    console.log('Run this in your own terminal: it asks you to paste the value there, so that it never goes through a chat.');
    process.exit(2);
  }

  console.log(`Paste your ${secret.label}, then press Return. It is not shown on screen.`);
  let value;
  try {
    value = fromStdin ? await readLine(process.stdin) : await readHidden(process.stdin, process.stdout);
  } catch (error) {
    console.log('Cancelled. Nothing was saved.');
    process.exit(1);
  }
  value = String(value || '').trim();
  if (!value) {
    console.log('Nothing was pasted, so nothing was saved.');
    process.exit(1);
  }

  // A wrong paste (something else left on the clipboard) must not replace a value that works.
  const current = readEnvValues(dataDir)[secret.name] || '';
  if (!looksRight(secret, value) && current && looksRight(secret, current)) {
    console.log(`This does not look like a ${secret.label}. ${secret.hint} The one saved now does.`);
    const answer = fromStdin
      ? ''
      : (await readVisible('Replace it anyway? Type y and press Return, or press Return to keep the saved one: ')).trim().toLowerCase();
    if (answer !== 'y' && answer !== 'yes') {
      console.log('Nothing was changed. Copy the right value and run this command again.');
      process.exit(1);
    }
  }

  writeEnvValue(dataDir, secret.name, value);
  console.log(`Saved as ${secret.name} in ${envFilePath(dataDir)}. Only your account can read that file.`);
  if (!looksRight(secret, value)) {
    console.log(`Check: this does not look like a ${secret.label}. ${secret.hint} If it is wrong, run this command again.`);
  }
  console.log('Now tell your agent that it is saved. Do not paste the value into the chat.');
}

if (require.main === module) main();

module.exports = { SECRETS, resolveSecret };
