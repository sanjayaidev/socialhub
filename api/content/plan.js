// api/content/plan.js
//
// Handles individual plan operations
// DELETE /api/content/plan { planId } -> deletes a plan and its posts
//

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

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  try {
    if (req.method === 'DELETE') {
      const body = await req.json();
      const { planId } = body || {};
      
      if (!planId) {
        return json({ error: 'planId is required' }, 400);
      }

      const pool = getPool();
      try {
        // First check if plan exists
        const existing = await pool.query('select id from plans where id = $1', [planId]);
        if (existing.rows.length === 0) {
          return json({ error: 'Plan not found' }, 404);
        }
        
        // Delete associated daily_posts first (due to foreign key)
        await pool.query('delete from daily_posts where plan_id = $1', [planId]);
        
        // Then delete the plan
        await pool.query('delete from plans where id = $1', [planId]);
        
        return json({ ok: true, planId });
      } finally {
        await pool.end();
      }
    }

    return json({ error: 'Method not allowed' }, 405);
  } catch (err) {
    console.error('plan.js error:', err);
    return json({ error: String(err?.message || err) }, 500);
  }
}
