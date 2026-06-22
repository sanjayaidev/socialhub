// api/content/calendar-month.js
//
// POST /api/content/calendar-month { month, year } -> CalendarItem[]
// month is a number 1-12.

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

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  try {
    const body = await req.json();
    const { month, year } = body || {};
    if (!month || !year) return json({ error: 'month and year are required' }, 400);

    const pool = getPool();
    try {
      const result = await pool.query(
        `select month, year, day, data, updated_at from calendar_days
         where month = $1 and year = $2 order by day`,
        [parseInt(month), parseInt(year)]
      );
      const items = result.rows.map(row => {
        const data = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
        return { month: row.month, year: row.year, day: row.day, updatedAt: row.updated_at, ...data };
      });
      return json(items);
    } finally {
      await pool.end();
    }
  } catch (err) {
    console.error('calendar-month.js error:', err);
    return json({ error: String(err?.message || err) }, 500);
  }
}
