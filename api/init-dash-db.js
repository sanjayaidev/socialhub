// pages/api/init-dash-db.js
// Edge function to initialize Neon database schema for dashboard and AI designs
// Uses DASH_URL environment variable for separate database connection
//
// Required env vars (set in Vercel → Settings → Environment Variables):
//   DASH_URL   your Neon database URL for dashboard/ai-designs tables

export const config = { runtime: 'edge' };

import { Pool } from '@neondatabase/serverless';

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

async function checkTableExists(pool, tableName) {
    const result = await pool.query(`
        SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name = $1
        )
    `, [tableName]);
    return result.rows[0].exists;
}

async function initializeDatabase() {
    const pool = getNeonPool();
    const actions = [];
    
    try {
        // Create plans table
        if (!(await checkTableExists(pool, 'plans'))) {
            await pool.query(`
                CREATE TABLE plans (
                    id TEXT PRIMARY KEY,
                    month VARCHAR NOT NULL,
                    year VARCHAR NOT NULL,
                    status VARCHAR DEFAULT 'in_progress',
                    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
                )
            `);
            actions.push('Created plans table');
        } else {
            actions.push('plans table already exists');
        }
        
        // Create daily_posts table
        if (!(await checkTableExists(pool, 'daily_posts'))) {
            await pool.query(`
                CREATE TABLE daily_posts (
                    id VARCHAR PRIMARY KEY,
                    plan_id TEXT REFERENCES plans(id) ON DELETE CASCADE,
                    day INTEGER NOT NULL,
                    type VARCHAR NOT NULL,
                    metadata JSONB,
                    status VARCHAR DEFAULT 'pending',
                    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
                )
            `);
            actions.push('Created daily_posts table');
            
            // Create indexes
            await pool.query(`CREATE INDEX IF NOT EXISTS idx_daily_posts_plan_id ON daily_posts(plan_id)`);
            await pool.query(`CREATE INDEX IF NOT EXISTS idx_daily_posts_day ON daily_posts(day)`);
            actions.push('Created daily_posts indexes');
        } else {
            actions.push('daily_posts table already exists');
        }
        
        // Create post_slides table
        if (!(await checkTableExists(pool, 'post_slides'))) {
            await pool.query(`
                CREATE TABLE post_slides (
                    id VARCHAR PRIMARY KEY,
                    post_id VARCHAR REFERENCES daily_posts(id) ON DELETE CASCADE,
                    slide_index INTEGER NOT NULL,
                    role VARCHAR NOT NULL,
                    design_spec JSONB,
                    generated_asset TEXT,
                    status VARCHAR DEFAULT 'pending',
                    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(post_id, slide_index)
                )
            `);
            actions.push('Created post_slides table');
            
            // Create indexes
            await pool.query(`CREATE INDEX IF NOT EXISTS idx_post_slides_post_id ON post_slides(post_id)`);
            actions.push('Created post_slides indexes');
        } else {
            actions.push('post_slides table already exists');
        }
        
        // Create ai_images table
        if (!(await checkTableExists(pool, 'ai_images'))) {
            await pool.query(`
                CREATE TABLE ai_images (
                    id TEXT PRIMARY KEY,
                    "planId" TEXT NOT NULL,
                    day INTEGER NOT NULL,
                    "slideIndex" INTEGER NOT NULL,
                    type TEXT NOT NULL,
                    "imageUrl" TEXT NOT NULL,
                    prompt TEXT NOT NULL,
                    "aspectRatio" TEXT NOT NULL,
                    "sourceJson" JSONB,
                    "createdAt" BIGINT NOT NULL,
                    "updatedAt" BIGINT NOT NULL
                )
            `);
            actions.push('Created ai_images table');
            
            // Create indexes
            await pool.query(`CREATE INDEX IF NOT EXISTS idx_ai_images_planid ON ai_images("planId")`);
            await pool.query(`CREATE INDEX IF NOT EXISTS idx_ai_images_day ON ai_images(day)`);
            actions.push('Created ai_images indexes');
        } else {
            actions.push('ai_images table already exists');
        }
        
        return { ok: true, actions };
    } catch (err) {
        console.error('Database initialization error:', err);
        throw err;
    } finally {
        await pool.end();
    }
}

export default async function handler(req) {
    if (req.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    
    if (req.method !== 'POST') {
        return json({ error: 'method not allowed' }, 405);
    }
    
    try {
        const result = await initializeDatabase();
        return json(result);
    } catch (err) {
        console.error('Init DB error:', err);
        return json({ error: String(err.message || err), actions: [] }, 500);
    }
}
