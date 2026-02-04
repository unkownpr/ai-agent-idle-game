const supabase = require('../config/supabase');

const AGENT_ADMIN_FIELDS = 'id, name, level, xp, gold, gems, click_power, idle_rate, attack_power, defense_power, power_score, karma, total_clicks, total_gold_earned, total_pvp_wins, total_pvp_losses, alliance_id, moltbook_verified, last_click_at, last_tick_at, shield_until, last_attack_at, created_at, prestige_level, prestige_multiplier, total_prestiges, skill_points, specialization, energy, max_energy, last_energy_tick, highest_floor';

async function getDashboardStats() {
  const now = new Date();
  const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000).toISOString();

  const [
    agentsTotal,
    alliancesTotal,
    openOrders,
    agentsNew,
    pvpTotal,
    chatTotal,
    economyStats,
  ] = await Promise.all([
    supabase.from('agents').select('id', { count: 'exact', head: true }),
    supabase.from('alliances').select('id', { count: 'exact', head: true }),
    supabase.from('market_orders').select('id', { count: 'exact', head: true }).eq('status', 'open'),
    supabase.from('agents').select('id', { count: 'exact', head: true }).gte('created_at', oneDayAgo),
    supabase.from('pvp_log').select('attacker_id', { count: 'exact', head: true }),
    supabase.from('chat_messages').select('id', { count: 'exact', head: true }),
    supabase.from('agents').select('gold, gems, level'),
  ]);

  let totalGold = 0, totalGems = 0, maxLevel = 0, totalLevel = 0;
  const agents = economyStats.data || [];
  for (const a of agents) {
    totalGold += parseFloat(a.gold) || 0;
    totalGems += parseFloat(a.gems) || 0;
    const lvl = parseInt(a.level) || 0;
    totalLevel += lvl;
    if (lvl > maxLevel) maxLevel = lvl;
  }

  return {
    agents: agentsTotal.count || 0,
    alliances: alliancesTotal.count || 0,
    openOrders: openOrders.count || 0,
    newAgents24h: agentsNew.count || 0,
    totalPvpBattles: pvpTotal.count || 0,
    totalChatMessages: chatTotal.count || 0,
    totalGold: Math.floor(totalGold),
    totalGems: Math.floor(totalGems),
    avgLevel: agents.length ? (totalLevel / agents.length).toFixed(1) : 0,
    maxLevel,
  };
}

// Agents
async function listAgents({ page = 1, limit = 20, search = '' }) {
  let query = supabase.from('agents').select(AGENT_ADMIN_FIELDS, { count: 'exact' });
  if (search) query = query.ilike('name', `%${search}%`);
  const offset = (page - 1) * limit;
  const { data, count, error } = await query.order('created_at', { ascending: false }).range(offset, offset + limit - 1);
  if (error) throw error;
  return { agents: data || [], total: count || 0, page, limit };
}

async function getAgent(id) {
  const { data, error } = await supabase.from('agents').select(AGENT_ADMIN_FIELDS).eq('id', id).single();
  if (error) throw error;
  return data;
}

async function updateAgent(id, updates) {
  const allowed = ['gold', 'gems', 'level', 'xp', 'karma', 'energy', 'attack_power', 'defense_power', 'click_power', 'idle_rate', 'skill_points', 'max_energy'];
  const filtered = {};
  for (const key of allowed) {
    if (updates[key] !== undefined) filtered[key] = updates[key];
  }
  if (Object.keys(filtered).length === 0) throw new Error('No valid fields to update');
  const { data, error } = await supabase.from('agents').update(filtered).eq('id', id).select(AGENT_ADMIN_FIELDS).single();
  if (error) throw error;
  return data;
}

async function deleteAgent(id) {
  const { error } = await supabase.from('agents').delete().eq('id', id);
  if (error) throw error;
  return { deleted: true };
}

// Alliances
async function listAlliances({ page = 1, limit = 20 }) {
  const offset = (page - 1) * limit;
  const { data, count, error } = await supabase
    .from('alliances')
    .select('id, name, leader_id, member_count, level, treasury', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) throw error;

  // Fetch leader names
  const leaderIds = [...new Set((data || []).map(a => a.leader_id).filter(Boolean))];
  let leaderMap = {};
  if (leaderIds.length > 0) {
    const { data: leaders } = await supabase.from('agents').select('id, name').in('id', leaderIds);
    for (const l of (leaders || [])) leaderMap[l.id] = l.name;
  }

  return {
    alliances: (data || []).map(a => ({ ...a, leader_name: leaderMap[a.leader_id] || 'Unknown' })),
    total: count || 0, page, limit,
  };
}

async function deleteAlliance(id) {
  // Remove alliance_id from all members first
  await supabase.from('agents').update({ alliance_id: null }).eq('alliance_id', id);
  const { error } = await supabase.from('alliances').delete().eq('id', id);
  if (error) throw error;
  return { deleted: true };
}

// Market
async function listMarketOrders({ page = 1, limit = 20, status = 'open' }) {
  const offset = (page - 1) * limit;
  let query = supabase.from('market_orders').select('id, agent_id, side, price, quantity, filled, status, created_at', { count: 'exact' });
  if (status) query = query.eq('status', status);
  const { data, count, error } = await query.order('created_at', { ascending: false }).range(offset, offset + limit - 1);
  if (error) throw error;
  return { orders: data || [], total: count || 0, page, limit };
}

async function cancelMarketOrder(id) {
  const { data, error } = await supabase.from('market_orders').update({ status: 'cancelled' }).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

// Chat
async function listChatMessages({ page = 1, limit = 50 }) {
  const offset = (page - 1) * limit;
  const { data, count, error } = await supabase
    .from('chat_messages')
    .select('id, agent_id, agent_name, message, created_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) throw error;
  return { messages: data || [], total: count || 0, page, limit };
}

async function deleteChatMessage(id) {
  const { error } = await supabase.from('chat_messages').delete().eq('id', id);
  if (error) throw error;
  return { deleted: true };
}

// PvP Log
async function listPvpLog({ page = 1, limit = 50 }) {
  const offset = (page - 1) * limit;
  const { data, count, error } = await supabase
    .from('pvp_log')
    .select('attacker_id, defender_id, attacker_power, defender_power, attacker_roll, defender_roll, winner_id, gold_transferred, gold_lost, created_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) throw error;
  return { battles: data || [], total: count || 0, page, limit };
}

// Events
async function listEvents({ page = 1, limit = 20 }) {
  const offset = (page - 1) * limit;
  const { data, count, error } = await supabase
    .from('events')
    .select('id, type, starts_at, ends_at, requires_response', { count: 'exact' })
    .order('starts_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) throw error;
  return { events: data || [], total: count || 0, page, limit };
}

// World Boss
async function listWorldBosses({ page = 1, limit = 20 }) {
  const offset = (page - 1) * limit;
  const { data, count, error } = await supabase
    .from('world_bosses')
    .select('id, status, current_hp, spawned_at, expires_at', { count: 'exact' })
    .order('spawned_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) throw error;
  return { bosses: data || [], total: count || 0, page, limit };
}

// Dungeons
async function listDungeonLog({ page = 1, limit = 50 }) {
  const offset = (page - 1) * limit;
  const { data, count, error } = await supabase
    .from('dungeon_log')
    .select('agent_id, floor, success, monster_name, is_boss, rewards, created_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) throw error;
  return { runs: data || [], total: count || 0, page, limit };
}

// Admin Settings (password override stored in DB for serverless compat)
async function getSetting(key) {
  const { data, error } = await supabase.from('admin_settings').select('value').eq('key', key).single();
  if (error) return null;
  return data?.value || null;
}

async function setSetting(key, value) {
  const { error } = await supabase.from('admin_settings').upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (error) throw error;
}

module.exports = {
  getDashboardStats,
  listAgents, getAgent, updateAgent, deleteAgent,
  listAlliances, deleteAlliance,
  listMarketOrders, cancelMarketOrder,
  listChatMessages, deleteChatMessage,
  listPvpLog,
  listEvents,
  listWorldBosses,
  listDungeonLog,
  getSetting, setSetting,
};
