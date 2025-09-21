// Banking service with atomic operations and proper error handling
const mongoose = require('mongoose');
const Account = require('../models/account');
const Transaction = require('../models/tx');
const paymentGateway = require('./paymentGateway');
const config = require('../config');
const { AppError } = require('../utils/errors');
const logger = require('../utils/logger');
const { generateAccountNumber } = require('../utils/accountUtils');

/**
 * Create initial account for new user
 * @param {string} userId - User ID
 * @returns {Object} Created account
 */
async function createInitialAccount(userId) {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // Check if user already has an account
    const existingAccount = await Account.findOne({ userId }).session(session);
    if (existingAccount) {
      await session.abortTransaction();
      return existingAccount;
    }

    // Generate unique account number
    const accountNo = await generateAccountNumber();

    // Create account with initial balance
    const account = await Account.create([{
      userId,
      accountNo,
      balance: config.banking.initialBalance || 100,
      currency: 'USD',
      status: 'active',
      metadata: {
        accountType: 'checking',
        overdraftLimit: 0
      }
    }], { session });

    await session.commitTransaction();
    logger.info(`Initial account created for user ${userId}: ${accountNo}`);
    
    return account[0];
  } catch (error) {
    await session.abortTransaction();
    logger.error('Account creation error:', error);
    throw new AppError('Failed to create account', 500);
  } finally {
    session.endSession();
  }
}

/**
 * Get user's primary account
 * @param {string} userId - User ID
 * @returns {Object} Primary account
 */
async function getPrimaryAccount(userId) {
  try {
    const account = await Account.findOne({ 
      userId, 
      status: 'active',
      'metadata.accountType': { $in: ['checking', 'savings'] }
    }).sort({ createdAt: 1 });

    if (!account) {
      // Create account if doesn't exist
      return await createInitialAccount(userId);
    }

    return account;
  } catch (error) {
    logger.error('Get primary account error:', error);
    throw new AppError('Failed to retrieve account', 500);
  }
}

/**
 * Get all user accounts
 * @param {string} userId - User ID
 * @returns {Array} User accounts
 */
async function getUserAccounts(userId) {
  try {
    const accounts = await Account.find({ userId })
      .sort({ createdAt: -1 });
    return accounts;
  } catch (error) {
    logger.error('Get user accounts error:', error);
    throw new AppError('Failed to retrieve accounts', 500);
  }
}

/**
 * Execute money transfer with atomic operations
 * @param {Object} transferData - Transfer details
 * @returns {Object} Transaction record
 */
async function executeTransfer(transferData) {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { 
      userId, 
      fromAccountId, 
      toAccountNo, 
      amount, 
      currency, 
      description, 
      metadata 
    } = transferData;

    // Validate amount
    if (amount <= 0) {
      throw new AppError('Transfer amount must be positive', 400);
    }

    // Get source account with lock
    const fromAccount = await Account.findOne({
      _id: fromAccountId,
      userId,
      status: 'active'
    }).session(session);

    if (!fromAccount) {
      throw new AppError('Source account not found or inactive', 404);
    }

    // Get destination account with lock
    const toAccount = await Account.findOne({
      accountNo: toAccountNo,
      status: 'active'
    }).session(session);

    if (!toAccount) {
      throw new AppError('Destination account not found or inactive', 404);
    }

    // Check if same account
    if (fromAccount._id.equals(toAccount._id)) {
      throw new AppError('Cannot transfer to the same account', 400);
    }

    // Check currency match
    if (fromAccount.currency !== toAccount.currency) {
      // In production, handle currency conversion
      throw new AppError('Currency mismatch. Cross-currency transfers not supported', 400);
    }

    // Check sufficient balance
    if (!fromAccount.canWithdraw(amount)) {
      throw new AppError('Insufficient funds', 400);
    }

    // Create pending transaction
    const transaction = await Transaction.create([{
      fromAccount: fromAccount._id,
      toAccount: toAccount._id,
      amount,
      currency: fromAccount.currency,
      type: 'transfer',
      status: 'pending',
      description,
      metadata: {
        ...metadata,
        fromAccountNo: fromAccount.accountNo,
        toAccountNo: toAccount.accountNo
      },
      createdBy: userId
    }], { session });

    // Process payment through gateway
    let paymentResult;
    try {
      paymentResult = await paymentGateway.processPayment({
        amount,
        currency,
        fromAccountId: fromAccount._id.toString(),
        toAccountId: toAccount._id.toString(),
        transactionId: transaction[0]._id.toString(),
        metadata
      });
    } catch (paymentError) {
      // Update transaction as failed
      transaction[0].status = 'failed';
      transaction[0].failureReason = paymentError.message;
      await transaction[0].save({ session });
      
      await session.commitTransaction();
      throw new AppError('Payment processing failed', 402);
    }

    // Update balances atomically
    const fromBalance = parseFloat(fromAccount.balance.toString());
    const toBalance = parseFloat(toAccount.balance.toString());

    fromAccount.balance = fromBalance - amount;
    toAccount.balance = toBalance + amount;
    fromAccount.metadata.lastActivityDate = new Date();
    toAccount.metadata.lastActivityDate = new Date();

    await fromAccount.save({ session });
    await toAccount.save({ session });

    // Update transaction status
    transaction[0].status = 'completed';
    transaction[0].processedAt = new Date();
    transaction[0].metadata.paymentGatewayId = paymentResult.id;
    await transaction[0].save({ session });

    await session.commitTransaction();

    logger.info(`Transfer completed: ${transaction[0].reference}`);
    return transaction[0];
  } catch (error) {
    await session.abortTransaction();
    logger.error('Transfer error:', error);
    throw error;
  } finally {
    session.endSession();
  }
}

/**
 * Get user transactions with pagination
 * @param {Object} filters - Filter options
 * @returns {Object} Paginated transactions
 */
async function getUserTransactions(filters) {
  try {
    const {
      userId,
      page = 1,
      limit = 20,
      startDate,
      endDate,
      type,
      status
    } = filters;

    // Get user's accounts
    const userAccounts = await Account.find({ userId }).select('_id');
    const accountIds = userAccounts.map(acc => acc._id);

    // Build query
    const query = {
      $or: [
        { fromAccount: { $in: accountIds } },
        { toAccount: { $in: accountIds } }
      ]
    };

    if (type) query.type = type;
    if (status) query.status = status;
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = startDate;
      if (endDate) query.createdAt.$lte = endDate;
    }

    // Execute query with pagination
    const skip = (page - 1) * limit;
    const [transactions, total] = await Promise.all([
      Transaction.find(query)
        .populate('fromAccount', 'accountNo')
        .populate('toAccount', 'accountNo')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Transaction.countDocuments(query)
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      transactions,
      currentPage: page,
      totalPages,
      totalItems: total,
      hasNext: page < totalPages,
      hasPrev: page > 1
    };
  } catch (error) {
    logger.error('Get user transactions error:', error);
    throw new AppError('Failed to retrieve transactions', 500);
  }
}

/**
 * Get transaction details
 * @param {string} transactionId - Transaction ID
 * @param {string} userId - User ID for authorization
 * @returns {Object} Transaction details
 */
async function getTransactionDetails(transactionId, userId) {
  try {
    // Get user's accounts for authorization
    const userAccounts = await Account.find({ userId }).select('_id');
    const accountIds = userAccounts.map(acc => acc._id.toString());

    const transaction = await Transaction.findById(transactionId)
      .populate('fromAccount')
      .populate('toAccount');

    if (!transaction) {
      return null;
    }

    // Check if user is authorized to view this transaction
    const fromAccountId = transaction.fromAccount?._id?.toString();
    const toAccountId = transaction.toAccount?._id?.toString();

    if (!accountIds.includes(fromAccountId) && !accountIds.includes(toAccountId)) {
      throw new AppError('Unauthorized to view this transaction', 403);
    }

    return transaction;
  } catch (error) {
    if (error instanceof AppError) throw error;
    logger.error('Get transaction details error:', error);
    throw new AppError('Failed to retrieve transaction details', 500);
  }
}

/**
 * Reverse a transaction
 * @param {string} transactionId - Transaction ID to reverse
 * @param {string} userId - User ID initiating reversal
 * @param {string} reason - Reversal reason
 * @returns {Object} Reversal transaction
 */
async function reverseTransaction(transactionId, userId, reason) {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // Get original transaction
    const originalTx = await Transaction.findById(transactionId)
      .populate('fromAccount')
      .populate('toAccount')
      .session(session);

    if (!originalTx) {
      throw new AppError('Transaction not found', 404);
    }

    // Check if transaction can be reversed
    if (!originalTx.canReverse()) {
      throw new AppError('Transaction cannot be reversed', 400);
    }

    // Verify user owns the source account
    if (originalTx.fromAccount.userId.toString() !== userId) {
      throw new AppError('Unauthorized to reverse this transaction', 403);
    }

    // Create reversal transaction
    const reversalTx = await Transaction.create([{
      fromAccount: originalTx.toAccount._id,
      toAccount: originalTx.fromAccount._id,
      amount: originalTx.amount,
      currency: originalTx.currency,
      type: 'refund',
      status: 'pending',
      description: `Reversal of ${originalTx.reference}: ${reason}`,
      metadata: {
        reversalOf: originalTx._id,
        reversalReason: reason,
        originalReference: originalTx.reference
      },
      createdBy: userId
    }], { session });

    // Update account balances
    const amount = parseFloat(originalTx.amount.toString());
    
    originalTx.fromAccount.balance = parseFloat(originalTx.fromAccount.balance.toString()) + amount;
    originalTx.toAccount.balance = parseFloat(originalTx.toAccount.balance.toString()) - amount;

    await originalTx.fromAccount.save({ session });
    await originalTx.toAccount.save({ session });

    // Update reversal transaction status
    reversalTx[0].status = 'completed';
    reversalTx[0].processedAt = new Date();
    await reversalTx[0].save({ session });

    // Update original transaction
    originalTx.status = 'reversed';
    originalTx.metadata.reversedBy = reversalTx[0]._id;
    originalTx.metadata.reversedAt = new Date();
    await originalTx.save({ session });

    await session.commitTransaction();

    logger.info(`Transaction reversed: ${originalTx.reference} -> ${reversalTx[0].reference}`);
    return reversalTx[0];
  } catch (error) {
    await session.abortTransaction();
    logger.error('Transaction reversal error:', error);
    throw error;
  } finally {
    session.endSession();
  }
}

module.exports = {
  createInitialAccount,
  getPrimaryAccount,
  getUserAccounts,
  executeTransfer,
  getUserTransactions,
  getTransactionDetails,
  reverseTransaction
};
