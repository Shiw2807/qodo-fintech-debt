// Authentication service with proper security and token management
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/user');
const config = require('../config');
const { AppError } = require('../utils/errors');
const logger = require('../utils/logger');
const redisClient = require('../utils/redis');

// Token configuration
const ACCESS_TOKEN_EXPIRY = config.jwt.accessTokenExpiry || '15m';
const REFRESH_TOKEN_EXPIRY = config.jwt.refreshTokenExpiry || '7d';
const JWT_SECRET = config.jwt.secret;
const JWT_REFRESH_SECRET = config.jwt.refreshSecret;

/**
 * Generate access and refresh tokens for a user
 * @param {Object} user - User object
 * @returns {Object} Access and refresh tokens
 */
async function generateTokens(user) {
  try {
    // Create minimal payload for security
    const payload = {
      id: user._id.toString(),
      email: user.email,
      role: user.role
    };

    // Generate access token
    const accessToken = jwt.sign(
      payload,
      JWT_SECRET,
      { 
        expiresIn: ACCESS_TOKEN_EXPIRY,
        issuer: config.app.name,
        audience: config.app.clientUrl
      }
    );

    // Generate refresh token with different secret
    const refreshPayload = {
      id: user._id.toString(),
      tokenId: crypto.randomBytes(16).toString('hex')
    };

    const refreshToken = jwt.sign(
      refreshPayload,
      JWT_REFRESH_SECRET,
      { 
        expiresIn: REFRESH_TOKEN_EXPIRY,
        issuer: config.app.name
      }
    );

    // Store refresh token in Redis for revocation capability
    if (redisClient) {
      await redisClient.setex(
        `refresh_token:${refreshPayload.tokenId}`,
        7 * 24 * 60 * 60, // 7 days in seconds
        JSON.stringify({
          userId: user._id.toString(),
          email: user.email,
          createdAt: new Date().toISOString()
        })
      );
    }

    return { accessToken, refreshToken };
  } catch (error) {
    logger.error('Token generation error:', error);
    throw new AppError('Failed to generate authentication tokens', 500);
  }
}

/**
 * Verify and decode access token
 * @param {string} token - JWT token
 * @returns {Object} Decoded token payload
 */
async function verifyAccessToken(token) {
  try {
    const decoded = jwt.verify(token, JWT_SECRET, {
      issuer: config.app.name,
      audience: config.app.clientUrl
    });
    return decoded;
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      throw new AppError('Access token has expired', 401);
    }
    if (error.name === 'JsonWebTokenError') {
      throw new AppError('Invalid access token', 401);
    }
    throw new AppError('Token verification failed', 401);
  }
}

/**
 * Verify and decode refresh token
 * @param {string} token - Refresh token
 * @returns {Object} Decoded token payload
 */
async function verifyRefreshToken(token) {
  try {
    const decoded = jwt.verify(token, JWT_REFRESH_SECRET, {
      issuer: config.app.name
    });

    // Check if token exists in Redis (not revoked)
    if (redisClient) {
      const tokenData = await redisClient.get(`refresh_token:${decoded.tokenId}`);
      if (!tokenData) {
        throw new AppError('Refresh token has been revoked', 401);
      }
    }

    return decoded;
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (error.name === 'TokenExpiredError') {
      throw new AppError('Refresh token has expired', 401);
    }
    if (error.name === 'JsonWebTokenError') {
      throw new AppError('Invalid refresh token', 401);
    }
    throw new AppError('Token verification failed', 401);
  }
}

/**
 * Refresh access token using refresh token
 * @param {string} refreshToken - Refresh token
 * @returns {Object} New access and refresh tokens
 */
async function refreshAccessToken(refreshToken) {
  try {
    // Verify refresh token
    const decoded = await verifyRefreshToken(refreshToken);

    // Get user
    const user = await User.findById(decoded.id).select('+isActive');
    if (!user) {
      throw new AppError('User not found', 404);
    }

    if (!user.isActive) {
      throw new AppError('User account is deactivated', 403);
    }

    // Revoke old refresh token
    if (redisClient && decoded.tokenId) {
      await redisClient.del(`refresh_token:${decoded.tokenId}`);
    }

    // Generate new tokens
    return await generateTokens(user);
  } catch (error) {
    logger.error('Token refresh error:', error);
    throw error;
  }
}

/**
 * Revoke refresh token
 * @param {string} refreshToken - Refresh token to revoke
 */
async function revokeRefreshToken(refreshToken) {
  try {
    const decoded = jwt.decode(refreshToken);
    if (decoded && decoded.tokenId && redisClient) {
      await redisClient.del(`refresh_token:${decoded.tokenId}`);
    }
  } catch (error) {
    logger.error('Token revocation error:', error);
    // Don't throw error for revocation failures
  }
}

/**
 * Authenticate user with email and password
 * @param {string} email - User email
 * @param {string} password - User password
 * @returns {Object} User object if authentication successful
 */
async function authenticateUser(email, password) {
  try {
    // Find user by email efficiently with password field
    const user = await User.findByEmailWithPassword(email.toLowerCase());
    
    if (!user) {
      // Track failed attempt by IP if possible
      logger.warn(`Authentication failed: User not found for email ${email}`);
      return null;
    }

    // Check if account is locked
    if (user.isLocked) {
      logger.warn(`Authentication failed: Account locked for ${email}`);
      return null;
    }

    // Verify password
    const isPasswordValid = await user.comparePassword(password);
    
    if (!isPasswordValid) {
      // Handle failed login attempt
      await user.handleFailedLogin();
      logger.warn(`Authentication failed: Invalid password for ${email}`);
      return null;
    }

    // Don't return user with password field
    const userObj = user.toObject();
    delete userObj.password;
    
    return userObj;
  } catch (error) {
    logger.error('Authentication error:', error);
    throw new AppError('Authentication failed', 500);
  }
}

/**
 * Initiate password reset process
 * @param {string} email - User email
 */
async function initiatePasswordReset(email) {
  try {
    const user = await User.findOne({ email: email.toLowerCase() });
    
    if (!user) {
      // Don't reveal if user exists
      logger.info(`Password reset requested for non-existent email: ${email}`);
      return;
    }

    // Generate reset token
    const resetToken = await user.generatePasswordResetToken();

    // TODO: Send email with reset token
    // In production, this would send an email
    logger.info(`Password reset token generated for ${email}: ${resetToken}`);
    
    // For development, you might want to return the token
    // In production, never return the token in the response
    if (config.app.env === 'development') {
      return { resetToken, email };
    }
  } catch (error) {
    logger.error('Password reset initiation error:', error);
    throw new AppError('Failed to initiate password reset', 500);
  }
}

/**
 * Reset password using reset token
 * @param {string} token - Password reset token
 * @param {string} newPassword - New password
 */
async function resetPassword(token, newPassword) {
  try {
    // Find user with valid reset token
    const users = await User.find({
      'security.passwordResetExpires': { $gt: Date.now() }
    });

    let user = null;
    for (const u of users) {
      if (await u.verifyPasswordResetToken(token)) {
        user = u;
        break;
      }
    }

    if (!user) {
      throw new AppError('Invalid or expired reset token', 400);
    }

    // Update password
    user.password = newPassword;
    user.security.passwordResetToken = undefined;
    user.security.passwordResetExpires = undefined;
    user.security.loginAttempts = 0;
    user.security.lockUntil = undefined;

    await user.save();

    logger.info(`Password reset successful for user ${user.email}`);
  } catch (error) {
    logger.error('Password reset error:', error);
    throw error;
  }
}

/**
 * Verify email with verification token
 * @param {string} token - Email verification token
 */
async function verifyEmail(token) {
  try {
    const user = await User.findOne({
      'security.emailVerificationToken': token,
      'security.emailVerificationExpires': { $gt: Date.now() }
    });

    if (!user) {
      throw new AppError('Invalid or expired verification token', 400);
    }

    user.isEmailVerified = true;
    user.security.emailVerificationToken = undefined;
    user.security.emailVerificationExpires = undefined;

    await user.save();

    logger.info(`Email verified for user ${user.email}`);
    return user;
  } catch (error) {
    logger.error('Email verification error:', error);
    throw error;
  }
}

module.exports = {
  generateTokens,
  verifyAccessToken,
  verifyRefreshToken,
  refreshAccessToken,
  revokeRefreshToken,
  authenticateUser,
  initiatePasswordReset,
  resetPassword,
  verifyEmail
};
