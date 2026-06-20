# Turso Integration Guide for Vercel

Your app is now configured to use Turso database with Vercel. Here's what was set up:

## Files Created/Modified

1. **`package.json`** - Added `@libsql/client` dependency
2. **`page/api/content.js`** - Updated API to use Turso instead of Appwrite
3. **`lib/db.js`** - Reusable Turso client helper (optional, for other API routes)
4. **`schema.sql`** - Database schema to create the `content_items` table
5. **`page/api/init-db.js`** - Auto-initialization endpoint for creating tables on deploy

## Environment Variables

You've already connected Turso through Vercel Storage, so these are configured:
- `TURSO_DATABASE_URL` - Your Turso database URL
- `TURSO_AUTH_TOKEN` - Your Turso authentication token

## Setup Steps

### 1. Install Dependencies

Run this in your project:
```bash
npm install
```

Or if you don't have a local setup, Vercel will install dependencies automatically on deploy.

### 2. Create the Database Table (Automatic)

**Recommended: Use the auto-initialization endpoint**

After deploying to Vercel, call the initialization endpoint once:

```bash
curl https://your-vercel-app.vercel.app/api/init-db
```

Or visit in browser: `https://your-vercel-app.vercel.app/api/init-db`

This will:
- Check if the `content_items` table exists
- Create it if it doesn't exist
- Create the `idx_content_items_day` index if it doesn't exist
- Return a status report of what was done

**Manual Option A: Turso CLI**
```bash
turso db shell <your-database-name> < schema.sql
```

**Manual Option B: Turso Console**
1. Go to https://console.turso.tech
2. Select your database
3. Open the SQL console
4. Copy and paste the contents of `schema.sql`

### 3. Deploy to Vercel

```bash
vercel deploy
```

Vercel will automatically:
- Install `@libsql/client` from package.json
- Use the environment variables you've already configured
- Deploy the Edge function at `/api/content`
- Deploy the Edge function at `/api/init-db`

### 4. Auto-Initialize on Each Deploy (Optional)

To automatically initialize the database on each deployment, add a post-deploy script:

**Option A: Call init-db endpoint after deploy**
```bash
vercel deploy && curl https://your-vercel-app.vercel.app/api/init-db
```

**Option B: Add to vercel.json (if you have one)**
```json
{
  "deployments": {
    "postDeploy": "curl $VERCEL_URL/api/init-db"
  }
}
```

**Option C: GitHub Actions**
If using GitHub for deployments, add a step to call the init endpoint after deployment.

## API Endpoints

Your `/api/content` endpoint now supports:

- **GET** `/api/content` - Get all content items
- **POST** `/api/content` - Create/update a content item
- **POST** `/api/content?bulk=1` - Bulk replace all items
- **DELETE** `/api/content?id=<id>` - Delete a content item

## Testing Locally

If you want to test locally:

```bash
# Install dependencies
npm install

# Run Vercel dev server
npx vercel dev
```

Make sure you have a `.env.local` file with:
```
TURSO_DATABASE_URL=your-turso-url
TURSO_AUTH_TOKEN=your-turso-token
```

## Notes

- The API uses Edge runtime for optimal performance on Vercel
- All database connections are properly closed after each query
- JSON fields (platforms, design_spec) are serialized/deserialized automatically
- The `content_items` table uses `id` as TEXT PRIMARY KEY for flexibility
