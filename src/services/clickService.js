const supabase = require('../config/supabase');
const balance = require('../config/gameBalance');
const { TooManyRequestsError, AppError } = require('../utils/errors');
const { checkLevelUp } = require('../engine/tickEngine');
const { AGENT_PUBLIC_FIELDS } = require('./authService');

async function click(agent) {
  const now = Date.now();
  const lastClick = new Date(agent.last_click_at).getTime();

  if (now - lastClick < balance.CLICK_COOLDOWN_MS) {
    throw new TooManyRequestsError('Click cooldown: 1 click per second');
  }

  const clickPower = parseFloat(agent.click_power);
  const karma = parseFloat(agent.karma);
  const goldEarned = clickPower * karma;
  const xpGained = balance.CLICK_XP;

  const newXp = parseInt(agent.xp) + xpGained;
  const { level, xp, leveledUp } = checkLevelUp(agent.level, newXp);

  // Atomic gold addition via RPC + update other fields
  await supabase.rpc('add_gold', { p_agent_id: agent.id, p_amount: goldEarned });

  const { data, error } = await supabase
    .from('agents')
    .update({
      xp: xp,
      level: level,
      total_clicks: parseInt(agent.total_clicks) + 1,
      total_gold_earned: parseFloat(agent.total_gold_earned) + goldEarned,
      last_click_at: new Date().toISOString(),
    })
    .eq('id', agent.id)
    .select(AGENT_PUBLIC_FIELDS)
    .single();

  if (error) throw new AppError(error.message, 500, 'DB_ERROR');

  // Log the click
  await supabase.from('click_log').insert({
    agent_id: agent.id,
    gold_earned: goldEarned,
    click_power_at: clickPower,
  });

  return {
    goldEarned: Math.round(goldEarned * 100) / 100,
    xpGained,
    leveledUp,
    newLevel: level,
    agent: data,
  };
}

module.exports = { click };
