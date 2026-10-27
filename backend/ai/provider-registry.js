const CAPABILITY_NAMES = ['text', 'image', 'document', 'structuredOutput', 'toolCalling'];

const MODEL_CAPABILITIES = new Map([
  // OpenAI chat-completions models explicitly retained by VEEDA.
  ...[
    'gpt-4o', 'gpt-4o-mini', 'gpt-4o-2024-05-13', 'gpt-4o-2024-08-06',
    'gpt-4o-mini-2024-07-18', 'gpt-4-turbo', 'gpt-4-turbo-2024-04-09',
    'gpt-4-vision-preview', 'gpt-4o-2024-11-20', 'gpt-4o-mini-2024-11-20',
  ].map((model) => [`openai:${model}`, ['text', 'image', 'structuredOutput', 'toolCalling']]),
  ['groq:qwen/qwen3.8-27b', ['text', 'image', 'toolCalling']],
  ['groq:openai/gpt-oss-120b', ['text', 'structuredOutput', 'toolCalling']],
  ['groq:openai/gpt-oss-20b', ['text', 'structuredOutput', 'toolCalling']],
  ['gemini:gemini-2.5-flash', CAPABILITY_NAMES],
  ['gemini:gemini-2.5-flash-lite', CAPABILITY_NAMES],
  ['gemini:gemini-2.5-pro', CAPABILITY_NAMES],
  ['openrouter:openai/gpt-4o-mini', ['text', 'image', 'structuredOutput', 'toolCalling']],
  ['openrouter:openai/gpt-4o', ['text', 'image', 'structuredOutput', 'toolCalling']],
  ['openrouter:google/gemini-2.5-flash', CAPABILITY_NAMES],
  ['openrouter:google/gemini-2.5-pro', CAPABILITY_NAMES],
  ['openrouter:qwen/qwen3.8-27b', ['text', 'image', 'toolCalling']],
  ['openrouter:openai/gpt-oss-120b', ['text', 'structuredOutput', 'toolCalling']],
  ['cerebras:gpt-oss-120b', ['text', 'structuredOutput', 'toolCalling']],
  ['cerebras:gpt-oss-20b', ['text', 'structuredOutput', 'toolCalling']],
]);

function capabilities(names = []) {
  const set = new Set(names);
  return Object.fromEntries(CAPABILITY_NAMES.map((name) => [name, set.has(name)]));
}

function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value || ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function explicitSelfHostedCapabilities(env) {
  const names = String(env.SELF_HOSTED_CAPABILITIES || '')
    .split(',')
    .map((name) => name.trim())
    .filter((name) => CAPABILITY_NAMES.includes(name));
  return capabilities(names);
}

function knownCapabilities(provider, model) {
  return capabilities(MODEL_CAPABILITIES.get(`${provider}:${String(model || '').toLowerCase()}`) || []);
}

function entry({ name, key, adapter, baseUrl, textModel, visionModel, priority, timeoutMs, rpm, env, headers = {} }) {
  const selectedVisionModel = visionModel || textModel;
  const textCapabilities = name === 'self_hosted'
    ? explicitSelfHostedCapabilities(env)
    : knownCapabilities(name, textModel);
  const visionCapabilities = name === 'self_hosted'
    ? explicitSelfHostedCapabilities(env)
    : knownCapabilities(name, selectedVisionModel);
  return {
    name,
    key,
    adapter,
    baseUrl,
    models: { text: textModel, image: selectedVisionModel },
    capabilitiesByModel: { text: textCapabilities, image: visionCapabilities },
    priority: parsePositiveInteger(priority, 100),
    timeoutMs: parsePositiveInteger(timeoutMs, 20_000),
    requestsPerMinute: parsePositiveInteger(rpm, 60),
    headers,
  };
}

/** Server-only registry. Returned public status objects must never include `key`. */
export function buildProviderRegistry(env = process.env) {
  const providers = [
    entry({
      name: 'groq', key: env.GROQ_API_KEY, adapter: 'openai_chat',
      baseUrl: env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1/chat/completions',
      textModel: env.GROQ_MODEL || 'openai/gpt-oss-120b',
      visionModel: env.GROQ_VISION_MODEL,
      priority: env.GROQ_PRIORITY || 20, timeoutMs: env.GROQ_TIMEOUT_MS, rpm: env.GROQ_RPM, env,
    }),
    entry({
      name: 'gemini', key: env.GEMINI_API_KEY, adapter: 'gemini_generate_content',
      baseUrl: env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta',
      textModel: env.GEMINI_MODEL || 'gemini-2.5-flash',
      visionModel: env.GEMINI_VISION_MODEL,
      priority: env.GEMINI_PRIORITY || 10, timeoutMs: env.GEMINI_TIMEOUT_MS, rpm: env.GEMINI_RPM, env,
    }),
    entry({
      name: 'openrouter', key: env.OPENROUTER_API_KEY, adapter: 'openai_chat',
      baseUrl: env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1/chat/completions',
      textModel: env.OPENROUTER_MODEL || 'openai/gpt-oss-120b',
      visionModel: env.OPENROUTER_VISION_MODEL,
      priority: env.OPENROUTER_PRIORITY || 30, timeoutMs: env.OPENROUTER_TIMEOUT_MS, rpm: env.OPENROUTER_RPM, env,
    }),
    entry({
      name: 'openai', key: env.OPENAI_API_KEY, adapter: 'openai_chat',
      baseUrl: env.OPENAI_BASE_URL || 'https://api.openai.com/v1/chat/completions',
      textModel: env.OPENAI_MODEL || 'gpt-4o-mini',
      visionModel: env.OPENAI_VISION_MODEL,
      priority: env.OPENAI_PRIORITY || 40, timeoutMs: env.OPENAI_TIMEOUT_MS, rpm: env.OPENAI_RPM, env,
    }),
    entry({
      name: 'self_hosted', key: env.SELF_HOSTED_API_KEY || (env.SELF_HOSTED_ALLOW_NO_AUTH === 'true' ? 'no-auth' : ''),
      adapter: env.SELF_HOSTED_API_FORMAT === 'gemini' ? 'gemini_generate_content' : 'openai_chat',
      baseUrl: env.SELF_HOSTED_BASE_URL,
      textModel: env.SELF_HOSTED_MODEL,
      visionModel: env.SELF_HOSTED_VISION_MODEL,
      priority: env.SELF_HOSTED_PRIORITY || 50, timeoutMs: env.SELF_HOSTED_TIMEOUT_MS, rpm: env.SELF_HOSTED_RPM, env,
    }),
    // Existing text-only compatibility is retained, but Cerebras is not a vision route.
    entry({
      name: 'cerebras', key: env.CEREBRAS_API_KEY, adapter: 'openai_chat',
      baseUrl: env.CEREBRAS_BASE_URL || 'https://api.cerebras.ai/v1/chat/completions',
      textModel: env.CEREBRAS_MODEL || 'gpt-oss-120b',
      priority: env.CEREBRAS_PRIORITY || 60, timeoutMs: env.CEREBRAS_TIMEOUT_MS, rpm: env.CEREBRAS_RPM, env,
    }),
  ];
  return providers.filter((provider) => Boolean(provider.key && provider.baseUrl && provider.models.text));
}

export function providerSupports(provider, capability) {
  const slot = capability === 'image' ? 'image' : 'text';
  return provider.capabilitiesByModel[slot]?.[capability] === true;
}

export function providerModel(provider, capability) {
  return capability === 'image' ? provider.models.image : provider.models.text;
}

export function isKnownImageModel(providerName, model) {
  return knownCapabilities(providerName, model).image === true;
}

export { CAPABILITY_NAMES };
