const balance = require('../config/gameBalance');

const BOSS_NAMES = [
  'Chronos, the Time Eater',
  'Nexus Prime',
  'The Void Architect',
  'Omega Protocol',
  'Entropy Colossus',
  'Neural Leviathan',
  'Quantum Hydra',
  'The Singularity',
];

function generateBoss(activePlayerCount) {
  const hp = Math.floor(balance.WORLD_BOSS_BASE_HP * (1 + activePlayerCount * balance.WORLD_BOSS_PLAYER_SCALING));
  const name = BOSS_NAMES[Math.floor(Math.random() * BOSS_NAMES.length)];

  return {
    name,
    max_hp: hp,
    current_hp: hp,
    status: 'active',
    spawned_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + balance.WORLD_BOSS_DURATION_MS).toISOString(),
  };
}

function calculateAttack(agent) {
  const baseDamage = parseFloat(agent.attack_power) + parseFloat(agent.click_power) * 0.5;
  const prestigeMult = parseFloat(agent.prestige_multiplier) || 1;
  const randomFactor = 0.8 + Math.random() * 0.4; // 0.8 to 1.2
  return Math.floor(baseDamage * prestigeMult * randomFactor);
}

function calculateRewards(totalDamage, agentDamage, isTopDamage) {
  const damageShare = totalDamage > 0 ? agentDamage / totalDamage : 0;
  const multiplier = isTopDamage ? balance.WORLD_BOSS_TOP_DAMAGE_MULTIPLIER : 1;

  return {
    gold: Math.floor(balance.WORLD_BOSS_BASE_GOLD * damageShare * multiplier),
    gems: Math.max(1, Math.floor(balance.WORLD_BOSS_BASE_GEMS * damageShare * multiplier)),
  };
}

module.exports = { generateBoss, calculateAttack, calculateRewards, BOSS_NAMES };
