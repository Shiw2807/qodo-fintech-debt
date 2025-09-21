// Admin controller with proper authorization and optimized queries
const adminService = require('../services/adminService');
const { validatePagination, validateDateRange } = require('../utils/validators');
const { AppError } = require('../utils/errors');
const logger = require('../utils/logger');
const { checkAdminRole } = require('../middleware/authorization');

/**
 * Get all users with pagination and filters
 * @route GET /api/v1/admin/users
 * @access Admin only
 */
async function listUsers(req, res, next) {
  try {
    // Validate pagination
    const { page = 1, limit = 50, role, isActive, search } = req.query;
    
    const paginationResult = validatePagination({ page, limit });
    if (!paginationResult.isValid) {
      throw new AppError(paginationResult.errors.join(', '), 400);
    }

    // Build filters
    const filters = {
      page: parseInt(page),
      limit: parseInt(limit),
      role,
      isActive: isActive !== undefined ? isActive === 'true' : undefined,
      search
    };

    // Get users through service
    const result = await adminService.getUsers(filters);

    logger.info(`Admin ${req.user.email} accessed user list`);

    res.status(200).json({
      success: true,
      data: {
        users: result.users.map(user => ({
          id: user._id,
          email: user.email,
          name: user.name,
          role: user.role,
          isActive: user.isActive,
          isEmailVerified: user.isEmailVerified,
          lastLogin: user.security?.lastLogin,
          createdAt: user.createdAt
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
    logger.error('List users error:', error);
    next(error);
  }
}

/**
 * Get system dashboard statistics
 * @route GET /api/v1/admin/dashboard
 * @access Admin only
 */
async function getDashboard(req, res, next) {
  try {
    const { startDate, endDate } = req.query;
    
    // Validate date range if provided
    if (startDate || endDate) {
      const dateValidation = validateDateRange({ startDate, endDate });
      if (!dateValidation.isValid) {
        throw new AppError(dateValidation.errors.join(', '), 400);
      }
    }

    // Get dashboard data through service (optimized with aggregation)
    const dashboardData = await adminService.getDashboardStats({
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined
    });

    logger.info(`Admin ${req.user.email} accessed dashboard`);

    res.status(200).json({
      success: true,
      data: dashboardData
    });
  } catch (error) {
    logger.error('Dashboard error:', error);
    next(error);
  }
}

/**
 * Get all transactions with advanced filtering
 * @route GET /api/v1/admin/transactions
 * @access Admin only
 */
async function listTransactions(req, res, next) {
  try {
    const { 
      page = 1, 
      limit = 100, 
      status, 
      type, 
      minAmount, 
      maxAmount,
      startDate,
      endDate 
    } = req.query;

    // Validate pagination
    const paginationResult = validatePagination({ page, limit });
    if (!paginationResult.isValid) {
      throw new AppError(paginationResult.errors.join(', '), 400);
    }

    // Build filters
    const filters = {
      page: parseInt(page),
      limit: parseInt(limit),
      status,
      type,
      minAmount: minAmount ? parseFloat(minAmount) : undefined,
      maxAmount: maxAmount ? parseFloat(maxAmount) : undefined,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined
    };

    // Get transactions through service
    const result = await adminService.getTransactions(filters);

    logger.info(`Admin ${req.user.email} accessed transaction list`);

    res.status(200).json({
      success: true,
      data: {
        transactions: result.transactions,
        pagination: {
          currentPage: result.currentPage,
          totalPages: result.totalPages,
          totalItems: result.totalItems,
          hasNext: result.hasNext,
          hasPrev: result.hasPrev
        },
        summary: result.summary
      }
    });
  } catch (error) {
    logger.error('List transactions error:', error);
    next(error);
  }
}

/**
 * Get user details including accounts and recent transactions
 * @route GET /api/v1/admin/users/:userId
 * @access Admin only
 */
async function getUserDetails(req, res, next) {
  try {
    const { userId } = req.params;

    if (!userId) {
      throw new AppError('User ID is required', 400);
    }

    const userDetails = await adminService.getUserDetails(userId);

    if (!userDetails) {
      throw new AppError('User not found', 404);
    }

    logger.info(`Admin ${req.user.email} accessed user details for ${userId}`);

    res.status(200).json({
      success: true,
      data: userDetails
    });
  } catch (error) {
    logger.error('Get user details error:', error);
    next(error);
  }
}

/**
 * Update user status (activate/deactivate)
 * @route PATCH /api/v1/admin/users/:userId/status
 * @access Admin only
 */
async function updateUserStatus(req, res, next) {
  try {
    const { userId } = req.params;
    const { isActive, reason } = req.body;

    if (!userId) {
      throw new AppError('User ID is required', 400);
    }

    if (typeof isActive !== 'boolean') {
      throw new AppError('isActive must be a boolean value', 400);
    }

    const updatedUser = await adminService.updateUserStatus(userId, isActive, reason);

    logger.warn(`Admin ${req.user.email} ${isActive ? 'activated' : 'deactivated'} user ${userId}`);

    res.status(200).json({
      success: true,
      data: {
        user: {
          id: updatedUser._id,
          email: updatedUser.email,
          isActive: updatedUser.isActive
        }
      },
      message: `User ${isActive ? 'activated' : 'deactivated'} successfully`
    });
  } catch (error) {
    logger.error('Update user status error:', error);
    next(error);
  }
}

/**
 * Freeze/unfreeze account
 * @route PATCH /api/v1/admin/accounts/:accountId/freeze
 * @access Admin only
 */
async function freezeAccount(req, res, next) {
  try {
    const { accountId } = req.params;
    const { freeze, reason } = req.body;

    if (!accountId) {
      throw new AppError('Account ID is required', 400);
    }

    if (typeof freeze !== 'boolean') {
      throw new AppError('freeze must be a boolean value', 400);
    }

    if (!reason) {
      throw new AppError('Reason is required', 400);
    }

    const account = await adminService.freezeAccount(accountId, freeze, reason);

    logger.warn(`Admin ${req.user.email} ${freeze ? 'froze' : 'unfroze'} account ${accountId}`);

    res.status(200).json({
      success: true,
      data: {
        account: {
          id: account._id,
          accountNo: account.accountNo,
          status: account.status
        }
      },
      message: `Account ${freeze ? 'frozen' : 'unfrozen'} successfully`
    });
  } catch (error) {
    logger.error('Freeze account error:', error);
    next(error);
  }
}

/**
 * Export data for reporting
 * @route GET /api/v1/admin/export
 * @access Admin only
 */
async function exportData(req, res, next) {
  try {
    const { type, format = 'json', startDate, endDate } = req.query;

    if (!type || !['users', 'transactions', 'accounts'].includes(type)) {
      throw new AppError('Valid export type is required (users, transactions, accounts)', 400);
    }

    const exportData = await adminService.exportData({
      type,
      format,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined
    });

    logger.info(`Admin ${req.user.email} exported ${type} data`);

    // Set appropriate headers for download
    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${type}-export-${Date.now()}.csv"`);
      res.send(exportData);
    } else {
      res.status(200).json({
        success: true,
        data: exportData
      });
    }
  } catch (error) {
    logger.error('Export data error:', error);
    next(error);
  }
}

module.exports = {
  listUsers,
  getDashboard,
  listTransactions,
  getUserDetails,
  updateUserStatus,
  freezeAccount,
  exportData
};
