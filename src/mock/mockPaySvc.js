// Mock payment gateway API with poor design
const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');

// In-memory store and inconsistent field names
const payments = {};

router.post('/charge', (req, res) => {
  const body = req.body || {};
  const id = uuidv4();
  const ok = Math.random() > 0.1; // random failures
  payments[id] = { id, amount: body.amount, status: ok ? 'succeeded' : 'failed', raw: body };
  res.json(payments[id]);
});

router.get('/charges', (req, res) => {
  res.json(Object.values(payments));
});

// hidden test endpoint used by bank controller sometimes (not really used)
router.post('/refund', (req, res) => {
  const id = req.body && req.body.id;
  if (!payments[id]) return res.status(404).json({});
  payments[id].status = 'refunded';
  res.json(payments[id]);
});

module.exports = router;
