// pages/api/content.js
// Edge function that connects to Neon database via Vercel Storage
// Uses @neondatabase/serverless for PostgreSQL operations
//
// Required env vars (set in Vercel → Settings → Environment Variables):
//   DATABASE_URL   your Neon database URL (e.g., postgresql://...)

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

// Neon client helper - creates a pool for Edge runtime
function getNeonPool() {
    const url = process.env.DATABASE_URL;
    
    if (!url) {
        throw new Error('Missing DATABASE_URL environment variable');
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

function rowToItem(row) {
    // Convert database row to content item object (legacy content_items table)
    return {
        id: row.id,
        day: row.day,
        audience: row.audience || '',
        raw: row.raw,
        refined: row.refined || '',
        platforms: row.platforms ? JSON.parse(row.platforms) : [],
        hook: row.hook || '',
        description: row.description || '',
        cta: row.cta || '',
        hashtags: row.hashtags || '',
        designSpec: row.design_spec ? JSON.parse(row.design_spec) : undefined,
        designImage: row.design_image || undefined,
    };
}

function plannerRowToItem(row) {
    // Convert planner table row to content item object
    return {
        id: row.id,
        postingDate: row.posting_date,
        month: row.month,
        year: row.year,
        dayOfMonth: row.day_of_month,
        audience: row.audience || '',
        raw: row.raw,
        refined: row.refined || '',
        platforms: row.platforms ? JSON.parse(row.platforms) : [],
        hook: row.hook || '',
        description: row.description || '',
        cta: row.cta || '',
        hashtags: row.hashtags || '',
        designSpec: row.design_spec ? JSON.parse(row.design_spec) : undefined,
        designImage: row.design_image || undefined,
    };
}

async function getAllItems() {
    const pool = getNeonPool();
    try {
        const result = await pool.query('SELECT * FROM content_items ORDER BY day ASC');
        return result.rows.map(row => rowToItem(row));
    } finally {
        await pool.end();
    }
}

async function getAllPlannerItems(month = null, year = null) {
    const pool = getNeonPool();
    try {
        let query = 'SELECT * FROM planner';
        let params = [];
        if (month !== null && year !== null) {
            query += ' WHERE month = $1 AND year = $2';
            params = [month, year];
        }
        query += ' ORDER BY posting_date ASC';
        const result = await pool.query(query, params);
        return result.rows.map(row => plannerRowToItem(row));
    } finally {
        await pool.end();
    }
}

async function getItemById(id) {
    const pool = getNeonPool();
    try {
        const result = await pool.query('SELECT * FROM content_items WHERE id = $1', [id]);
        if (result.rows.length === 0) return null;
        return rowToItem(result.rows[0]);
    } finally {
        await pool.end();
    }
}

async function getPlannerItemById(id) {
    const pool = getNeonPool();
    try {
        const result = await pool.query('SELECT * FROM planner WHERE id = $1', [id]);
        if (result.rows.length === 0) return null;
        return plannerRowToItem(result.rows[0]);
    } finally {
        await pool.end();
    }
}

async function upsertItem(item) {
    const pool = getNeonPool();
    try {
        // Check if item exists
        const existing = await pool.query('SELECT id FROM content_items WHERE id = $1', [item.id]);
        
        if (existing.rows.length > 0) {
            // Update existing item
            await pool.query(`UPDATE content_items SET 
                day = $1, audience = $2, raw = $3, refined = $4, 
                platforms = $5, hook = $6, description = $7, cta = $8, 
                hashtags = $9, design_spec = $10, design_image = $11
                WHERE id = $12`, [
                item.day,
                item.audience || '',
                item.raw,
                item.refined || '',
                JSON.stringify(item.platforms || []),
                item.hook || '',
                item.description || '',
                item.cta || '',
                item.hashtags || '',
                item.designSpec ? JSON.stringify(item.designSpec) : null,
                item.designImage || null,
                item.id,
            ]);
        } else {
            // Insert new item
            await pool.query(`INSERT INTO content_items 
                (id, day, audience, raw, refined, platforms, hook, description, cta, hashtags, design_spec, design_image)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`, [
                item.id,
                item.day,
                item.audience || '',
                item.raw,
                item.refined || '',
                JSON.stringify(item.platforms || []),
                item.hook || '',
                item.description || '',
                item.cta || '',
                item.hashtags || '',
                item.designSpec ? JSON.stringify(item.designSpec) : null,
                item.designImage || null,
            ]);
        }
    } finally {
        await pool.end();
    }
}

async function upsertPlannerItem(item) {
    const pool = getNeonPool();
    try {
        // Check if item exists
        const existing = await pool.query('SELECT id FROM planner WHERE id = $1', [item.id]);
        
        if (existing.rows.length > 0) {
            // Update existing item
            await pool.query(`UPDATE planner SET 
                posting_date = $1, month = $2, year = $3, day_of_month = $4,
                audience = $5, raw = $6, refined = $7, platforms = $8, 
                hook = $9, description = $10, cta = $11, hashtags = $12, 
                design_spec = $13, design_image = $14, updated_at = NOW()
                WHERE id = $15`, [
                item.postingDate,
                item.month,
                item.year,
                item.dayOfMonth,
                item.audience || '',
                item.raw,
                item.refined || '',
                JSON.stringify(item.platforms || []),
                item.hook || '',
                item.description || '',
                item.cta || '',
                item.hashtags || '',
                item.designSpec ? JSON.stringify(item.designSpec) : null,
                item.designImage || null,
                item.id,
            ]);
        } else {
            // Insert new item
            await pool.query(`INSERT INTO planner 
                (id, posting_date, month, year, day_of_month, audience, raw, refined, platforms, hook, description, cta, hashtags, design_spec, design_image)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`, [
                item.id,
                item.postingDate,
                item.month,
                item.year,
                item.dayOfMonth,
                item.audience || '',
                item.raw,
                item.refined || '',
                JSON.stringify(item.platforms || []),
                item.hook || '',
                item.description || '',
                item.cta || '',
                item.hashtags || '',
                item.designSpec ? JSON.stringify(item.designSpec) : null,
                item.designImage || null,
            ]);
        }
    } finally {
        await pool.end();
    }
}

async function deleteItem(id) {
    const pool = getNeonPool();
    try {
        await pool.query('DELETE FROM content_items WHERE id = $1', [id]);
    } finally {
        await pool.end();
    }
}

async function deletePlannerItem(id) {
    const pool = getNeonPool();
    try {
        await pool.query('DELETE FROM planner WHERE id = $1', [id]);
    } finally {
        await pool.end();
    }
}

async function deleteAllItems() {
    const pool = getNeonPool();
    try {
        await pool.query('DELETE FROM content_items');
    } finally {
        await pool.end();
    }
}

async function deleteAllPlannerItems() {
    const pool = getNeonPool();
    try {
        await pool.query('DELETE FROM planner');
    } finally {
        await pool.end();
    }
}

export default async function handler(req) {
    if (req.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    if (!authorized(req)) {
        return json({ error: 'unauthorized' }, 401);
    }

    const { searchParams } = new URL(req.url);
    const table = searchParams.get('table') || 'content_items'; // 'content_items' or 'planner'

    try {
        if (req.method === 'GET') {
            if (table === 'planner') {
                const month = searchParams.get('month');
                const year = searchParams.get('year');
                const items = await getAllPlannerItems(
                    month !== null ? parseInt(month) : null,
                    year !== null ? parseInt(year) : null
                );
                return json({ items });
            } else {
                const items = await getAllItems();
                return json({ items });
            }
        }

        if (req.method === 'POST') {
            const body = await req.json();

            // Bulk replace-all (used by the planner's Import feature and initial seed)
            if (searchParams.get('bulk') === '1') {
                const items = Array.isArray(body.items) ? body.items : [];
                // Delete all existing items first
                if (table === 'planner') {
                    await deleteAllPlannerItems();
                    for (const item of items) {
                        if (item.id && item.raw) await upsertPlannerItem(item);
                    }
                } else {
                    await deleteAllItems();
                    for (const item of items) {
                        if (item.id && item.raw) await upsertItem(item);
                    }
                }
                return json({ ok: true, count: items.length });
            }

            // Single upsert (add or edit)
            if (!body.id || !body.raw) {
                return json({ error: 'id and raw are required' }, 400);
            }
            if (table === 'planner') {
                await upsertPlannerItem(body);
            } else {
                await upsertItem(body);
            }
            return json({ ok: true, id: body.id });
        }

        if (req.method === 'DELETE') {
            const id = searchParams.get('id');
            if (!id) return json({ error: 'id query param required' }, 400);
            if (table === 'planner') {
                await deletePlannerItem(id);
            } else {
                await deleteItem(id);
            }
            return json({ ok: true });
        }

        return json({ error: 'method not allowed' }, 405);
    } catch (err) {
        console.error('Database error:', err);
        return json({ error: String(err && err.message ? err.message : err) }, 500);
    }
}
