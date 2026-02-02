const supabase = require('../config/supabase');
const balance = require('../config/gameBalance');
const { resolveCombat, canAttack } = require('../engine/combatEngine');
const { NotFoundError, AppError, ForbiddenError } = require('../utils/errors');

const MAX_PAGE_LIMIT = 100;

async function attack(attacker, targetId) {
  // Self-attack check
  if (attacker.id === targetId) {
    throw new ForbiddenError('Cannot attack yourself');
  }

  // Fetch defender
  const { data: defender, error } = await supabase
    .from('agents')
    .select('*')
    .eq('id', targetId)
    .single();

  if (error || !defender) throw new NotFoundError('Target not found');

  // Check if active peace treaty event
  const { data: peaceEvents } = await supabase
    .from('events')
    .select('*')
    .eq('type', 'peace_treaty')
    .gt('ends_at', new Date().toISOString())
    .limit(1);

  if (peaceEvents && peaceEvents.length > 0) {
    throw new ForbiddenError('PvP is disabled during Peace Treaty event');
  }

  // Validate attack
  const check = canAttack(attacker, defender);
  if (!check.canAttack) {
    throw new AppError(check.errors.join('; '), 400, 'PVP_BLOCKED');
  }

  // Resolve combat
  const result = resolveCombat(attacker, defender);

  // Apply results
  if (result.attackerWins) {
    // Attacker gains gold, defender loses gold
    await supabase
      .from('agents')
      .update({
        gold: parseFloat(attacker.gold) + result.goldTransferred,
        total_pvp_wins: attacker.total_pvp_wins + 1,
        last_attack_at: new Date().toISOString(),
      })
      .eq('id', attacker.id);

    await supabase
      .from('agents')
      .update({
        gold: Math.max(0, parseFloat(defender.gold) - result.goldTransferred),
        total_pvp_losses: defender.total_pvp_losses + 1,
        shield_until: new Date(Date.now() + balance.PVP_DEFENSE_SHIELD_MS).toISOString(),
      })
      .eq('id', defender.id);
  } else {
    // Attacker loses gold
    await supabase
      .from('agents')
      .update({
        gold: Math.max(0, parseFloat(attacker.gold) - result.goldLost),
        total_pvp_losses: attacker.total_pvp_losses + 1,
        last_attack_at: new Date().toISOString(),
      })
      .eq('id', attacker.id);

    await supabase
      .from('agents')
      .update({
        total_pvp_wins: defender.total_pvp_wins + 1,
        shield_until: new Date(Date.now() + balance.PVP_DEFENSE_SHIELD_MS).toISOString(),
      })
      .eq('id', defender.id);
  }

  // Log PvP
  await supabase.from('pvp_log').insert({
    attacker_id: attacker.id,
    defender_id: defender.id,
    attacker_power: result.attackerPower,
    defender_power: result.defenderPower,
    attacker_roll: result.attackerRoll,
    defender_roll: result.defenderRoll,
    winner_id: result.winnerId,
    gold_transferred: result.goldTransferred,
    gold_lost: result.goldLost,
  });

  return {
    winner: result.attackerWins ? 'attacker' : 'defender',
    ...result,
  };
}

async function getTargets(agent) {
  const powerScore = parseFloat(agent.power_score);
  const minPower = powerScore * (1 - balance.PVP_POWER_RANGE);
  const maxPower = powerScore * (1 + balance.PVP_POWER_RANGE);

  let query = supabase
    .from('agents')
    .select('id, name, level, power_score, alliance_id')
    .neq('id', agent.id)
    .gte('level', balance.PVP_MIN_LEVEL)
    .gte('power_score', minPower)
    .lte('power_score', maxPower)
    .lt('shield_until', new Date().toISOString())
    .limit(20);

  // Exclude alliance members using parameterized filter
  if (agent.alliance_id) {
    query = query.not('alliance_id', 'eq', agent.alliance_id);
  }

  const { data, error } = await query;
  if (error) throw new AppError(error.message, 500, 'DB_ERROR');
  return data || [];
}

async function getPvpLog(agentId, page = 1, limit = 20) {
  limit = Math.min(Math.max(1, limit), MAX_PAGE_LIMIT);
  page = Math.max(1, page);

  const from = (page - 1) * limit;
  const to = from + limit - 1;

  const { data, error, count } = await supabase
    .from('pvp_log')
    .select('*', { count: 'exact' })
    .or(`attacker_id.eq.${agentId},defender_id.eq.${agentId}`)
    .order('created_at', { ascending: false })
    .range(from, to);

  if (error) throw new AppError(error.message, 500, 'DB_ERROR');
  return { logs: data || [], total: count || 0 };
}

module.exports = { attack, getTargets, getPvpLog };
