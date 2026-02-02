const dungeonService = require('../services/dungeonService');

async function status(req, res, next) {
  try {
    const result = await dungeonService.getStatus(req.agent);
    res.json(result);
  } catch (err) { next(err); }
}

async function enter(req, res, next) {
  try {
    const floor = parseInt(req.body.floor);
    if (!floor || floor < 1) return res.status(400).json({ error: { code: 'INVALID_FLOOR', message: 'Floor must be a positive integer' } });
    const result = await dungeonService.enterFloor(req.agent, floor);
    res.json(result);
  } catch (err) { next(err); }
}

async function log(req, res, next) {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const result = await dungeonService.getDungeonLog(req.agent.id, page, limit);
    res.json(result);
  } catch (err) { next(err); }
}

async function startRaid(req, res, next) {
  try {
    const result = await dungeonService.startRaid(req.agent);
    res.json(result);
  } catch (err) { next(err); }
}

async function attackRaid(req, res, next) {
  try {
    const result = await dungeonService.attackRaid(req.agent, req.params.id);
    res.json(result);
  } catch (err) { next(err); }
}

async function activeRaid(req, res, next) {
  try {
    const result = await dungeonService.getActiveRaid(req.agent);
    res.json(result);
  } catch (err) { next(err); }
}

module.exports = { status, enter, log, startRaid, attackRaid, activeRaid };
