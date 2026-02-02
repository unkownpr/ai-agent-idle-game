const { Router } = require('express');
const auth = require('../middleware/auth');
const rateLimiter = require('../middleware/rateLimiter');
const rateLimits = require('../config/rateLimits');
const controller = require('../controllers/upgradeController');

const router = Router();

router.get('/upgrades', auth, controller.list);
router.post('/upgrades/:id/buy', auth, rateLimiter({ windowMs: rateLimits.upgrade.windowMs, maxRequests: rateLimits.upgrade.maxRequests }), controller.buy);

module.exports = router;
