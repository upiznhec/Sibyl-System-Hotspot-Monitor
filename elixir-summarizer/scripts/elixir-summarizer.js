/**
 * Elixir summarizer: writes short event summaries with an optional model.
 *
 * From Sibyl System Hotspot Monitor v1.3.20 by Misaka Studio (Elixir v3.7.0, MIT License).
 * Changed for this fork: English prompts with the same rules (facts from the material only,
 * conflicting details left out, no marketing advice; at most two sentences and 50 words);
 * model settings come from Sibyl's lib/model-config.js (the user's own key, optional).
 * Without a model, the first line of the material is the summary, as in v1.3.20.
 */

const https = require('https');
const http = require('http');
const {
  chatCompletionsPath,
  resolveModelConfig
} = require('../../sibyl/scripts/lib/model-config');
const locale = require('../../sibyl/scripts/lib/locale');

const AI_SUMMARY_PROMPT = `Write a short summary of this trending topic from the material below.

Length: at most two sentences and 50 words.

Rules:
1. Lead with the newest development (today, yesterday) and who or what it involves.
2. Use only facts that the material states. Leave out anything the sources do not support, and drop details where sources disagree.
3. Say what happened and, if the material shows it, why people are searching for it or posting about it.
4. Do not name the sources, add links or describe how the material was found.
5. Do not give marketing advice or suggest content to make.
6. Write plainly; avoid stock phrases such as "sparks discussion" or "goes viral" unless the material says so.

Material:
{content}

Reply with the summary only, without quotes or explanations.`;

const AI_TRUNCATE_PROMPT = `Shorten this summary to at most 50 words and two sentences. Keep the main fact, who or what it involves, and the key result or number; remove background, lists and adjectives. Add nothing new.

Summary:
{content}

Reply with the shortened summary only.`;

const COMMERCIAL_DETECTION_PROMPT = `Decide whether this trending topic is advertising or sponsored promotion rather than news or public discussion.

Title: {title}
Material:
{content}

Categories:
- normal: news, events, public discussion, creator or community activity, or brand news that people discuss on their own (for example a recall, a controversy or a widely discussed launch)
- promotion: an advertisement, sponsored post, coupon, sale or product listing with no news or discussion around it

Reply with JSON only:
{"isCommercial": true or false, "category": "normal" or "promotion", "reason": "a short reason", "confidence": 0.0 to 1.0}`;

const MAX_WORDS = 50;
// A summary that is still a little long after one request to shorten it is accepted.
const MAX_WORDS_AFTER_SHORTENING = 60;

function wordCount(value) {
  return String(value || '').trim().split(/\s+/).filter(Boolean).length;
}

function unquote(value) {
  return String(value || '').replace(/^["']|["']$/g, '').trim();
}

// Material without markup, as sent to the model.
function cleanMaterial(value) {
  return String(value || '')
    .replace(/```wbCustomBlock[\s\S]*?```/g, '')
    .replace(/<media-block>[\s\S]*?<\/media-block>/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\*\*/g, '')
    .replace(/#+\s*/g, '');
}

/**
 * Calls an OpenAI-compatible chat completions API, retrying once by default.
 */
async function callAIModel(prompt, config, maxRetries = 2, options = {}) {
  const model = config?.models?.[0]?.id;
  if (!model) return { success: false, error: 'no model name set' };

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const result = await new Promise(resolve => {
      const data = JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: options.maxTokens || 500,
        temperature: options.temperature ?? 0.3
      });

      const baseUrl = config.baseUrl || 'https://api.openai.com/v1';
      const isHttps = baseUrl.startsWith('https');
      const url = new URL(baseUrl);
      const client = isHttps ? https : http;

      const req = client.request({
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: chatCompletionsPath(baseUrl),
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`,
          'Content-Length': Buffer.byteLength(data)
        }
      }, res => {
        let responseData = '';
        res.on('data', chunk => responseData += chunk);
        res.on('end', () => {
          try {
            const content = JSON.parse(responseData).choices?.[0]?.message?.content;
            resolve(content ? { success: true, content } : { success: false, error: 'empty model reply' });
          } catch (error) {
            resolve({ success: false, error: `could not read the model reply: ${error.message}` });
          }
        });
      });

      req.on('error', error => resolve({ success: false, error: `request failed: ${error.message}` }));
      req.setTimeout(20000, () => {
        req.destroy();
        resolve({ success: false, error: 'request timed out after 20 s' });
      });
      req.write(data);
      req.end();
    });

    if (result.success) return result;
    if (attempt < maxRetries) await new Promise(resolve => setTimeout(resolve, 2000));
  }

  return { success: false, error: 'the model did not answer' };
}

/**
 * Is the topic advertising rather than news or discussion? Without a model: assumed not.
 */
async function detectCommercialContent(content, title, customConfig = null) {
  const notChecked = reason => ({ isCommercial: false, category: 'unknown', reason, confidence: 0 });
  try {
    const modelConfig = customConfig || resolveModelConfig();
    if (!modelConfig || !modelConfig.apiKey) return notChecked('no model set');

    const prompt = COMMERCIAL_DETECTION_PROMPT
      .replace('{title}', title || 'unknown topic')
      .replace('{content}', cleanMaterial(content).trim().substring(0, 2000) || 'no material');
    const result = await callAIModel(prompt, modelConfig);
    if (result.success) {
      const jsonMatch = result.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]);
          return {
            isCommercial: parsed.isCommercial === true || parsed.category === 'promotion',
            category: parsed.category || 'unknown',
            subCategory: parsed.subCategory || null,
            reason: parsed.reason || '',
            confidence: parsed.confidence || 0.5
          };
        } catch (error) {
          console.error('Could not read the advertising check:', error.message);
        }
      }
    }
    return notChecked('the model gave no usable answer');
  } catch (error) {
    console.error('Advertising check failed:', error.message);
    return notChecked('check failed');
  }
}

/**
 * Writes the summary with the model: 5 to 50 words; one request to shorten a longer one.
 * Returns null when there is no model or no usable summary.
 */
async function generateAISummary(content, title = '', customConfig = null) {
  try {
    const modelConfig = customConfig || resolveModelConfig();
    if (!modelConfig || !modelConfig.apiKey) return null;

    const result = await callAIModel(AI_SUMMARY_PROMPT.replace('{content}', content), modelConfig);
    if (!result.success) {
      console.log(`Summary not written: ${result.error}`);
      return null;
    }
    const summary = unquote(result.content);
    const words = wordCount(summary);
    if (words >= 5 && words <= MAX_WORDS) return summary;
    if (words > MAX_WORDS) {
      const shorter = await callAIModel(AI_TRUNCATE_PROMPT.replace('{content}', summary), modelConfig);
      if (shorter.success) {
        const shortened = unquote(shorter.content);
        const shortenedWords = wordCount(shortened);
        if (shortenedWords >= 5 && shortenedWords <= MAX_WORDS_AFTER_SHORTENING) return shortened;
      }
    }
    console.log(`Summary not used: ${words} words`);
    return null;
  } catch (error) {
    console.error('Summary failed:', error.message);
    return null;
  }
}

function cleanSummary(value) {
  if (!value) return locale.text().noSummary;
  return String(value)
    .replace(/```wbCustomBlock[\s\S]*?```/g, '')
    .replace(/<media-block>[\s\S]*?<\/media-block>/g, '')
    .replace(/###\s+/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\n\s*\n/g, '\n')
    .trim();
}

/**
 * Without a model: the first line of the material longer than 20 characters, cut at a
 * sentence end near 150 characters.
 */
function extractSummaryFromText(value) {
  const paragraphs = String(value || '').split(/\n+/).filter(paragraph => paragraph.trim().length > 20);
  if (paragraphs.length === 0) return locale.text().noSummary;

  let first = paragraphs[0].replace(/\*\*/g, '').replace(/```[\s\S]*?```/g, '').trim();
  if (first.length > 150) {
    const truncated = first.substring(0, 150);
    const lastSentence = truncated.lastIndexOf('.');
    first = lastSentence > 100 ? truncated.substring(0, lastSentence + 1) : `${truncated.substring(0, 147)}...`;
  }
  return first;
}

/**
 * Main entry: checks for advertising, then writes the summary.
 * Returns { summary, isCommercial, category, subCategory, reason, confidence }.
 */
async function summarizeContent(material, title = '', customConfig = null) {
  if (!material) {
    return { summary: locale.text().noSummary, isCommercial: false, category: 'unknown', reason: 'no material', confidence: 0 };
  }

  const cleaned = cleanMaterial(material);
  const detection = await detectCommercialContent(cleaned, title, customConfig);
  if (detection.isCommercial) {
    return {
      summary: null,
      isCommercial: true,
      category: detection.category,
      subCategory: detection.subCategory,
      reason: detection.reason,
      confidence: detection.confidence
    };
  }

  const aiSummary = await generateAISummary(cleaned, title, customConfig);
  return {
    summary: aiSummary || extractSummaryFromText(cleaned),
    isCommercial: false,
    category: detection.category,
    subCategory: detection.subCategory,
    reason: aiSummary ? detection.reason : 'no model summary; first line of the material',
    confidence: detection.confidence
  };
}

module.exports = {
  summarizeContent,
  generateAISummary,
  callAIModel,
  detectCommercialContent,
  cleanSummary,
  extractSummaryFromText,
  AI_SUMMARY_PROMPT,
  COMMERCIAL_DETECTION_PROMPT
};
