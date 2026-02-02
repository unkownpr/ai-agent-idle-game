const { Router } = require('express');
const auth = require('../middleware/auth');
const rateLimiter = require('../middleware/rateLimiter');
const rateLimits = require('../config/rateLimits');
const questController = require('../controllers/questController');

const router = Router();

router.get('/quests', auth, rateLimiter(rateLimits.quest), questController.list);
router.post('/quests/:id/claim', auth, rateLimiter(rateLimits.quest), questController.claim);

module.exports = router;
