const mongoose = require('mongoose');

// Transaction schema with proper validation, indexes, and audit trail
const transactionSchema = new mongoose.Schema({
  fromAccount: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Account',
    required: function() {
      return this.type !== 'deposit';
    },
    index: true
  },
  toAccount: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Account',
    required: function() {
      return this.type !== 'withdrawal';
    },
    index: true
  },
  amount: {
    type: mongoose.Types.Decimal128,
    required: true,
    get: (value) => parseFloat(value ? value.toString() : 0),
    validate: {
      validator: function(value) {
        return parseFloat(value.toString()) > 0;
      },
      message: 'Transaction amount must be positive'
    }
  },
  currency: {
    type: String,
    required: true,
    enum: ['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD']
  },
  type: { 
    type: String,
    required: true,
    enum: ['transfer', 'deposit', 'withdrawal', 'payment', 'refund'],
    index: true
  },
  status: { 
    type: String,
    required: true,
    enum: ['pending', 'processing', 'completed', 'failed', 'cancelled', 'reversed'],
    default: 'pending',
    index: true
  },
  reference: {
    type: String,
    unique: true,
    sparse: true,
    index: true
  },
  description: {
    type: String,
    maxlength: 500
  },
  metadata: {
    paymentMethod: {
      type: String,
      enum: ['bank_transfer', 'card', 'cash', 'check', 'wire']
    },
    externalReference: String,
    reversalOf: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Transaction'
    },
    fees: {
      type: mongoose.Types.Decimal128,
      default: 0,
      get: (value) => parseFloat(value ? value.toString() : 0)
    },
    exchangeRate: {
      type: mongoose.Types.Decimal128,
      get: (value) => parseFloat(value ? value.toString() : 0)
    },
    ipAddress: String,
    userAgent: String
  },
  failureReason: {
    type: String,
    maxlength: 1000
  },
  processedAt: Date,
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  createdAt: { 
    type: Date, 
    default: Date.now,
    immutable: true,
    index: true
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

// Compound indexes for common queries
transactionSchema.index({ fromAccount: 1, createdAt: -1 });
transactionSchema.index({ toAccount: 1, createdAt: -1 });
transactionSchema.index({ status: 1, type: 1, createdAt: -1 });
transactionSchema.index({ createdBy: 1, createdAt: -1 });

// Generate unique reference if not provided
transactionSchema.pre('save', function(next) {
  if (!this.reference) {
    this.reference = `TXN-${Date.now()}-${Math.random().toString(36).substring(2, 9).toUpperCase()}`;
  }
  this.updatedAt = new Date();
  next();
});

// Update processedAt when status changes to completed
transactionSchema.pre('save', function(next) {
  if (this.isModified('status') && this.status === 'completed' && !this.processedAt) {
    this.processedAt = new Date();
  }
  next();
});

// Instance method to check if transaction can be reversed
transactionSchema.methods.canReverse = function() {
  const reversibleStatuses = ['completed'];
  const nonReversibleTypes = ['reversal'];
  return reversibleStatuses.includes(this.status) && 
         !nonReversibleTypes.includes(this.type) &&
         !this.metadata?.reversalOf;
};

// Static method to get transaction summary for an account
transactionSchema.statics.getAccountSummary = async function(accountId, startDate, endDate) {
  const match = {
    $or: [{ fromAccount: accountId }, { toAccount: accountId }],
    status: 'completed'
  };
  
  if (startDate || endDate) {
    match.createdAt = {};
    if (startDate) match.createdAt.$gte = startDate;
    if (endDate) match.createdAt.$lte = endDate;
  }

  return this.aggregate([
    { $match: match },
    {
      $group: {
        _id: '$type',
        count: { $sum: 1 },
        totalAmount: { $sum: { $toDouble: '$amount' } }
      }
    }
  ]);
};

// Virtual for formatted amount
transactionSchema.virtual('formattedAmount').get(function() {
  const amount = parseFloat(this.amount.toString());
  return `${this.currency} ${amount.toFixed(2)}`;
});

module.exports = mongoose.model('Transaction', transactionSchema);
