# Appwrite Migration Guide

This guide shows you how to set up Appwrite as your database and optionally migrate data from Turso.

## Quick Start (Recommended)

Use the automated migration script to set up everything via API:

### 1. Install Dependencies

```bash
npm install
```

### 2. Set Environment Variables

Create a `.env` file or set these environment variables:

```bash
# Required - Appwrite Configuration
APPWRITE_ENDPOINT=https://cloud.appwrite.io/v1
APPWRITE_PROJECT_ID=your_project_id
APPWRITE_API_KEY=your_api_key_with_database_permissions

# Optional - For Turso Migration
TURSO_DATABASE_URL=libsql://your-db.turso.io
TURSO_AUTH_TOKEN=your_turso_token

# Optional - Specify custom database/collection IDs
APPWRITE_DATABASE_ID=content_planner_db
APPWRITE_COLLECTION_ID=content_items
```

### 3. Run Migration Script

```bash
npm run migrate
# or
node migrate-to-appwrite.js
```

The script will:
1. ✅ Create the database (if it doesn't exist)
2. ✅ Create the `content_items` collection
3. ✅ Add all required attributes (day, raw, audience, etc.)
4. ✅ Create an index on the `day` field for faster queries
5. ✅ Migrate data from Turso (if TURSO_DATABASE_URL is set)
6. ✅ Seed sample data if no migration source exists

## Manual Setup (Alternative)

If you prefer to set up Appwrite manually through the console:

### 1. Create Database
- Go to [Appwrite Console](https://cloud.appwrite.io)
- Select your project
- Click **Databases** → **Create Database**
- Name it "Content Planner Database"

### 2. Create Collection
- Inside your database, click **Create Collection**
- Name: `Content Items`
- Collection ID: `content_items`

### 3. Add Attributes
Add these attributes to your collection:

| Attribute | Type | Required | Size | Notes |
|-----------|------|----------|------|-------|
| day | integer | Yes | - | Day number (1-31) |
| audience | string | No | 255 | Target audience |
| raw | string | Yes | 65536 | Raw content idea |
| refined | string | No | 65536 | Refined content |
| platforms | string | No | 65536 | JSON array of platforms |
| hook | string | No | 65536 | Content hook |
| description | string | No | 65536 | Description |
| cta | string | No | 65536 | Call to action |
| hashtags | string | No | 65536 | Hashtags |
| design_spec | string | No | 65536 | JSON design spec |
| design_image | string | No | 65536 | Base64 image data |

### 4. Create Index
- Go to **Indexes** tab
- Create index with ID: `day_index`
- Type: Key
- Attributes: `day`
- Order: ASC

### 5. Get API Key
- Go to **API Keys** in your project
- Create new API key with scopes:
  - `databases.read`, `databases.write`
  - `collections.read`, `collections.write`
  - `documents.read`, `documents.write`

## Environment Variables for Vercel

After setup, add these to your Vercel project:

```
APPWRITE_ENDPOINT=https://cloud.appwrite.io/v1
APPWRITE_PROJECT_ID=your_project_id
APPWRITE_DATABASE_ID=content_planner_db
APPWRITE_COLLECTION_ID=content_items
APPWRITE_API_KEY=your_api_key
```

## Testing

Once configured, open `planner.html` in your browser to test the integration. The app will:
- Load existing content items
- Allow adding/editing/deleting days
- Support bulk import/export
- Work with AI features for content refinement

## Troubleshooting

### "Missing required Appwrite environment variables"
Make sure all required env vars are set before running the migration script.

### "Database already exists"
The script handles this gracefully and will skip creation if the database exists.

### "Collection already exists"
Same as above - the script checks and skips if collection exists.

### Migration fails
Check that your Turso credentials are correct and the `content_items` table exists in Turso.

## Data Structure

Appwrite documents will have this structure:

```json
{
  "$id": "day_1",
  "$createdAt": "2025-01-15T10:30:00Z",
  "$updatedAt": "2025-01-15T10:30:00Z",
  "day": 1,
  "audience": "clients",
  "raw": "Your content idea here",
  "refined": "Refined version",
  "platforms": "[\"Instagram\",\"LinkedIn\"]",
  "hook": "Your hook text",
  "description": "Description",
  "cta": "Call to action",
  "hashtags": "#tags",
  "design_spec": "{\"colors\":[...]}",
  "design_image": "data:image/png;base64,..."
}
```

Note: Complex fields like `platforms` and `design_spec` are stored as JSON strings in Appwrite.
