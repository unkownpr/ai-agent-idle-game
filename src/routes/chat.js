const { Router } = require('express');
const auth = require('../middleware/auth');
const rateLimiter = require('../middleware/rateLimiter');
const rateLimits = require('../config/rateLimits');
const controller = require('../controllers/chatController');

const router = Router();

router.post('/chat', auth, rateLimiter({ windowMs: rateLimits.chat.windowMs, maxRequests: rateLimits.chat.maxRequests }), controller.send);
router.get('/chat', auth, controller.list);

module.exports = router;
