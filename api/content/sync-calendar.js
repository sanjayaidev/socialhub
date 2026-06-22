// api/content/sync-calendar.js
//
// POST /api/content/sync-calendar { planId }
// Pushes every post in the given plan into calendar_days, keyed by
// (month, year, post.day). Overwrites only the days included in this
// plan — days from other plans/syncs for the same month are untouched.

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

// month names -> 1-12, since `plans.month` is stored as a name string
const MONTH_NUM = {
  january:1, february:2, march:3, april:4, may:5, june:6,
  july:7, august:8, september:9, october:10, november:11, december:12
};

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
      const planRes = await pool.query('select id, month, year from plans where id = $1', [planId]);
      if (!planRes.rows.length) return json({ error: 'Plan not found' }, 404);
      const plan = planRes.rows[0];

      const monthNum = MONTH_NUM[String(plan.month).toLowerCase()] || parseInt(plan.month) || 1;
      const year = parseInt(plan.year);

      const postsRes = await pool.query(
        `select dp.id, dp.day, dp.type, dp.metadata,
                COALESCE(
                  (select json_agg(slides ORDER BY slides.slide_index)
                   from (select ps.slide_index, ps.role, ps.design_spec, ps.generated_asset, ps.status
                         from post_slides ps where ps.post_id = dp.id order by ps.slide_index) slides
                  ), '[]'::json
                ) as slides
         from daily_posts dp where dp.plan_id = $1 order by dp.day`,
        [planId]
      );

      const now = Date.now();
      let synced = 0;

      for (const row of postsRes.rows) {
        const metadata = typeof row.metadata === 'string' ? JSON.parse(row.metadata) : (row.metadata || {});
        let images = [];
        if (Array.isArray(row.slides)) {
          images = [...row.slides].sort((a, b) => a.slide_index - b.slide_index)
            .filter(s => s.generated_asset).map(s => s.generated_asset);
        }

        const data = {
          title: metadata.title || '',
          type: row.type || metadata.type || 'single',
          hook: metadata.hook || '',
          caption: metadata.caption || '',
          hashtags: metadata.hashtags || [],
          image_prompt: metadata.image_prompt || '',
          bullets: metadata.bullets || [],
          audience: metadata.audience || '',
          platforms: metadata.platforms || [],
          cta: metadata.cta || '',
          tag: metadata.tag || '',
          images,
          postId: row.id,
        };

        await pool.query(
          `insert into calendar_days (month, year, day, data, source_plan_id, created_at, updated_at)
           values ($1,$2,$3,$4,$5,$6,$6)
           on conflict (month, year, day)
           do update set data = $4, source_plan_id = $5, updated_at = $6`,
          [monthNum, year, row.day, JSON.stringify(data), planId, now]
        );
        synced++;
      }

      return json({ ok: true, synced, month: monthNum, year });
    } finally {
      await pool.end();
    }
  } catch (err) {
    console.error('sync-calendar.js error:', err);
    return json({ error: String(err?.message || err) }, 500);
  }
}
