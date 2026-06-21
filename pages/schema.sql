-- ============================================================
-- Content Planner — plans/posts schema
-- Run with: psql $DATABASE_URL -f schema-plans.sql
--
-- This replaces the flat content_items model in pages/api/content.js
-- with the plan -> posts model that dashboard.js and sidepanel.js
-- actually expect (Object.entries(allPlans), post.day/type/caption/
-- hashtags/slides/images/status, etc).
-- ============================================================

create extension if not exists "uuid-ossp";

create table if not exists content_plans (
  id            uuid primary key default uuid_generate_v4(),
  month         text not null,
  year          text not null,
  post_count    int not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists content_posts (
  id             uuid primary key default uuid_generate_v4(),
  plan_id        uuid not null references content_plans(id) on delete cascade,
  day            int not null,
  type           text not null default 'single',     -- single | carousel | story | reel-cover
  title          text,
  hook           text,
  caption        text,
  hashtags       jsonb not null default '[]',
  image_prompt   text,
  bullets        jsonb not null default '[]',
  slides         jsonb not null default '[]',
  cta            text,
  tag            text,
  images         jsonb not null default '[]',         -- array of data URLs / hosted URLs
  status         text not null default 'ideas_ready', -- ideas_ready | complete
  brand_settings jsonb,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (plan_id, day)
);

create index if not exists idx_content_posts_plan on content_posts(plan_id, day);

create or replace function set_updated_at_plans()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_content_plans_updated_at on content_plans;
create trigger trg_content_plans_updated_at before update on content_plans
  for each row execute function set_updated_at_plans();

drop trigger if exists trg_content_posts_updated_at on content_posts;
create trigger trg_content_posts_updated_at before update on content_posts
  for each row execute function set_updated_at_plans();
