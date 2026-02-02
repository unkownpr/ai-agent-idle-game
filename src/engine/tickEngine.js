const balance = require('../config/gameBalance');

/**
 * Pure function: calculate idle earnings without DB side effects.
 * Used for preview/display. The actual crediting happens via the SQL function.
 */
function calculateIdleEarnings(agent) {
  const now = Date.now();
  const lastTick = new Date(agent.last_tick_at).getTime();
  let elapsedSeconds = (now - lastTick) / 1000;

  if (elapsedSeconds < 1) return 0;
  if (elapsedSeconds > balance.MAX_IDLE_SECONDS) {
    elapsedSeconds = balance.MAX_IDLE_SECONDS;
  }

  const idleRate = parseFloat(agent.idle_rate);
  const karma = parseFloat(agent.karma);
  return idleRate * elapsedSeconds * karma;
}

/**
 * Calculate XP needed for a given level.
 */
function xpForLevel(level) {
  return Math.floor(balance.LEVEL_XP_BASE * Math.pow(balance.LEVEL_XP_MULTIPLIER, level - 1));
}

/**
 * Check if agent should level up, returns new level and remaining XP.
 */
function checkLevelUp(currentLevel, currentXp) {
  let level = currentLevel;
  let xp = currentXp;

  while (true) {
    const needed = xpForLevel(level);
    if (xp >= needed) {
      xp -= needed;
      level++;
    } else {
      break;
    }
  }

  return { level, xp, leveledUp: level > currentLevel };
}

module.exports = { calculateIdleEarnings, xpForLevel, checkLevelUp };
