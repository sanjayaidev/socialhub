// api/content/regenerate-ai-image.js
//
// POST /api/content/regenerate-ai-image { id, prompt, aspectRatio, day, slideIndex, type, planId }
// -> regenerates an AI image using NVIDIA NIM and updates the database

import { Pool } from '@neondatabase/serverless';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const NVIDIA_BASE_URL = 'https://integrate.api.nvidia.com/v1';
const NIM_MODEL = 'google/gemma-3n-e4b-img2img-nano';

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

function getPool() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('Missing DATABASE_URL environment variable');
  return new Pool({ connectionString: url, ssl: 'require' });
}

async function callNVIDIAImageGen(prompt, aspectRatio) {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) {
    throw new Error('NVIDIA_API_KEY environment variable is not set');
  }

  // Map aspect ratio to dimensions
  let width = 1024, height = 1024;
  if (aspectRatio === '4:5') { width = 1080; height = 1350; }
  else if (aspectRatio === '9:16') { width = 1080; height = 1920; }
  else if (aspectRatio === '16:9') { width = 1920; height = 1080; }
  else if (aspectRatio === '1:1') { width = 1024; height = 1024; }

  const response = await fetch(`${NVIDIA_BASE_URL}/images/generations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'google/gemma-3n-e4b-img2img-nano',
      prompt: prompt,
      n: 1,
      size: `${width}x${height}`,
      response_format: 'url',
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`NVIDIA API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  if (!data.data || !data.data[0] || !data.data[0].url) {
    throw new Error('No image URL returned from NVIDIA API');
  }

  return data.data[0].url;
}

async function updateAIImage(pool, id, imageUrl, prompt) {
  const now = Date.now();
  const result = await pool.query(
    `update ai_images 
     set "imageUrl" = $1, prompt = $2, "updatedAt" = $3 
     where id = $4 
     returning id, "planId", day, "slideIndex", type, "imageUrl", prompt, "aspectRatio", "sourceJson", "createdAt", "updatedAt"`,
    [imageUrl, prompt, now, id]
  );
  
  if (result.rows.length === 0) {
    throw new Error('Image not found');
  }
  
  const row = result.rows[0];
  return {
    id: row.id,
    planId: row.planId,
    day: row.day,
    slideIndex: row.slideIndex,
    type: row.type,
    imageUrl: row.imageUrl,
    prompt: row.prompt,
    aspectRatio: row.aspectRatio,
    sourceJson: row.sourceJson,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  try {
    if (req.method === 'POST') {
      const body = await req.json();
      const { id, prompt, aspectRatio, day, slideIndex, type, planId } = body || {};
      
      if (!id || !prompt || !aspectRatio) {
        return json({ error: 'id, prompt, and aspectRatio are required' }, 400);
      }
      
      const pool = getPool();
      try {
        // Generate new image via NVIDIA API
        const imageUrl = await callNVIDIAImageGen(prompt, aspectRatio);
        
        // Update database with new image
        const updated = await updateAIImage(pool, id, imageUrl, prompt);
        
        return json({ ok: true, result: updated });
      } finally {
        await pool.end();
      }
    }

    return json({ error: 'Method not allowed' }, 405);
  } catch (err) {
    console.error('regenerate-ai-image.js error:', err);
    return json({ error: String(err?.message || err) }, 500);
  }
}
