const { getChangelog } = require('../services/changelogService');

async function list(req, res) {
  const changelog = getChangelog();
  res.json({ changelog });
}

module.exports = { list };
