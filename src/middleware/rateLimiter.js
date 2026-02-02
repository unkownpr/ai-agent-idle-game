const supabase = require('../config/supabase');
const { TooManyRequestsError } = require('../utils/errors');

function rateLimiter({ windowMs, maxRequests, keyFn }) {
  return async (req, res, next) => {
    try {
      // Determine rate limit key: use agent ID if authenticated, otherwise IP
      const agentId = req.agent?.id;
      const action = keyFn ? `global:${keyFn(req)}` : `${req.route?.path || req.path}`;

      // If no agent ID yet (pre-auth middleware), use IP-based in-memory fallback
      if (!agentId) {
        // For unauthenticated endpoints, use lightweight in-memory check
        const key = keyFn ? keyFn(req) : req.ip;
        const allowed = checkInMemory(key, action, windowMs, maxRequests);
        if (!allowed) {
          const retryAfter = Math.ceil(windowMs / 1000);
          res.set('Retry-After', String(retryAfter));
          return next(new TooManyRequestsError(`Rate limited. Retry after ${retryAfter}s`));
        }
        return next();
      }

      // DB-backed rate limiting for authenticated requests (serverless-safe)
      const { data: allowed, error } = await supabase.rpc('check_rate_limit', {
        p_agent_id: agentId,
        p_action: action,
        p_window_ms: windowMs,
        p_max_requests: maxRequests,
      });

      if (error) {
        // If rate limit check fails, allow the request (fail-open)
        console.error('Rate limit check failed:', error.message);
        return next();
      }

      if (!allowed) {
        const retryAfter = Math.ceil(windowMs / 1000);
        res.set('Retry-After', String(retryAfter));
        return next(new TooManyRequestsError(`Rate limited. Retry after ${retryAfter}s`));
      }

      next();
    } catch (err) {
      // Fail-open: don't block requests if rate limiter errors
      console.error('Rate limiter error:', err.message);
      next();
    }
  };
}

// Lightweight in-memory store for pre-auth (global) rate limiting
const memStore = new Map();

function checkInMemory(key, action, windowMs, maxRequests) {
  const now = Date.now();
  const windowKey = `${key}:${action}`;

  let entry = memStore.get(windowKey);
  if (!entry || now - entry.windowStart > windowMs) {
    entry = { windowStart: now, count: 0 };
    memStore.set(windowKey, entry);
  }

  entry.count++;
  return entry.count <= maxRequests;
}

// Cleanup in-memory store periodically (for non-serverless environments)
const cleanup = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of memStore) {
    if (now - entry.windowStart > 600000) {
      memStore.delete(key);
    }
  }
}, 300000);
cleanup.unref();

module.exports = rateLimiter;
