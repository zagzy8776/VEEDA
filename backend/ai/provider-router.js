import { buildProviderRegistry, providerModel, providerSupports } from './provider-registry.js';
import { callProvider } from './provider-adapters.js';

const health = new Map();
const usage = new Map();
const UNAVAILABLE_MS = 60_000;

function id(provider, capability) {
  return `${provider.name}:${providerModel(provider, capability)}`;
}

function withinLimit(provider, now) {
  const key = id(provider, 'text');
  const window = usage.get(key);
  if (!window || now - window.startedAt >= 60_000) return true;
  return window.count < provider.requestsPerMinute;
}

function recordUsage(provider, now) {
  const key = id(provider, 'text');
  const window = usage.get(key);
  if (!window || now - window.startedAt >= 60_000) usage.set(key, { startedAt: now, count: 1 });
  else window.count += 1;
}

export function selectProviders(capability, env = process.env, now = Date.now()) {
  return buildProviderRegistry(env)
    .filter((provider) => providerSupports(provider, capability))
    .filter((provider) => (health.get(id(provider, capability))?.unavailableUntil || 0) <= now)
    .filter((provider) => withinLimit(provider, now))
    .sort((a, b) => {
      const priority = a.priority - b.priority;
      if (priority) return priority;
      return (health.get(id(a, capability))?.latencyMs || Infinity)
        - (health.get(id(b, capability))?.latencyMs || Infinity);
    });
}

export function beginProviderAttempt(provider, now = Date.now()) {
  recordUsage(provider, now);
  return now;
}

export function recordProviderSuccess(provider, capability, startedAt, now = Date.now()) {
  const key = id(provider, capability);
  const previous = health.get(key)?.latencyMs;
  const latencyMs = Math.max(0, now - startedAt);
  health.set(key, { unavailableUntil: 0, latencyMs: previous == null ? latencyMs : Math.round(previous * 0.7 + latencyMs * 0.3) });
}

export function recordProviderFailure(provider, capability, now = Date.now()) {
  const key = id(provider, capability);
  health.set(key, { ...health.get(key), unavailableUntil: now + UNAVAILABLE_MS });
}

export function capabilityStatus(capability, env = process.env, now = Date.now()) {
  const configured = buildProviderRegistry(env);
  if (configured.length === 0) return { state: 'NOT_CONFIGURED', available: false, providers: [] };
  const supported = configured.filter((provider) => providerSupports(provider, capability));
  if (supported.length === 0) {
    return { state: 'UNSUPPORTED_MODEL', available: false, providers: configured.map(publicProvider) };
  }
  const available = selectProviders(capability, env, now);
  if (available.length === 0) {
    return { state: 'PROVIDER_UNAVAILABLE', available: false, providers: supported.map(publicProvider) };
  }
  return { state: 'AVAILABLE', available: true, providers: available.map(publicProvider) };
}

export function publicProvider(provider) {
  return {
    name: provider.name,
    model: provider.models.image,
    capabilities: provider.capabilitiesByModel.image,
  };
}

export function resetProviderRuntimeState() {
  health.clear();
  usage.clear();
}

export async function callWithFailover(capability, messages, options = {}) {
  const env = options.env || process.env;
  const fetchImpl = options.fetchImpl || fetch;
  const errors = [];
  for (const provider of selectProviders(capability, env, options.now ?? Date.now())) {
    const startedAt = beginProviderAttempt(provider, options.now ?? Date.now());
    const model = providerModel(provider, capability);
    try {
      const reply = await callProvider(provider, model, messages, fetchImpl);
      recordProviderSuccess(provider, capability, startedAt, options.finishedAt ?? Date.now());
      return { reply, provider, model, errors };
    } catch (error) {
      recordProviderFailure(provider, capability, options.finishedAt ?? Date.now());
      errors.push({ provider: provider.name, model, message: error?.message || 'Provider failed' });
    }
  }
  return { reply: null, provider: null, model: null, errors };
}
