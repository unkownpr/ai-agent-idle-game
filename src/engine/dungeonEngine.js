const balance = require('../config/gameBalance');

function generateMonster(floor) {
  const isBoss = floor % balance.DUNGEON_BOSS_INTERVAL === 0;
  const baseHp = balance.DUNGEON_BASE_HP * floor * (1 + floor * balance.DUNGEON_HP_SCALING);
  const hp = isBoss ? baseHp * balance.DUNGEON_BOSS_HP_MULT : baseHp;
  const attack = Math.floor(5 + floor * 3 * (isBoss ? 2 : 1));
  const defense = Math.floor(3 + floor * 2 * (isBoss ? 2 : 1));

  const names = isBoss
    ? ['Dragon Lord', 'Shadow King', 'Void Titan', 'Chaos Overlord', 'Ancient Wyrm']
    : ['Goblin', 'Skeleton', 'Dark Slime', 'Corrupted Bot', 'Phantom', 'Cave Troll', 'Shadow Imp', 'Iron Golem'];

  return {
    name: names[Math.floor(Math.random() * names.length)],
    hp: Math.floor(hp),
    attack,
    defense,
    isBoss,
    floor,
  };
}

function calculateCombat(agent, monster, skillEffects = {}) {
  const agentAttack = parseFloat(agent.attack_power) * (1 + (skillEffects.dungeon_damage || 0));
  const agentDefense = parseFloat(agent.defense_power);
  const prestigeMult = parseFloat(agent.prestige_multiplier) || 1;

  // Combat: agent deals damage based on attack vs monster defense
  const agentDamage = Math.max(1, agentAttack * prestigeMult - monster.defense * 0.3);
  const monsterDamage = Math.max(1, monster.attack - agentDefense * 0.3);

  // Rounds to kill each other
  const roundsToKillMonster = Math.ceil(monster.hp / agentDamage);
  const agentEffectiveHp = agentDefense * 10 + parseFloat(agent.level) * 5;
  const roundsToKillAgent = Math.ceil(agentEffectiveHp / monsterDamage);

  const success = roundsToKillMonster <= roundsToKillAgent;

  return {
    success,
    agentDamage: Math.floor(agentDamage),
    monsterDamage: Math.floor(monsterDamage),
    rounds: Math.min(roundsToKillMonster, roundsToKillAgent),
    monsterHp: monster.hp,
  };
}

function calculateRewards(floor, isBoss, success, skillEffects = {}) {
  if (!success) {
    return { gold: 0, xp: Math.floor(floor * 2), gems: 0 };
  }

  const lootBonus = 1 + (skillEffects.dungeon_loot_bonus || 0);
  const gold = Math.floor((50 + floor * 20) * (isBoss ? 5 : 1) * lootBonus);
  const xp = Math.floor((5 + floor * 2) * (isBoss ? 3 : 1));

  // Gem drops
  let gems = 0;
  const bossRewardBonus = 1 + (skillEffects.boss_reward_bonus || 0);
  if (isBoss) {
    gems = Math.ceil(floor / 5) * bossRewardBonus;
  } else {
    const gemChance = balance.DUNGEON_GEM_BASE_CHANCE + Math.floor(floor / 10) * balance.DUNGEON_GEM_CHANCE_PER_10;
    const gemFindBonus = skillEffects.gem_find_bonus || 0;
    if (Math.random() < gemChance + gemFindBonus) {
      gems = Math.ceil(floor / 10);
    }
  }

  return {
    gold: Math.floor(gold),
    xp,
    gems: Math.floor(gems),
  };
}

function calculateEnergyCost(floor) {
  return balance.DUNGEON_BASE_ENERGY_COST + Math.floor(floor / 10);
}

module.exports = { generateMonster, calculateCombat, calculateRewards, calculateEnergyCost };
