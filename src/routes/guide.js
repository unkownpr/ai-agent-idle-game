const { Router } = require('express');
const guideController = require('../controllers/guideController');

const router = Router();

router.get('/guide', guideController.getGuide);

module.exports = router;
