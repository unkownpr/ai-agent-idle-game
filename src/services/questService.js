const supabase = require('../config/supabase');
const { AppError, NotFoundError } = require('../utils/errors');

async function getDailyQuests(agentId) {
  const now = new Date();

  // Check for existing active quests
  const { data: existing } = await supabase
    .from('agent_quests')
    .select('*, quest_catalog(*)')
    .eq('agent_id', agentId)
    .gt('expires_at', now.toISOString())
    .order('created_at', { ascending: false })
    .limit(3);

  if (existing && existing.length === 3) {
    return { quests: existing };
  }

  // Assign new daily quests
  const { data: catalog } = await supabase
    .from('quest_catalog')
    .select('*');

  if (!catalog || catalog.length === 0) {
    return { quests: [] };
  }

  // Pick 3 random quests
  const shuffled = catalog.sort(() => Math.random() - 0.5);
  const selected = shuffled.slice(0, 3);

  // Expire at midnight UTC
  const tomorrow = new Date(now);
  tomorrow.setUTCHours(23, 59, 59, 999);

  const questInserts = selected.map(q => ({
    agent_id: agentId,
    quest_id: q.id,
    progress: 0,
    completed: false,
    reward_claimed: false,
    expires_at: tomorrow.toISOString(),
  }));

  // Delete old expired quests first
  await supabase
    .from('agent_quests')
    .delete()
    .eq('agent_id', agentId)
    .lt('expires_at', now.toISOString());

  const { data: newQuests, error } = await supabase
    .from('agent_quests')
    .insert(questInserts)
    .select('*, quest_catalog(*)');

  if (error) throw new AppError(error.message, 500, 'DB_ERROR');
  return { quests: newQuests || [] };
}

async function updateProgress(agentId, questType, amount) {
  // Find active quests matching this type
  const now = new Date().toISOString();

  const { data: activeQuests } = await supabase
    .from('agent_quests')
    .select('*, quest_catalog(*)')
    .eq('agent_id', agentId)
    .eq('completed', false)
    .gt('expires_at', now);

  if (!activeQuests || activeQuests.length === 0) return;

  for (const aq of activeQuests) {
    const quest = aq.quest_catalog;
    if (!quest || quest.type !== questType) continue;

    const newProgress = Math.min(parseInt(aq.progress) + amount, quest.target);
    const completed = newProgress >= quest.target;

    await supabase
      .from('agent_quests')
      .update({ progress: newProgress, completed })
      .eq('id', aq.id);
  }
}

async function claimReward(agentId, questId) {
  const { data: aq, error } = await supabase
    .from('agent_quests')
    .select('*, quest_catalog(*)')
    .eq('id', questId)
    .eq('agent_id', agentId)
    .single();

  if (error || !aq) throw new NotFoundError('Quest not found');
  if (!aq.completed) throw new AppError('Quest not completed yet', 400, 'NOT_COMPLETED');
  if (aq.reward_claimed) throw new AppError('Reward already claimed', 400, 'ALREADY_CLAIMED');

  const quest = aq.quest_catalog;

  // Mark claimed
  await supabase
    .from('agent_quests')
    .update({ reward_claimed: true })
    .eq('id', questId);

  // Award rewards
  if (quest.gold_reward > 0) {
    await supabase.rpc('add_gold', { p_agent_id: agentId, p_amount: quest.gold_reward });
  }
  if (quest.gem_reward > 0) {
    await supabase.rpc('add_gems', { p_agent_id: agentId, p_amount: quest.gem_reward });
  }

  return {
    goldReward: quest.gold_reward,
    gemReward: quest.gem_reward,
  };
}

module.exports = { getDailyQuests, updateProgress, claimReward };
