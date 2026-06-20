// pages/api/content.js
// Edge function that sits between the Content Planner artifact and Appwrite.
// Same shape as pages/api/chat.js: one file, plain fetch-compatible client,
// no Node-only APIs (so it works on the Edge runtime).
//
// Required env vars (set in Vercel → Settings → Environment Variables):
//   APPWRITE_ENDPOINT    e.g. https://cloud.appwrite.io/v1
//   APPWRITE_PROJECT_ID  your Appwrite project ID
//   APPWRITE_DATABASE_ID your Appwrite database ID
//   APPWRITE_COLLECTION_ID your Appwrite collection ID for content_items
//   APPWRITE_API_KEY     your Appwrite API key with appropriate permissions
// Optional:
//   CONTENT_API_SECRET   if set, every request must send header
//                         x-api-secret: <value>. If unset, the endpoint is open
//                         (fine for solo/dev use, not for anything public).

export const config = { runtime: 'edge' };

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

// Appwrite client helper - creates a fetch-compatible client for Edge runtime
function getAppwriteClient() {
    const endpoint = process.env.APPWRITE_ENDPOINT;
    const projectId = process.env.APPWRITE_PROJECT_ID;
    const apiKey = process.env.APPWRITE_API_KEY;
    
    if (!endpoint || !projectId || !apiKey) {
        throw new Error('Missing required Appwrite environment variables');
    }
    
    return {
        endpoint: endpoint.replace(/\/$/, ''), // Remove trailing slash
        projectId,
        apiKey,
        databaseId: process.env.APPWRITE_DATABASE_ID,
        collectionId: process.env.APPWRITE_COLLECTION_ID,
    };
}

function makeAppwriteHeaders() {
    const client = getAppwriteClient();
    return {
        'Content-Type': 'application/json',
        'X-Appwrite-Project': client.projectId,
        'Authorization': `Bearer ${client.apiKey}`,
    };
}

function authorized(req) {
    const secret = process.env.CONTENT_API_SECRET;
    if (!secret) return true; // no secret configured -> open endpoint
    return req.headers.get('x-api-secret') === secret;
}

function rowToItem(doc) {
    // Appwrite documents have $id, $createdAt, $updatedAt metadata
    return {
        id: doc.$id || doc.id,
        day: doc.day,
        audience: doc.audience || '',
        raw: doc.raw,
        refined: doc.refined || '',
        platforms: doc.platforms ? (typeof doc.platforms === 'string' ? JSON.parse(doc.platforms) : doc.platforms) : [],
        hook: doc.hook || '',
        description: doc.description || '',
        cta: doc.cta || '',
        hashtags: doc.hashtags || '',
        designSpec: doc.design_spec ? (typeof doc.design_spec === 'string' ? JSON.parse(doc.design_spec) : doc.design_spec) : undefined,
        designImage: doc.design_image || undefined,
    };
}

async function appwriteFetch(path, options = {}) {
    const client = getAppwriteClient();
    const url = `${client.endpoint}/databases/${client.databaseId}/collections/${client.collectionId}/documents${path}`;
    const headers = makeAppwriteHeaders();
    
    const res = await fetch(url, { ...options, headers });
    if (!res.ok) {
        let detail = '';
        try { detail = JSON.stringify(await res.json()); } catch (e) {}
        throw new Error(`Appwrite error ${res.status} ${detail}`.slice(0, 200));
    }
    return res.json();
}

async function upsertItem(item) {
    const client = getAppwriteClient();
    const docId = item.id;
    
    // Prepare document data for Appwrite
    const document = {
        day: item.day,
        audience: item.audience || '',
        raw: item.raw,
        refined: item.refined || '',
        platforms: JSON.stringify(item.platforms || []),
        hook: item.hook || '',
        description: item.description || '',
        cta: item.cta || '',
        hashtags: item.hashtags || '',
        design_spec: item.designSpec ? JSON.stringify(item.designSpec) : null,
        design_image: item.designImage || null,
    };
    
    // Try to update existing document, or create if it doesn't exist
    try {
        await appwriteFetch(`/${docId}`, {
            method: 'PUT',
            body: JSON.stringify(document),
        });
    } catch (err) {
        // If document doesn't exist, create it
        if (err.message.includes('404')) {
            await appwriteFetch('', {
                method: 'POST',
                body: JSON.stringify({ ...document, $id: docId }),
            });
        } else {
            throw err;
        }
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
            // Appwrite doesn't have a simple "get all" without pagination, so we'll fetch with limit=100
            // For more than 100 items, you'd need to implement pagination
            const result = await appwriteFetch('?limit=100');
            const items = (result.documents || []).map(rowToItem).sort((a, b) => a.day - b.day);
            return json({ items });
        }

        if (req.method === 'POST') {
            const body = await req.json();

            // Bulk replace-all (used by the planner's Import feature and initial seed)
            if (searchParams.get('bulk') === '1') {
                const items = Array.isArray(body.items) ? body.items : [];
                // Delete all existing documents first
                const current = await appwriteFetch('?limit=100');
                for (const doc of (current.documents || [])) {
                    try {
                        await appwriteFetch(`/${doc.$id}`, { method: 'DELETE' });
                    } catch (e) { /* ignore delete errors */ }
                }
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
            await appwriteFetch(`/${id}`, { method: 'DELETE' });
            return json({ ok: true });
        }

        return json({ error: 'method not allowed' }, 405);
    } catch (err) {
        return json({ error: String(err && err.message ? err.message : err) }, 500);
    }
}
