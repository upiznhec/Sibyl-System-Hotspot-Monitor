const crypto = require('crypto');
const path = require('path');

const { summarizeContent } = require('../../../elixir-summarizer/scripts/elixir-summarizer');
const { resolveModelConfig } = require('./model-config');
const { isNoSummary } = require('./locale');
const { retrieveNewsEvidence } = require('./news-evidence');
const {
  getDataDir,
  readJson,
  writeJsonAtomic
} = require('./snapshot-store');
const { normalizeForCompare } = require('./signals');

const DEFAULT_CONFIG = {
  enabled: true,
  cacheTtlHours: 6,
  retrievalLimit: 10,
  concurrency: 2,
  timeBudgetSeconds: 180,
  failureCacheTtlMinutes: 30
};

function cacheFile() {
  return path.join(getDataDir(), 'report-summaries.json');
}

function failureCacheFile() {
  return path.join(getDataDir(), 'report-retrieval-failures.json');
}

function loadCache() {
  const cache = readJson(cacheFile(), {});
  return cache && typeof cache === 'object' ? cache : {};
}

function loadFailureCache() {
  const cache = readJson(failureCacheFile(), {});
  return cache && typeof cache === 'object' ? cache : {};
}

function loadAlertSummaries() {
  const cache = readJson(path.join(getDataDir(), 'alert-summaries.json'), {});
  const summaries = new Map();
  Object.values(cache || {}).forEach(item => {
    const title = normalizeForCompare(item?.title || '');
    const summary = normalizeSummary(item?.summary);
    if (title && summary) summaries.set(title, summary);
  });
  return summaries;
}

function normalizeSummary(summary) {
  const text = String(summary || '').replace(/\s+/g, ' ').trim();
  if (!text || isNoSummary(text)) return '';
  return text.length > 140 ? `${text.slice(0, 137)}...` : text;
}

function sourceHash(cluster) {
  const source = [
    cluster.canonicalTitle,
    ...(cluster.aliases || []),
    ...(cluster.eventMerge?.memberSummaries || [])
      .map(item => `${item?.topicId || ''}:${normalizeSummary(item?.summary)}`),
    ...(cluster.signals || []).map(signal => `${signal.platform}:${signal.title}`)
  ].filter(Boolean).sort().join('|');
  return crypto.createHash('sha1').update(source).digest('hex');
}

function cacheValid(entry, hash, ttlHours) {
  if (!entry?.summary || entry.sourceHash !== hash || !entry.updatedAt) return false;
  const age = Date.now() - new Date(entry.updatedAt).getTime();
  return Number.isFinite(age) && age >= 0 && age <= ttlHours * 60 * 60 * 1000;
}

function failureCacheValid(entry, hash, ttlMinutes) {
  if (!entry?.failureReason || entry.sourceHash !== hash || !entry.updatedAt) return false;
  const age = Date.now() - new Date(entry.updatedAt).getTime();
  return Number.isFinite(age) && age >= 0 && age <= ttlMinutes * 60 * 1000;
}

function knownSummariesForCluster(cluster, summaries) {
  return [...new Set((cluster.aliases || [])
    .map(title => summaries.get(normalizeForCompare(title)))
    .filter(Boolean))];
}

function knownEvidence(cluster, summaries) {
  const lines = [];
  (cluster.signals || []).forEach(signal => {
    lines.push(`Search term (${signal.platformLabel || signal.platform}): ${signal.title}`);
  });
  summaries.forEach(summary => lines.push(`Known summary: ${summary}`));
  return lines.join('\n');
}

function memberSummariesForCluster(cluster) {
  return [...new Set((cluster.eventMerge?.memberSummaries || [])
    .map(item => normalizeSummary(item?.summary))
    .filter(Boolean))];
}

async function summarizeEvidence(content, title, dependencies = {}, modelConfig = null) {
  const summarizer = dependencies.summarize || summarizeContent;
  const result = await summarizer(content, title, modelConfig);
  if (result?.isCommercial) {
    return { filtered: true, reason: result.reason || 'judged to be advertising' };
  }
  return {
    summary: normalizeSummary(result?.summary),
    reason: result?.reason || null
  };
}

async function buildEventSummary(cluster, fullConfig, context, dependencies = {}) {
  const title = cluster.canonicalTitle || cluster.mainSignal.title;
  const hash = sourceHash(cluster);
  const cached = context.cache[cluster.topicId];
  if (cacheValid(cached, hash, context.options.cacheTtlHours)) {
    return { ...cached, cached: true };
  }
  if (Date.now() >= context.deadlineAt) {
    return { summary: '', sourceHash: hash, timeBudgetExceeded: true };
  }
  const memberSummaries = memberSummariesForCluster(cluster);
  const memberCount = Number(cluster.eventMerge?.memberCount) || 0;
  if (memberSummaries.length > 1 && memberSummaries.length >= memberCount) {
    const result = await summarizeEvidence(
      knownEvidence(cluster, memberSummaries),
      title,
      dependencies,
      context.modelConfig
    );
    if (result.filtered) return result;
    if (result.summary) {
      return {
        summary: result.summary,
        source: 'member-summaries-elixir',
        sourceHash: hash,
        updatedAt: new Date().toISOString()
      };
    }
  }
  const knownSummaries = knownSummariesForCluster(cluster, context.alertSummaries);
  if (knownSummaries.length === 1 && !cluster.eventMerge) {
    return {
      summary: knownSummaries[0],
      source: 'instant-alert-cache',
      sourceHash: hash,
      updatedAt: new Date().toISOString()
    };
  }

  const failed = context.failureCache[cluster.topicId];
  if (failureCacheValid(
    failed,
    hash,
    context.options.failureCacheTtlMinutes
  ) && knownSummaries.length === 0) {
    return {
      summary: '',
      sourceHash: hash,
      retrievalFailure: failed.failureReason,
      retrievalFailureCached: true
    };
  }

  let retrievalFailure = null;
  // Evidence retrieval is pluggable; without a retriever the summary uses the rule-based fallback.
  const retrieve = dependencies.retrieveEvidence || context.retrieveEvidence;
  const shouldRetrieve = Boolean(retrieve) &&
    context.retrievalCount < context.options.retrievalLimit &&
    Date.now() < context.deadlineAt &&
    (cluster.eventMerge?.memberCount > 1 || knownSummaries.length === 0);

  if (shouldRetrieve) {
    context.retrievalCount++;
    const retrieval = await retrieve({
      title,
      relatedTitles: cluster.aliases || [],
      platform: 'multi',
      platformLabel: 'multiple sources',
      category: cluster.category,
      url: cluster.mainSignal?.url || '',
      signals: cluster.signals || []
    }, fullConfig);
    if (!retrieval.success) {
      retrievalFailure = retrieval.retryable
        ? null
        : (retrieval.failureReason || 'unknown');
      console.warn(`No summary material for "${title}": ${retrieval.failureReason || 'unknown'}`);
    }
    if (retrieval.success && retrieval.evidenceText) {
      const result = await summarizeEvidence(retrieval.evidenceText, title, dependencies, context.modelConfig);
      if (result.filtered) return result;
      if (result.summary) {
        return {
          summary: result.summary,
          source: `${retrieval.routeUsed || 'retrieval'}-elixir`,
          sourceHash: hash,
          retrievalRoute: retrieval.routeUsed,
          confidence: retrieval.confidence,
          claimStatus: retrieval.claimStatus || 'supported',
          confidenceBasis: retrieval.confidenceBasis || null,
          sources: retrieval.sources || [],
          updatedAt: new Date().toISOString()
        };
      }
    }
  }

  if (knownSummaries.length > 0) {
    const result = await summarizeEvidence(
      knownEvidence(cluster, knownSummaries),
      title,
      dependencies,
      context.modelConfig
    );
    if (result.filtered) return result;
    if (result.summary) {
      return {
        summary: result.summary,
        source: 'alert-cache-elixir',
        sourceHash: hash,
        updatedAt: new Date().toISOString()
      };
    }
  }

  return {
    summary: '',
    sourceHash: hash,
    retrievalFailure,
    updatedAt: retrievalFailure ? new Date().toISOString() : null
  };
}

async function applyEventSummaries(clusters, fullConfig = {}, dependencies = {}) {
  const options = { ...DEFAULT_CONFIG, ...(fullConfig.eventSummary || {}) };
  if (options.enabled === false) return clusters;

  const context = {
    options,
    cache: loadCache(),
    failureCache: loadFailureCache(),
    alertSummaries: loadAlertSummaries(),
    modelConfig: resolveModelConfig(fullConfig),
    // News links saved with the items (lib/news-evidence.js); "newsEvidence": false turns it off.
    retrieveEvidence: options.newsEvidence === false ? null : retrieveNewsEvidence,
    retrievalCount: 0,
    deadlineAt: Date.now() + Math.max(1, Number(options.timeBudgetSeconds) || 180) * 1000
  };

  let cursor = 0;
  async function worker() {
    while (cursor < clusters.length) {
      const cluster = clusters[cursor++];
      let result;
      try {
        result = await buildEventSummary(cluster, fullConfig, context, dependencies);
      } catch (error) {
        cluster.eventSummary = '';
        cluster.eventSummarySource = null;
        cluster.summaryError = error.message;
        console.error(`Summary failed for "${cluster.canonicalTitle || cluster.mainSignal?.title || cluster.topicId}":`, error.message);
        continue;
      }
      if (result.filtered) {
        cluster.eventSummary = '';
        cluster.summaryFiltered = true;
        cluster.summaryFilterReason = result.reason;
        continue;
      }
      cluster.eventSummary = result.summary || '';
      cluster.eventSummarySource = result.source || null;
      if (result.summary) {
        context.cache[cluster.topicId] = result;
        delete context.failureCache[cluster.topicId];
        writeJsonAtomic(cacheFile(), context.cache);
        writeJsonAtomic(failureCacheFile(), context.failureCache);
      } else if (result.retrievalFailure && !result.retrievalFailureCached) {
        context.failureCache[cluster.topicId] = {
          sourceHash: result.sourceHash,
          failureReason: result.retrievalFailure,
          updatedAt: result.updatedAt || new Date().toISOString()
        };
        writeJsonAtomic(failureCacheFile(), context.failureCache);
      }
    }
  }

  const workerCount = Math.min(
    clusters.length,
    Math.max(1, Math.floor(Number(options.concurrency) || 2))
  );
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  writeJsonAtomic(cacheFile(), context.cache);
  writeJsonAtomic(failureCacheFile(), context.failureCache);
  return clusters;
}

module.exports = {
  applyEventSummaries,
  buildEventSummary,
  normalizeSummary,
  sourceHash
};
