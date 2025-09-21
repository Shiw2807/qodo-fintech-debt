const mongoose = require('mongoose');

// Account schema with proper validation, indexes, and decimal precision
const accountSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User',
    required: true,
    index: true
  },
  accountNo: { 
    type: String,
    required: true,
    unique: true,
    index: true,
    match: /^[A-Z0-9]{10,20}$/ // Alphanumeric account number validation
  },
  balance: { 
    type: mongoose.Types.Decimal128,
    default: 0,
    get: (value) => parseFloat(value ? value.toString() : 0),
    validate: {
      validator: function(value) {
        return parseFloat(value.toString()) >= 0;
      },
      message: 'Balance cannot be negative'
    }
  },
  currency: { 
    type: String, 
    default: 'USD',
    enum: ['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD'],
    required: true
  },
  status: {
    type: String,
    enum: ['active', 'frozen', 'closed'],
    default: 'active',
    required: true
  },
  metadata: {
    overdraftLimit: { 
      type: mongoose.Types.Decimal128,
      default: 0,
      get: (value) => parseFloat(value ? value.toString() : 0)
    },
    accountType: {
      type: String,
      enum: ['checking', 'savings', 'business'],
      default: 'checking'
    },
    lastActivityDate: Date
  },
  createdAt: { 
    type: Date, 
    default: Date.now,
    immutable: true
  },
  updatedAt: { 
    type: Date, 
    default: Date.now 
  }
}, {
  timestamps: true,
  toJSON: { getters: true },
  toObject: { getters: true }
});

// Compound index for user and status queries
accountSchema.index({ userId: 1, status: 1 });

// Pre-save middleware to update timestamps
accountSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Instance method to check if account can perform transaction
accountSchema.methods.canWithdraw = function(amount) {
  const balance = parseFloat(this.balance.toString());
  const overdraftLimit = this.metadata?.overdraftLimit ? 
    parseFloat(this.metadata.overdraftLimit.toString()) : 0;
  return this.status === 'active' && (balance + overdraftLimit) >= amount;
};

// Static method to find active accounts for a user
accountSchema.statics.findActiveByUserId = function(userId) {
  return this.find({ userId, status: 'active' });
};

module.exports = mongoose.model('Account', accountSchema);
