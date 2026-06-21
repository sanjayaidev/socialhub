# Content Planner - Railway Deployment

A content planning application with Neon database integration, now optimized for Railway deployment.

## Setup Instructions

### 1. Install Dependencies
```bash
npm install
```

### 2. Set Environment Variables in Railway
Go to Railway Dashboard → Project → Variables and add:
- `DATABASE_URL`: Your Neon database connection string (e.g., `postgresql://user:pass@ep-xxx.region.aws.neon.tech/dbname?sslmode=require`)

### 3. Deploy to Railway

**Option A: Deploy from GitHub (Recommended)**
1. Push your code to a GitHub repository
2. Go to [railway.app](https://railway.app)
3. Click "New Project" → "Deploy from GitHub repo"
4. Select your repository
5. Railway will automatically detect the `package.json` and start command
6. Add your environment variables in the Railway dashboard

**Option B: Deploy with Railway CLI**
```bash
# Install Railway CLI
npm install -g @railway/cli

# Login to Railway
railway login

# Initialize project
railway init

# Deploy
railway up
```

### 4. Auto-Migration
The database migration runs automatically on first page load:
- The API endpoints handle database initialization
- Tables are created if they don't exist
- Demo data is seeded on first use
- Migrations are tracked to prevent re-running

## Files Structure
- `/index.html` - Main frontend application
- `/dashboard.html` - Dashboard interface
- `/designer.html` - Designer interface
- `/api/content/*.js` - API endpoints for CRUD operations (Neon DB)
- `/server.js` - Express server for Railway deployment
- `/package.json` - Node dependencies
- `/.nvmrc` - Node version specification
- `/presets/` - Content preset templates
- `/utils/` - Utility functions

## How It Works
1. **Server**: Express.js server serves static files and handles API routes
2. **Database**: Neon serverless PostgreSQL for data persistence
3. **API Routes**: 
   - `/api/content/generate` - AI content generation
   - `/api/content/plans` - List/create content plans
   - `/api/content/plan-details` - Get plan details
   - `/api/content/delete-plan` - Delete a plan
   - `/api/content/post` - Post operations
4. **Static Assets**: HTML, CSS, JS files served directly

## Railway Configuration
Railway automatically detects this as a Node.js project through:
- `package.json` with `start` script: `node server.js`
- `.nvmrc` specifying Node 24.x

## Demo Data
Content plans include:
- Monthly content calendars
- Post types (carousel, single, story, reel)
- Complete content (hooks, captions, hashtags, image prompts)
- Brand settings support
- Multiple platform formats

## Local Development
```bash
# Install dependencies
npm install

# Set environment variable
export DATABASE_URL="your-neon-connection-string"

# Start server
npm start

# Open browser to http://localhost:3000
```

## Environment Variables Required
- `DATABASE_URL` - Neon PostgreSQL connection string (required for database operations)

## Notes
- The `vercel.json` file is kept for reference but is not used in Railway deployment
- All API handlers use Web API Response objects for compatibility
- CORS is enabled for all API routes
