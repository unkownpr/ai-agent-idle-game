const worldBossService = require('../services/worldBossService');

async function getActive(req, res, next) {
  try {
    const result = await worldBossService.getActiveBoss();
    res.json(result);
  } catch (err) { next(err); }
}

async function attack(req, res, next) {
  try {
    const result = await worldBossService.attackBoss(req.agent);
    res.json(result);
  } catch (err) { next(err); }
}

async function getRewards(req, res, next) {
  try {
    const result = await worldBossService.getRewards(req.agent.id);
    res.json(result);
  } catch (err) { next(err); }
}

async function claimReward(req, res, next) {
  try {
    const result = await worldBossService.claimReward(req.agent.id, req.params.id);
    res.json(result);
  } catch (err) { next(err); }
}

async function history(req, res, next) {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 10, 50);
    const result = await worldBossService.getHistory(page, limit);
    res.json(result);
  } catch (err) { next(err); }
}

module.exports = { getActive, attack, getRewards, claimReward, history };
