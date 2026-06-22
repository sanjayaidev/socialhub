import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());

// CORS headers for API routes
const corsHeaders = (req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
};

// Serve static files from root directory
app.use(express.static(__dirname));

// Serve presets directory
app.use('/presets', express.static(join(__dirname, 'presets')));

// Serve utils directory
app.use('/utils', express.static(join(__dirname, 'utils')));

// Helper to adapt Express req/res to the handler's expected format
const apiHandler = async (req, res, handlerPath) => {
  try {
    const handler = await import(handlerPath);
    
    // Create a request object that matches what the handlers expect
    const handlerReq = {
      method: req.method,
      json: async () => req.body,
    };
    
    const response = await handler.default(handlerReq);
    
    // Extract status and headers from Response object
    const status = response.status || 200;
    response.headers.forEach((value, key) => {
      res.setHeader(key, value);
    });
    
    const text = await response.text();
    res.status(status).send(text);
  } catch (err) {
    console.error(`Error in ${handlerPath}:`, err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Content API routes
app.options('/api/content/*', corsHeaders);
app.use('/api/content/*', corsHeaders);

app.post('/api/content/generate', (req, res) => {
  apiHandler(req, res, join(__dirname, 'api', 'content', 'generate.js'));
});

app.all('/api/content/plan', (req, res) => {
  apiHandler(req, res, join(__dirname, 'api', 'content', 'plan.js'));
});

app.all('/api/content/plans', (req, res) => {
  apiHandler(req, res, join(__dirname, 'api', 'content', 'plans.js'));
});

app.all('/api/content/plan-details', (req, res) => {
  apiHandler(req, res, join(__dirname, 'api', 'content', 'plan-details.js'));
});

app.all('/api/content/delete-plan', (req, res) => {
  apiHandler(req, res, join(__dirname, 'api', 'content', 'delete-plan.js'));
});

app.all('/api/content/post', (req, res) => {
  apiHandler(req, res, join(__dirname, 'api', 'content', 'post.js'));
});

// AI Images API routes
app.all('/api/content/ai-images', (req, res) => {
  apiHandler(req, res, join(__dirname, 'api', 'content', 'ai-images.js'));
});
app.all('/api/content/calendar-month', (req, res) => {
  apiHandler(req, res, join(__dirname, 'api', 'content', 'calendar-month.js'));
});

app.all('/api/content/calendar-day', (req, res) => {
  apiHandler(req, res, join(__dirname, 'api', 'content', 'calendar-day.js'));
});

app.all('/api/content/sync-calendar', (req, res) => {
  apiHandler(req, res, join(__dirname, 'api', 'content', 'sync-calendar.js'));
});
app.all('/api/content/ai-image', (req, res) => {
  apiHandler(req, res, join(__dirname, 'api', 'content', 'ai-image.js'));
});

app.all('/api/content/regenerate-ai-image', (req, res) => {
  apiHandler(req, res, join(__dirname, 'api', 'content', 'regenerate-ai-image.js'));
});

// Chat API route
app.all('/api/chat', (req, res) => {
  apiHandler(req, res, join(__dirname, 'api', 'chat.js'));
});

// Catch-all route for SPA support
app.get('*', (req, res) => {
  res.sendFile(join(__dirname, 'index.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

export default app;
