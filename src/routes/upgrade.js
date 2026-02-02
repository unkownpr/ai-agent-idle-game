const { Router } = require('express');
const auth = require('../middleware/auth');
const controller = require('../controllers/upgradeController');

const router = Router();

router.get('/upgrades', auth, controller.list);
router.post('/upgrades/:id/buy', auth, controller.buy);

module.exports = router;
