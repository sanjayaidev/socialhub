// pages/api/content.js
// Edge function that sits between the Content Planner artifact and Turso.
// Same shape as pages/api/chat.js: one file, plain fetch-compatible client,
// no Node-only APIs (so it works on the Edge runtime).
//
// Required env vars (set in Vercel → Settings → Environment Variables):
//   TURSO_DATABASE_URL   e.g. libsql://smagents-content-yourname.turso.io
//   TURSO_AUTH_TOKEN     token from `turso db tokens create`
// Optional:
//   CONTENT_API_SECRET   if set, every request must send header
//                         x-api-secret: <value>. If unset, the endpoint is open
//                         (fine for solo/dev use, not for anything public).

export const config = { runtime: 'edge' };

import { createClient } from '@libsql/client/web';

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

function db() {
    return createClient({
        url: process.env.TURSO_DATABASE_URL,
        authToken: process.env.TURSO_AUTH_TOKEN,
    });
}

function authorized(req) {
    const secret = process.env.CONTENT_API_SECRET;
    if (!secret) return true; // no secret configured -> open endpoint
    return req.headers.get('x-api-secret') === secret;
}

function rowToItem(row) {
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

async function upsertItem(client, item) {
    await client.execute({
        sql: `INSERT INTO content_items
            (id, day, audience, raw, refined, platforms, hook, description, cta, hashtags, design_spec, design_image, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
            ON CONFLICT(id) DO UPDATE SET
                day = excluded.day,
                audience = excluded.audience,
                raw = excluded.raw,
                refined = excluded.refined,
                platforms = excluded.platforms,
                hook = excluded.hook,
                description = excluded.description,
                cta = excluded.cta,
                hashtags = excluded.hashtags,
                design_spec = COALESCE(excluded.design_spec, content_items.design_spec),
                design_image = COALESCE(excluded.design_image, content_items.design_image),
                updated_at = datetime('now')`,
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

export default async function handler(req) {
    if (req.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    if (!authorized(req)) {
        return json({ error: 'unauthorized' }, 401);
    }

    const client = db();
    const { searchParams } = new URL(req.url);

    try {
        if (req.method === 'GET') {
            const result = await client.execute('SELECT * FROM content_items ORDER BY day ASC');
            return json({ items: result.rows.map(rowToItem) });
        }

        if (req.method === 'POST') {
            const body = await req.json();

            // Bulk replace-all (used by the planner's Import feature and initial seed)
            if (searchParams.get('bulk') === '1') {
                const items = Array.isArray(body.items) ? body.items : [];
                await client.execute('DELETE FROM content_items');
                for (const item of items) {
                    if (item.id && item.raw) await upsertItem(client, item);
                }
                return json({ ok: true, count: items.length });
            }

            // Single upsert (add or edit)
            if (!body.id || !body.raw) {
                return json({ error: 'id and raw are required' }, 400);
            }
            await upsertItem(client, body);
            return json({ ok: true, id: body.id });
        }

        if (req.method === 'DELETE') {
            const id = searchParams.get('id');
            if (!id) return json({ error: 'id query param required' }, 400);
            await client.execute({ sql: 'DELETE FROM content_items WHERE id = ?', args: [id] });
            return json({ ok: true });
        }

        return json({ error: 'method not allowed' }, 405);
    } catch (err) {
        return json({ error: String(err && err.message ? err.message : err) }, 500);
    }
}
