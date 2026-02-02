const supabase = require('../config/supabase');
const balance = require('../config/gameBalance');
const { AppError, NotFoundError, ForbiddenError, ConflictError, InsufficientFundsError } = require('../utils/errors');

async function createAlliance(agent, name) {
  if (agent.alliance_id) throw new ConflictError('Already in an alliance');

  // Atomic gold deduction
  const { data: success, error: deductErr } = await supabase.rpc('deduct_gold', {
    p_agent_id: agent.id,
    p_amount: balance.ALLIANCE_CREATE_COST,
  });
  if (deductErr) throw new AppError(deductErr.message, 500, 'DB_ERROR');
  if (!success) {
    throw new InsufficientFundsError(`Need ${balance.ALLIANCE_CREATE_COST} gold`);
  }

  // Create alliance
  const { data: alliance, error } = await supabase
    .from('alliances')
    .insert({ name, leader_id: agent.id })
    .select()
    .single();

  if (error) {
    // Refund gold if alliance creation fails
    await supabase.rpc('add_gold', { p_agent_id: agent.id, p_amount: balance.ALLIANCE_CREATE_COST });
    if (error.code === '23505') throw new ConflictError('Alliance name taken');
    throw new AppError(error.message, 500, 'DB_ERROR');
  }

  // Update agent
  await supabase
    .from('agents')
    .update({ alliance_id: alliance.id })
    .eq('id', agent.id);

  return alliance;
}

async function getAlliance(allianceId) {
  const { data, error } = await supabase
    .from('alliances')
    .select('*')
    .eq('id', allianceId)
    .single();

  if (error || !data) throw new NotFoundError('Alliance not found');

  const { data: members } = await supabase
    .from('agents')
    .select('id, name, level, power_score')
    .eq('alliance_id', allianceId);

  return { ...data, members: members || [] };
}

async function apply(agent, allianceId) {
  if (agent.alliance_id) throw new ConflictError('Already in an alliance');

  const { data: alliance } = await supabase
    .from('alliances')
    .select('*')
    .eq('id', allianceId)
    .single();

  if (!alliance) throw new NotFoundError('Alliance not found');
  if (alliance.member_count >= balance.ALLIANCE_MAX_MEMBERS) {
    throw new AppError('Alliance is full', 400, 'ALLIANCE_FULL');
  }

  const { error } = await supabase
    .from('alliance_applications')
    .insert({ alliance_id: allianceId, agent_id: agent.id });

  if (error) {
    if (error.code === '23505') throw new ConflictError('Already applied');
    throw new AppError(error.message, 500, 'DB_ERROR');
  }

  return { status: 'applied' };
}

async function acceptApplication(leader, applicationId) {
  const { data: app, error } = await supabase
    .from('alliance_applications')
    .select('*')
    .eq('id', applicationId)
    .eq('status', 'pending')
    .single();

  if (error || !app) throw new NotFoundError('Application not found');

  // Verify leader
  const { data: alliance } = await supabase
    .from('alliances')
    .select('*')
    .eq('id', app.alliance_id)
    .single();

  if (!alliance || alliance.leader_id !== leader.id) {
    throw new ForbiddenError('Only the alliance leader can accept applications');
  }

  if (alliance.member_count >= balance.ALLIANCE_MAX_MEMBERS) {
    throw new AppError('Alliance is full', 400, 'ALLIANCE_FULL');
  }

  // Accept
  await supabase
    .from('alliance_applications')
    .update({ status: 'accepted' })
    .eq('id', applicationId);

  await supabase
    .from('agents')
    .update({ alliance_id: alliance.id })
    .eq('id', app.agent_id);

  await supabase
    .from('alliances')
    .update({ member_count: alliance.member_count + 1 })
    .eq('id', alliance.id);

  return { status: 'accepted' };
}

async function rejectApplication(leader, applicationId) {
  const { data: app } = await supabase
    .from('alliance_applications')
    .select('*')
    .eq('id', applicationId)
    .eq('status', 'pending')
    .single();

  if (!app) throw new NotFoundError('Application not found');

  const { data: alliance } = await supabase
    .from('alliances')
    .select('*')
    .eq('id', app.alliance_id)
    .single();

  if (!alliance || alliance.leader_id !== leader.id) {
    throw new ForbiddenError('Only the alliance leader can reject applications');
  }

  await supabase
    .from('alliance_applications')
    .update({ status: 'rejected' })
    .eq('id', applicationId);

  return { status: 'rejected' };
}

async function leave(agent) {
  if (!agent.alliance_id) throw new AppError('Not in an alliance', 400, 'NO_ALLIANCE');

  const { data: alliance } = await supabase
    .from('alliances')
    .select('*')
    .eq('id', agent.alliance_id)
    .single();

  if (alliance && alliance.leader_id === agent.id) {
    throw new ForbiddenError('Leader cannot leave. Transfer leadership or disband.');
  }

  await supabase
    .from('agents')
    .update({ alliance_id: null })
    .eq('id', agent.id);

  if (alliance) {
    await supabase
      .from('alliances')
      .update({ member_count: Math.max(0, alliance.member_count - 1) })
      .eq('id', alliance.id);
  }

  return { status: 'left' };
}

async function donate(agent, amount) {
  if (!agent.alliance_id) throw new AppError('Not in an alliance', 400, 'NO_ALLIANCE');

  // Atomic gold deduction
  const { data: success, error: deductErr } = await supabase.rpc('deduct_gold', {
    p_agent_id: agent.id,
    p_amount: amount,
  });
  if (deductErr) throw new AppError(deductErr.message, 500, 'DB_ERROR');
  if (!success) {
    throw new InsufficientFundsError(`Need ${amount} gold`);
  }

  const { data: alliance } = await supabase
    .from('alliances')
    .select('*')
    .eq('id', agent.alliance_id)
    .single();

  await supabase
    .from('alliances')
    .update({ treasury: parseFloat(alliance.treasury) + amount })
    .eq('id', alliance.id);

  return { donated: amount, newTreasury: parseFloat(alliance.treasury) + amount };
}

async function upgradeAlliance(leader) {
  if (!leader.alliance_id) throw new AppError('Not in an alliance', 400, 'NO_ALLIANCE');

  const { data: alliance } = await supabase
    .from('alliances')
    .select('*')
    .eq('id', leader.alliance_id)
    .single();

  if (!alliance || alliance.leader_id !== leader.id) {
    throw new ForbiddenError('Only the leader can upgrade the alliance');
  }

  const nextLevel = alliance.level + 1;
  const cost = balance.ALLIANCE_LEVEL_COST[nextLevel];
  if (!cost) throw new AppError('Alliance at max level', 400, 'MAX_LEVEL');

  if (parseFloat(alliance.treasury) < cost) {
    throw new InsufficientFundsError(`Treasury needs ${cost} gold (has ${alliance.treasury})`);
  }

  await supabase
    .from('alliances')
    .update({
      level: nextLevel,
      treasury: parseFloat(alliance.treasury) - cost,
    })
    .eq('id', alliance.id);

  return {
    newLevel: nextLevel,
    buffs: balance.ALLIANCE_LEVEL_BUFFS[nextLevel],
    cost,
  };
}

async function getApplications(leader) {
  if (!leader.alliance_id) throw new AppError('Not in an alliance', 400, 'NO_ALLIANCE');

  const { data: alliance } = await supabase
    .from('alliances')
    .select('*')
    .eq('id', leader.alliance_id)
    .single();

  if (!alliance || alliance.leader_id !== leader.id) {
    throw new ForbiddenError('Only the leader can view applications');
  }

  const { data } = await supabase
    .from('alliance_applications')
    .select('*, agents:agent_id(id, name, level, power_score)')
    .eq('alliance_id', leader.alliance_id)
    .eq('status', 'pending');

  return data || [];
}

module.exports = {
  createAlliance,
  getAlliance,
  apply,
  acceptApplication,
  rejectApplication,
  leave,
  donate,
  upgradeAlliance,
  getApplications,
};
