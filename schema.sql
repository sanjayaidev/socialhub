-- Neon Database Schema for Content Planner
-- This schema is auto-applied via /api/init-db endpoint

-- Create content_items table with month and date support (updated for January 2026)
CREATE TABLE IF NOT EXISTS content_items (
    id TEXT PRIMARY KEY,
    day INTEGER NOT NULL,
    month INTEGER DEFAULT 1,
    year INTEGER DEFAULT 2026,
    posting_date DATE DEFAULT '2026-01-01',
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

-- Create indexes for content_items table
CREATE INDEX IF NOT EXISTS idx_content_items_day ON content_items(day);
CREATE INDEX IF NOT EXISTS idx_content_items_month_year ON content_items(month, year);
CREATE INDEX IF NOT EXISTS idx_content_items_posting_date ON content_items(posting_date);

-- Create planner_item table (temporary storage for AI-generated content, same structure as content_items)
CREATE TABLE IF NOT EXISTS planner_item (
    id TEXT PRIMARY KEY,
    day INTEGER NOT NULL,
    month INTEGER NOT NULL,
    year INTEGER NOT NULL,
    posting_date DATE NOT NULL,
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
    status TEXT DEFAULT 'draft',  -- draft, saved, published
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for planner_item table
CREATE INDEX IF NOT EXISTS idx_planner_item_posting_date ON planner_item(posting_date);
CREATE INDEX IF NOT EXISTS idx_planner_item_month_year ON planner_item(month, year);
CREATE INDEX IF NOT EXISTS idx_planner_item_day_of_month ON planner_item(day_of_month);
CREATE INDEX IF NOT EXISTS idx_planner_item_status ON planner_item(status);

-- Legacy planner table (kept for backward compatibility)
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

-- Seed demo data into content_items table (January 2026)
-- This runs once when the table is created
DO $$
BEGIN
    -- Only seed if content_items table is empty
    IF NOT EXISTS (SELECT 1 FROM content_items LIMIT 1) THEN
        INSERT INTO content_items (id, day, month, year, posting_date, audience, raw, refined, platforms, hook, description, cta, hashtags)
        VALUES 
        ('c1', 1, 1, 2026, '2026-01-01', 'client', 'WhatsApp tools cost too much every month', 'Why Pay ₹3,000+/Month for WATI or AiSensy When You Can Own It for ₹2,500 Once?', '["ig","yt","li"]', 'Coaches and clinics are renting WhatsApp automation for ₹3,000+/month. I sell the same thing for ₹2,500 — once.', 'GOwa is a self-hosted WhatsApp server: bulk messages, auto-replies, CRM hooks. No subscription, no lock-in. You own the server.', 'DM ''WHATSAPP'' or message me directly for a free quote.', '#whatsappautomation #smallbusiness #saas'),
        ('c2', 2, 1, 2026, '2026-01-02', 'student', 'People want to learn how I build all this', 'I''m Opening My Full-Stack Build System to Students — Here''s What''s Inside', '["yt","li"]', 'Everything I sell to clients, I now teach. Android, Web, Windows, Infra — one unified system.', 'Build with Sanjay isn''t pre-recorded fluff. It''s the exact stack I use for client work.', 'Full curriculum + pricing in bio.', '#learntobuild #fullstack #buildwithsanjay'),
        ('c3', 3, 1, 2026, '2026-01-03', 'client', 'Agencies overquote simple apps', 'An Agency Quoted a Client ₹80,000 and 3 Months. I Did It in 5 Days.', '["ig","yt","li"]', '₹80,000. Three months. That''s what an agency quoted. I build the same thing in 3–7 days.', 'React, Flutter, Supabase — one codebase for web, Android and iOS.', 'Tell me your problem on WhatsApp — free consultation.', '#webdev #appdevelopment #startupindia');
    END IF;
    
    -- Seed demo data into planner table (convert content_items demo data to planner format)
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
