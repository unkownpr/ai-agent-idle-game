const { Router } = require('express');
const auth = require('../middleware/auth');
const controller = require('../controllers/pvpController');

const router = Router();

router.post('/pvp/attack/:targetId', auth, controller.attack);
router.get('/pvp/targets', auth, controller.targets);
router.get('/pvp/log', auth, controller.log);

module.exports = router;
