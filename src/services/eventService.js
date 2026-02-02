const supabase = require('../config/supabase');
const { rollEvent, processChoice } = require('../engine/eventGenerator');
const { AppError, NotFoundError, ConflictError, InsufficientFundsError } = require('../utils/errors');

// Track last event check time in-memory
let lastEventCheck = 0;
const balance = require('../config/gameBalance');

async function getActiveEvents() {
  // Attempt to spawn new event if check interval passed
  await maybeSpawnEvent();

  const { data, error } = await supabase
    .from('events')
    .select('*')
    .gt('ends_at', new Date().toISOString())
    .order('starts_at', { ascending: false });

  if (error) throw new AppError(error.message, 500, 'DB_ERROR');
  return data || [];
}

async function maybeSpawnEvent() {
  const now = Date.now();
  if (now - lastEventCheck < balance.EVENT_CHECK_INTERVAL_MS) return;
  lastEventCheck = now;

  const event = rollEvent();
  if (!event) return;

  await supabase.from('events').insert(event);
}

async function respondToEvent(agent, eventId, choiceId) {
  const { data: event, error } = await supabase
    .from('events')
    .select('*')
    .eq('id', eventId)
    .gt('ends_at', new Date().toISOString())
    .single();

  if (error || !event) throw new NotFoundError('Event not found or expired');
  if (!event.requires_response) {
    throw new AppError('This event does not require a response', 400, 'NO_RESPONSE_NEEDED');
  }

  const choice = processChoice(event, choiceId);
  if (!choice) throw new AppError('Invalid choice', 400, 'INVALID_CHOICE');

  // Check costs
  if (choice.cost?.gold && parseFloat(agent.gold) < choice.cost.gold) {
    throw new InsufficientFundsError(`Need ${choice.cost.gold} gold`);
  }
  if (choice.cost?.gems && parseFloat(agent.gems) < choice.cost.gems) {
    throw new InsufficientFundsError(`Need ${choice.cost.gems} gems`);
  }

  // Insert response first (unique constraint prevents duplicates)
  const { error: insertError } = await supabase.from('event_responses').insert({
    event_id: eventId,
    agent_id: agent.id,
    choice: choiceId,
    reward: choice.reward || {},
  });

  if (insertError) {
    if (insertError.code === '23505') {
      throw new ConflictError('Already responded to this event');
    }
    throw new AppError(insertError.message, 500, 'DB_ERROR');
  }

  // Apply cost/reward after successful insert
  const updates = {};
  if (choice.cost?.gold) updates.gold = parseFloat(agent.gold) - choice.cost.gold;
  if (choice.cost?.gems) updates.gems = parseFloat(agent.gems) - choice.cost.gems;
  if (choice.reward?.gold) updates.gold = (updates.gold ?? parseFloat(agent.gold)) + choice.reward.gold;
  if (choice.reward?.gems) updates.gems = (updates.gems ?? parseFloat(agent.gems)) + choice.reward.gems;

  if (Object.keys(updates).length > 0) {
    await supabase.from('agents').update(updates).eq('id', agent.id);
  }

  return { choice: choiceId, reward: choice.reward, cost: choice.cost };
}

module.exports = { getActiveEvents, respondToEvent };
