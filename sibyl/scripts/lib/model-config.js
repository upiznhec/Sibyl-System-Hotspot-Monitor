// Model settings for the optional AI steps (event merging, relevance check, summaries).
// Any OpenAI-compatible chat completions API works. Settings come from the environment
// (preferred for the key) or from config.ai. The AI steps need both a key and a model name;
// without them every AI step uses the rule-based fallback, as v1.3.20 does when no model
// is configured.
//
// Environment variables: SIBYL_AI_API_KEY, SIBYL_AI_BASE_URL, SIBYL_AI_MODEL
// config.ai: { "baseUrl": "https://api.openai.com/v1", "model": "<model name>", "apiKey": "" }

const DEFAULT_BASE_URL = 'https://api.openai.com/v1';

// What is set and where the key came from. The deploy self-check reports this without the key.
function readModelSettings(config = {}) {
  const ai = config.ai || {};
  let keyFrom = '';
  if (process.env.SIBYL_AI_API_KEY) keyFrom = 'SIBYL_AI_API_KEY';
  else if (ai.apiKey) keyFrom = 'config.ai.apiKey';
  return {
    apiKey: process.env.SIBYL_AI_API_KEY || ai.apiKey || '',
    keyFrom,
    baseUrl: process.env.SIBYL_AI_BASE_URL || ai.baseUrl || DEFAULT_BASE_URL,
    // "models: [{ id }]" is the provider format v1.3.20 read from openclaw.json; it still works.
    model: process.env.SIBYL_AI_MODEL || ai.model || ai.models?.[0]?.id || ''
  };
}

// The config that callAIModel expects, or null when AI is not set up.
function resolveModelConfig(config = {}) {
  const { apiKey, baseUrl, model } = readModelSettings(config);
  // No default model works with every provider, so a key without a model leaves AI off.
  if (!apiKey || !model) return null;
  return { baseUrl, apiKey, models: [{ id: model }] };
}

// v1.3.20 always posted to /v1/chat/completions on the base URL's host. Keep that when the
// base URL has no path, and append /chat/completions to the path otherwise, so that providers
// with other base paths also work. A full endpoint URL is used as it is.
function chatCompletionsPath(baseUrl) {
  const pathname = new URL(baseUrl).pathname.replace(/\/+$/, '');
  if (!pathname) return '/v1/chat/completions';
  return pathname.endsWith('/chat/completions') ? pathname : `${pathname}/chat/completions`;
}

module.exports = {
  DEFAULT_BASE_URL,
  chatCompletionsPath,
  readModelSettings,
  resolveModelConfig
};
