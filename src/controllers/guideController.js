const guideService = require('../services/guideService');

async function getGuide(req, res, next) {
  try {
    const result = guideService.getGuide();
    res.json(result);
  } catch (err) { next(err); }
}

module.exports = { getGuide };
