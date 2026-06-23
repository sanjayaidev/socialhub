// api/content/plan.js
//
// GET  /api/content/plans              -> { [planId]: { id, month, year, post_count } }
// POST /api/content/plans { month, year, posts, planId? }
//      -> creates a new plan if planId is absent, otherwise replaces
//         ALL posts under the given planId with the supplied array
//         (full replace, not a merge — matches how sidepanel.js /
//         dashboard.js always send the complete current post list).

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

async function listPlans() {
  const pool = getPool();
  try {
    const result = await pool.query(`
      select p.id, p.month, p.year, count(d.id)::int as post_count
      from plans p
      left join daily_posts d on d.plan_id = p.id
      group by p.id, p.month, p.year
      order by p.created_at desc
    `);
    const out = {};
    for (const row of result.rows) {
      out[row.id] = { id: row.id, month: row.month, year: row.year, post_count: row.post_count };
    }
    return out;
  } finally {
    await pool.end();
  }
}

async function upsertPostsForPlan(pool, planId, posts) {
  // Full replace: delete existing posts for this plan, reinsert the
  // supplied array. Simpler and matches the "always send the whole
  // currentPosts array" pattern used by the frontend.
  await pool.query('delete from daily_posts where plan_id = $1', [planId]);
  for (const post of posts) {
    await pool.query(
      `insert into daily_posts
        (plan_id, day, type, metadata, status)
       values ($1,$2,$3,$4,$5)`,
      [
        planId,
        post.day,
        post.type || 'single',
        JSON.stringify(post),
        post.status || 'pending',
      ]
    );
  }
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  try {
    if (req.method === 'GET') {
      const plans = await listPlans();
      return json(plans);
    }

    if (req.method === 'POST') {
      const body = await req.json();
      const { month, year, posts, planId } = body || {};
      if (!month || !year || !Array.isArray(posts)) {
        return json({ error: 'month, year, and posts[] are required' }, 400);
      }

      const pool = getPool();
      try {
        if (planId) {
          const existing = await pool.query('select id from plans where id = $1', [planId]);
          if (existing.rows.length === 0) {
            return json({ error: 'Plan not found' }, 404);
          }
          await pool.query('update plans set month = $1, year = $2 where id = $3', [month, year, planId]);
          await upsertPostsForPlan(pool, planId, posts);
          return json({ ok: true, planId });
        }

        const newPlanId = `plan_${month}_${year}_${Date.now()}`;
        const created = await pool.query(
          'insert into plans (id, month, year) values ($1, $2, $3) returning id',
          [newPlanId, month, year]
        );
        const newPlanId = created.rows[0].id;
        await upsertPostsForPlan(pool, newPlanId, posts);
        return json({ ok: true, planId: newPlanId }, 201);
      } finally {
        await pool.end();
      }
    }

    return json({ error: 'Method not allowed' }, 405);
  } catch (err) {
    console.error('plans.js error:', err);
    return json({ error: String(err?.message || err) }, 500);
  }
}
