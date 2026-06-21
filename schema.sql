-- Neon Database Schema for Content Planner
-- This schema is auto-applied via /api/init-db endpoint

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
