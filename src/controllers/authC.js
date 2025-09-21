// Authentication controller with proper validation and error handling
const User = require('../models/user');
const authService = require('../services/authThings');
const accountService = require('../services/bankSvc');
const { validateRegistration, validateLogin } = require('../utils/validators');
const { AppError } = require('../utils/errors');
const logger = require('../utils/logger');

/**
 * Register a new user
 * @route POST /api/v1/auth/register
 */
async function register(req, res, next) {
  try {
    // Validate input
    const validationResult = validateRegistration(req.body);
    if (!validationResult.isValid) {
      throw new AppError(validationResult.errors.join(', '), 400);
    }

    const { email, password, name, profile } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      throw new AppError('Email already registered', 409);
    }

    // Create user with proper data structure
    const user = await User.create({
      email: email.toLowerCase(),
      password,
      name,
      profile: profile || {},
      role: 'user', // Always default to user role for security
      isActive: true,
      isEmailVerified: false
    });

    // Create initial account through service layer
    const account = await accountService.createInitialAccount(user._id);

    // Generate tokens
    const { accessToken, refreshToken } = await authService.generateTokens(user);

    // Log successful registration
    logger.info(`User registered: ${user.email}`);

    // Return consistent response
    res.status(201).json({
      success: true,
      data: {
        user: {
          id: user._id,
          email: user.email,
          name: user.name,
          role: user.role
        },
        account: {
          id: account._id,
          accountNo: account.accountNo,
          balance: account.balance,
          currency: account.currency
        },
        tokens: {
          accessToken,
          refreshToken
        }
      },
      message: 'Registration successful'
    });
  } catch (error) {
    logger.error('Registration error:', error);
    next(error);
  }
}

/**
 * Login user
 * @route POST /api/v1/auth/login
 */
async function login(req, res, next) {
  try {
    // Validate input
    const validationResult = validateLogin(req.body);
    if (!validationResult.isValid) {
      throw new AppError(validationResult.errors.join(', '), 400);
    }

    const { email, password } = req.body;

    // Find user and verify credentials
    const user = await authService.authenticateUser(email, password);
    if (!user) {
      // Log failed attempt
      logger.warn(`Failed login attempt for: ${email}`);
      throw new AppError('Invalid email or password', 401);
    }

    // Check if account is active
    if (!user.isActive) {
      throw new AppError('Account is deactivated', 403);
    }

    // Check if account is locked
    if (user.isLocked) {
      throw new AppError('Account is temporarily locked due to multiple failed login attempts', 423);
    }

    // Reset login attempts on successful login
    await user.resetLoginAttempts();

    // Generate tokens
    const { accessToken, refreshToken } = await authService.generateTokens(user);

    // Log successful login
    logger.info(`User logged in: ${user.email}`);

    // Return consistent response
    res.status(200).json({
      success: true,
      data: {
        user: {
          id: user._id,
          email: user.email,
          name: user.name,
          role: user.role,
          isEmailVerified: user.isEmailVerified
        },
        tokens: {
          accessToken,
          refreshToken
        }
      },
      message: 'Login successful'
    });
  } catch (error) {
    logger.error('Login error:', error);
    next(error);
  }
}

/**
 * Refresh access token
 * @route POST /api/v1/auth/refresh
 */
async function refreshToken(req, res, next) {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      throw new AppError('Refresh token is required', 400);
    }

    const tokens = await authService.refreshAccessToken(refreshToken);

    res.status(200).json({
      success: true,
      data: { tokens },
      message: 'Token refreshed successfully'
    });
  } catch (error) {
    logger.error('Token refresh error:', error);
    next(error);
  }
}

/**
 * Logout user
 * @route POST /api/v1/auth/logout
 */
async function logout(req, res, next) {
  try {
    const { refreshToken } = req.body;
    const userId = req.user?.id;

    if (refreshToken) {
      await authService.revokeRefreshToken(refreshToken);
    }

    logger.info(`User logged out: ${userId}`);

    res.status(200).json({
      success: true,
      message: 'Logout successful'
    });
  } catch (error) {
    logger.error('Logout error:', error);
    next(error);
  }
}

/**
 * Request password reset
 * @route POST /api/v1/auth/forgot-password
 */
async function forgotPassword(req, res, next) {
  try {
    const { email } = req.body;

    if (!email) {
      throw new AppError('Email is required', 400);
    }

    await authService.initiatePasswordReset(email);

    // Always return success to prevent email enumeration
    res.status(200).json({
      success: true,
      message: 'If the email exists, a password reset link has been sent'
    });
  } catch (error) {
    logger.error('Password reset request error:', error);
    // Don't expose actual error to prevent information leakage
    res.status(200).json({
      success: true,
      message: 'If the email exists, a password reset link has been sent'
    });
  }
}

/**
 * Reset password with token
 * @route POST /api/v1/auth/reset-password
 */
async function resetPassword(req, res, next) {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      throw new AppError('Token and new password are required', 400);
    }

    await authService.resetPassword(token, newPassword);

    res.status(200).json({
      success: true,
      message: 'Password reset successful'
    });
  } catch (error) {
    logger.error('Password reset error:', error);
    next(error);
  }
}

module.exports = {
  register,
  login,
  refreshToken,
  logout,
  forgotPassword,
  resetPassword
};
