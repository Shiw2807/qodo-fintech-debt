// Account utility functions
const crypto = require('crypto');
const Account = require('../models/account');

/**
 * Generate unique account number
 * @returns {string} Unique account number
 */
async function generateAccountNumber() {
  let accountNo;
  let isUnique = false;
  let attempts = 0;
  const maxAttempts = 10;

  while (!isUnique && attempts < maxAttempts) {
    // Generate account number with prefix and random alphanumeric
    const prefix = 'ACC';
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = crypto.randomBytes(4).toString('hex').toUpperCase();
    accountNo = `${prefix}${timestamp}${random}`;

    // Check uniqueness
    const existing = await Account.findOne({ accountNo });
    if (!existing) {
      isUnique = true;
    }
    
    attempts++;
  }

  if (!isUnique) {
    throw new Error('Failed to generate unique account number');
  }

  return accountNo;
}

/**
 * Format currency amount for display
 * @param {number} amount - Amount to format
 * @param {string} currency - Currency code
 * @returns {string} Formatted amount
 */
function formatCurrency(amount, currency = 'USD') {
  const formatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  
  return formatter.format(amount);
}

/**
 * Calculate transaction fee
 * @param {number} amount - Transaction amount
 * @param {string} type - Transaction type
 * @returns {number} Fee amount
 */
function calculateTransactionFee(amount, type) {
  const feeRates = {
    transfer: 0.001, // 0.1%
    withdrawal: 0.002, // 0.2%
    payment: 0.015, // 1.5%
    deposit: 0 // No fee for deposits
  };

  const rate = feeRates[type] || 0;
  const fee = amount * rate;
  
  // Minimum and maximum fee limits
  const minFee = 0.01;
  const maxFee = 50;
  
  return Math.min(Math.max(fee, minFee), maxFee);
}

/**
 * Validate IBAN
 * @param {string} iban - IBAN to validate
 * @returns {boolean} Is valid IBAN
 */
function isValidIBAN(iban) {
  // Remove spaces and convert to uppercase
  iban = iban.replace(/\s/g, '').toUpperCase();
  
  // Check basic format
  if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]+$/.test(iban)) {
    return false;
  }
  
  // Move first 4 characters to end
  const rearranged = iban.substring(4) + iban.substring(0, 4);
  
  // Replace letters with numbers (A=10, B=11, ..., Z=35)
  const numeric = rearranged.replace(/[A-Z]/g, (char) => {
    return (char.charCodeAt(0) - 55).toString();
  });
  
  // Calculate mod 97
  let remainder = numeric.substring(0, 2);
  for (let i = 2; i < numeric.length; i++) {
    remainder = (parseInt(remainder) % 97).toString() + numeric[i];
  }
  
  return parseInt(remainder) % 97 === 1;
}

/**
 * Mask account number for display
 * @param {string} accountNo - Account number to mask
 * @returns {string} Masked account number
 */
function maskAccountNumber(accountNo) {
  if (!accountNo || accountNo.length < 8) {
    return accountNo;
  }
  
  const visibleStart = 3;
  const visibleEnd = 4;
  const masked = accountNo.substring(0, visibleStart) + 
                 '*'.repeat(accountNo.length - visibleStart - visibleEnd) + 
                 accountNo.substring(accountNo.length - visibleEnd);
  
  return masked;
}

/**
 * Generate transaction reference
 * @param {string} type - Transaction type
 * @returns {string} Transaction reference
 */
function generateTransactionReference(type = 'TXN') {
  const prefix = type.toUpperCase().substring(0, 3);
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = crypto.randomBytes(3).toString('hex').toUpperCase();
  
  return `${prefix}-${timestamp}-${random}`;
}

/**
 * Calculate account age in days
 * @param {Date} createdAt - Account creation date
 * @returns {number} Age in days
 */
function calculateAccountAge(createdAt) {
  const now = new Date();
  const created = new Date(createdAt);
  const diffTime = Math.abs(now - created);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  return diffDays;
}

/**
 * Determine account tier based on balance and age
 * @param {number} balance - Account balance
 * @param {Date} createdAt - Account creation date
 * @returns {string} Account tier
 */
function determineAccountTier(balance, createdAt) {
  const age = calculateAccountAge(createdAt);
  
  if (balance >= 100000 && age >= 365) {
    return 'platinum';
  } else if (balance >= 50000 && age >= 180) {
    return 'gold';
  } else if (balance >= 10000 && age >= 90) {
    return 'silver';
  } else {
    return 'bronze';
  }
}

module.exports = {
  generateAccountNumber,
  formatCurrency,
  calculateTransactionFee,
  isValidIBAN,
  maskAccountNumber,
  generateTransactionReference,
  calculateAccountAge,
  determineAccountTier
};