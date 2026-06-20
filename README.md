# Content Planner - Neon Database Integration

## Setup Instructions

### 1. Install Dependencies
```bash
npm install
```

### 2. Set Environment Variables in Vercel
Go to Vercel Dashboard → Project Settings → Environment Variables and add:
- `DATABASE_URL`: Your Neon database connection string (e.g., `postgresql://user:pass@ep-xxx.region.aws.neon.tech/dbname`)

### 3. Deploy to Vercel
```bash
vercel deploy
```

### 4. Auto-Migration
The database migration runs automatically on first page load:
- The `/api/init-db` endpoint is called when the page loads
- It creates the `content_items` table if it doesn't exist
- It seeds 31 days of demo data if not already seeded
- Migrations are tracked in the `_migrations` table to prevent re-running

## Files Structure
- `/index.html` - Main frontend application
- `/page/api/content.js` - API endpoint for CRUD operations (Neon DB)
- `/page/api/init-db.js` - Auto-migration endpoint
- `/package.json` - Node dependencies
- `/vercel.json` - Vercel configuration

## How It Works
1. **Page Load**: Calls `/api/init-db` to ensure tables exist and demo data is seeded
2. **Data Fetch**: Retrieves content from Neon database via `/api/content`
3. **CRUD Operations**: All adds, edits, deletes sync to Neon database immediately
4. **Migration Tracking**: Uses `_migrations` table to track which migrations have run

## Demo Data
31 days of content ideas are automatically seeded on first deployment:
- Days 1-31 with complete content (raw idea, refined title, hook, description, CTA, hashtags)
- Audience tags (client/student)
- Platform tags (IG, YT, LI)
