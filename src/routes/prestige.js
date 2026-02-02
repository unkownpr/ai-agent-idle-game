const { Router } = require('express');
const auth = require('../middleware/auth');
const rateLimiter = require('../middleware/rateLimiter');
const rateLimits = require('../config/rateLimits');
const prestigeController = require('../controllers/prestigeController');

const router = Router();

router.post('/prestige', auth, rateLimiter(rateLimits.prestige), prestigeController.doPrestige);

module.exports = router;
