const prestigeService = require('../services/prestigeService');

async function doPrestige(req, res, next) {
  try {
    const result = await prestigeService.prestige(req.agent);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

module.exports = { doPrestige };
