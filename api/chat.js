// pages/api/chat.js
//
// Minimal personal-use chat endpoint for Railway deployment.
//
// Stripped down from the original Edge-based chat.js:
//   - Runs on plain Node (Railway doesn't have Vercel's Edge runtime,
//     so no `export const config = { runtime: 'edge' }` here).
//   - No Postgres/Neon history — conversation state lives entirely in
//     the browser (see public/chat.html), so nothing is persisted
//     server-side.
//   - No Upstash rate limiting.
//   - No auth — single personal NVIDIA_API_KEY env var, same as the
//     original personal-use design.
//   - Only 5 models instead of 20.
//
// GET  /api/chat?list=models   -> { models: [...] }
// POST /api/chat { messages, model, stream } -> OpenAI-shaped chat completion

const NVIDIA_BASE_URL = 'https://integrate.api.nvidia.com/v1';

// Curated 5-model list from user's requirements.
const ALLOWED_MODELS = [
  'moonshotai/kimi-k2.6',
  'nvidia/llama-3.1-nemoguard-8b-content-safety',
  'deepseek-ai/deepseek-v4-flash',
  'deepseek-ai/deepseek-v4-pro',
  'mistralai/mistral-large-3-675b-instruct-2512',
];

function isAllowedModel(modelId) {
  return ALLOWED_MODELS.includes(modelId);
}

export default async function handler(req) {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'NVIDIA_API_KEY environment variable is not set' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // GET ?list=models -> just the curated list, no upstream call needed
  if (req.method === 'GET') {
    if (req.query?.list === 'models') {
      return new Response(JSON.stringify({ models: ALLOWED_MODELS }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ error: 'Use GET ?list=models or POST a chat request' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const body = await req.json();
  const {
    messages,
    model = ALLOWED_MODELS[0],
    stream = false,
    temperature = 0.7,
    max_tokens = 2048,
  } = body || {};

  if (!messages || !Array.isArray(messages)) {
    return new Response(JSON.stringify({ error: 'Messages array is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!isAllowedModel(model)) {
    return new Response(JSON.stringify({ error: `Model "${model}" is not in the allowed list` }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const upstreamPayload = {
    model,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
    temperature,
    max_tokens,
    top_p: 1,
    stream: Boolean(stream),
  };

  let upstream;
  try {
    upstream = await fetch(`${NVIDIA_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(upstreamPayload),
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Failed to reach NVIDIA API', details: err.message }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!upstream.ok) {
    const rawText = await upstream.text();
    let details = rawText;
    try {
      details = JSON.parse(rawText);
    } catch (_) {
      // leave as raw text if not JSON
    }
    return new Response(JSON.stringify({ error: 'NVIDIA API returned an error', status: upstream.status, details }), {
      status: upstream.status,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Streaming: pipe NVIDIA's SSE stream straight through to the client.
  if (upstreamPayload.stream && upstream.body) {
    const streamResponse = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of upstream.body) {
            controller.enqueue(chunk);
          }
        } catch (err) {
          // Client likely disconnected mid-stream — nothing more to do.
        } finally {
          controller.close();
        }
      },
    });

    return new Response(streamResponse, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  }

  // Non-streaming: pass the JSON straight through.
  const data = await upstream.json();
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
