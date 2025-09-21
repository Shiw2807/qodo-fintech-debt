const mongoose = require('mongoose');

// No indexes, balances as Number without precision control
const accountSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  accountNo: String, // no unique constraint
  balance: { type: Number, default: 0 },
  currency: { type: String, default: 'USD' },
  flags: { type: Object, default: {} }, // free-form flags
});

module.exports = mongoose.model('Account', accountSchema);
