// Bank controller with proper separation of concerns and validation
const bankService = require('../services/bankSvc');
const { validateTransfer, validatePagination } = require('../utils/validators');
const { AppError } = require('../utils/errors');
const logger = require('../utils/logger');

/**
 * Get account balance for authenticated user
 * @route GET /api/v1/bank/balance
 */
async function getBalance(req, res, next) {
  try {
    const userId = req.user.id;
    
    // Get user's primary account through service
    const account = await bankService.getPrimaryAccount(userId);
    
    if (!account) {
      throw new AppError('No account found for user', 404);
    }

    res.status(200).json({
      success: true,
      data: {
        accountId: account._id,
        accountNo: account.accountNo,
        balance: parseFloat(account.balance.toString()),
        currency: account.currency,
        status: account.status,
        overdraftLimit: account.metadata?.overdraftLimit ? 
          parseFloat(account.metadata.overdraftLimit.toString()) : 0
      }
    });
  } catch (error) {
    logger.error('Get balance error:', error);
    next(error);
  }
}

/**
 * Get all accounts for authenticated user
 * @route GET /api/v1/bank/accounts
 */
async function getAccounts(req, res, next) {
  try {
    const userId = req.user.id;
    
    const accounts = await bankService.getUserAccounts(userId);
    
    res.status(200).json({
      success: true,
      data: {
        accounts: accounts.map(acc => ({
          accountId: acc._id,
          accountNo: acc.accountNo,
          balance: parseFloat(acc.balance.toString()),
          currency: acc.currency,
          status: acc.status,
          accountType: acc.metadata?.accountType || 'checking'
        }))
      }
    });
  } catch (error) {
    logger.error('Get accounts error:', error);
    next(error);
  }
}

/**
 * Transfer money between accounts
 * @route POST /api/v1/bank/transfer
 */
async function transfer(req, res, next) {
  try {
    // Validate transfer request
    const validationResult = validateTransfer(req.body);
    if (!validationResult.isValid) {
      throw new AppError(validationResult.errors.join(', '), 400);
    }

    const userId = req.user.id;
    const { 
      fromAccountId, 
      toAccountNo, 
      amount, 
      currency = 'USD', 
      description,
      paymentMethod = 'bank_transfer'
    } = req.body;

    // Prepare transfer data
    const transferData = {
      userId,
      fromAccountId,
      toAccountNo,
      amount: parseFloat(amount),
      currency,
      description,
      metadata: {
        paymentMethod,
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      }
    };

    // Execute transfer through service
    const transaction = await bankService.executeTransfer(transferData);

    logger.info(`Transfer executed: ${transaction.reference}`);

    res.status(200).json({
      success: true,
      data: {
        transactionId: transaction._id,
        reference: transaction.reference,
        amount: parseFloat(transaction.amount.toString()),
        currency: transaction.currency,
        status: transaction.status,
        description: transaction.description,
        createdAt: transaction.createdAt
      },
      message: 'Transfer initiated successfully'
    });
  } catch (error) {
    logger.error('Transfer error:', error);
    next(error);
  }
}

/**
 * Get user's transaction history
 * @route GET /api/v1/bank/transactions
 */
async function getTransactions(req, res, next) {
  try {
    const userId = req.user.id;
    
    // Validate pagination parameters
    const { page = 1, limit = 20, startDate, endDate, type, status } = req.query;
    
    const paginationResult = validatePagination({ page, limit });
    if (!paginationResult.isValid) {
      throw new AppError(paginationResult.errors.join(', '), 400);
    }

    // Build filter options
    const filters = {
      userId,
      page: parseInt(page),
      limit: parseInt(limit),
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      type,
      status
    };

    // Get transactions through service
    const result = await bankService.getUserTransactions(filters);

    res.status(200).json({
      success: true,
      data: {
        transactions: result.transactions.map(tx => ({
          transactionId: tx._id,
          reference: tx.reference,
          type: tx.type,
          amount: parseFloat(tx.amount.toString()),
          currency: tx.currency,
          status: tx.status,
          description: tx.description,
          fromAccount: tx.fromAccount,
          toAccount: tx.toAccount,
          createdAt: tx.createdAt
        })),
        pagination: {
          currentPage: result.currentPage,
          totalPages: result.totalPages,
          totalItems: result.totalItems,
          hasNext: result.hasNext,
          hasPrev: result.hasPrev
        }
      }
    });
  } catch (error) {
    logger.error('Get transactions error:', error);
    next(error);
  }
}

/**
 * Get transaction details by ID
 * @route GET /api/v1/bank/transactions/:transactionId
 */
async function getTransactionDetails(req, res, next) {
  try {
    const userId = req.user.id;
    const { transactionId } = req.params;

    if (!transactionId) {
      throw new AppError('Transaction ID is required', 400);
    }

    const transaction = await bankService.getTransactionDetails(transactionId, userId);

    if (!transaction) {
      throw new AppError('Transaction not found', 404);
    }

    res.status(200).json({
      success: true,
      data: {
        transaction: {
          transactionId: transaction._id,
          reference: transaction.reference,
          type: transaction.type,
          amount: parseFloat(transaction.amount.toString()),
          currency: transaction.currency,
          status: transaction.status,
          description: transaction.description,
          fromAccount: transaction.fromAccount,
          toAccount: transaction.toAccount,
          metadata: transaction.metadata,
          failureReason: transaction.failureReason,
          processedAt: transaction.processedAt,
          createdAt: transaction.createdAt,
          updatedAt: transaction.updatedAt
        }
      }
    });
  } catch (error) {
    logger.error('Get transaction details error:', error);
    next(error);
  }
}

/**
 * Request transaction reversal
 * @route POST /api/v1/bank/transactions/:transactionId/reverse
 */
async function reverseTransaction(req, res, next) {
  try {
    const userId = req.user.id;
    const { transactionId } = req.params;
    const { reason } = req.body;

    if (!transactionId) {
      throw new AppError('Transaction ID is required', 400);
    }

    if (!reason) {
      throw new AppError('Reversal reason is required', 400);
    }

    const reversalTransaction = await bankService.reverseTransaction(transactionId, userId, reason);

    logger.info(`Transaction reversed: ${transactionId} -> ${reversalTransaction.reference}`);

    res.status(200).json({
      success: true,
      data: {
        reversalTransaction: {
          transactionId: reversalTransaction._id,
          reference: reversalTransaction.reference,
          originalTransactionId: transactionId,
          amount: parseFloat(reversalTransaction.amount.toString()),
          status: reversalTransaction.status,
          reason
        }
      },
      message: 'Transaction reversal initiated'
    });
  } catch (error) {
    logger.error('Transaction reversal error:', error);
    next(error);
  }
}

module.exports = {
  getBalance,
  getAccounts,
  transfer,
  getTransactions,
  getTransactionDetails,
  reverseTransaction
};
