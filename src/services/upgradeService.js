const supabase = require('../config/supabase');
const { NotFoundError, InsufficientFundsError, AppError } = require('../utils/errors');
const { AGENT_PUBLIC_FIELDS } = require('./authService');

async function listUpgrades(agentId) {
  const { data: catalog, error: catErr } = await supabase
    .from('upgrade_catalog')
    .select('*')
    .order('id');

  if (catErr) throw new AppError(catErr.message, 500, 'DB_ERROR');

  const { data: owned, error: ownErr } = await supabase
    .from('agent_upgrades')
    .select('upgrade_id, level')
    .eq('agent_id', agentId);

  if (ownErr) throw new AppError(ownErr.message, 500, 'DB_ERROR');

  const ownedMap = {};
  for (const o of owned || []) {
    ownedMap[o.upgrade_id] = o.level;
  }

  return catalog.map((u) => {
    const currentLevel = ownedMap[u.id] || 0;
    const nextCost = currentLevel < u.max_level
      ? Math.floor(u.base_cost * Math.pow(u.cost_multiplier, currentLevel))
      : null;
    return {
      ...u,
      current_level: currentLevel,
      next_cost: nextCost,
      maxed: currentLevel >= u.max_level,
    };
  });
}

async function buyUpgrade(agent, upgradeId) {
  const { data: upgrade, error: upErr } = await supabase
    .from('upgrade_catalog')
    .select('*')
    .eq('id', upgradeId)
    .single();

  if (upErr || !upgrade) throw new NotFoundError('Upgrade not found');

  // Get current level
  const { data: existing } = await supabase
    .from('agent_upgrades')
    .select('*')
    .eq('agent_id', agent.id)
    .eq('upgrade_id', upgradeId)
    .single();

  const currentLevel = existing ? existing.level : 0;
  if (currentLevel >= upgrade.max_level) {
    throw new AppError('Upgrade already at max level', 400, 'MAX_LEVEL');
  }

  const cost = Math.floor(upgrade.base_cost * Math.pow(upgrade.cost_multiplier, currentLevel));
  const currency = upgrade.currency;

  // Validate currency field to prevent property injection
  const VALID_CURRENCIES = ['gold', 'gems'];
  if (!VALID_CURRENCIES.includes(currency)) {
    throw new AppError('Invalid upgrade currency', 500, 'INVALID_CURRENCY');
  }

  // Atomic deduction - prevents race conditions
  const rpcName = currency === 'gold' ? 'deduct_gold' : 'deduct_gems';
  const { data: success, error: deductErr } = await supabase.rpc(rpcName, {
    p_agent_id: agent.id,
    p_amount: cost,
  });

  if (deductErr) throw new AppError(deductErr.message, 500, 'DB_ERROR');
  if (!success) {
    throw new InsufficientFundsError(`Need ${cost} ${currency}`);
  }

  // Upsert upgrade
  if (existing) {
    await supabase
      .from('agent_upgrades')
      .update({ level: currentLevel + 1 })
      .eq('agent_id', agent.id)
      .eq('upgrade_id', upgradeId);
  } else {
    await supabase
      .from('agent_upgrades')
      .insert({ agent_id: agent.id, upgrade_id: upgradeId, level: 1 });
  }

  // Recalculate stats
  await supabase.rpc('recalculate_agent_stats', { p_agent_id: agent.id });

  // Fetch updated agent
  const { data: updated } = await supabase
    .from('agents')
    .select(AGENT_PUBLIC_FIELDS)
    .eq('id', agent.id)
    .single();

  return {
    upgrade: upgrade.name,
    newLevel: currentLevel + 1,
    cost,
    currency,
    agent: updated,
  };
}

module.exports = { listUpgrades, buyUpgrade };
