const supabase = require('../config/supabase');
const { AppError } = require('../utils/errors');

async function getLeaderboard({ sortBy = 'power_score', page = 1, limit = 20 } = {}) {
  const allowedSorts = ['power_score', 'gold', 'level', 'total_clicks', 'total_pvp_wins'];
  if (!allowedSorts.includes(sortBy)) sortBy = 'power_score';

  const from = (page - 1) * limit;
  const to = from + limit - 1;

  const { data, error, count } = await supabase
    .from('agents')
    .select('id, name, level, power_score, gold, total_clicks, total_pvp_wins, total_pvp_losses, alliance_id', { count: 'exact' })
    .order(sortBy, { ascending: false })
    .range(from, to);

  if (error) throw new AppError(error.message, 500, 'DB_ERROR');

  return {
    leaderboard: (data || []).map((a, i) => ({ rank: from + i + 1, ...a })),
    total: count || 0,
    page,
    limit,
  };
}

module.exports = { getLeaderboard };
