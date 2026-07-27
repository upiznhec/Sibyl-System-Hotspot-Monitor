const path = require('path');

const {
  getDataDir,
  readJson,
  writeJsonAtomic
} = require('./snapshot-store');

const DEFAULT_POLICY = {
  confirmationDelayMinutes: 30,
  firstOpenHours: 48,
  repeatOpenHours: 96,
  recoverySuccessesRequired: 2
};

const NON_TRIPPING_FAILURES = new Set([
  'no_results',
  'topic_miss',
  'page_error',
  'pending'
]);

const IMMEDIATE_DISABLE_FAILURES = new Set([
  'not_configured'
]);

const IMMEDIATE_LONG_OPEN_FAILURES = new Set([
  'auth',
  'forbidden',
  'anti_bot'
]);

const IMMEDIATE_OPEN_FAILURES = new Set([
  'rate_limit'
]);

function finiteNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

function optionalNumber(value) {
  if (value === '' || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizePolicy(policy = {}) {
  return {
    confirmationDelayMinutes: finiteNumber(
      policy.confirmationDelayMinutes,
      DEFAULT_POLICY.confirmationDelayMinutes
    ),
    firstOpenHours: finiteNumber(policy.firstOpenHours, DEFAULT_POLICY.firstOpenHours),
    repeatOpenHours: finiteNumber(policy.repeatOpenHours, DEFAULT_POLICY.repeatOpenHours),
    recoverySuccessesRequired: Math.max(
      1,
      finiteNumber(policy.recoverySuccessesRequired, DEFAULT_POLICY.recoverySuccessesRequired)
    )
  };
}

function healthFile(dataDir = getDataDir()) {
  return path.join(dataDir, 'retrieval-health.json');
}

function emptyState() {
  return {
    version: 1,
    updatedAt: null,
    capabilities: {}
  };
}

function loadHealthState(options = {}) {
  const state = readJson(options.file || healthFile(options.dataDir), emptyState());
  if (!state.capabilities || typeof state.capabilities !== 'object') {
    state.capabilities = {};
  }
  return state;
}

function saveHealthState(state, options = {}) {
  state.updatedAt = new Date().toISOString();
  writeJsonAtomic(options.file || healthFile(options.dataDir), state);
  return state;
}

function defaultCapability(id) {
  return {
    id,
    status: 'unknown',
    consecutiveFailures: 0,
    openCount: 0,
    recoverySuccesses: 0,
    lastAttemptAt: null,
    lastSuccessAt: null,
    lastFailureAt: null,
    lastFailureType: null,
    lastFailureReason: null,
    lastPageErrorAt: null,
    lastOutcome: null,
    latencyMs: null,
    openedAt: null,
    retryAfter: null,
    cooldownHours: null,
    disabledReason: null
  };
}

function ensureCapability(state, id) {
  if (!state.capabilities[id]) {
    state.capabilities[id] = defaultCapability(id);
  }
  return state.capabilities[id];
}

function asDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function addHours(date, hours) {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

function capabilityAvailability(capability, now = new Date()) {
  const retryAfter = asDate(capability.retryAfter);
  const due = Boolean(retryAfter && retryAfter.getTime() <= now.getTime());

  if (capability.status === 'disabled') {
    return { canUse: false, probeDue: false, reason: capability.disabledReason || 'disabled' };
  }
  if (capability.status === 'open' || capability.status === 'suspect') {
    return {
      canUse: false,
      probeDue: due,
      reason: due ? 'probe_due' : capability.status
    };
  }
  if (capability.status === 'half_open') {
    return { canUse: true, probeDue: false, reason: 'recovery_trial' };
  }
  return { canUse: true, probeDue: false, reason: capability.status || 'unknown' };
}

function listCapabilities(state, ids = [], options = {}) {
  const now = asDate(options.now) || new Date();
  const capabilityIds = ids.length ? ids : Object.keys(state.capabilities).sort();
  return capabilityIds.map(id => {
    const capability = ensureCapability(state, id);
    return {
      ...capability,
      availability: capabilityAvailability(capability, now)
    };
  });
}

function selectCapability(state, ids, options = {}) {
  return listCapabilities(state, ids, options)
    .find(capability => capability.availability.canUse) || null;
}

function listDueProbes(state, ids = [], options = {}) {
  return listCapabilities(state, ids, options)
    .filter(capability => capability.availability.probeDue);
}

function clearFailure(capability) {
  capability.consecutiveFailures = 0;
  capability.openCount = 0;
  capability.lastFailureAt = null;
  capability.lastFailureType = null;
  capability.lastFailureReason = null;
  capability.openedAt = null;
  capability.retryAfter = null;
  capability.cooldownHours = null;
  capability.disabledReason = null;
}

function recordSuccess(state, id, options = {}) {
  const now = asDate(options.now) || new Date();
  const policy = normalizePolicy(options.policy);
  const capability = ensureCapability(state, id);
  const recovering = capability.status === 'open' || capability.status === 'half_open';

  capability.lastAttemptAt = now.toISOString();
  capability.lastSuccessAt = now.toISOString();
  capability.lastOutcome = 'success';
  const latencyMs = optionalNumber(options.latencyMs);
  capability.latencyMs = latencyMs === null ? capability.latencyMs : latencyMs;

  if (recovering) {
    capability.recoverySuccesses = (capability.recoverySuccesses || 0) + 1;
    if (capability.recoverySuccesses >= policy.recoverySuccessesRequired) {
      capability.status = 'healthy';
      capability.recoverySuccesses = 0;
      clearFailure(capability);
    } else {
      capability.status = 'half_open';
      capability.retryAfter = null;
    }
  } else {
    capability.status = 'healthy';
    capability.recoverySuccesses = 0;
    clearFailure(capability);
  }

  return capability;
}

function laterDate(baseDate, candidate) {
  const parsed = asDate(candidate);
  if (!parsed) return baseDate;
  return parsed.getTime() > baseDate.getTime() ? parsed : baseDate;
}

function openCapability(capability, now, hours, failureType, reason, retryAfter) {
  const defaultRetry = addHours(now, hours);
  capability.status = 'open';
  capability.openCount = (capability.openCount || 0) + 1;
  capability.recoverySuccesses = 0;
  capability.openedAt = now.toISOString();
  capability.retryAfter = laterDate(defaultRetry, retryAfter).toISOString();
  capability.cooldownHours = hours;
  capability.lastFailureType = failureType;
  capability.lastFailureReason = reason || null;
}

function recordFailure(state, id, options = {}) {
  const now = asDate(options.now) || new Date();
  const policy = normalizePolicy(options.policy);
  const capability = ensureCapability(state, id);
  const failureType = String(options.failureType || 'unknown').trim().toLowerCase();
  const reason = String(options.reason || '').trim();

  capability.lastAttemptAt = now.toISOString();
  capability.lastOutcome = failureType;
  const latencyMs = optionalNumber(options.latencyMs);
  capability.latencyMs = latencyMs === null ? capability.latencyMs : latencyMs;

  if (NON_TRIPPING_FAILURES.has(failureType)) {
    if (failureType === 'page_error') {
      capability.lastPageErrorAt = now.toISOString();
      return capability;
    }
    recordSuccess(state, id, {
      now,
      policy,
      latencyMs: options.latencyMs
    });
    capability.lastOutcome = failureType;
    return capability;
  }

  capability.lastFailureAt = now.toISOString();
  capability.lastFailureType = failureType;
  capability.lastFailureReason = reason || null;

  if (IMMEDIATE_DISABLE_FAILURES.has(failureType)) {
    capability.status = 'disabled';
    capability.disabledReason = reason || failureType;
    capability.retryAfter = null;
    capability.cooldownHours = null;
    capability.recoverySuccesses = 0;
    return capability;
  }

  capability.consecutiveFailures = (capability.consecutiveFailures || 0) + 1;

  if (IMMEDIATE_LONG_OPEN_FAILURES.has(failureType)) {
    openCapability(
      capability,
      now,
      policy.repeatOpenHours,
      failureType,
      reason,
      options.retryAfter
    );
    return capability;
  }

  const failedRecovery = capability.status === 'open' ||
    capability.status === 'half_open' ||
    (capability.openCount || 0) > 0;

  if (failedRecovery) {
    openCapability(
      capability,
      now,
      policy.repeatOpenHours,
      failureType,
      reason,
      options.retryAfter
    );
    return capability;
  }

  if (IMMEDIATE_OPEN_FAILURES.has(failureType) || capability.consecutiveFailures >= 2) {
    openCapability(
      capability,
      now,
      policy.firstOpenHours,
      failureType,
      reason,
      options.retryAfter
    );
    return capability;
  }

  capability.status = 'suspect';
  capability.retryAfter = addMinutes(now, policy.confirmationDelayMinutes).toISOString();
  capability.cooldownHours = policy.confirmationDelayMinutes / 60;
  capability.recoverySuccesses = 0;
  return capability;
}

function disableCapability(state, id, reason = 'manual') {
  const capability = ensureCapability(state, id);
  capability.status = 'disabled';
  capability.disabledReason = reason;
  capability.retryAfter = null;
  capability.cooldownHours = null;
  capability.recoverySuccesses = 0;
  capability.lastOutcome = 'disabled';
  return capability;
}

function resetCapability(state, id) {
  state.capabilities[id] = defaultCapability(id);
  return state.capabilities[id];
}

module.exports = {
  DEFAULT_POLICY,
  capabilityAvailability,
  disableCapability,
  healthFile,
  listCapabilities,
  listDueProbes,
  loadHealthState,
  normalizePolicy,
  recordFailure,
  recordSuccess,
  resetCapability,
  saveHealthState,
  selectCapability
};
