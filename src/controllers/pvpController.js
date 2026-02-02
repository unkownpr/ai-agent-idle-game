const pvpService = require('../services/pvpService');

async function attack(req, res, next) {
  try {
    const result = await pvpService.attack(req.agent, req.params.targetId);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function targets(req, res, next) {
  try {
    const data = await pvpService.getTargets(req.agent);
    res.json({ targets: data });
  } catch (err) {
    next(err);
  }
}

async function log(req, res, next) {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const result = await pvpService.getPvpLog(req.agent.id, page, limit);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

module.exports = { attack, targets, log };
