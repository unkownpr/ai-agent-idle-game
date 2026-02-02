const { Router } = require('express');
const auth = require('../middleware/auth');
const rateLimiter = require('../middleware/rateLimiter');
const rateLimits = require('../config/rateLimits');
const dungeonController = require('../controllers/dungeonController');

const router = Router();

router.get('/dungeon/status', auth, dungeonController.status);
router.post('/dungeon/enter', auth, rateLimiter(rateLimits.dungeon), dungeonController.enter);
router.get('/dungeon/log', auth, dungeonController.log);
router.post('/dungeon/raid/start', auth, dungeonController.startRaid);
router.post('/dungeon/raid/:id/attack', auth, rateLimiter(rateLimits.dungeon), dungeonController.attackRaid);
router.get('/dungeon/raid/active', auth, dungeonController.activeRaid);

module.exports = router;
