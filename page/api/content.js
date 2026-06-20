// pages/api/content.js
// Edge function that connects to Turso database via Vercel Storage
// Uses @libsql/client for SQLite-compatible database operations
//
// Required env vars (set in Vercel → Settings → Environment Variables):
//   TURSO_DATABASE_URL   your Turso database URL (e.g., libsql://...)
//   TURSO_AUTH_TOKEN     your Turso authentication token

export const config = { runtime: 'edge' };

import { createClient } from '@libsql/client';

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

// Turso client helper - creates a client for Edge runtime
function getTursoClient() {
    const url = process.env.TURSO_DATABASE_URL;
    const authToken = process.env.TURSO_AUTH_TOKEN;
    
    if (!url) {
        throw new Error('Missing TURSO_DATABASE_URL environment variable');
    }
    
    return createClient({
        url: url,
        authToken: authToken,
    });
}

function authorized(req) {
    const secret = process.env.CONTENT_API_SECRET;
    if (!secret) return true; // no secret configured -> open endpoint
    return req.headers.get('x-api-secret') === secret;
}

function rowToItem(row) {
    // Convert database row to content item object
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

async function getAllItems() {
    const client = getTursoClient();
    try {
        const result = await client.execute('SELECT * FROM content_items ORDER BY day ASC');
        return result.rows.map(row => rowToItem(row));
    } finally {
        client.close();
    }
}

async function getItemById(id) {
    const client = getTursoClient();
    try {
        const result = await client.execute({
            sql: 'SELECT * FROM content_items WHERE id = ?',
            args: [id],
        });
        if (result.rows.length === 0) return null;
        return rowToItem(result.rows[0]);
    } finally {
        client.close();
    }
}

async function upsertItem(item) {
    const client = getTursoClient();
    try {
        // Check if item exists
        const existing = await client.execute({
            sql: 'SELECT id FROM content_items WHERE id = ?',
            args: [item.id],
        });
        
        if (existing.rows.length > 0) {
            // Update existing item
            await client.execute({
                sql: `UPDATE content_items SET 
                    day = ?, audience = ?, raw = ?, refined = ?, 
                    platforms = ?, hook = ?, description = ?, cta = ?, 
                    hashtags = ?, design_spec = ?, design_image = ?
                    WHERE id = ?`,
                args: [
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
                ],
            });
        } else {
            // Insert new item
            await client.execute({
                sql: `INSERT INTO content_items 
                    (id, day, audience, raw, refined, platforms, hook, description, cta, hashtags, design_spec, design_image)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                args: [
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
                ],
            });
        }
    } finally {
        client.close();
    }
}

async function deleteItem(id) {
    const client = getTursoClient();
    try {
        await client.execute({
            sql: 'DELETE FROM content_items WHERE id = ?',
            args: [id],
        });
    } finally {
        client.close();
    }
}

async function deleteAllItems() {
    const client = getTursoClient();
    try {
        await client.execute('DELETE FROM content_items');
    } finally {
        client.close();
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

    try {
        if (req.method === 'GET') {
            const items = await getAllItems();
            return json({ items });
        }

        if (req.method === 'POST') {
            const body = await req.json();

            // Bulk replace-all (used by the planner's Import feature and initial seed)
            if (searchParams.get('bulk') === '1') {
                const items = Array.isArray(body.items) ? body.items : [];
                // Delete all existing items first
                await deleteAllItems();
                // Insert new items
                for (const item of items) {
                    if (item.id && item.raw) await upsertItem(item);
                }
                return json({ ok: true, count: items.length });
            }

            // Single upsert (add or edit)
            if (!body.id || !body.raw) {
                return json({ error: 'id and raw are required' }, 400);
            }
            await upsertItem(body);
            return json({ ok: true, id: body.id });
        }

        if (req.method === 'DELETE') {
            const id = searchParams.get('id');
            if (!id) return json({ error: 'id query param required' }, 400);
            await deleteItem(id);
            return json({ ok: true });
        }

        return json({ error: 'method not allowed' }, 405);
    } catch (err) {
        console.error('Database error:', err);
        return json({ error: String(err && err.message ? err.message : err) }, 500);
    }
}
