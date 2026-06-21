// api/content/ai-image.js
//
// DELETE /api/content/ai-image { id } -> delete an AI image by ID

import { Pool } from '@neondatabase/serverless';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
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

async function deleteAIImage(id) {
  const pool = getPool();
  try {
    const result = await pool.query('delete from ai_images where id = $1 returning id', [id]);
    if (result.rows.length === 0) {
      throw new Error('Image not found');
    }
    return { ok: true, id };
  } finally {
    await pool.end();
  }
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  try {
    if (req.method === 'DELETE') {
      const body = await req.json();
      const { id } = body || {};
      
      if (!id) {
        return json({ error: 'id is required' }, 400);
      }
      
      const result = await deleteAIImage(id);
      return json(result);
    }

    return json({ error: 'Method not allowed' }, 405);
  } catch (err) {
    console.error('ai-image.js error:', err);
    return json({ error: String(err?.message || err) }, 500);
  }
}
