const supabase = require('../config/supabase');
const balance = require('../config/gameBalance');
const { AppError, ForbiddenError, NotFoundError, InsufficientFundsError } = require('../utils/errors');
const { AGENT_PUBLIC_FIELDS } = require('./authService');
const { generateMonster, calculateCombat, calculateRewards, calculateEnergyCost } = require('../engine/dungeonEngine');
const { checkLevelUp } = require('../engine/tickEngine');

function regenerateEnergy(agent) {
  const lastTick = new Date(agent.last_energy_tick || agent.created_at).getTime();
  const now = Date.now();
  const minutesElapsed = (now - lastTick) / 60000;
  const energyGained = Math.floor(minutesElapsed * balance.DUNGEON_ENERGY_REGEN_PER_MIN);
  const maxEnergy = parseInt(agent.max_energy) || balance.DUNGEON_DEFAULT_MAX_ENERGY;
  const currentEnergy = Math.min(maxEnergy, (parseInt(agent.energy) || 0) + energyGained);
  return { currentEnergy, maxEnergy, energyGained, needsUpdate: energyGained > 0 };
}

async function getStatus(agent) {
  const { currentEnergy, maxEnergy } = regenerateEnergy(agent);

  const { data: logs } = await supabase
    .from('dungeon_log')
    .select('*')
    .eq('agent_id', agent.id)
    .order('created_at', { ascending: false })
    .limit(10);

  return {
    energy: currentEnergy,
    maxEnergy,
    highestFloor: parseInt(agent.highest_floor) || 0,
    recentRuns: logs || [],
  };
}

async function enterFloor(agent, floor) {
  if (floor < 1) throw new AppError('Floor must be at least 1', 400, 'INVALID_FLOOR');

  const highestFloor = parseInt(agent.highest_floor) || 0;
  if (floor > highestFloor + 1) {
    throw new ForbiddenError(`Cannot skip floors. Highest cleared: ${highestFloor}, max entry: ${highestFloor + 1}`);
  }

  // Energy check with regen
  const { currentEnergy } = regenerateEnergy(agent);
  const energyCost = calculateEnergyCost(floor);
  if (currentEnergy < energyCost) {
    throw new InsufficientFundsError(`Need ${energyCost} energy (have ${currentEnergy})`);
  }

  // Get skill effects
  let skillEffects = {};
  try {
    const skillService = require('./skillService');
    skillEffects = await skillService.getAgentSkillEffects(agent.id);
  } catch (e) {}

  // Generate monster and resolve combat
  const monster = generateMonster(floor);
  const combat = calculateCombat(agent, monster, skillEffects);
  const rewards = calculateRewards(floor, monster.isBoss, combat.success, skillEffects);

  // Update energy
  const newEnergy = currentEnergy - energyCost;

  // Apply rewards
  const updateData = {
    energy: newEnergy,
    last_energy_tick: new Date().toISOString(),
  };

  if (combat.success && floor > highestFloor) {
    updateData.highest_floor = floor;
  }

  if (rewards.xp > 0) {
    const newXp = parseInt(agent.xp) + rewards.xp;
    const { level, xp, leveledUp } = checkLevelUp(agent.level, newXp);
    updateData.xp = xp;
    updateData.level = level;
    if (leveledUp) {
      const levelsGained = level - agent.level;
      updateData.skill_points = (parseInt(agent.skill_points) || 0) + levelsGained;
    }
  }

  const { data: updatedAgent, error: updateError } = await supabase
    .from('agents')
    .update(updateData)
    .eq('id', agent.id)
    .select(AGENT_PUBLIC_FIELDS)
    .single();

  if (updateError) throw new AppError(updateError.message, 500, 'DB_ERROR');

  if (rewards.gold > 0) {
    await supabase.rpc('add_gold', { p_agent_id: agent.id, p_amount: rewards.gold });
  }
  if (rewards.gems > 0) {
    await supabase.rpc('add_gems', { p_agent_id: agent.id, p_amount: rewards.gems });
  }

  // Log dungeon run
  await supabase.from('dungeon_log').insert({
    agent_id: agent.id,
    floor,
    success: combat.success,
    monster_name: monster.name,
    is_boss: monster.isBoss,
    rewards: rewards,
    combat_details: {
      agentDamage: combat.agentDamage,
      monsterDamage: combat.monsterDamage,
      rounds: combat.rounds,
      monsterHp: combat.monsterHp,
    },
  });

  // Fire-and-forget quest progress
  try {
    const questService = require('./questService');
    questService.updateProgress(agent.id, 'dungeon_floor', floor).catch(() => {});
  } catch (e) {}

  return {
    success: combat.success,
    monster,
    combat: {
      agentDamage: combat.agentDamage,
      monsterDamage: combat.monsterDamage,
      rounds: combat.rounds,
    },
    rewards,
    energyRemaining: newEnergy,
    agent: updatedAgent,
  };
}

async function getDungeonLog(agentId, page = 1, limit = 20) {
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  const { data, error, count } = await supabase
    .from('dungeon_log')
    .select('*', { count: 'exact' })
    .eq('agent_id', agentId)
    .order('created_at', { ascending: false })
    .range(from, to);

  if (error) throw new AppError(error.message, 500, 'DB_ERROR');
  return { logs: data || [], total: count || 0, page, limit };
}

async function startRaid(agent) {
  if (!agent.alliance_id) throw new ForbiddenError('Must be in an alliance');

  // Check leader
  const { data: alliance } = await supabase
    .from('alliances')
    .select('*')
    .eq('id', agent.alliance_id)
    .single();

  if (!alliance || alliance.leader_id !== agent.id) {
    throw new ForbiddenError('Only the alliance leader can start raids');
  }

  // Check no active raid
  const { data: activeRaid } = await supabase
    .from('alliance_raids')
    .select('id')
    .eq('alliance_id', agent.alliance_id)
    .eq('status', 'active')
    .single();

  if (activeRaid) throw new AppError('Alliance already has an active raid', 400, 'RAID_ACTIVE');

  const bossHp = 50000 * alliance.level;

  const { data: raid, error } = await supabase
    .from('alliance_raids')
    .insert({
      alliance_id: agent.alliance_id,
      boss_name: 'Alliance Raid Boss',
      boss_hp: bossHp,
      current_hp: bossHp,
      total_damage: 0,
      status: 'active',
      expires_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    })
    .select()
    .single();

  if (error) throw new AppError(error.message, 500, 'DB_ERROR');
  return raid;
}

async function attackRaid(agent, raidId) {
  const { data: raid, error } = await supabase
    .from('alliance_raids')
    .select('*')
    .eq('id', raidId)
    .eq('status', 'active')
    .single();

  if (error || !raid) throw new NotFoundError('Active raid not found');
  if (raid.alliance_id !== agent.alliance_id) throw new ForbiddenError('Not your alliance raid');

  if (new Date(raid.expires_at) < new Date()) {
    await supabase.from('alliance_raids').update({ status: 'expired' }).eq('id', raidId);
    throw new AppError('Raid has expired', 400, 'RAID_EXPIRED');
  }

  const damage = Math.floor(parseFloat(agent.attack_power) * (parseFloat(agent.prestige_multiplier) || 1) * (1 + Math.random() * 0.3));
  const newHp = Math.max(0, parseFloat(raid.current_hp) - damage);

  await supabase
    .from('alliance_raids')
    .update({
      current_hp: newHp,
      total_damage: parseFloat(raid.total_damage) + damage,
      status: newHp <= 0 ? 'defeated' : 'active',
    })
    .eq('id', raidId);

  // Log participation
  const { data: existing } = await supabase
    .from('alliance_raid_participants')
    .select('id, damage')
    .eq('raid_id', raidId)
    .eq('agent_id', agent.id)
    .single();

  if (existing) {
    await supabase
      .from('alliance_raid_participants')
      .update({ damage: parseFloat(existing.damage) + damage })
      .eq('id', existing.id);
  } else {
    await supabase
      .from('alliance_raid_participants')
      .insert({ raid_id: raidId, agent_id: agent.id, damage });
  }

  // If defeated, distribute rewards
  if (newHp <= 0) {
    const { data: participants } = await supabase
      .from('alliance_raid_participants')
      .select('agent_id, damage')
      .eq('raid_id', raidId)
      .order('damage', { ascending: false });

    const totalDamage = parseFloat(raid.total_damage) + damage;
    for (const p of (participants || [])) {
      const share = parseFloat(p.damage) / totalDamage;
      const goldReward = Math.floor(5000 * share);
      const gemReward = Math.max(1, Math.floor(5 * share));
      await supabase.rpc('add_gold', { p_agent_id: p.agent_id, p_amount: goldReward });
      await supabase.rpc('add_gems', { p_agent_id: p.agent_id, p_amount: gemReward });
    }
  }

  return {
    damage,
    bossHpRemaining: newHp,
    defeated: newHp <= 0,
  };
}

async function getActiveRaid(agent) {
  if (!agent.alliance_id) throw new ForbiddenError('Must be in an alliance');

  const { data: raid } = await supabase
    .from('alliance_raids')
    .select('*')
    .eq('alliance_id', agent.alliance_id)
    .eq('status', 'active')
    .single();

  if (!raid) return { raid: null };

  const { data: participants } = await supabase
    .from('alliance_raid_participants')
    .select('agent_id, damage')
    .eq('raid_id', raid.id)
    .order('damage', { ascending: false });

  return { raid, participants: participants || [] };
}

module.exports = { getStatus, enterFloor, getDungeonLog, startRaid, attackRaid, getActiveRaid, regenerateEnergy };
