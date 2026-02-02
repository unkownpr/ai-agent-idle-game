const supabase = require('../config/supabase');
const { AppError, NotFoundError, TooManyRequestsError } = require('../utils/errors');

async function sendMessage(agentId, message) {
  // Look up agent name
  const { data: agent, error: agentError } = await supabase
    .from('agents')
    .select('id, name')
    .eq('id', agentId)
    .single();

  if (agentError || !agent) throw new NotFoundError('Agent not found');

  // Rate limit: max 1 message per 3 seconds (check last message time from DB)
  const { data: lastMsg } = await supabase
    .from('chat_messages')
    .select('created_at')
    .eq('agent_id', agentId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (lastMsg) {
    const elapsed = Date.now() - new Date(lastMsg.created_at).getTime();
    if (elapsed < 3000) {
      throw new TooManyRequestsError('You can only send one message every 3 seconds');
    }
  }

  // Insert message
  const { data: chatMsg, error } = await supabase
    .from('chat_messages')
    .insert({
      agent_id: agentId,
      agent_name: agent.name,
      message,
    })
    .select('id, agent_id, agent_name, message, created_at')
    .single();

  if (error) throw new AppError(error.message, 500, 'DB_ERROR');

  return chatMsg;
}

async function getMessages(limit = 50, before = null) {
  let query = supabase
    .from('chat_messages')
    .select('id, agent_id, agent_name, message, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (before) {
    query = query.lt('created_at', before);
  }

  const { data, error } = await query;
  if (error) throw new AppError(error.message, 500, 'DB_ERROR');

  return data || [];
}

module.exports = { sendMessage, getMessages };
