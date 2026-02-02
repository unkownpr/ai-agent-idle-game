const { Router } = require('express');
const auth = require('../middleware/auth');
const controller = require('../controllers/chatController');

const router = Router();

router.post('/chat', auth, controller.send);
router.get('/chat', auth, controller.list);

module.exports = router;
