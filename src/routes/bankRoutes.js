const express = require('express');
const router = express.Router();
const bank = require('../controllers/bank_controller');

router.get('/balance', bank.mebal);
router.post('/transfer', bank.xfers);
router.get('/tx/mine', bank.mytx);
router.get('/tx/all', bank.alltx); // duplicate access under bank instead of admin only

module.exports = router;
