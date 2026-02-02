const balance = require('../config/gameBalance');

const EVENT_TYPES = [
  {
    type: 'gold_rush',
    title: 'Gold Rush',
    description: 'A gold vein has been discovered! All idle rates doubled for 15 minutes.',
    effect: { idle_multiplier: 2.0 },
    requires_response: false,
  },
  {
    type: 'industrial_revolution',
    title: 'Industrial Revolution',
    description: 'New technology! Click power +50% for 15 minutes.',
    effect: { click_multiplier: 1.5 },
    requires_response: false,
  },
  {
    type: 'plague',
    title: 'Plague',
    description: 'A mysterious plague! Idle rates halved for 15 minutes.',
    effect: { idle_multiplier: 0.5 },
    requires_response: false,
  },
  {
    type: 'merchant',
    title: 'Wandering Merchant',
    description: 'A merchant offers a deal. Choose wisely!',
    effect: {},
    requires_response: true,
    choices: [
      { id: 'buy', label: 'Buy rare goods (-500 gold, +50 gems)', cost: { gold: 500 }, reward: { gems: 50 } },
      { id: 'sell', label: 'Sell resources (+1000 gold)', cost: {}, reward: { gold: 1000 } },
      { id: 'ignore', label: 'Ignore the merchant', cost: {}, reward: {} },
    ],
  },
  {
    type: 'war_drums',
    title: 'War Drums',
    description: 'Battle fever! Attack power +30% for 15 minutes.',
    effect: { attack_multiplier: 1.3 },
    requires_response: false,
  },
  {
    type: 'market_crash',
    title: 'Market Crash',
    description: 'The market is in turmoil! All market fees reduced to 0% for 15 minutes.',
    effect: { market_fee_override: 0 },
    requires_response: false,
  },
  {
    type: 'peace_treaty',
    title: 'Peace Treaty',
    description: 'A ceasefire has been declared. No PvP attacks for 15 minutes.',
    effect: { pvp_disabled: true },
    requires_response: false,
  },
];

/**
 * Roll for a new event. Returns event data or null.
 */
function rollEvent() {
  if (Math.random() > balance.EVENT_SPAWN_CHANCE) {
    return null;
  }

  const template = EVENT_TYPES[Math.floor(Math.random() * EVENT_TYPES.length)];
  const now = new Date();
  const endsAt = new Date(now.getTime() + balance.EVENT_DURATION_MS);

  return {
    type: template.type,
    title: template.title,
    description: template.description,
    effect: template.effect,
    requires_response: template.requires_response,
    choices: template.choices || [],
    starts_at: now.toISOString(),
    ends_at: endsAt.toISOString(),
  };
}

/**
 * Process a choice for a response-requiring event.
 */
function processChoice(eventData, choiceId) {
  if (!eventData.choices || !Array.isArray(eventData.choices)) {
    return null;
  }
  return eventData.choices.find((c) => c.id === choiceId) || null;
}

module.exports = { rollEvent, processChoice, EVENT_TYPES };
