const { Router } = require('express');
const adminAuth = require('../middleware/adminAuth');
const controller = require('../controllers/adminController');

const router = Router();

// In-memory rate limiting for login (5 attempts / 15 min per IP)
const loginAttempts = new Map();
function loginRateLimit(req, res, next) {
  const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
  const now = Date.now();
  const windowMs = 15 * 60 * 1000;
  const maxAttempts = 5;

  let entry = loginAttempts.get(ip);
  if (!entry || now - entry.windowStart > windowMs) {
    entry = { windowStart: now, count: 0 };
    loginAttempts.set(ip, entry);
  }

  entry.count++;
  if (entry.count > maxAttempts) {
    const retryAfter = Math.ceil((entry.windowStart + windowMs - now) / 1000);
    res.set('Retry-After', String(retryAfter));
    return res.status(429).json({ error: { code: 'RATE_LIMITED', message: `Too many login attempts. Retry after ${retryAfter}s` } });
  }
  next();
}

// Cleanup login attempts periodically
const cleanup = setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of loginAttempts) {
    if (now - entry.windowStart > 900000) loginAttempts.delete(ip);
  }
}, 300000);
cleanup.unref();

// Auth endpoints (no adminAuth needed)
router.post('/admin/login', loginRateLimit, controller.login);
router.post('/admin/logout', controller.logout);

// Protected API endpoints
router.get('/admin/api/dashboard', adminAuth, controller.dashboard);

router.get('/admin/api/agents', adminAuth, controller.listAgents);
router.get('/admin/api/agents/:id', adminAuth, controller.getAgent);
router.put('/admin/api/agents/:id', adminAuth, controller.updateAgent);
router.delete('/admin/api/agents/:id', adminAuth, controller.deleteAgent);

router.get('/admin/api/alliances', adminAuth, controller.listAlliances);
router.delete('/admin/api/alliances/:id', adminAuth, controller.deleteAlliance);

router.get('/admin/api/market', adminAuth, controller.listMarketOrders);
router.post('/admin/api/market/:id/cancel', adminAuth, controller.cancelMarketOrder);

router.get('/admin/api/chat', adminAuth, controller.listChatMessages);
router.delete('/admin/api/chat/:id', adminAuth, controller.deleteChatMessage);

router.get('/admin/api/pvp', adminAuth, controller.listPvpLog);
router.get('/admin/api/events', adminAuth, controller.listEvents);
router.get('/admin/api/world-bosses', adminAuth, controller.listWorldBosses);
router.get('/admin/api/dungeons', adminAuth, controller.listDungeonLog);

router.post('/admin/api/change-password', adminAuth, controller.changePassword);

module.exports = router;
