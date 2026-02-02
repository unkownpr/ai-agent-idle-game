const { Router } = require('express');
const Joi = require('joi');
const validate = require('../middleware/validate');
const auth = require('../middleware/auth');
const controller = require('../controllers/authController');

const router = Router();

router.post(
  '/register',
  validate(Joi.object({
    name: Joi.string().alphanum().min(3).max(30).required(),
  })),
  controller.register
);

router.post(
  '/verify-moltbook',
  auth,
  validate(Joi.object({
    moltbookToken: Joi.string().required(),
  })),
  controller.verifyMoltbook
);

router.get('/me', auth, controller.getMe);

module.exports = router;
