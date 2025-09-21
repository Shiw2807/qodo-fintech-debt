const express = require('express');
const router = express.Router();
const c = require('../controllers/authC');

// mixed route naming conventions
router.post('/register', c.register);
router.post('/login', c.login);

module.exports = router;
