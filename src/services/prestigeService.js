const supabase = require('../config/supabase');
const balance = require('../config/gameBalance');
const { AppError, ForbiddenError } = require('../utils/errors');
const { AGENT_PUBLIC_FIELDS } = require('./authService');

async function prestige(agent) {
  if (agent.level < balance.PRESTIGE_MIN_LEVEL) {
    throw new ForbiddenError(`Must be level ${balance.PRESTIGE_MIN_LEVEL}+ to prestige (current: ${agent.level})`);
  }

  const currentPrestige = parseInt(agent.prestige_level) || 0;
  const newPrestige = currentPrestige + 1;
  const newMultiplier = 1 + newPrestige * balance.PRESTIGE_BONUS_PER_LEVEL;
  const totalPrestiges = (parseInt(agent.total_prestiges) || 0) + 1;

  // Reset: level, xp, gold, upgrades, skills, dungeon progress, energy
  // Keep: gems, prestige stats, name, api_key
  const { data, error } = await supabase
    .from('agents')
    .update({
      level: 1,
      xp: 0,
      gold: 0,
      click_power: 1,
      idle_rate: 0.1,
      attack_power: 10,
      defense_power: 10,
      power_score: 0,
      total_clicks: 0,
      total_gold_earned: 0,
      total_pvp_wins: 0,
      total_pvp_losses: 0,
      prestige_level: newPrestige,
      prestige_multiplier: newMultiplier,
      total_prestiges: totalPrestiges,
      skill_points: 0,
      specialization: null,
      energy: balance.DUNGEON_DEFAULT_MAX_ENERGY,
      max_energy: balance.DUNGEON_DEFAULT_MAX_ENERGY,
      highest_floor: 0,
      last_click_at: '2000-01-01T00:00:00Z',
      last_attack_at: '2000-01-01T00:00:00Z',
      shield_until: '2000-01-01T00:00:00Z',
    })
    .eq('id', agent.id)
    .select(AGENT_PUBLIC_FIELDS)
    .single();

  if (error) throw new AppError(error.message, 500, 'DB_ERROR');

  // Reset upgrades
  await supabase.from('agent_upgrades').delete().eq('agent_id', agent.id);

  // Reset skills
  await supabase.from('agent_skills').delete().eq('agent_id', agent.id);

  // Recalculate power score
  await supabase.rpc('recalculate_power_score', { p_agent_id: agent.id });

  return {
    agent: data,
    prestigeLevel: newPrestige,
    multiplier: newMultiplier,
    totalPrestiges,
  };
}

module.exports = { prestige };
