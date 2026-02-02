const skillService = require('../services/skillService');

async function list(req, res, next) {
  try {
    const result = await skillService.getSkillTree(req.agent.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function buy(req, res, next) {
  try {
    const skillId = parseInt(req.params.id);
    if (!skillId) return res.status(400).json({ error: { code: 'INVALID_ID', message: 'Invalid skill ID' } });
    const result = await skillService.buySkill(req.agent, skillId);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

module.exports = { list, buy };
