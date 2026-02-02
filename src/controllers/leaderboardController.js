const leaderboardService = require('../services/leaderboardService');

async function get(req, res, next) {
  try {
    const { sortBy, page, limit } = req.query;
    const result = await leaderboardService.getLeaderboard({
      sortBy,
      page: parseInt(page, 10) || 1,
      limit: parseInt(limit, 10) || 20,
    });
    res.json(result);
  } catch (err) { next(err); }
}

module.exports = { get };
