// api/chat.js
// Fixed version using Web Response API (matching server.js apiHandler contract)

const NVIDIA_BASE_URL = 'https://integrate.api.nvidia.com/v1 ';

const ALLOWED_MODELS = [
  'deepseek-ai/deepseek-v4-flash',
  'deepseek-ai/deepseek-v4-pro',
  'meta/llama-3.1-70b-instruct',
  'meta/llama-3.1-8b-instruct',
  'meta/llama-3.2-3b-instruct',
  'meta/llama-3.3-70b-instruct',
  'mistralai/mistral-large-3-675b-instruct-2512',
  'mistralai/mistral-small-4-119b-2603',
  'mistralai/ministral-14b-instruct-2512',
  'moonshotai/kimi-k2.6',
  'abacusai/dracarys-llama-3.1-70b-instruct',
];

function isAllowedModel(modelId) { return ALLOWED_MODELS.includes(modelId); }

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

// Per-instance rate limit (fine for personal use)
const rateLimitStore = new Map();
function checkRateLimit(modelId) {
  const now = Date.now();
  const windowMs = 60000, maxRequests = 40;
  if (!rateLimitStore.has(modelId)) {
    rateLimitStore.set(modelId, { count: 1, resetTime: now + windowMs });
    return { allowed: true };
  }
  const r = rateLimitStore.get(modelId);
  if (now > r.resetTime) { rateLimitStore.set(modelId, { count: 1, resetTime: now + windowMs }); return { allowed: true }; }
  if (r.count >= maxRequests) return { allowed: false, retryAfter: Math.ceil((r.resetTime - now) / 1000) };
  r.count++;
  return { allowed: true };
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) return json({ error: 'NVIDIA_API_KEY environment variable is not set' }, 500);

  // GET /api/chat?list=models
  if (req.method === 'GET') {
    if (req.query?.list === 'models') {
      const byProvider = {};
      ALLOWED_MODELS.forEach((m) => {
        const p = m.split('/')[0] || 'nvidia';
        (byProvider[p] ||= []).push(m);
      });
      return json({ models: ALLOWED_MODELS, by_provider: byProvider });
    }
    return json({ error: 'Use GET ?list=models or POST a chat request' }, 400);
  }

  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const body = await req.json();
  const { messages, model = ALLOWED_MODELS[0], stream = false, temperature = 0.7, max_tokens = 2048 } = body || {};

  if (!messages || !Array.isArray(messages)) return json({ error: 'Messages array is required' }, 400);
  if (!isAllowedModel(model)) return json({ error: `Model "${model}" is not in the allowed list`, allowed_models: ALLOWED_MODELS }, 403);

  const rate = checkRateLimit(model);
  if (!rate.allowed) return json({ error: `Rate limit reached for model "${model}". Try again in ${rate.retryAfter}s.`, retry_after_seconds: rate.retryAfter }, 429);

  const upstreamPayload = {
    model,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
    temperature, max_tokens, top_p: 1,
    stream: Boolean(stream),
  };

  let upstream;
  try {
    upstream = await fetch(`${NVIDIA_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(upstreamPayload),
    });
  } catch (err) {
    return json({ error: 'Failed to reach NVIDIA API', details: err.message }, 502);
  }

  if (!upstream.ok) {
    const rawText = await upstream.text();
    let details = rawText;
    try { details = JSON.parse(rawText); } catch (_) {}
    return json({ error: 'NVIDIA API returned an error', status: upstream.status, details }, upstream.status);
  }

  // Streaming: hand the upstream ReadableStream straight back as the
  // Response body. server.js now pipes this chunk-by-chunk instead of
  // buffering it (see the apiHandler fix below).
  if (upstreamPayload.stream && upstream.body) {
    return new Response(upstream.body, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        ...CORS_HEADERS,
      },
    });
  }

  const data = await upstream.json();
  return json(data);
}
