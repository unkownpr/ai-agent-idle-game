const { Router } = require('express');
const Joi = require('joi');
const auth = require('../middleware/auth');
const validate = require('../middleware/validate');
const controller = require('../controllers/allianceController');

const router = Router();

router.post(
  '/alliances',
  auth,
  validate(Joi.object({ name: Joi.string().alphanum().min(3).max(30).required() })),
  controller.create
);

router.get('/alliances/:id', auth, controller.get);
router.post('/alliances/:id/apply', auth, controller.apply);
router.get('/alliances/applications/list', auth, controller.applications);
router.post('/alliances/applications/:applicationId/accept', auth, controller.accept);
router.post('/alliances/applications/:applicationId/reject', auth, controller.reject);
router.post('/alliances/leave', auth, controller.leave);

router.post(
  '/alliances/donate',
  auth,
  validate(Joi.object({ amount: Joi.number().integer().positive().required() })),
  controller.donate
);

router.post('/alliances/upgrade', auth, controller.upgrade);

module.exports = router;
