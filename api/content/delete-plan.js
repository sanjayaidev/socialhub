// api/content/delete-plan.js
//
// DELETE /api/content/plan { planId } -> { ok: true }
// Cascades to content_posts via the FK's ON DELETE CASCADE.

import { Pool } from '@neondatabase/serverless';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'DELETE, OPTIONS',
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

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== 'DELETE') {
    return json({ error: 'Method not allowed' }, 405);
  }

  try {
    const body = await req.json();
    const { planId } = body || {};
    if (!planId) return json({ error: 'planId is required' }, 400);

    const pool = getPool();
    try {
      await pool.query('delete from content_plans where id = $1', [planId]);
      return json({ ok: true });
    } finally {
      await pool.end();
    }
  } catch (err) {
    console.error('delete-plan.js error:', err);
    return json({ error: String(err?.message || err) }, 500);
  }
}
