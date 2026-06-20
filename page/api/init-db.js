// pages/api/init-db.js
// Edge function to initialize Neon database schema on first run or deployment
// Automatically runs migrations and seeds demo data if not already done
//
// Required env vars (set in Vercel → Settings → Environment Variables):
//   DATABASE_URL   your Neon database URL (e.g., postgresql://...)

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
    const url = process.env.DATABASE_URL;
    
    if (!url) {
        throw new Error('Missing DATABASE_URL environment variable');
    }
    
    return new Pool({
        connectionString: url,
        ssl: 'require',
    });
}

async function checkMigrationApplied(pool, migrationName) {
    const result = await pool.query(`
        SELECT 1 FROM _migrations WHERE migration_name = $1
    `, [migrationName]);
    return result.rows.length > 0;
}

async function recordMigration(pool, migrationName) {
    await pool.query(`
        INSERT INTO _migrations (migration_name) VALUES ($1)
    `, [migrationName]);
}

async function initializeDatabase() {
    const pool = getNeonPool();
    const actions = [];
    
    try {
        // Create migrations table if it doesn't exist
        const createMigrationsTable = `
            CREATE TABLE IF NOT EXISTS _migrations (
                id SERIAL PRIMARY KEY,
                migration_name TEXT UNIQUE NOT NULL,
                applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `;
        await pool.query(createMigrationsTable);
        actions.push('Ensured _migrations table exists');
        
        // Check if main migration already ran
        const migrationAlreadyRan = await checkMigrationApplied(pool, 'create_content_items_v1');
        
        if (!migrationAlreadyRan) {
            // Create content_items table
            const createTableSQL = `
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
            `;
            await pool.query(createTableSQL);
            actions.push('Created content_items table');
            
            // Create index on day for faster sorting
            const createIndexSQL = `
                CREATE INDEX IF NOT EXISTS idx_content_items_day ON content_items(day)
            `;
            await pool.query(createIndexSQL);
            actions.push('Created idx_content_items_day index');
            
            // Record migration as complete
            await recordMigration(pool, 'create_content_items_v1');
            actions.push('Recorded migration create_content_items_v1');
        } else {
            actions.push('Migration create_content_items_v1 already applied');
        }
        
        // Check if demo data migration already ran
        const demoDataAlreadyInserted = await checkMigrationApplied(pool, 'seed_demo_data_v1');
        
        if (!demoDataAlreadyInserted) {
            // Insert demo data
            const demoData = [
                { id: 'd1', day: 1, audience: 'client', raw: "WhatsApp tools cost too much every month", refined: "Why Pay ₹3,000+/Month for WATI or AiSensy When You Can Own It for ₹2,500 Once?", platforms: ["ig","yt","li"], hook: "Coaches and clinics are renting WhatsApp automation for ₹3,000+/month. I sell the same thing for ₹2,500 — once.", description: "GOwa is a self-hosted WhatsApp server: bulk messages, auto-replies, CRM hooks. No subscription, no lock-in. You own the server.", cta: "DM 'WHATSAPP' or message me directly for a free quote.", hashtags: "#whatsappautomation #smallbusiness #saas" },
                { id: 'd2', day: 2, audience: 'student', raw: "People want to learn how I build all this", refined: "I'm Opening My Full-Stack Build System to Students — Here's What's Inside", platforms: ["yt","li"], hook: "Everything I sell to clients, I now teach. Android, Web, Windows, Infra — one unified system.", description: "Build with Sanjay isn't pre-recorded fluff. It's the exact stack I use for client work: shared auth, shared databases, one AI backend across every app you build.", cta: "Full curriculum + pricing in bio. Apply for the ₹25,000 bundle or pick a single module.", hashtags: "#learntobuild #fullstack #buildwithsanjay" },
                { id: 'd3', day: 3, audience: 'client', raw: "Agencies overquote simple apps", refined: "An Agency Quoted a Client ₹80,000 and 3 Months. I Did It in 5 Days.", platforms: ["ig","yt","li"], hook: "₹80,000. Three months. That's what an agency quoted for a simple business app. I build the same thing in 3–7 days.", description: "React, Flutter, Supabase — one codebase for web, Android and iOS. Fixed price from ₹5,000. You only pay after you confirm it works.", cta: "Tell me your problem on WhatsApp — free consultation, no commitment.", hashtags: "#webdev #appdevelopment #startupindia" },
                { id: 'd4', day: 4, audience: 'student', raw: "Show the infra module value", refined: "The ₹15,000 Module Most Students Skip — And Why It's the One That Actually Matters", platforms: ["yt","li"], hook: "Everyone wants to learn the flashy app. Almost nobody wants to learn deployment, auth, and databases. That's the mistake.", description: "The Infrastructure module covers deploy, DB, auth, APIs, Docker, Supabase, Cloudflare — the unglamorous skills that make every other app actually ship.", cta: "Module breakdown and pricing at the course pricing page — link in bio.", hashtags: "#webdevelopment #supabase #learntocode" },
                { id: 'd5', day: 5, audience: 'client', raw: "Proof: GOwa saved a client real money", refined: "This Client Was Paying ₹4,000/Month Just to Send WhatsApp Messages. Not Anymore.", platforms: ["ig","yt","li"], hook: "₹48,000+ saved a year. That's what switching from WATI/Interakt to a self-hosted server actually looks like.", description: "GOwa is live, not a mockup — a self-hosted WhatsApp API server I deploy for businesses who are tired of renting basic messaging tools.", cta: "Want the same setup? Message me — fixed price, pay after it works.", hashtags: "#whatsappapi #costsaving #smallbusinessindia" },
                { id: 'd6', day: 6, audience: 'student', raw: "Android module — what you actually build", refined: "In the Android Module, You Don't Just Learn Kotlin — You Ship 3 Real Apps", platforms: ["yt","li"], hook: "₹8,000 and you walk away with PocketAI, CGLive, and StreamStudio — real, working apps, not toy projects.", description: "This is the same engineering I use for paying clients, broken into a module you can finish on your own timeline.", cta: "See the full module list and the bundle discount — course pricing in bio.", hashtags: "#androiddev #buildwithsanjay #appdev" },
                { id: 'd7', day: 7, audience: 'client', raw: "Why my clients trust a solo dev over an agency", refined: "18+ Brands Trust One Developer Over an Agency. Here's Why That Works.", platforms: ["ig","li"], hook: "No account managers. No handoffs. You talk to the person actually building your product — every time.", description: "7+ years building for businesses across gaming, tech, food, real estate, fashion and education. Fixed price, 3 free revisions, you pay only after approval.", cta: "Free consultation — tell me your problem on WhatsApp.", hashtags: "#solodev #buildinpublic #indianbusiness" },
                { id: 'd8', day: 8, audience: 'student', raw: "Web Apps module breakdown", refined: "₹7,000 Gets You n8n, an AI Chatbot, an HR Tool, and a Calendly Clone — Here's the Module", platforms: ["yt","li"], hook: "Four real products in one module. This is what 'learn by building' actually means.", description: "The Web Apps module walks you through n8n automation, AI chat interfaces, HR dashboards, and scheduling tools — the exact builds I sell to clients.", cta: "Full module breakdown on the pricing page — link in bio.", hashtags: "#n8n #automation #learntocode" },
                { id: 'd9', day: 9, audience: 'client', raw: "AI integration is confusing for business owners", refined: "\"My Competitors Use AI. I Don't Know Where to Start.\" — Here's the Fix.", platforms: ["yt","li"], hook: "You don't need to understand AI. You need someone to wire it into what you already have.", description: "Groq, Gemini, OpenAI, ElevenLabs — I connect real AI to your product: chatbots that answer real questions, document Q&A, voice synthesis. Starts at ₹1,500.", cta: "Message 'AI' on WhatsApp for a free scoping call.", hashtags: "#aiintegration #chatbot #businessautomation" },
                { id: 'd10', day: 10, audience: 'student', raw: "Windows module — desktop AI agent", refined: "₹5,000 Module: Build a Desktop AI Agent + Browser Extension From Scratch", platforms: ["yt","li"], hook: "Most courses skip desktop apps entirely. I built my business on them. Here's the module.", description: "The Windows module teaches the exact desktop-agent architecture I use for client tools — lightweight, fast, and sellable.", cta: "Course pricing and module list — link in bio.", hashtags: "#desktopapp #buildwithsanjay #windevs" },
                { id: 'd11', day: 11, audience: 'client', raw: "Social media management pitch", refined: "\"We Post Randomly and Get Zero Traction.\" Sound Familiar?", platforms: ["ig","yt","li"], hook: "Posting isn't a strategy. A content calendar, designed posts, and monthly reports is.", description: "Strategy-first social media management from ₹4,999/month — Instagram, Facebook, LinkedIn, GMB. Done for you, not post-and-pray.", cta: "DM 'SOCIAL' for a free audit of your current page.", hashtags: "#socialmediamanagement #contentstrategy #digitalmarketing" },
                { id: 'd12', day: 12, audience: 'student', raw: "Why the bundle beats single modules", refined: "Why I Tell Students to Buy the ₹25,000 Bundle, Not Single Modules", platforms: ["yt","li"], hook: "Five separate modules teach you five separate apps. The bundle teaches you one system where they all talk to each other.", description: "One auth system, one shared database, one AI backend across Android, Web, Desktop, and Extension. That's the actual unlock — not the code, the architecture.", cta: "Apply for the bundle — link in bio, course pricing page.", hashtags: "#fullstackdeveloper #systemdesign #buildwithsanjay" },
                { id: 'd13', day: 13, audience: 'client', raw: "Chrome extension delivered in 24h for a client", refined: "A Client Needed to See Where Their Remote Team's Time Was Going. I Shipped This in 24 Hours.", platforms: ["yt","li"], hook: "No spyware. No invasive tracking software. Just a lightweight Chrome extension that respects the team and answers the question.", description: "Built with vanilla JS, zero dependencies, data never leaves the browser. Delivered same-day. Chrome extensions start at ₹1,500.", cta: "Need something similar? Message me your use case.", hashtags: "#chromeextension #remotework #automation" },
                { id: 'd14', day: 14, audience: 'student', raw: "Websites module value", refined: "₹6,000 Module: Portfolio, Ecom, Flipbook, Wedding Site, AI Chatbot — All in One Track", platforms: ["yt","li"], hook: "Five different website types. One module. Real client-grade builds, not templates.", description: "The Websites module is the fastest way to start taking freelance website projects — you finish with five deployable site types in your portfolio.", cta: "See the full curriculum on the pricing page — link in bio.", hashtags: "#webdesign #freelancing #learntocode" },
                { id: 'd15', day: 15, audience: 'client', raw: "Pay after it works — trust pitch", refined: "I Don't Get Paid Until You Confirm It Works. Here's Why That Matters.", platforms: ["ig","li"], hook: "Freelancer disappeared mid-project? That's not how I work. Fixed price upfront. You approve, then you pay.", description: "No hourly billing. No invoice surprises. 3 free revisions included. Zero upfront, zero risk on your side — every single project.", cta: "Tell me your problem — free consultation, no commitment.", hashtags: "#trust #freelancerindia #fixedprice" },
                { id: 'd16', day: 16, audience: 'student', raw: "Real student testimonial", refined: "\"It Was a Wonderful Month With Lots of Learning\" — A Student's Honest Review", platforms: ["ig","li"], hook: "I'm not posting this to brag. I'm posting it because this is what 1-on-1 training is supposed to feel like.", description: "Personalised video editing and dev training — Mobile or PC, taught with depth and patience, not generic pre-recorded lessons.", cta: "Enquire about 1-on-1 training — link in bio.", hashtags: "#studentreview #mentorship #learnonline" },
                { id: 'd17', day: 17, audience: 'client', raw: "Income tax calculator case study", refined: "People Were Paying CAs Just to Estimate Their Tax. I Built a Free Calculator With AI Q&A Instead.", platforms: ["yt","li"], hook: "FY 2024-25, old regime, new regime, every income head — and an AI that answers your specific question. Free.", description: "This is a live tool, not a portfolio mockup. It shows exactly the kind of fintech + AI work I take on for clients.", cta: "Need a custom calculator or fintech tool for your business? Message me.", hashtags: "#fintech #aiQA #indiantax" },
                { id: 'd18', day: 18, audience: 'student', raw: "Who the course is actually for", refined: "You Don't Need to Be 'Technical' to Start — Here's Who This Course Is Really For", platforms: ["ig","yt","li"], hook: "If you can describe a problem in plain language, you can finish this course. That's the only requirement.", description: "Every module is built the same way I build for clients: start from the problem, not the jargon. Beginners included.", cta: "Pick your starting module — pricing page link in bio.", hashtags: "#beginnerfriendly #codingforbeginners #buildwithsanjay" },
                { id: 'd19', day: 19, audience: 'client', raw: "Business automation pain point", refined: "If Someone on Your Team Copy-Pastes Data Every Day, That's a ₹1,500 Problem to Fix", platforms: ["yt","li"], hook: "The same manual task, every single day — that's automatable, and it's usually cheaper to fix than to keep doing.", description: "Scripts, n8n workflows, API integrations — I replace repetitive ops work with scheduled jobs that connect to your existing stack.", cta: "Tell me the repetitive task. I'll tell you if it's automatable and what it costs.", hashtags: "#businessautomation #n8n #operations" },
                { id: 'd20', day: 20, audience: 'student', raw: "GMB rank tracker as a teaching example", refined: "I Taught Myself to Track Google Maps Rankings — Then Turned It Into a Product Worth Selling", platforms: ["yt","li"], hook: "Every tool I teach in this course exists because I needed it first, then sold it. That's the real lesson.", description: "The GMB Rank Tracker module shows the exact build process — from personal tool to one-time-purchase product clients pay for.", cta: "Learn to build sellable tools, not just toy projects — course link in bio.", hashtags: "#buildinpublic #seo #indiehacker" },
                { id: 'd21', day: 21, audience: 'client', raw: "Backend & API service pitch", refined: "\"My App Has No Real Backend — It Breaks Under Load.\" I Fix That From ₹2,000.", platforms: ["yt","li"], hook: "A backend that wasn't built to scale will break exactly when your app starts succeeding. Fix it before that happens.", description: "Supabase auth, database, realtime, storage, plus custom servers and Razorpay/PayPal integration — scalable from day one.", cta: "Send me your current setup — I'll tell you what's at risk.", hashtags: "#backend #supabase #appfounders" },
                { id: 'd22', day: 22, audience: 'student', raw: "Cross-app architecture explained simply", refined: "What 'Cross-App Communication' Actually Means (Explained for Beginners)", platforms: ["yt","li"], hook: "Your Android app, your website, and your desktop tool should be able to talk to each other. Most courses never teach this.", description: "One authentication system, shared databases that sync across platforms, a centralized AI backend — that's the architecture behind the full bundle.", cta: "This is exactly what the ₹25,000 bundle teaches — link in bio.", hashtags: "#systemarchitecture #fullstack #buildwithsanjay" },
                { id: 'd23', day: 23, audience: 'client', raw: "Video and design services pitch", refined: "\"Our Videos Look Cheap and Nobody Watches Them.\" Let's Fix That.", platforms: ["ig","yt","li"], hook: "Premiere Pro edits, After Effects motion, Blender 3D, brand identity — built for YouTube, Reels, and ads that actually hold attention.", description: "7+ years editing, 2+ years running digital marketing for real brands. Custom pricing based on scope.", cta: "Send me a video you're unhappy with — I'll tell you what's fixable.", hashtags: "#videoediting #motiongraphics #branding" },
                { id: 'd24', day: 24, audience: 'student', raw: "1-on-1 training pitch, separate from the dev course", refined: "Want to Edit Your Own Content Instead of Paying Someone Every Month? Learn It Properly.", platforms: ["ig","li"], hook: "CapCut, Inshot, VN on mobile. Premiere Pro and After Effects on PC. Taught at your pace, with real projects.", description: "Not pre-recorded generic lessons. One-on-one video editing training that builds an actual portfolio as you go.", cta: "Enquire about training — link in bio.", hashtags: "#videoediting #1on1training #learnonline" },
                { id: 'd25', day: 25, audience: 'client', raw: "Site Sheet — editable site without code", refined: "A Website Your Client Can Edit Like a Spreadsheet — No Code, No Developer Needed After Launch", platforms: ["ig","yt","li"], hook: "Most clients don't want to learn a CMS. They want something that feels like Google Sheets. So I built that.", description: "SiteSheet is a one-time-purchase website with a spreadsheet-like editing UI — content updates without touching code.", cta: "Want a site your team can actually maintain? Message me.", hashtags: "#nocode #webdesign #smallbusinesswebsite" },
                { id: 'd26', day: 26, audience: 'student', raw: "Compare module price vs agency price", refined: "The Infra Module Costs ₹15,000. An Agency Would Charge That Per Month.", platforms: ["yt","li"], hook: "Learn deployment, databases, auth, and Docker once — or keep paying someone else to handle it forever.", description: "This module exists because clients kept asking me to 'just teach them' instead of hiring me every time something needed deploying.", cta: "Course pricing breakdown — link in bio.", hashtags: "#devops #docker #learntocode" },
                { id: 'd27', day: 27, audience: 'client', raw: "Free tools as a trust-building lead magnet", refined: "I Give Away 4 Tools for Free — No Account, No Catch. Here's Why.", platforms: ["ig","yt"], hook: "Godot Visual Coder, an AI Coder app, Blender on mobile, a livestreaming app — all free. Try before you ever pay me for anything.", description: "If the free tools are useful, the paid work speaks for itself. That's the whole strategy.", cta: "Try a free tool first — link in bio. Then tell me what you actually need built.", hashtags: "#freetools #buildinpublic #godotdev" },
                { id: 'd28', day: 28, audience: 'student', raw: "Show real client logos as proof for course credibility", refined: "18+ Real Businesses Use What I Teach in This Course. Not Theory — Production Code.", platforms: ["li"], hook: "Every module in this course is something I've already shipped to a paying client. You're not learning hypotheticals.", description: "From dental clinics to fintech to fashion brands — the same patterns taught in the course are running live for real businesses today.", cta: "See the module list and pick where to start — link in bio.", hashtags: "#realworldskills #buildwithsanjay #portfolio" },
                { id: 'd29', day: 29, audience: 'client', raw: "Process transparency — how a project actually goes", refined: "From \"I Have a Problem\" to Live: My Exact 4-Step Process", platforms: ["ig","li"], hook: "Tell me the problem. Get one fixed number. I build with daily WhatsApp updates. You approve, then you pay.", description: "No hourly billing, no radio silence, no surprise invoices. This is the same process for every client, every time.", cta: "Start with step one — tell me your problem on WhatsApp.", hashtags: "#transparentpricing #freelancerindia #process" },
                { id: 'd30', day: 30, audience: 'student', raw: "Direct comparison: course vs hiring me", refined: "Hire Me for ₹80,000+, or Learn to Build It Yourself for ₹25,000 — Here's an Honest Comparison", platforms: ["yt","li"], hook: "I'll say this even though it costs me client work: if you're building long-term, learning might be the better investment.", description: "Hiring gets you one product. The course gets you the skill to build the next ten yourself — that's the actual trade-off.", cta: "Decide which one fits you — both links in bio.", hashtags: "#learnvshire #buildwithsanjay #honestmarketing" },
                { id: 'd31', day: 31, audience: 'client', raw: "Month-end recap + dual CTA", refined: "31 Days, 9+ Tools, 18+ Brands — Here's Everything I Can Build or Teach You", platforms: ["ig","yt","li"], hook: "If you scrolled through this month and saw something that matched your problem, this is your reminder to actually message me.", description: "Business owner? I'll quote you a fixed price. Want to learn to build it yourself? I'll point you to the right module.", cta: "Business owners: WhatsApp me. Future builders: check the course pricing page. Both links in bio.", hashtags: "#recap #buildwithsanjay #cta" }
            ];
            
            for (const item of demoData) {
                await pool.query(`
                    INSERT INTO content_items (id, day, audience, raw, refined, platforms, hook, description, cta, hashtags)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                    ON CONFLICT (id) DO NOTHING
                `, [item.id, item.day, item.audience, item.raw, item.refined, JSON.stringify(item.platforms), item.hook, item.description, item.cta, item.hashtags]);
            }
            
            await recordMigration(pool, 'seed_demo_data_v1');
            actions.push('Seeded demo data (31 items)');
        } else {
            actions.push('Demo data already seeded');
        }
        
        return { success: true, actions };
    } catch (error) {
        throw error;
    } finally {
        await pool.end();
    }
}

export default async function handler(req) {
    if (req.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    // Always allow POST from frontend (no auth required for auto-migration on page load)
    // Only enforce secret for GET requests if configured
    
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
