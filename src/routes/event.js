const { Router } = require('express');
const Joi = require('joi');
const auth = require('../middleware/auth');
const validate = require('../middleware/validate');
const rateLimiter = require('../middleware/rateLimiter');
const rateLimits = require('../config/rateLimits');
const controller = require('../controllers/eventController');

const router = Router();

router.get('/events/active', auth, controller.active);

router.post(
  '/events/:id/respond',
  auth,
  rateLimiter({ windowMs: rateLimits.event.windowMs, maxRequests: rateLimits.event.maxRequests }),
  validate(Joi.object({ choice: Joi.string().required() })),
  controller.respond
);

module.exports = router;
