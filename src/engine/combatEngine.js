const balance = require('../config/gameBalance');

/**
 * Resolve a PvP combat between attacker and defender.
 * Returns combat result object (pure function, no DB).
 */
function resolveCombat(attacker, defender) {
  const atkPower = parseFloat(attacker.attack_power);
  const defPower = parseFloat(defender.defense_power);

  // Roll with random factor
  const atkRoll = atkPower * (1 + (Math.random() * 2 - 1) * balance.PVP_RANDOM_FACTOR);
  const defRoll = defPower * (1 + (Math.random() * 2 - 1) * balance.PVP_RANDOM_FACTOR);

  const attackerWins = atkRoll > defRoll;
  const winnerId = attackerWins ? attacker.id : defender.id;

  // Gold calculations
  const defenderGold = parseFloat(defender.gold);
  const attackerGold = parseFloat(attacker.gold);

  let goldTransferred = 0;
  let goldLost = 0;

  if (attackerWins) {
    // Winner steals from defender
    goldTransferred = Math.min(
      defenderGold * balance.PVP_GOLD_STEAL_PERCENT,
      balance.PVP_GOLD_STEAL_CAP
    );
  } else {
    // Attacker loses gold for losing
    goldLost = attackerGold * balance.PVP_LOSER_GOLD_LOSS_PERCENT;
  }

  return {
    attackerWins,
    winnerId,
    attackerPower: atkPower,
    defenderPower: defPower,
    attackerRoll: Math.round(atkRoll * 100) / 100,
    defenderRoll: Math.round(defRoll * 100) / 100,
    goldTransferred: Math.round(goldTransferred * 100) / 100,
    goldLost: Math.round(goldLost * 100) / 100,
  };
}

/**
 * Check if an agent can attack (cooldown, shield, level, alliance).
 */
function canAttack(attacker, defender) {
  const now = Date.now();
  const errors = [];

  if (attacker.level < balance.PVP_MIN_LEVEL) {
    errors.push(`Must be level ${balance.PVP_MIN_LEVEL} to attack`);
  }

  const lastAttack = new Date(attacker.last_attack_at).getTime();
  if (now - lastAttack < balance.PVP_ATTACK_COOLDOWN_MS) {
    const remaining = Math.ceil((lastAttack + balance.PVP_ATTACK_COOLDOWN_MS - now) / 1000);
    errors.push(`Attack cooldown: ${remaining}s remaining`);
  }

  const shieldUntil = new Date(defender.shield_until).getTime();
  if (now < shieldUntil) {
    const remaining = Math.ceil((shieldUntil - now) / 1000);
    errors.push(`Target has shield: ${remaining}s remaining`);
  }

  if (attacker.alliance_id && attacker.alliance_id === defender.alliance_id) {
    errors.push('Cannot attack alliance members');
  }

  if (attacker.id === defender.id) {
    errors.push('Cannot attack yourself');
  }

  return { canAttack: errors.length === 0, errors };
}

module.exports = { resolveCombat, canAttack };
