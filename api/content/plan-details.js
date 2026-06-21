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
  return {
    postId: row.id,
    day: row.day,
    type: row.type,
    title: row.title || '',
    hook: row.hook || '',
    caption: row.caption || '',
    hashtags: row.hashtags || [],
    image_prompt: row.image_prompt || '',
    bullets: row.bullets || [],
    slides: row.slides || [],
    cta: row.cta || '',
    tag: row.tag || '',
    images: row.images || [],
    status: row.status,
    brandSettings: row.brand_settings || null,
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
        'select * from content_posts where plan_id = $1 order by day asc',
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
