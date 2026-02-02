const supabase = require('../config/supabase');
const { AppError } = require('../utils/errors');
const { hashApiKey } = require('../utils/crypto');
const { AGENT_PUBLIC_FIELDS } = require('../services/authService');

async function auth(req, res, next) {
  try {
    const apiKey = req.headers['x-api-key'];
    if (!apiKey) {
      throw new AppError('Missing X-API-Key header', 401, 'UNAUTHORIZED');
    }

    const apiKeyHash = hashApiKey(apiKey);

    const { data: agent, error } = await supabase
      .from('agents')
      .select(AGENT_PUBLIC_FIELDS)
      .eq('api_key', apiKeyHash)
      .single();

    if (error || !agent) {
      throw new AppError('Invalid API key', 401, 'UNAUTHORIZED');
    }

    // Flush idle earnings on every authenticated request
    const { data: earnings } = await supabase.rpc('calculate_idle_earnings', {
      p_agent_id: agent.id,
    });

    if (earnings && earnings > 0) {
      agent.gold = parseFloat(agent.gold) + parseFloat(earnings);
      agent.last_tick_at = new Date().toISOString();
    }

    req.agent = agent;
    req.idleEarnings = parseFloat(earnings) || 0;
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = auth;
