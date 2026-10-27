function dataUrlToInlineData(url) {
  const match = typeof url === 'string' ? url.match(/^data:([^;]+);base64,(.+)$/s) : null;
  if (!match) throw new Error('Image input must be a base64 data URL');
  return { mime_type: match[1], data: match[2] };
}

function normalizeText(value) {
  if (typeof value === 'string') return value.trim();
  if (Array.isArray(value)) return value.map((part) => part?.text || '').join('').trim();
  return '';
}

function openAiRequest(provider, model, messages) {
  const headers = {
    'content-type': 'application/json',
    ...(provider.key !== 'no-auth' ? { authorization: `Bearer ${provider.key}` } : {}),
    ...provider.headers,
  };
  return {
    url: provider.baseUrl,
    headers,
    body: { model, messages, temperature: 0.2, max_tokens: 900 },
    parse(data) {
      const text = normalizeText(data?.choices?.[0]?.message?.content);
      if (!text) throw new Error('Malformed provider response: missing assistant content');
      return text;
    },
  };
}

function geminiParts(content) {
  if (typeof content === 'string') return [{ text: content }];
  if (!Array.isArray(content)) return [];
  return content.flatMap((part) => {
    if (part?.type === 'text') return [{ text: part.text }];
    if (part?.type === 'image_url') return [{ inline_data: dataUrlToInlineData(part.image_url?.url) }];
    return [];
  });
}

function geminiRequest(provider, model, messages) {
  const systemText = messages
    .filter((message) => message.role === 'system')
    .map((message) => normalizeText(message.content))
    .filter(Boolean)
    .join('\n\n');
  const contents = messages
    .filter((message) => message.role !== 'system')
    .map((message) => ({
      role: message.role === 'assistant' ? 'model' : 'user',
      parts: geminiParts(message.content),
    }))
    .filter((content) => content.parts.length > 0);
  const root = provider.baseUrl.replace(/\/$/, '');
  return {
    url: `${root}/models/${encodeURIComponent(model)}:generateContent`,
    headers: { 'content-type': 'application/json', 'x-goog-api-key': provider.key, ...provider.headers },
    body: {
      ...(systemText ? { system_instruction: { parts: [{ text: systemText }] } } : {}),
      contents,
      generationConfig: { temperature: 0.2, maxOutputTokens: 900 },
    },
    parse(data) {
      const parts = data?.candidates?.[0]?.content?.parts;
      const text = Array.isArray(parts) ? parts.map((part) => part?.text || '').join('').trim() : '';
      if (!text) throw new Error('Malformed provider response: missing Gemini candidate text');
      return text;
    },
  };
}

export function buildProviderRequest(provider, model, messages) {
  if (provider.adapter === 'gemini_generate_content') return geminiRequest(provider, model, messages);
  if (provider.adapter === 'openai_chat') return openAiRequest(provider, model, messages);
  throw new Error(`Unsupported provider adapter: ${provider.adapter}`);
}

export async function callProvider(provider, model, messages, fetchImpl = fetch) {
  const request = buildProviderRequest(provider, model, messages);
  const response = await fetchImpl(request.url, {
    method: 'POST',
    headers: request.headers,
    body: JSON.stringify(request.body),
    signal: AbortSignal.timeout(provider.timeoutMs),
  });
  if (!response.ok) throw new Error(`${provider.name}/${model} HTTP ${response.status}`);
  return request.parse(await response.json());
}
