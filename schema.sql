-- schema.sql
-- Run once against your Turso database:
--   turso db shell smagents-content < schema.sql

CREATE TABLE IF NOT EXISTS content_items (
    id           TEXT PRIMARY KEY,
    day          INTEGER NOT NULL,
    audience     TEXT,
    raw          TEXT NOT NULL,
    refined      TEXT,
    platforms    TEXT,    -- JSON array, e.g. ["ig","yt","li"]
    hook         TEXT,
    description  TEXT,
    cta          TEXT,
    hashtags     TEXT,
    design_spec  TEXT,    -- JSON object (Design Studio layout)
    design_image TEXT,    -- base64 PNG data URL
    created_at   TEXT DEFAULT (datetime('now')),
    updated_at   TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_content_items_day ON content_items(day);
