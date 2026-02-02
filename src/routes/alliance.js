const { Router } = require('express');
const Joi = require('joi');
const auth = require('../middleware/auth');
const validate = require('../middleware/validate');
const rateLimiter = require('../middleware/rateLimiter');
const rateLimits = require('../config/rateLimits');
const controller = require('../controllers/allianceController');

const router = Router();
const allianceRL = rateLimiter({ windowMs: rateLimits.alliance.windowMs, maxRequests: rateLimits.alliance.maxRequests });

router.post(
  '/alliances',
  auth,
  allianceRL,
  validate(Joi.object({ name: Joi.string().alphanum().min(3).max(30).required() })),
  controller.create
);

router.get('/alliances/:id', auth, controller.get);
router.post('/alliances/:id/apply', auth, allianceRL, controller.apply);
router.get('/alliances/applications/list', auth, controller.applications);
router.post('/alliances/applications/:applicationId/accept', auth, allianceRL, controller.accept);
router.post('/alliances/applications/:applicationId/reject', auth, allianceRL, controller.reject);
router.post('/alliances/leave', auth, allianceRL, controller.leave);

router.post(
  '/alliances/donate',
  auth,
  allianceRL,
  validate(Joi.object({ amount: Joi.number().integer().positive().required() })),
  controller.donate
);

router.post('/alliances/upgrade', auth, allianceRL, controller.upgrade);

module.exports = router;
