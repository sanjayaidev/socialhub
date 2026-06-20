// pages/api/init-db.js
// Edge function to initialize Turso database schema on first run or deployment
// Call this endpoint once after deploying to Vercel to create tables
//
// Required env vars (set in Vercel → Settings → Environment Variables):
//   TURSO_DATABASE_URL   your Turso database URL (e.g., libsql://...)
//   TURSO_AUTH_TOKEN     your Turso authentication token

export const config = { runtime: 'edge' };

import { createClient } from '@libsql/client';

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, x-api-secret',
};

function json(obj, status = 200) {
    return new Response(JSON.stringify(obj), {
        status,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
}

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

async function checkTableExists(client) {
    const result = await client.execute(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name='content_items'
    `);
    return result.rows.length > 0;
}

async function checkIndexExists(client) {
    const result = await client.execute(`
        SELECT name FROM sqlite_master 
        WHERE type='index' AND name='idx_content_items_day'
    `);
    return result.rows.length > 0;
}

async function initializeDatabase() {
    const client = getTursoClient();
    const actions = [];
    
    try {
        // Check if table already exists
        const tableExists = await checkTableExists(client);
        
        if (!tableExists) {
            // Create content_items table
            await client.execute(`
                CREATE TABLE IF NOT EXISTS content_items (
                    id TEXT PRIMARY KEY,
                    day INTEGER NOT NULL,
                    audience TEXT DEFAULT '',
                    raw TEXT NOT NULL,
                    refined TEXT DEFAULT '',
                    platforms TEXT DEFAULT '[]',
                    hook TEXT DEFAULT '',
                    description TEXT DEFAULT '',
                    cta TEXT DEFAULT '',
                    hashtags TEXT DEFAULT '',
                    design_spec TEXT DEFAULT NULL,
                    design_image TEXT DEFAULT NULL
                )
            `);
            actions.push('Created content_items table');
        } else {
            actions.push('content_items table already exists');
        }
        
        // Check if index already exists
        const indexExists = await checkIndexExists(client);
        
        if (!indexExists) {
            // Create index on day for faster sorting
            await client.execute(`
                CREATE INDEX IF NOT EXISTS idx_content_items_day ON content_items(day)
            `);
            actions.push('Created idx_content_items_day index');
        } else {
            actions.push('idx_content_items_day index already exists');
        }
        
        return { success: true, actions };
    } catch (error) {
        throw error;
    } finally {
        client.close();
    }
}

export default async function handler(req) {
    if (req.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    // Optional: Add secret protection for production
    const secret = process.env.CONTENT_API_SECRET;
    if (secret && req.headers.get('x-api-secret') !== secret) {
        return json({ error: 'unauthorized' }, 401);
    }

    try {
        if (req.method === 'GET' || req.method === 'POST') {
            const result = await initializeDatabase();
            return json({
                message: 'Database initialization complete',
                ...result
            });
        }

        return json({ error: 'method not allowed' }, 405);
    } catch (err) {
        console.error('Database initialization error:', err);
        return json({ 
            error: 'Database initialization failed',
            details: String(err && err.message ? err.message : err) 
        }, 500);
    }
}
