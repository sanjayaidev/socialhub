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

-- Seed demo data into planner table (convert content_items demo data to planner format)
-- This runs once when the table is created
DO $$
BEGIN
    -- Only seed if planner table is empty
    IF NOT EXISTS (SELECT 1 FROM planner LIMIT 1) THEN
        INSERT INTO planner (id, posting_date, month, year, day_of_month, audience, raw, refined, platforms, hook, description, cta, hashtags)
        VALUES 
        ('p1', '2025-01-01', 1, 2025, 1, 'client', 'WhatsApp tools cost too much every month', 'Why Pay ₹3,000+/Month for WATI or AiSensy When You Can Own It for ₹2,500 Once?', '["ig","yt","li"]', 'Coaches and clinics are renting WhatsApp automation for ₹3,000+/month. I sell the same thing for ₹2,500 — once.', 'GOwa is a self-hosted WhatsApp server: bulk messages, auto-replies, CRM hooks. No subscription, no lock-in. You own the server.', 'DM ''WHATSAPP'' or message me directly for a free quote.', '#whatsappautomation #smallbusiness #saas'),
        ('p2', '2025-01-02', 1, 2025, 2, 'student', 'People want to learn how I build all this', 'I''m Opening My Full-Stack Build System to Students — Here''s What''s Inside', '["yt","li"]', 'Everything I sell to clients, I now teach. Android, Web, Windows, Infra — one unified system.', 'Build with Sanjay isn''t pre-recorded fluff. It''s the exact stack I use for client work.', 'Full curriculum + pricing in bio.', '#learntobuild #fullstack #buildwithsanjay'),
        ('p3', '2025-01-03', 1, 2025, 3, 'client', 'Agencies overquote simple apps', 'An Agency Quoted a Client ₹80,000 and 3 Months. I Did It in 5 Days.', '["ig","yt","li"]', '₹80,000. Three months. That''s what an agency quoted. I build the same thing in 3–7 days.', 'React, Flutter, Supabase — one codebase for web, Android and iOS.', 'Tell me your problem on WhatsApp — free consultation.', '#webdev #appdevelopment #startupindia');
    END IF;
END
$$;
