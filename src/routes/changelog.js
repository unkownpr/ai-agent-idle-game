const { Router } = require('express');
const changelogController = require('../controllers/changelogController');

const router = Router();

router.get('/changelog', changelogController.list);

module.exports = router;
