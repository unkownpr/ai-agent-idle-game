const supabase = require('../config/supabase');
const { AppError, NotFoundError, InsufficientFundsError } = require('../utils/errors');
const { AGENT_PUBLIC_FIELDS } = require('./authService');

async function getSkillTree(agentId) {
  const { data: catalog, error: catError } = await supabase
    .from('skill_catalog')
    .select('*')
    .order('path')
    .order('tier');

  if (catError) throw new AppError(catError.message, 500, 'DB_ERROR');

  const { data: owned } = await supabase
    .from('agent_skills')
    .select('skill_id')
    .eq('agent_id', agentId);

  const ownedSet = new Set((owned || []).map(s => s.skill_id));

  const skills = (catalog || []).map(s => ({
    ...s,
    owned: ownedSet.has(s.id),
  }));

  return { skills };
}

async function buySkill(agent, skillId) {
  const { data: skill, error: skillError } = await supabase
    .from('skill_catalog')
    .select('*')
    .eq('id', skillId)
    .single();

  if (skillError || !skill) throw new NotFoundError('Skill not found');

  // Check if already owned
  const { data: existing } = await supabase
    .from('agent_skills')
    .select('id')
    .eq('agent_id', agent.id)
    .eq('skill_id', skillId)
    .single();

  if (existing) throw new AppError('Skill already owned', 400, 'ALREADY_OWNED');

  // Check prerequisite: must own all lower tier skills in same path
  if (skill.tier > 1) {
    const { data: pathSkills } = await supabase
      .from('skill_catalog')
      .select('id')
      .eq('path', skill.path)
      .lt('tier', skill.tier);

    const { data: ownedInPath } = await supabase
      .from('agent_skills')
      .select('skill_id')
      .eq('agent_id', agent.id)
      .in('skill_id', (pathSkills || []).map(s => s.id));

    const ownedCount = (ownedInPath || []).length;
    const requiredCount = (pathSkills || []).length;

    if (ownedCount < requiredCount) {
      throw new AppError('Must own all lower tier skills in this path first', 400, 'PREREQUISITE_NOT_MET');
    }
  }

  // Check skill points
  const currentPoints = parseInt(agent.skill_points) || 0;
  if (currentPoints < skill.cost) {
    throw new InsufficientFundsError(`Need ${skill.cost} skill points (have ${currentPoints})`);
  }

  // Set specialization on first skill purchase
  const updateData = {
    skill_points: currentPoints - skill.cost,
  };
  if (!agent.specialization) {
    updateData.specialization = skill.path;
  }

  // Deduct skill points
  const { data: updatedAgent, error: updateError } = await supabase
    .from('agents')
    .update(updateData)
    .eq('id', agent.id)
    .select(AGENT_PUBLIC_FIELDS)
    .single();

  if (updateError) throw new AppError(updateError.message, 500, 'DB_ERROR');

  // Add skill
  const { error: insertError } = await supabase
    .from('agent_skills')
    .insert({ agent_id: agent.id, skill_id: skillId });

  if (insertError) throw new AppError(insertError.message, 500, 'DB_ERROR');

  return { skill, agent: updatedAgent };
}

async function getAgentSkillEffects(agentId) {
  const { data: owned } = await supabase
    .from('agent_skills')
    .select('skill_id, skill_catalog(*)')
    .eq('agent_id', agentId);

  const effects = {};
  for (const row of (owned || [])) {
    const skill = row.skill_catalog;
    if (skill && skill.effect) {
      for (const [key, value] of Object.entries(skill.effect)) {
        effects[key] = (effects[key] || 0) + value;
      }
    }
  }
  return effects;
}

module.exports = { getSkillTree, buySkill, getAgentSkillEffects };
