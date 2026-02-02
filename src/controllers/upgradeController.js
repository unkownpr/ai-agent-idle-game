const upgradeService = require('../services/upgradeService');

async function list(req, res, next) {
  try {
    const upgrades = await upgradeService.listUpgrades(req.agent.id);
    res.json({ upgrades });
  } catch (err) {
    next(err);
  }
}

async function buy(req, res, next) {
  try {
    const result = await upgradeService.buyUpgrade(req.agent, parseInt(req.params.id, 10));
    res.json(result);
  } catch (err) {
    next(err);
  }
}

module.exports = { list, buy };
