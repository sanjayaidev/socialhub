// api/content/calendar-day.js
//
// POST   /api/content/calendar-day { month, year, day, data } -> upsert one day
// DELETE /api/content/calendar-day { month, year, day }       -> remove one day

import { Pool } from '@neondatabase/serverless';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, DELETE, OPTIONS',
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
    const pool = getPool();
    try {
      if (req.method === 'POST') {
        const body = await req.json();
        const { month, year, day, data } = body || {};
        if (!month || !year || !day || !data) {
          return json({ error: 'month, year, day, and data are required' }, 400);
        }
        const now = Date.now();
        await pool.query(
          `insert into calendar_days (month, year, day, data, source_plan_id, created_at, updated_at)
           values ($1,$2,$3,$4,null,$5,$5)
           on conflict (month, year, day)
           do update set data = $4, updated_at = $5`,
          [parseInt(month), parseInt(year), parseInt(day), JSON.stringify(data), now]
        );
        return json({ ok: true });
      }

      if (req.method === 'DELETE') {
        const body = await req.json();
        const { month, year, day } = body || {};
        if (!month || !year || !day) return json({ error: 'month, year, day are required' }, 400);
        await pool.query('delete from calendar_days where month = $1 and year = $2 and day = $3', [parseInt(month), parseInt(year), parseInt(day)]);
        return json({ ok: true });
      }

      return json({ error: 'Method not allowed' }, 405);
    } finally {
      await pool.end();
    }
  } catch (err) {
    console.error('calendar-day.js error:', err);
    return json({ error: String(err?.message || err) }, 500);
  }
}
