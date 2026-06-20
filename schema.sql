-- Neon Database Schema for Content Planner
-- This schema is auto-applied via /api/init-db endpoint

-- Create content_items table (legacy, kept for backward compatibility)
CREATE TABLE IF NOT EXISTS content_items (
    id TEXT PRIMARY KEY,
    day INTEGER NOT NULL,
    audience TEXT DEFAULT '',
    raw TEXT NOT NULL,
    refined TEXT DEFAULT '',
    platforms TEXT DEFAULT '[]',  -- JSON array stored as string
    hook TEXT DEFAULT '',
    description TEXT DEFAULT '',
    cta TEXT DEFAULT '',
    hashtags TEXT DEFAULT '',
    design_spec TEXT DEFAULT NULL,  -- JSON object stored as string
    design_image TEXT DEFAULT NULL  -- base64 data URL
);

-- Create index on day for faster sorting
CREATE INDEX IF NOT EXISTS idx_content_items_day ON content_items(day);

-- Create planner table with date range support
CREATE TABLE IF NOT EXISTS planner (
    id TEXT PRIMARY KEY,
    posting_date DATE NOT NULL,
    month INTEGER NOT NULL,
    year INTEGER NOT NULL,
    day_of_month INTEGER NOT NULL,
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
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for planner table
CREATE INDEX IF NOT EXISTS idx_planner_posting_date ON planner(posting_date);
CREATE INDEX IF NOT EXISTS idx_planner_month_year ON planner(month, year);
CREATE INDEX IF NOT EXISTS idx_planner_day_of_month ON planner(day_of_month);
