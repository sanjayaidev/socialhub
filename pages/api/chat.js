// pages/api/chat.js
//
// Fixed version for Railway deployment with NVIDIA NIM free endpoints
// Uses correct model list and proper Next.js API route format

const NVIDIA_BASE_URL = 'https://integrate.api.nvidia.com/v1';

// CORRECT model list for NVIDIA NIM free endpoints
const ALLOWED_MODELS = [
  // DeepSeek models (available on NIM)
  'deepseek-ai/deepseek-v4-flash',
  'deepseek-ai/deepseek-v4-pro',
  
  // Meta Llama models (free tier)
  'meta/llama-3.1-70b-instruct',
  'meta/llama-3.1-8b-instruct',
  'meta/llama-3.2-3b-instruct',
  'meta/llama-3.3-70b-instruct',
  
  // Mistral models (free tier)
  'mistralai/mistral-large-3-675b-instruct-2512',
  'mistralai/mistral-small-4-119b-2603',
  'mistralai/ministral-14b-instruct-2512',
  
  // Other valid models
  'moonshotai/kimi-k2.6',
  'abacusai/dracarys-llama-3.1-70b-instruct',
];

function isAllowedModel(modelId) {
  return ALLOWED_MODELS.includes(modelId);
}

// Simple in-memory rate limiting for Railway (since we can't use Upstash)
// This is per-instance, not global - good enough for personal use
const rateLimitStore = new Map();

function checkRateLimit(modelId) {
  const now = Date.now();
  const windowMs = 60000; // 1 minute
  const maxRequests = 40; // RPM limit for free tier
  
  const key = modelId;
  if (!rateLimitStore.has(key)) {
    rateLimitStore.set(key, { count: 1, resetTime: now + windowMs });
    return { allowed: true, remaining: 39 };
  }
  
  const record = rateLimitStore.get(key);
  
  // Reset if window expired
  if (now > record.resetTime) {
    rateLimitStore.set(key, { count: 1, resetTime: now + windowMs });
    return { allowed: true, remaining: 39 };
  }
  
  // Check if over limit
  if (record.count >= maxRequests) {
    const retryAfter = Math.ceil((record.resetTime - now) / 1000);
    return { allowed: false, retryAfter };
  }
  
  // Increment count
  record.count++;
  return { allowed: true, remaining: maxRequests - record.count };
}

export default async function handler(req, res) {
  // Set CORS headers for Railway
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'NVIDIA_API_KEY environment variable is not set' });
  }

  // GET /api/chat?list=models -> return allowed models
  if (req.method === 'GET') {
    if (req.query?.list === 'models') {
      // Group by provider for better UI
      const byProvider = {};
      ALLOWED_MODELS.forEach((modelId) => {
        const provider = modelId.split('/')[0] || 'nvidia';
        if (!byProvider[provider]) byProvider[provider] = [];
        byProvider[provider].push(modelId);
      });
      
      return res.status(200).json({ 
        models: ALLOWED_MODELS,
        by_provider: byProvider 
      });
    }
    return res.status(400).json({ error: 'Use GET ?list=models or POST a chat request' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = req.body;
  const {
    messages,
    model = ALLOWED_MODELS[0],
    stream = false,
    temperature = 0.7,
    max_tokens = 2048,
  } = body || {};

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Messages array is required' });
  }

  if (!isAllowedModel(model)) {
    return res.status(403).json({ 
      error: `Model "${model}" is not in the allowed list`,
      allowed_models: ALLOWED_MODELS 
    });
  }

  // Apply rate limiting
  const rateResult = checkRateLimit(model);
  if (!rateResult.allowed) {
    return res.status(429).json({
      error: `Rate limit reached for model "${model}". Try again in ${rateResult.retryAfter} seconds.`,
      retry_after_seconds: rateResult.retryAfter,
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
    return res.status(502).json({ 
      error: 'Failed to reach NVIDIA API', 
      details: err.message 
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
    return res.status(upstream.status).json({ 
      error: 'NVIDIA API returned an error', 
      status: upstream.status, 
      details 
    });
  }

  // Streaming: pipe NVIDIA's stream through to client
  if (upstreamPayload.stream && upstream.body) {
    // For Node.js environment, we need to handle streaming differently
    // Use the native Node.js stream approach
    
    const { Readable } = require('stream');
    const stream = new Readable({
      async read() {
        try {
          const reader = upstream.body.getReader();
          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              this.push(null);
              break;
            }
            this.push(value);
          }
        } catch (err) {
          this.destroy(err);
        }
      }
    });
    
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    
    // Pipe the stream to response
    stream.pipe(res);
    
    // Handle client disconnect
    req.on('close', () => {
      stream.destroy();
    });
    
    return;
  }

  // Non-streaming: pass JSON straight through
  const data = await upstream.json();
  return res.status(200).json(data);
}

// For backward compatibility with Vercel-like exports
// but this is ignored in Railway's Node environment
export const config = {
  api: {
    bodyParser: true,
  },
};
