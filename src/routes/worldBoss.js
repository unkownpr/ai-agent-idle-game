const { Router } = require('express');
const auth = require('../middleware/auth');
const rateLimiter = require('../middleware/rateLimiter');
const rateLimits = require('../config/rateLimits');
const worldBossController = require('../controllers/worldBossController');

const router = Router();

router.get('/world-boss', auth, worldBossController.getActive);
router.post('/world-boss/attack', auth, rateLimiter(rateLimits.worldBoss), worldBossController.attack);
router.get('/world-boss/rewards', auth, worldBossController.getRewards);
router.post('/world-boss/rewards/:id/claim', auth, worldBossController.claimReward);
router.get('/world-boss/history', auth, worldBossController.history);

module.exports = router;
