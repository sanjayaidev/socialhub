-- Turso Database Schema for Content Planner
-- Run this SQL in your Turso console or via the libsql client to create the table

-- Create content_items table
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

-- Optional: Sample data for testing
-- INSERT INTO content_items (id, day, audience, raw, refined, platforms, hook, description, cta, hashtags)
-- VALUES ('sample-1', 1, 'developers', 'Build a todo app', 'Learn to build a production-ready todo application', '["twitter", "linkedin"]', '🧵 Build a todo app in 10 minutes', 'Step-by-step guide...', 'Try it now!', '#coding #webdev');
