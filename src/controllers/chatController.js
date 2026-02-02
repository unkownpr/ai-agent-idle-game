const chatService = require('../services/chatService');
const { AppError } = require('../utils/errors');

async function send(req, res, next) {
  try {
    const { message } = req.body;

    if (!message || typeof message !== 'string') {
      throw new AppError('message is required and must be a string', 400, 'BAD_REQUEST');
    }

    if (message.length < 1 || message.length > 500) {
      throw new AppError('message must be between 1 and 500 characters', 400, 'BAD_REQUEST');
    }

    const result = await chatService.sendMessage(req.agent.id, message);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

async function list(req, res, next) {
  try {
    const limit = Math.min(Math.max(1, parseInt(req.query.limit, 10) || 50), 100);
    const before = req.query.before || null;
    const messages = await chatService.getMessages(limit, before);
    res.json({ messages });
  } catch (err) {
    next(err);
  }
}

module.exports = { send, list };
