-- Neon Database Schema for Content Planner
-- This schema is auto-applied via /api/init-db endpoint

-- Create content_plans table
CREATE TABLE IF NOT EXISTS content_plans (
    id SERIAL PRIMARY KEY,
    month INTEGER NOT NULL,
    year INTEGER NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Create content_posts table
CREATE TABLE IF NOT EXISTS content_posts (
    id SERIAL PRIMARY KEY,
    plan_id INTEGER REFERENCES content_plans(id) ON DELETE CASCADE,
    day INTEGER NOT NULL,
    type TEXT DEFAULT 'single',
    title TEXT DEFAULT '',
    hook TEXT DEFAULT '',
    caption TEXT DEFAULT '',
    hashtags TEXT DEFAULT '[]',
    image_prompt TEXT DEFAULT '',
    bullets TEXT DEFAULT '[]',
    slides TEXT DEFAULT '[]',
    cta TEXT DEFAULT '',
    tag TEXT DEFAULT '',
    images TEXT DEFAULT '[]',
    status TEXT DEFAULT 'ideas_ready',
    brand_settings TEXT DEFAULT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for content_posts table
CREATE INDEX IF NOT EXISTS idx_content_posts_plan_id ON content_posts(plan_id);
CREATE INDEX IF NOT EXISTS idx_content_posts_day ON content_posts(day);

-- Create content_items table
CREATE TABLE IF NOT EXISTS content_items (
    id TEXT PRIMARY KEY,
    day INTEGER NOT NULL,
    month INTEGER DEFAULT 7 NOT NULL,
    audience TEXT DEFAULT '',
    raw TEXT NOT NULL,
    refined TEXT DEFAULT '',
    platforms TEXT DEFAULT '[]',  -- JSON array stored as string
    hook TEXT DEFAULT '',
    description TEXT DEFAULT '',
    cta TEXT DEFAULT '',
    hashtags TEXT DEFAULT '',
    design_spec TEXT DEFAULT NULL,  -- JSON object stored as string
    design_image TEXT DEFAULT NULL,  -- base64 data URL
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for content_items table
CREATE INDEX IF NOT EXISTS idx_content_items_day ON content_items(day);
CREATE INDEX IF NOT EXISTS idx_content_items_audience ON content_items(audience);
CREATE INDEX IF NOT EXISTS idx_content_items_month_day ON content_items(month, day);
