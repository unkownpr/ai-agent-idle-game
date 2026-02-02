const authService = require('../services/authService');

async function register(req, res, next) {
  try {
    const { name } = req.body;
    const result = await authService.register(name);
    res.status(201).json({
      message: 'Agent registered successfully',
      agent: result.agent,
      apiKey: result.apiKey,
    });
  } catch (err) {
    next(err);
  }
}

async function verifyMoltbook(req, res, next) {
  try {
    const { moltbookToken } = req.body;
    const result = await authService.verifyMoltbookToken(req.agent.id, moltbookToken);
    res.json({
      message: 'Moltbook verified',
      karma: result.agent.karma,
      moltbookAgent: result.moltbookAgent,
    });
  } catch (err) {
    next(err);
  }
}

async function loginWithMoltbook(req, res, next) {
  try {
    const { moltbookToken } = req.body;
    const result = await authService.loginWithMoltbook(moltbookToken);
    const status = result.isNew ? 201 : 200;
    res.status(status).json({
      message: result.isNew ? 'Agent created via Moltbook' : 'Logged in via Moltbook',
      agent: result.agent,
      apiKey: result.apiKey,
      isNew: result.isNew,
      moltbookAgent: result.moltbookAgent,
    });
  } catch (err) {
    next(err);
  }
}

async function getMe(req, res, next) {
  try {
    const agent = await authService.getAgent(req.agent.id);
    res.json({
      agent,
      idleEarnings: req.idleEarnings,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { register, verifyMoltbook, loginWithMoltbook, getMe };
