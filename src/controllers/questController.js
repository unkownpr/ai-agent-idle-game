const questService = require('../services/questService');

async function list(req, res, next) {
  try {
    const result = await questService.getDailyQuests(req.agent.id);
    res.json(result);
  } catch (err) { next(err); }
}

async function claim(req, res, next) {
  try {
    const result = await questService.claimReward(req.agent.id, req.params.id);
    res.json(result);
  } catch (err) { next(err); }
}

module.exports = { list, claim };
