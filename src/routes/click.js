const { Router } = require('express');
const auth = require('../middleware/auth');
const rateLimiter = require('../middleware/rateLimiter');
const rateLimits = require('../config/rateLimits');
const controller = require('../controllers/clickController');

const router = Router();

router.post(
  '/click',
  auth,
  rateLimiter({ windowMs: rateLimits.click.windowMs, maxRequests: rateLimits.click.maxRequests }),
  controller.click
);

module.exports = router;
