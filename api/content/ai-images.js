// api/content/ai-images.js
//
// POST /api/content/ai-images { planId? } -> list AI images (optionally filtered by planId)

import { Pool } from '@neondatabase/serverless';

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

function getPool() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('Missing DATABASE_URL environment variable');
  return new Pool({ connectionString: url, ssl: 'require' });
}

async function loadAIImages(planId = null) {
  const pool = getPool();
  try {
    let query;
    let params;
    
    if (planId) {
      query = `
        select id, "planId", day, "slideIndex", type, "imageUrl", prompt, "aspectRatio", "sourceJson", "createdAt", "updatedAt"
        from ai_images
        where "planId" = $1
        order by day, "slideIndex"
      `;
      params = [planId];
    } else {
      query = `
        select id, "planId", day, "slideIndex", type, "imageUrl", prompt, "aspectRatio", "sourceJson", "createdAt", "updatedAt"
        from ai_images
        order by "planId", day, "slideIndex"
      `;
      params = [];
    }
    
    const result = await pool.query(query, params);
    return result.rows.map(row => ({
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
    }));
  } finally {
    await pool.end();
  }
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  try {
    if (req.method === 'POST') {
      const body = await req.json();
      const { planId } = body || {};
      
      const images = await loadAIImages(planId);
      return json(images);
    }

    return json({ error: 'Method not allowed' }, 405);
  } catch (err) {
    console.error('ai-images.js error:', err);
    return json({ error: String(err?.message || err) }, 500);
  }
}
