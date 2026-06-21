// api/content/plan-details.js
//
// POST /api/content/plan-details { planId } -> Post[]
//
// Returns posts shaped exactly how dashboard.js expects: jsonb columns
// parsed back into arrays/objects, and `id` renamed to `postId` since
// that's the field name dashboard.js reads (post.postId).

import { Pool } from '@neondatabase/serverless';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
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

function rowToPost(row) {
  // Parse metadata jsonb back into post object
  const metadata = typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata;
  return {
    postId: row.id,
    day: row.day,
    type: row.type,
    ...metadata,
  };
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  try {
    const body = await req.json();
    const { planId } = body || {};
    if (!planId) return json({ error: 'planId is required' }, 400);

    const pool = getPool();
    try {
      const result = await pool.query(
        'select id, day, type, metadata from daily_posts where plan_id = $1 order by day asc',
        [planId]
      );
      return json(result.rows.map(rowToPost));
    } finally {
      await pool.end();
    }
  } catch (err) {
    console.error('plan-details.js error:', err);
    return json({ error: String(err?.message || err) }, 500);
  }
}
