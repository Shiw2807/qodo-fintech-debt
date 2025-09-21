// Input validation utilities

/**
 * Validate email format
 */
function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate password strength
 */
function isStrongPassword(password) {
  // At least 8 characters, one uppercase, one lowercase, one number, one special character
  const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
  return passwordRegex.test(password);
}

/**
 * Validate phone number
 */
function isValidPhone(phone) {
  const phoneRegex = /^\+?[\d\s-()]+$/;
  return phoneRegex.test(phone);
}

/**
 * Validate registration data
 */
function validateRegistration(data) {
  const errors = [];
  
  if (!data.email) {
    errors.push('Email is required');
  } else if (!isValidEmail(data.email)) {
    errors.push('Invalid email format');
  }
  
  if (!data.password) {
    errors.push('Password is required');
  } else if (!isStrongPassword(data.password)) {
    errors.push('Password must be at least 8 characters with uppercase, lowercase, number, and special character');
  }
  
  if (!data.name) {
    errors.push('Name is required');
  } else if (data.name.length < 2) {
    errors.push('Name must be at least 2 characters');
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Validate login data
 */
function validateLogin(data) {
  const errors = [];
  
  if (!data.email) {
    errors.push('Email is required');
  } else if (!isValidEmail(data.email)) {
    errors.push('Invalid email format');
  }
  
  if (!data.password) {
    errors.push('Password is required');
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Validate transfer data
 */
function validateTransfer(data) {
  const errors = [];
  
  if (!data.toAccountNo) {
    errors.push('Destination account number is required');
  }
  
  if (!data.amount) {
    errors.push('Amount is required');
  } else {
    const amount = parseFloat(data.amount);
    if (isNaN(amount) || amount <= 0) {
      errors.push('Amount must be a positive number');
    } else if (amount > 1000000) {
      errors.push('Amount exceeds maximum transfer limit');
    }
  }
  
  if (data.description && data.description.length > 500) {
    errors.push('Description cannot exceed 500 characters');
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Validate pagination parameters
 */
function validatePagination(data) {
  const errors = [];
  
  if (data.page) {
    const page = parseInt(data.page);
    if (isNaN(page) || page < 1) {
      errors.push('Page must be a positive integer');
    }
  }
  
  if (data.limit) {
    const limit = parseInt(data.limit);
    if (isNaN(limit) || limit < 1 || limit > 100) {
      errors.push('Limit must be between 1 and 100');
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Validate date range
 */
function validateDateRange(data) {
  const errors = [];
  
  if (data.startDate) {
    const startDate = new Date(data.startDate);
    if (isNaN(startDate.getTime())) {
      errors.push('Invalid start date format');
    }
  }
  
  if (data.endDate) {
    const endDate = new Date(data.endDate);
    if (isNaN(endDate.getTime())) {
      errors.push('Invalid end date format');
    }
  }
  
  if (data.startDate && data.endDate) {
    const startDate = new Date(data.startDate);
    const endDate = new Date(data.endDate);
    if (startDate > endDate) {
      errors.push('Start date cannot be after end date');
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Sanitize input string
 */
function sanitizeString(str) {
  if (typeof str !== 'string') return str;
  return str.trim().replace(/[<>]/g, '');
}

/**
 * Sanitize object properties
 */
function sanitizeObject(obj) {
  const sanitized = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      sanitized[key] = sanitizeString(value);
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      sanitized[key] = sanitizeObject(value);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

/**
 * Validate MongoDB ObjectId
 */
function isValidObjectId(id) {
  const objectIdRegex = /^[0-9a-fA-F]{24}$/;
  return objectIdRegex.test(id);
}

/**
 * Validate account number format
 */
function isValidAccountNumber(accountNo) {
  const accountRegex = /^[A-Z0-9]{10,20}$/;
  return accountRegex.test(accountNo);
}

module.exports = {
  isValidEmail,
  isStrongPassword,
  isValidPhone,
  validateRegistration,
  validateLogin,
  validateTransfer,
  validatePagination,
  validateDateRange,
  sanitizeString,
  sanitizeObject,
  isValidObjectId,
  isValidAccountNumber
};