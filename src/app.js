const express = require('express');
const cors = require('cors');
const path = require('path');
const swaggerUi = require('swagger-ui-express');
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

  // Swagger docs (only in development)
  if (env.nodeEnv !== 'production') {
    try {
      const swaggerDoc = YAML.load(path.join(__dirname, '..', 'swagger.yaml'));
      app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerDoc));
    } catch {
      // swagger.yaml not found, skip docs
    }
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

  // 404
  app.use((req, res) => {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found' } });
  });

  // Error handler
  app.use(errorHandler);

  return app;
}

module.exports = createApp;
