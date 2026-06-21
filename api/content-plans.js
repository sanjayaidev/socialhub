// pages/api/content-plans.js
// Edge function for dashboard and AI designs - manages plans, posts, slides, and AI images
// Uses separate DASH_URL environment variable for Neon database connection
//
// Required env vars (set in Vercel → Settings → Environment Variables):
//   DASH_URL   your Neon database URL for dashboard/ai-designs tables

export const config = { runtime: 'edge' };

import { Pool } from '@neondatabase/serverless';

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, x-api-secret',
};

function json(obj, status = 200) {
    return new Response(JSON.stringify(obj), {
        status,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
}

// Neon client helper - uses DASH_URL for dashboard/ai-designs database
function getNeonPool() {
    const url = process.env.DASH_URL;

    if (!url) {
        throw new Error('Missing DASH_URL environment variable');
    }

    return new Pool({
        connectionString: url,
        ssl: 'require',
    });
}

function authorized(req) {
    const secret = process.env.CONTENT_API_SECRET;
    if (!secret) return true; // no secret configured -> open endpoint
    return req.headers.get('x-api-secret') === secret;
}

// ── PLANS ──

async function getAllPlans() {
    const pool = getNeonPool();
    try {
        const result = await pool.query(`
            SELECT p.*, COUNT(dp.id) as post_count
            FROM plans p
            LEFT JOIN daily_posts dp ON p.id = dp.plan_id
            GROUP BY p.id
            ORDER BY p.created_at DESC
        `);
        
        const plans = {};
        for (const row of result.rows) {
            const key = `${row.month}_${row.year}`;
            plans[key] = {
                id: row.id,
                month: row.month,
                year: row.year,
                status: row.status,
                post_count: parseInt(row.post_count) || 0,
                created_at: row.created_at,
                updated_at: row.updated_at
            };
        }
        return plans;
    } finally {
        await pool.end();
    }
}

async function savePlan({ month, year, posts, planId }) {
    const pool = getNeonPool();
    try {
        let plan_id = planId;
        
        // Check if plan exists
        const existing = await pool.query(
            'SELECT id FROM plans WHERE month = $1 AND year = $2',
            [month, year]
        );
        
        if (existing.rows.length > 0) {
            plan_id = existing.rows[0].id;
            // Update existing plan
            await pool.query(
                'UPDATE plans SET updated_at = CURRENT_TIMESTAMP WHERE id = $1',
                [plan_id]
            );
        } else {
            // Create new plan
            plan_id = planId || `plan_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
            await pool.query(
                'INSERT INTO plans (id, month, year) VALUES ($1, $2, $3)',
                [plan_id, month, year]
            );
        }
        
        // Save posts if provided
        if (posts && Array.isArray(posts)) {
            for (const post of posts) {
                // Upsert daily_post
                const postId = post.id || `post_${plan_id}_${post.day}`;
                
                await pool.query(`
                    INSERT INTO daily_posts (id, plan_id, day, type, metadata, status)
                    VALUES ($1, $2, $3, $4, $5, $6)
                    ON CONFLICT (id) DO UPDATE SET
                        type = EXCLUDED.type,
                        metadata = EXCLUDED.metadata,
                        status = EXCLUDED.status,
                        updated_at = CURRENT_TIMESTAMP
                `, [
                    postId,
                    plan_id,
                    post.day,
                    post.type || 'single',
                    JSON.stringify({
                        title: post.title,
                        hook: post.hook,
                        bullets: post.bullets,
                        cta: post.cta,
                        image_prompt: post.image_prompt,
                        tag: post.tag,
                        slides: post.slides
                    }),
                    post.status || 'pending'
                ]);
                
                // Save slides if carousel type
                if (post.type === 'carousel' && post.slides && Array.isArray(post.slides)) {
                    for (let i = 0; i < post.slides.length; i++) {
                        const slide = post.slides[i];
                        const slideId = `slide_${postId}_${i}`;
                        
                        await pool.query(`
                            INSERT INTO post_slides (id, post_id, slide_index, role, design_spec, generated_asset, status)
                            VALUES ($1, $2, $3, $4, $5, $6, $7)
                            ON CONFLICT (id) DO UPDATE SET
                                role = EXCLUDED.role,
                                design_spec = EXCLUDED.design_spec,
                                generated_asset = EXCLUDED.generated_asset,
                                status = EXCLUDED.status,
                                updated_at = CURRENT_TIMESTAMP
                        `, [
                            slideId,
                            postId,
                            i,
                            slide.role || 'content',
                            JSON.stringify(slide.design_spec || {}),
                            slide.generated_asset || null,
                            slide.status || 'pending'
                        ]);
                    }
                }
            }
        }
        
        return { ok: true, planId: plan_id };
    } finally {
        await pool.end();
    }
}

async function getPlanDetails(planId) {
    const pool = getNeonPool();
    try {
        // Get all posts for this plan
        const postsResult = await pool.query(`
            SELECT * FROM daily_posts
            WHERE plan_id = $1
            ORDER BY day ASC
        `, [planId]);
        
        const posts = [];
        for (const postRow of postsResult.rows) {
            const post = {
                id: postRow.id,
                plan_id: postRow.plan_id,
                day: postRow.day,
                type: postRow.type,
                status: postRow.status,
                metadata: postRow.metadata ? JSON.parse(postRow.metadata) : {}
            };
            
            // Extract metadata fields
            const meta = post.metadata || {};
            post.title = meta.title || '';
            post.hook = meta.hook || '';
            post.bullets = meta.bullets || [];
            post.cta = meta.cta || '';
            post.image_prompt = meta.image_prompt || '';
            post.tag = meta.tag || '';
            post.slides = meta.slides || [];
            
            // Get slides for this post
            const slidesResult = await pool.query(`
                SELECT * FROM post_slides
                WHERE post_id = $1
                ORDER BY slide_index ASC
            `, [post.id]);
            
            if (slidesResult.rows.length > 0) {
                post.slides = slidesResult.rows.map((slideRow, idx) => ({
                    id: slideRow.id,
                    slideIndex: slideRow.slide_index,
                    role: slideRow.role,
                    design_spec: slideRow.design_spec ? JSON.parse(slideRow.design_spec) : {},
                    generated_asset: slideRow.generated_asset,
                    status: slideRow.status,
                    title: meta.slides?.[idx]?.title || '',
                    body: meta.slides?.[idx]?.body || '',
                    bullets: meta.slides?.[idx]?.bullets || [],
                    cta: meta.slides?.[idx]?.cta || '',
                    image_prompt: meta.slides?.[idx]?.image_prompt || post.image_prompt
                }));
            }
            
            // Check for AI-generated images
            const aiImagesResult = await pool.query(`
                SELECT * FROM ai_images
                WHERE "planId" = $1 AND day = $2
                ORDER BY "slideIndex" ASC
            `, [planId, post.day]);
            
            if (aiImagesResult.rows.length > 0) {
                post.images = aiImagesResult.rows.map(imgRow => ({
                    id: imgRow.id,
                    imageUrl: imgRow.imageUrl,
                    prompt: imgRow.prompt,
                    aspectRatio: imgRow.aspectRatio,
                    slideIndex: imgRow.slideIndex,
                    type: imgRow.type
                }));
            }
            
            posts.push(post);
        }
        
        return posts;
    } finally {
        await pool.end();
    }
}

async function deletePost({ postId }) {
    const pool = getNeonPool();
    try {
        // Delete cascades to post_slides via foreign key
        await pool.query('DELETE FROM daily_posts WHERE id = $1', [postId]);
        return { ok: true };
    } finally {
        await pool.end();
    }
}

async function deletePlan({ planId }) {
    const pool = getNeonPool();
    try {
        // Delete cascades to daily_posts and then to post_slides and ai_images
        await pool.query('DELETE FROM plans WHERE id = $1', [planId]);
        return { ok: true };
    } finally {
        await pool.end();
    }
}

// ── AI IMAGES ──

async function getAIImages(planId = null) {
    const pool = getNeonPool();
    try {
        let query = 'SELECT * FROM ai_images';
        let params = [];
        
        if (planId) {
            query += ' WHERE "planId" = $1';
            params = [planId];
        }
        
        query += ' ORDER BY day ASC, "slideIndex" ASC';
        
        const result = await pool.query(query, params);
        
        return result.rows.map(row => ({
            id: row.id,
            planId: row.planId,
            day: row.day,
            slideIndex: row.slideIndex,
            type: row.type,
            imageUrl: row.imageUrl,
            prompt: row.prompt,
            aspectRatio: row.aspectRatio,
            sourceJson: row.sourceJson,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt
        }));
    } finally {
        await pool.end();
    }
}

async function saveAIImage(data) {
    const pool = getNeonPool();
    try {
        const { id, planId, day, slideIndex, type, imageUrl, prompt, aspectRatio, sourceJson } = data;
        
        const now = Date.now();
        
        await pool.query(`
            INSERT INTO ai_images (id, "planId", day, "slideIndex", type, "imageUrl", prompt, "aspectRatio", "sourceJson", "createdAt", "updatedAt")
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            ON CONFLICT (id) DO UPDATE SET
                "imageUrl" = EXCLUDED."imageUrl",
                prompt = EXCLUDED.prompt,
                "aspectRatio" = EXCLUDED."aspectRatio",
                "sourceJson" = EXCLUDED."sourceJson",
                "updatedAt" = EXCLUDED."updatedAt"
        `, [
            id,
            planId,
            day,
            slideIndex,
            type,
            imageUrl,
            prompt,
            aspectRatio,
            JSON.stringify(sourceJson || {}),
            now,
            now
        ]);
        
        return { ok: true, id };
    } finally {
        await pool.end();
    }
}

async function deleteAIImage({ id }) {
    const pool = getNeonPool();
    try {
        await pool.query('DELETE FROM ai_images WHERE id = $1', [id]);
        return { ok: true };
    } finally {
        await pool.end();
    }
}

async function regenerateAIImage(data) {
    const pool = getNeonPool();
    try {
        const { id, prompt, imageUrl } = data;
        const now = Date.now();
        
        await pool.query(`
            UPDATE ai_images
            SET prompt = $1, "imageUrl" = $2, "updatedAt" = $3
            WHERE id = $4
        `, [prompt, imageUrl, now, id]);
        
        return { ok: true, id };
    } finally {
        await pool.end();
    }
}

// ── REQUEST HANDLER ──

export default async function handler(req) {
    if (req.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    
    if (!authorized(req)) {
        return json({ error: 'unauthorized' }, 401);
    }

    const url = new URL(req.url);
    const searchParams = url.searchParams;
    const action = searchParams.get('action');

    try {
        const body = req.method === 'POST' || req.method === 'DELETE' ? await req.json() : {};

        // Plans endpoints
        if (action === 'getAllPlans' || (req.method === 'GET' && url.pathname.includes('/content-plans'))) {
            const plans = await getAllPlans();
            return json({ plans });
        }

        if (action === 'savePlan' || (req.method === 'POST' && url.pathname.includes('/content-plans') && !action)) {
            const result = await savePlan(body);
            return json(result);
        }

        if (action === 'getPlanDetails') {
            const posts = await getPlanDetails(body.planId);
            return json({ posts });
        }

        if (action === 'deletePost') {
            const result = await deletePost(body);
            return json(result);
        }

        if (action === 'deletePlan') {
            const result = await deletePlan(body);
            return json(result);
        }

        // AI Images endpoints
        if (action === 'getAIImages') {
            const images = await getAIImages(body.planId);
            return json({ images });
        }

        if (action === 'saveAIImage') {
            const result = await saveAIImage(body);
            return json(result);
        }

        if (action === 'deleteAIImage') {
            const result = await deleteAIImage(body);
            return json(result);
        }

        if (action === 'regenerateAIImage') {
            const result = await regenerateAIImage(body);
            return json(result);
        }

        return json({ error: 'unknown action or method not allowed' }, 405);
    } catch (err) {
        console.error('Database error:', err);
        return json({ error: String(err.message || err) }, 500);
    }
}
