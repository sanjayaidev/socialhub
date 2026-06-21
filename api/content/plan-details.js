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
  
  // Build images array from post_slides if available
  let images = [];
  if (row.slides && Array.isArray(row.slides)) {
    // Sort slides by slide_index and extract generated_asset URLs
    const sortedSlides = [...row.slides].sort((a, b) => a.slide_index - b.slide_index);
    images = sortedSlides
      .filter(slide => slide.generated_asset)
      .map(slide => slide.generated_asset);
  }
  
  // Build slides array with status info if available
  let slides = null;
  if (row.slides && Array.isArray(row.slides)) {
    const sortedSlides = [...row.slides].sort((a, b) => a.slide_index - b.slide_index);
    slides = sortedSlides.map(slide => ({
      role: slide.role,
      design_spec: slide.design_spec,
      generated_asset: slide.generated_asset,
      status: slide.status
    }));
  }
  
  return {
    postId: row.id,
    day: row.day,
    type: row.type,
    images,
    slides,
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
      // Fetch posts with their slides from post_slides table using LEFT JOIN LATERAL
      const result = await pool.query(`
        SELECT 
          dp.id, 
          dp.day, 
          dp.type, 
          dp.metadata,
          COALESCE(
            (SELECT json_agg(slides ORDER BY slides.slide_index)
             FROM (
               SELECT ps.slide_index, ps.role, ps.design_spec, ps.generated_asset, ps.status
               FROM post_slides ps
               WHERE ps.post_id = dp.id
               ORDER BY ps.slide_index
             ) slides
            ), '[]'::json
          ) as slides
        FROM daily_posts dp
        WHERE dp.plan_id = $1
        ORDER BY dp.day ASC
      `, [planId]);
      return result.rows.map(rowToPost);
    } finally {
      await pool.end();
    }
  } catch (err) {
    console.error('plan-details.js error:', err);
    return json({ error: String(err?.message || err) }, 500);
  }
}
