const mongoose = require('mongoose');

// Transaction schema missing indexes and validation, stores raw payloads
const txSchema = new mongoose.Schema({
  from: { type: mongoose.Schema.Types.ObjectId, ref: 'Account' },
  to: { type: mongoose.Schema.Types.ObjectId, ref: 'Account' },
  amt: Number,
  type: { type: String, default: 'transfer' },
  status: { type: String, default: 'ok' },
  meta: Object,
  created: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Transaction', txSchema);
