const supabase = require('../config/supabase');
const { generateApiKey, hashApiKey } = require('../utils/crypto');
const { ConflictError, AppError } = require('../utils/errors');
const balance = require('../config/gameBalance');
const { verifyMoltbook } = require('../middleware/moltbookAuth');

const AGENT_PUBLIC_FIELDS = 'id, name, level, xp, gold, gems, click_power, idle_rate, attack_power, defense_power, power_score, karma, total_clicks, total_gold_earned, total_pvp_wins, total_pvp_losses, alliance_id, moltbook_verified, last_click_at, last_tick_at, shield_until, last_attack_at, created_at';

async function register(name) {
  const apiKey = generateApiKey();
  const apiKeyHash = hashApiKey(apiKey);

  const { data, error } = await supabase
    .from('agents')
    .insert({ name, api_key: apiKeyHash })
    .select(AGENT_PUBLIC_FIELDS)
    .single();

  if (error) {
    if (error.code === '23505') {
      throw new ConflictError('Agent name already taken');
    }
    throw new AppError(error.message, 500, 'DB_ERROR');
  }

  // Calculate initial power score
  await supabase.rpc('recalculate_power_score', { p_agent_id: data.id });

  return { agent: data, apiKey };
}

async function verifyMoltbookToken(agentId, moltbookToken) {
  await verifyMoltbook(moltbookToken);

  const karmaBonus = 1 + balance.MOLTBOOK_KARMA_BONUS;

  const { data, error } = await supabase
    .from('agents')
    .update({ moltbook_verified: true, karma: karmaBonus })
    .eq('id', agentId)
    .select(AGENT_PUBLIC_FIELDS)
    .single();

  if (error) throw new AppError(error.message, 500, 'DB_ERROR');
  return data;
}

async function getAgent(agentId) {
  const { data, error } = await supabase
    .from('agents')
    .select(AGENT_PUBLIC_FIELDS)
    .eq('id', agentId)
    .single();

  if (error) throw new AppError(error.message, 500, 'DB_ERROR');
  return data;
}

module.exports = { register, verifyMoltbookToken, getAgent, AGENT_PUBLIC_FIELDS };
