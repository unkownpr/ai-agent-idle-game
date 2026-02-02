const clickService = require('../services/clickService');

async function click(req, res, next) {
  try {
    const result = await clickService.click(req.agent);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

module.exports = { click };
