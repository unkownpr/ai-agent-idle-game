const eventService = require('../services/eventService');

async function active(req, res, next) {
  try {
    const events = await eventService.getActiveEvents();
    res.json({ events });
  } catch (err) { next(err); }
}

async function respond(req, res, next) {
  try {
    const result = await eventService.respondToEvent(req.agent, req.params.id, req.body.choice);
    res.json(result);
  } catch (err) { next(err); }
}

module.exports = { active, respond };
