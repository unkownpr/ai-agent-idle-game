const { Router } = require('express');
const Joi = require('joi');
const auth = require('../middleware/auth');
const validate = require('../middleware/validate');
const controller = require('../controllers/eventController');

const router = Router();

router.get('/events/active', auth, controller.active);

router.post(
  '/events/:id/respond',
  auth,
  validate(Joi.object({ choice: Joi.string().required() })),
  controller.respond
);

module.exports = router;
