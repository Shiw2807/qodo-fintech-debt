// Custom error classes for better error handling

/**
 * Application-specific error class
 */
class AppError extends Error {
  constructor(message, statusCode = 500, isOperational = true) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.timestamp = new Date().toISOString();
    
    Error.captureStackTrace(this, this.constructor);
  }
  
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      statusCode: this.statusCode,
      timestamp: this.timestamp
    };
  }
}

/**
 * Validation error class
 */
class ValidationError extends AppError {
  constructor(message, fields = []) {
    super(message, 400);
    this.name = 'ValidationError';
    this.fields = fields;
  }
}

/**
 * Authentication error class
 */
class AuthenticationError extends AppError {
  constructor(message = 'Authentication failed') {
    super(message, 401);
    this.name = 'AuthenticationError';
  }
}

/**
 * Authorization error class
 */
class AuthorizationError extends AppError {
  constructor(message = 'Access denied') {
    super(message, 403);
    this.name = 'AuthorizationError';
  }
}

/**
 * Not found error class
 */
class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super(`${resource} not found`, 404);
    this.name = 'NotFoundError';
  }
}

/**
 * Rate limit error class
 */
class RateLimitError extends AppError {
  constructor(message = 'Too many requests') {
    super(message, 429);
    this.name = 'RateLimitError';
  }
}

/**
 * Database error class
 */
class DatabaseError extends AppError {
  constructor(message = 'Database operation failed', originalError = null) {
    super(message, 500);
    this.name = 'DatabaseError';
    this.originalError = originalError;
  }
}

/**
 * Payment error class
 */
class PaymentError extends AppError {
  constructor(message = 'Payment processing failed', code = null) {
    super(message, 402);
    this.name = 'PaymentError';
    this.code = code;
  }
}

/**
 * Error handler middleware
 */
function errorHandler(err, req, res, next) {
  // Default to 500 server error
  let error = err;
  
  // Handle non-AppError errors
  if (!(error instanceof AppError)) {
    const message = err.message || 'Internal server error';
    error = new AppError(message, 500, false);
  }
  
  // Log error
  if (error.statusCode >= 500) {
    console.error('Server Error:', {
      message: error.message,
      stack: error.stack,
      url: req.url,
      method: req.method,
      ip: req.ip
    });
  }
  
  // Send error response
  res.status(error.statusCode).json({
    success: false,
    error: {
      name: error.name,
      message: error.message,
      ...(process.env.NODE_ENV === 'development' && {
        stack: error.stack,
        originalError: error.originalError
      })
    }
  });
}

/**
 * Async error wrapper for route handlers
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = {
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  RateLimitError,
  DatabaseError,
  PaymentError,
  errorHandler,
  asyncHandler
};