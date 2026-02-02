const { Router } = require('express');
const auth = require('../middleware/auth');
const rateLimiter = require('../middleware/rateLimiter');
const rateLimits = require('../config/rateLimits');
const skillController = require('../controllers/skillController');

const router = Router();

router.get('/skills', auth, skillController.list);
router.post('/skills/:id/buy', auth, rateLimiter(rateLimits.skill), skillController.buy);

module.exports = router;
