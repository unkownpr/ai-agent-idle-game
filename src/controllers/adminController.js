const crypto = require('crypto');
const env = require('../config/env');
const adminService = require('../services/adminService');

function createJwt(payload, secret, expiresInSeconds) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const body = Buffer.from(JSON.stringify({ ...payload, iat: now, exp: now + expiresInSeconds })).toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${signature}`;
}

function setCookie(res, token) {
  const maxAge = 8 * 60 * 60; // 8 hours
  const secure = env.nodeEnv === 'production' ? 'Secure;' : '';
  res.setHeader('Set-Cookie', `admin_token=${token}; HttpOnly; ${secure} SameSite=Strict; Path=/admin; Max-Age=${maxAge}`);
}

function clearCookie(res) {
  const secure = env.nodeEnv === 'production' ? 'Secure;' : '';
  res.setHeader('Set-Cookie', `admin_token=; HttpOnly; ${secure} SameSite=Strict; Path=/admin; Max-Age=0`);
}

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Email and password required' } });
    }

    if (!env.adminEmail || !env.adminPasswordHash || !env.adminJwtSecret) {
      return res.status(503).json({ error: { code: 'ADMIN_DISABLED', message: 'Admin panel not configured' } });
    }

    const inputHash = crypto.createHash('sha256').update(password).digest('hex');

    // Check DB override first, then fall back to env
    const dbHash = await adminService.getSetting('password_hash');
    const currentHash = dbHash || env.adminPasswordHash;

    if (email !== env.adminEmail || inputHash !== currentHash) {
      return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Invalid credentials' } });
    }

    const token = createJwt({ role: 'admin', email }, env.adminJwtSecret, 8 * 60 * 60);
    setCookie(res, token);
    res.json({ ok: true });
  } catch (err) {
    console.error('Admin login error:', err.message);
    res.status(500).json({ error: { code: 'INTERNAL', message: 'Login failed' } });
  }
};

exports.logout = (req, res) => {
  clearCookie(res);
  res.json({ ok: true });
};

exports.dashboard = async (req, res) => {
  try {
    const stats = await adminService.getDashboardStats();
    res.json(stats);
  } catch (err) {
    console.error('Admin dashboard error:', err.message);
    res.status(500).json({ error: { code: 'INTERNAL', message: 'Failed to load dashboard' } });
  }
};

// Agents
exports.listAgents = async (req, res) => {
  try {
    const { page = 1, limit = 20, search = '' } = req.query;
    const result = await adminService.listAgents({ page: parseInt(page), limit: parseInt(limit), search });
    res.json(result);
  } catch (err) {
    console.error('Admin listAgents error:', err.message);
    res.status(500).json({ error: { code: 'INTERNAL', message: 'Failed to list agents' } });
  }
};

exports.getAgent = async (req, res) => {
  try {
    const agent = await adminService.getAgent(req.params.id);
    res.json(agent);
  } catch (err) {
    console.error('Admin getAgent error:', err.message);
    res.status(500).json({ error: { code: 'INTERNAL', message: 'Failed to get agent' } });
  }
};

exports.updateAgent = async (req, res) => {
  try {
    const agent = await adminService.updateAgent(req.params.id, req.body);
    res.json(agent);
  } catch (err) {
    console.error('Admin updateAgent error:', err.message);
    res.status(500).json({ error: { code: 'INTERNAL', message: err.message || 'Failed to update agent' } });
  }
};

exports.deleteAgent = async (req, res) => {
  try {
    await adminService.deleteAgent(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    console.error('Admin deleteAgent error:', err.message);
    res.status(500).json({ error: { code: 'INTERNAL', message: 'Failed to delete agent' } });
  }
};

// Alliances
exports.listAlliances = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const result = await adminService.listAlliances({ page: parseInt(page), limit: parseInt(limit) });
    res.json(result);
  } catch (err) {
    console.error('Admin listAlliances error:', err.message);
    res.status(500).json({ error: { code: 'INTERNAL', message: 'Failed to list alliances' } });
  }
};

exports.deleteAlliance = async (req, res) => {
  try {
    await adminService.deleteAlliance(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    console.error('Admin deleteAlliance error:', err.message);
    res.status(500).json({ error: { code: 'INTERNAL', message: 'Failed to delete alliance' } });
  }
};

// Market
exports.listMarketOrders = async (req, res) => {
  try {
    const { page = 1, limit = 20, status = 'open' } = req.query;
    const result = await adminService.listMarketOrders({ page: parseInt(page), limit: parseInt(limit), status });
    res.json(result);
  } catch (err) {
    console.error('Admin listMarketOrders error:', err.message);
    res.status(500).json({ error: { code: 'INTERNAL', message: 'Failed to list orders' } });
  }
};

exports.cancelMarketOrder = async (req, res) => {
  try {
    const order = await adminService.cancelMarketOrder(req.params.id);
    res.json(order);
  } catch (err) {
    console.error('Admin cancelOrder error:', err.message);
    res.status(500).json({ error: { code: 'INTERNAL', message: 'Failed to cancel order' } });
  }
};

// Chat
exports.listChatMessages = async (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const result = await adminService.listChatMessages({ page: parseInt(page), limit: parseInt(limit) });
    res.json(result);
  } catch (err) {
    console.error('Admin listChat error:', err.message);
    res.status(500).json({ error: { code: 'INTERNAL', message: 'Failed to list messages' } });
  }
};

exports.deleteChatMessage = async (req, res) => {
  try {
    await adminService.deleteChatMessage(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    console.error('Admin deleteChat error:', err.message);
    res.status(500).json({ error: { code: 'INTERNAL', message: 'Failed to delete message' } });
  }
};

// PvP
exports.listPvpLog = async (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const result = await adminService.listPvpLog({ page: parseInt(page), limit: parseInt(limit) });
    res.json(result);
  } catch (err) {
    console.error('Admin listPvp error:', err.message);
    res.status(500).json({ error: { code: 'INTERNAL', message: 'Failed to list battles' } });
  }
};

// Events
exports.listEvents = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const result = await adminService.listEvents({ page: parseInt(page), limit: parseInt(limit) });
    res.json(result);
  } catch (err) {
    console.error('Admin listEvents error:', err.message);
    res.status(500).json({ error: { code: 'INTERNAL', message: 'Failed to list events' } });
  }
};

// World Boss
exports.listWorldBosses = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const result = await adminService.listWorldBosses({ page: parseInt(page), limit: parseInt(limit) });
    res.json(result);
  } catch (err) {
    console.error('Admin listBosses error:', err.message);
    res.status(500).json({ error: { code: 'INTERNAL', message: 'Failed to list bosses' } });
  }
};

// Dungeons
exports.listDungeonLog = async (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const result = await adminService.listDungeonLog({ page: parseInt(page), limit: parseInt(limit) });
    res.json(result);
  } catch (err) {
    console.error('Admin listDungeons error:', err.message);
    res.status(500).json({ error: { code: 'INTERNAL', message: 'Failed to list dungeon runs' } });
  }
};

// Change Password
exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Current password and new password required' } });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'New password must be at least 6 characters' } });
    }

    const currentHash = crypto.createHash('sha256').update(currentPassword).digest('hex');
    const dbHash = await adminService.getSetting('password_hash');
    const storedHash = dbHash || env.adminPasswordHash;

    if (currentHash !== storedHash) {
      return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Current password is incorrect' } });
    }

    const newHash = crypto.createHash('sha256').update(newPassword).digest('hex');
    await adminService.setSetting('password_hash', newHash);
    res.json({ ok: true });
  } catch (err) {
    console.error('Admin changePassword error:', err.message);
    res.status(500).json({ error: { code: 'INTERNAL', message: 'Failed to change password. Make sure admin_settings table exists in Supabase.' } });
  }
};
