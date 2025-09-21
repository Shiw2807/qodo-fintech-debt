const express = require('express');
const router = express.Router();
const admin = require('../controllers/admin');

router.get('/users', admin.listUsers);
router.get('/everything', admin.listEverything);

module.exports = router;
