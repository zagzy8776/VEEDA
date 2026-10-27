import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { buildProviderRegistry, providerSupports } from '../ai/provider-registry.js';
import { buildProviderRequest } from '../ai/provider-adapters.js';
import { callWithFailover, capabilityStatus, resetProviderRuntimeState, selectProviders } from '../ai/provider-router.js';

beforeEach(() => resetProviderRuntimeState());

test('missing credentials configure no providers', () => {
  assert.deepEqual(buildProviderRegistry({}), []);
  assert.deepEqual(capabilityStatus('image', {}), { state: 'NOT_CONFIGURED', available: false, providers: [] });
});

test('Gemini vision works independently of missing OpenAI credentials', () => {
  const env = { GEMINI_API_KEY: 'gemini-secret', GEMINI_MODEL: 'gemini-2.5-flash' };
  const selected = selectProviders('image', env);
  assert.equal(selected.length, 1);
  assert.equal(selected[0].name, 'gemini');
  assert.equal(providerSupports(selected[0], 'document'), true);
  assert.equal(providerSupports(selected[0], 'structuredOutput'), true);
  assert.equal(providerSupports(selected[0], 'toolCalling'), true);
});

test('capabilities are separate and unsupported models never enter vision routing', () => {
  const env = { GROQ_API_KEY: 'groq-secret', GROQ_MODEL: 'openai/gpt-oss-120b' };
  const provider = buildProviderRegistry(env)[0];
  assert.equal(providerSupports(provider, 'text'), true);
  assert.equal(providerSupports(provider, 'image'), false);
  assert.equal(providerSupports(provider, 'document'), false);
  assert.equal(capabilityStatus('image', env).state, 'UNSUPPORTED_MODEL');
});

test('self-hosted endpoints require explicit capabilities instead of model-name guessing', () => {
  const base = {
    SELF_HOSTED_BASE_URL: 'https://local.example/v1/chat/completions',
    SELF_HOSTED_API_KEY: 'local-secret',
    SELF_HOSTED_MODEL: 'custom-model',
  };
  assert.equal(selectProviders('image', base).length, 0);
  const configured = selectProviders('image', { ...base, SELF_HOSTED_CAPABILITIES: 'text,image' });
  assert.equal(configured.length, 1);
  assert.equal(configured[0].name, 'self_hosted');
});

test('OpenAI-style and Gemini adapters produce provider-specific image requests', () => {
  const messages = [
    { role: 'system', content: 'System safety' },
    { role: 'user', content: [
      { type: 'text', text: 'Exact question' },
      { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,abc123' } },
    ] },
  ];
  const groq = buildProviderRegistry({
    GROQ_API_KEY: 'groq-secret', GROQ_MODEL: 'openai/gpt-oss-120b', GROQ_VISION_MODEL: 'qwen/qwen3.8-27b',
  })[0];
  const groqRequest = buildProviderRequest(groq, groq.models.image, messages);
  assert.equal(groqRequest.body.messages[1].content[0].text, 'Exact question');
  assert.equal(groqRequest.body.messages[1].content[1].image_url.url, 'data:image/jpeg;base64,abc123');
  assert.match(groqRequest.headers.authorization, /^Bearer /);

  const gemini = buildProviderRegistry({ GEMINI_API_KEY: 'gemini-secret', GEMINI_MODEL: 'gemini-2.5-flash' })[0];
  const geminiRequest = buildProviderRequest(gemini, gemini.models.image, messages);
  assert.deepEqual(geminiRequest.body.contents[0].parts, [
    { text: 'Exact question' },
    { inline_data: { mime_type: 'image/jpeg', data: 'abc123' } },
  ]);
  assert.equal(geminiRequest.headers['x-goog-api-key'], 'gemini-secret');
  assert.equal(geminiRequest.headers.authorization, undefined);
});

test('routing honors priority and fails over after a malformed provider response', async () => {
  const env = {
    GEMINI_API_KEY: 'gemini-secret', GEMINI_MODEL: 'gemini-2.5-flash', GEMINI_PRIORITY: '10',
    GROQ_API_KEY: 'groq-secret', GROQ_MODEL: 'openai/gpt-oss-120b', GROQ_VISION_MODEL: 'qwen/qwen3.8-27b', GROQ_PRIORITY: '20',
  };
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    if (url.includes('generativelanguage.googleapis.com')) {
      return { ok: true, status: 200, json: async () => ({ candidates: [] }) };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: 'A grounded visible observation.' } }] }),
    };
  };
  const result = await callWithFailover('image', [{ role: 'user', content: 'question' }], {
    env, fetchImpl, now: 1000, finishedAt: 1010,
  });
  assert.equal(result.provider.name, 'groq');
  assert.equal(result.reply, 'A grounded visible observation.');
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0].message, /Malformed provider response/);
  assert.equal(calls.length, 2);
  assert.match(calls[0], /generativelanguage/);
  assert.match(calls[1], /groq/);
});

test('a configured request limit removes a provider until its minute resets', async () => {
  const env = { GEMINI_API_KEY: 'secret', GEMINI_MODEL: 'gemini-2.5-flash', GEMINI_RPM: '1' };
  const fetchImpl = async () => ({
    ok: true, status: 200,
    json: async () => ({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] }),
  });
  const first = await callWithFailover('image', [{ role: 'user', content: 'question' }], { env, fetchImpl, now: 1000, finishedAt: 1001 });
  assert.equal(first.reply, 'ok');
  assert.equal(selectProviders('image', env, 1002).length, 0);
  assert.equal(capabilityStatus('image', env, 1002).state, 'PROVIDER_UNAVAILABLE');
  assert.equal(selectProviders('image', env, 61_001).length, 1);
});
