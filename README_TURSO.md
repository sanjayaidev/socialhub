# Turso Integration Guide for Vercel

Your app is now configured to use Turso database with Vercel. Here's what was set up:

## Files Created/Modified

1. **`package.json`** - Added `@libsql/client` dependency
2. **`page/api/content.js`** - Updated API to use Turso instead of Appwrite
3. **`lib/db.js`** - Reusable Turso client helper (optional, for other API routes)
4. **`schema.sql`** - Database schema to create the `content_items` table

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

### 2. Create the Database Table

Run the SQL schema in your Turso database. You can do this via:

**Option A: Turso CLI**
```bash
turso db shell <your-database-name> < schema.sql
```

**Option B: Turso Console**
1. Go to https://console.turso.tech
2. Select your database
3. Open the SQL console
4. Copy and paste the contents of `schema.sql`

**Option C: Programmatically** (create a one-time migration script)

### 3. Deploy to Vercel

```bash
vercel deploy
```

Vercel will automatically:
- Install `@libsql/client` from package.json
- Use the environment variables you've already configured
- Deploy the Edge function at `/api/content`

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
