const supabase = require('../config/supabase');
const balance = require('../config/gameBalance');
const { AppError, NotFoundError } = require('../utils/errors');
const { generateBoss, calculateAttack, calculateRewards } = require('../engine/worldBossEngine');

async function getActiveBoss() {
  // Check for active boss
  const { data: boss } = await supabase
    .from('world_bosses')
    .select('*')
    .eq('status', 'active')
    .gt('expires_at', new Date().toISOString())
    .order('spawned_at', { ascending: false })
    .limit(1)
    .single();

  if (boss) {
    const { data: attacks } = await supabase
      .from('world_boss_attacks')
      .select('agent_id, damage_dealt')
      .eq('boss_id', boss.id)
      .order('damage_dealt', { ascending: false })
      .limit(20);

    return { boss, leaderboard: attacks || [] };
  }

  // Lazy spawn: check if enough time has passed since last boss
  const { data: lastBoss } = await supabase
    .from('world_bosses')
    .select('spawned_at')
    .order('spawned_at', { ascending: false })
    .limit(1)
    .single();

  const timeSinceLastSpawn = lastBoss
    ? Date.now() - new Date(lastBoss.spawned_at).getTime()
    : Infinity;

  if (timeSinceLastSpawn >= balance.WORLD_BOSS_SPAWN_INTERVAL_MS) {
    // Count active players (logged in within last 24h)
    const { count } = await supabase
      .from('agents')
      .select('id', { count: 'exact', head: true })
      .gt('last_tick_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

    const bossData = generateBoss(count || 1);

    const { data: newBoss, error } = await supabase
      .from('world_bosses')
      .insert(bossData)
      .select()
      .single();

    if (error) throw new AppError(error.message, 500, 'DB_ERROR');
    return { boss: newBoss, leaderboard: [] };
  }

  return { boss: null, leaderboard: [] };
}

async function attackBoss(agent) {
  const { data: boss } = await supabase
    .from('world_bosses')
    .select('*')
    .eq('status', 'active')
    .gt('expires_at', new Date().toISOString())
    .single();

  if (!boss) throw new NotFoundError('No active world boss');

  // Check cooldown
  const { data: lastAttack } = await supabase
    .from('world_boss_attacks')
    .select('created_at')
    .eq('boss_id', boss.id)
    .eq('agent_id', agent.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (lastAttack) {
    const elapsed = Date.now() - new Date(lastAttack.created_at).getTime();
    if (elapsed < balance.WORLD_BOSS_ATTACK_COOLDOWN_MS) {
      const remaining = Math.ceil((balance.WORLD_BOSS_ATTACK_COOLDOWN_MS - elapsed) / 1000);
      throw new AppError(`Attack cooldown: ${remaining}s remaining`, 429, 'COOLDOWN');
    }
  }

  const damage = calculateAttack(agent);
  const newHp = Math.max(0, parseFloat(boss.current_hp) - damage);

  // Update boss HP
  await supabase
    .from('world_bosses')
    .update({
      current_hp: newHp,
      status: newHp <= 0 ? 'defeated' : 'active',
    })
    .eq('id', boss.id);

  // Record attack (aggregate damage per agent)
  const { data: existingAttack } = await supabase
    .from('world_boss_attacks')
    .select('id, damage_dealt')
    .eq('boss_id', boss.id)
    .eq('agent_id', agent.id)
    .single();

  if (existingAttack) {
    await supabase
      .from('world_boss_attacks')
      .update({
        damage_dealt: parseFloat(existingAttack.damage_dealt) + damage,
        created_at: new Date().toISOString(),
      })
      .eq('id', existingAttack.id);
  } else {
    await supabase
      .from('world_boss_attacks')
      .insert({
        boss_id: boss.id,
        agent_id: agent.id,
        damage_dealt: damage,
      });
  }

  // If boss defeated, distribute rewards
  if (newHp <= 0) {
    await distributeRewards(boss.id);
  }

  return {
    damage,
    bossHpRemaining: newHp,
    defeated: newHp <= 0,
  };
}

async function distributeRewards(bossId) {
  const { data: attacks } = await supabase
    .from('world_boss_attacks')
    .select('agent_id, damage_dealt')
    .eq('boss_id', bossId)
    .order('damage_dealt', { ascending: false });

  if (!attacks || attacks.length === 0) return;

  const totalDamage = attacks.reduce((sum, a) => sum + parseFloat(a.damage_dealt), 0);
  const topCount = balance.WORLD_BOSS_TOP_DAMAGE_COUNT;

  const rewardInserts = [];
  for (let i = 0; i < attacks.length; i++) {
    const a = attacks[i];
    const isTop = i < topCount;
    const rewards = calculateRewards(totalDamage, parseFloat(a.damage_dealt), isTop);

    rewardInserts.push({
      boss_id: bossId,
      agent_id: a.agent_id,
      gold_reward: rewards.gold,
      gem_reward: rewards.gems,
      is_top_damage: isTop,
      claimed: false,
    });
  }

  await supabase.from('world_boss_rewards').insert(rewardInserts);
}

async function getRewards(agentId) {
  const { data, error } = await supabase
    .from('world_boss_rewards')
    .select('*')
    .eq('agent_id', agentId)
    .eq('claimed', false)
    .order('created_at', { ascending: false });

  if (error) throw new AppError(error.message, 500, 'DB_ERROR');
  return { rewards: data || [] };
}

async function claimReward(agentId, rewardId) {
  const { data: reward, error } = await supabase
    .from('world_boss_rewards')
    .select('*')
    .eq('id', rewardId)
    .eq('agent_id', agentId)
    .eq('claimed', false)
    .single();

  if (error || !reward) throw new NotFoundError('Reward not found or already claimed');

  await supabase
    .from('world_boss_rewards')
    .update({ claimed: true })
    .eq('id', rewardId);

  if (reward.gold_reward > 0) {
    await supabase.rpc('add_gold', { p_agent_id: agentId, p_amount: reward.gold_reward });
  }
  if (reward.gem_reward > 0) {
    await supabase.rpc('add_gems', { p_agent_id: agentId, p_amount: reward.gem_reward });
  }

  return {
    goldReward: reward.gold_reward,
    gemReward: reward.gem_reward,
    isTopDamage: reward.is_top_damage,
  };
}

async function getHistory(page = 1, limit = 10) {
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  const { data, error, count } = await supabase
    .from('world_bosses')
    .select('*', { count: 'exact' })
    .in('status', ['defeated', 'expired'])
    .order('spawned_at', { ascending: false })
    .range(from, to);

  if (error) throw new AppError(error.message, 500, 'DB_ERROR');
  return { bosses: data || [], total: count || 0, page, limit };
}

module.exports = { getActiveBoss, attackBoss, distributeRewards, getRewards, claimReward, getHistory };
