# Dashboard & AI Designs - Database Setup Guide

This document explains how to configure the separate database for the Dashboard and AI Designs features.

## Overview

The application uses **two separate Neon databases**:

1. **DATABASE_URL** - Used by the content planner/sidepanel (existing `content_items` table)
2. **DASH_URL** - Used by dashboard and AI designs (new tables: `plans`, `daily_posts`, `post_slides`, `ai_images`)

## Environment Variables

Set these in Vercel → Settings → Environment Variables:

### Required Variables:

```bash
# Existing - for content planner/sidepanel
DATABASE_URL=postgresql://...

# NEW - for dashboard and AI designs
DASH_URL=postgresql://...

# Optional - API security
CONTENT_API_SECRET=your-secret-key
```

## Database Schema

The DASH_URL database should have these tables (auto-created by `/api/init-dash-db`):

### 1. `plans`
Stores monthly content plans.
```sql
CREATE TABLE plans (
    id TEXT PRIMARY KEY,
    month VARCHAR NOT NULL,
    year VARCHAR NOT NULL,
    status VARCHAR DEFAULT 'in_progress',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
```

### 2. `daily_posts`
Stores individual posts within a plan.
```sql
CREATE TABLE daily_posts (
    id VARCHAR PRIMARY KEY,
    plan_id TEXT REFERENCES plans(id) ON DELETE CASCADE,
    day INTEGER NOT NULL,
    type VARCHAR NOT NULL,
    metadata JSONB,
    status VARCHAR DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
```

### 3. `post_slides`
Stores slides for carousel posts.
```sql
CREATE TABLE post_slides (
    id VARCHAR PRIMARY KEY,
    post_id VARCHAR REFERENCES daily_posts(id) ON DELETE CASCADE,
    slide_index INTEGER NOT NULL,
    role VARCHAR NOT NULL,
    design_spec JSONB,
    generated_asset TEXT,
    status VARCHAR DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(post_id, slide_index)
);
```

### 4. `ai_images`
Stores AI-generated images.
```sql
CREATE TABLE ai_images (
    id TEXT PRIMARY KEY,
    "planId" TEXT NOT NULL,
    day INTEGER NOT NULL,
    "slideIndex" INTEGER NOT NULL,
    type TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    prompt TEXT NOT NULL,
    "aspectRatio" TEXT NOT NULL,
    "sourceJson" JSONB,
    "createdAt" BIGINT NOT NULL,
    "updatedAt" BIGINT NOT NULL
);
```

## API Endpoints

All endpoints use the `/api/content-plans` route with action parameters:

### Plans Management

| Action | Method | Endpoint | Description |
|--------|--------|----------|-------------|
| `getAllPlans` | GET | `/api/content-plans?action=getAllPlans` | Get all plans |
| `savePlan` | POST | `/api/content-plans?action=savePlan` | Create/update plan |
| `getPlanDetails` | POST | `/api/content-plans?action=getPlanDetails` | Get plan with posts |
| `deletePost` | DELETE | `/api/content-plans?action=deletePost` | Delete a post |
| `deletePlan` | DELETE | `/api/content-plans?action=deletePlan` | Delete entire plan |

### AI Images Management

| Action | Method | Endpoint | Description |
|--------|--------|----------|-------------|
| `getAIImages` | POST | `/api/content-plans?action=getAIImages` | Load AI images |
| `saveAIImage` | POST | `/api/content-plans?action=saveAIImage` | Save AI image |
| `deleteAIImage` | DELETE | `/api/content-plans?action=deleteAIImage` | Delete AI image |
| `regenerateAIImage` | POST | `/api/content-plans?action=regenerateAIImage` | Regenerate image |

## Initialization

To initialize the dashboard database, make a POST request to:

```bash
POST /api/init-dash-db
```

This will create all required tables if they don't exist.

## Dual-Mode Support

The dashboard and AI designs pages work in **both modes**:

### 1. Web App Mode (Direct Browser Access)
- Uses direct `fetch()` calls to API endpoints
- Detects absence of `chrome.runtime`
- Pages: `dashboard.html`, `ai-designs.html`

### 2. Chrome Extension Mode
- Uses `chrome.runtime.sendMessage()` for DB operations
- Communicates with background script
- Opens via side panel buttons

### Detection Logic

```javascript
if (typeof chrome === 'undefined' || !chrome.runtime) {
  // Web app mode - use API calls
  await apiCall('/api/content-plans?action=...', ...);
} else {
  // Chrome extension mode
  await chrome.runtime.sendMessage({ action: '...', ... });
}
```

## Navigation

### Side Panel Buttons

The side panel now correctly navigates in both modes:

```javascript
// Open Dashboard
async function openDashboard() {
  if (typeof chrome !== 'undefined' && chrome.tabs) {
    // Extension mode
    chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') });
  } else {
    // Web app mode
    window.location.href = 'dashboard.html';
  }
}

// Open Designer
async function openDesigner() {
  if (typeof chrome !== 'undefined' && chrome.tabs) {
    chrome.tabs.create({ url: chrome.runtime.getURL('designer.html') });
  } else {
    window.location.href = 'designer.html';
  }
}
```

### AI Designs → Dashboard Navigation

```javascript
document.getElementById('backToDashboardBtn').addEventListener('click', () => {
  if (typeof chrome !== 'undefined' && chrome.tabs) {
    chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') });
  } else {
    window.location.href = 'dashboard.html';
  }
});
```

## Files Modified

### API Layer
- ✅ `/api/content-plans.js` - New unified API for dashboard/ai-designs
- ✅ `/api/init-dash-db.js` - Database initialization

### Frontend
- ✅ `dashboard.js` - Updated API endpoints, dual-mode support
- ✅ `ai-designs.js` - Updated API endpoints, dual-mode support  
- ✅ `sidepanel.js` - Updated API endpoints, fixed navigation

### Configuration
- ✅ `vercel.json` - Added API routes configuration

## Testing

### Test Web App Mode
1. Navigate directly to `http://localhost:3000/dashboard.html`
2. Should load plans from API
3. Generate content, view dashboard, manage AI images

### Test Extension Mode
1. Load extension in Chrome
2. Open side panel
3. Click "Open Dashboard" button
4. Should open dashboard.html in new tab
5. All DB operations should work via chrome.runtime

## Troubleshooting

### "Missing DASH_URL environment variable"
- Set `DASH_URL` in Vercel environment variables
- Ensure it points to a valid Neon database

### Tables not created
- Call `POST /api/init-dash-db` to initialize schema
- Check Vercel function logs for errors

### API returns 401
- If `CONTENT_API_SECRET` is set, include header: `x-api-secret: your-secret`
- Or remove the secret from environment variables

### Navigation not working
- Check browser console for errors
- Verify file paths are correct
- In extension mode, ensure pages are listed in manifest.json

## Architecture Summary

```
┌─────────────────┐         ┌──────────────────┐
│   Side Panel    │         │  Dashboard HTML  │
│  (Generation)   │         │  (View/Edit)     │
└────────┬────────┘         └────────┬─────────┘
         │                           │
         │ API Calls                 │ API Calls
         │ /api/content-plans        │ /api/content-plans
         ▼                           ▼
┌─────────────────────────────────────────────────┐
│           /api/content-plans.js                 │
│  (Unified API for Plans & AI Images)            │
└─────────────────────────────────────────────────┘
         │
         │ Uses DASH_URL
         ▼
┌─────────────────────────────────────────────────┐
│         Neon Database (Separate)                │
│  - plans                                        │
│  - daily_posts                                  │
│  - post_slides                                  │
│  - ai_images                                    │
└─────────────────────────────────────────────────┘
```
