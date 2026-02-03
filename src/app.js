const express = require('express');
const cors = require('cors');
const path = require('path');
const YAML = require('yamljs');

const errorHandler = require('./middleware/errorHandler');
const rateLimiter = require('./middleware/rateLimiter');
const rateLimits = require('./config/rateLimits');
const env = require('./config/env');

// Routes
const authRoutes = require('./routes/auth');
const clickRoutes = require('./routes/click');
const upgradeRoutes = require('./routes/upgrade');
const pvpRoutes = require('./routes/pvp');
const allianceRoutes = require('./routes/alliance');
const marketRoutes = require('./routes/market');
const eventRoutes = require('./routes/event');
const leaderboardRoutes = require('./routes/leaderboard');
const chatRoutes = require('./routes/chat');
const changelogRoutes = require('./routes/changelog');
const prestigeRoutes = require('./routes/prestige');
const skillRoutes = require('./routes/skill');
const dungeonRoutes = require('./routes/dungeon');
const questRoutes = require('./routes/quest');
const worldBossRoutes = require('./routes/worldBoss');
const guideRoutes = require('./routes/guide');

function createApp() {
  const app = express();

  // Middleware
  app.use(cors());
  app.use(express.json({ limit: '1mb' }));

  // Global rate limit
  app.use(rateLimiter({
    windowMs: rateLimits.global.windowMs,
    maxRequests: rateLimits.global.maxRequests,
    keyFn: (req) => req.headers['x-api-key'] || req.ip,
  }));

  // Swagger docs
  try {
    const swaggerDoc = YAML.load(path.join(__dirname, '..', 'swagger.yaml'));
    app.get('/docs/swagger.json', (req, res) => res.json(swaggerDoc));
    app.get('/docs', (req, res) => {
      res.send(`<!DOCTYPE html><html><head><title>API Docs</title>
<link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css">
</head><body><div id="swagger-ui"></div>
<script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
<script>SwaggerUIBundle({url:'/docs/swagger.json',dom_id:'#swagger-ui',deepLinking:true})</script>
</body></html>`);
    });
  } catch {
    // swagger.yaml not found, skip docs
  }

  // Static frontend
  app.use(express.static(path.join(__dirname, '..', 'public')));

  // Health check
  app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

  // Public config (Supabase Realtime credentials for frontend)
  app.get('/api/v1/config', (req, res) => {
    res.json({
      supabaseUrl: env.supabaseUrl,
      supabaseAnonKey: env.supabaseAnonKey || null,
    });
  });

  // API routes
  const api = '/api/v1';
  app.use(api, authRoutes);
  app.use(api, clickRoutes);
  app.use(api, upgradeRoutes);
  app.use(api, pvpRoutes);
  app.use(api, allianceRoutes);
  app.use(api, marketRoutes);
  app.use(api, eventRoutes);
  app.use(api, leaderboardRoutes);
  app.use(api, chatRoutes);
  app.use(api, changelogRoutes);
  app.use(api, prestigeRoutes);
  app.use(api, skillRoutes);
  app.use(api, dungeonRoutes);
  app.use(api, questRoutes);
  app.use(api, worldBossRoutes);
  app.use(api, guideRoutes);

  // 404
  app.use((req, res) => {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found' } });
  });

  // Error handler
  app.use(errorHandler);

  return app;
}

module.exports = createApp;
