const { Router } = require('express');
const auth = require('../middleware/auth');
const controller = require('../controllers/leaderboardController');

const router = Router();

router.get('/leaderboard', auth, controller.get);

module.exports = router;
