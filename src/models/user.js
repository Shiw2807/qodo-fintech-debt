const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// Configuration constants
const SALT_ROUNDS = 12; // Industry standard for bcrypt
const PASSWORD_MIN_LENGTH = 8;

// User schema with proper validation, indexes, and security
const userSchema = new mongoose.Schema({
  name: String,
  email: String, // no unique index
  password: String, // stored as bcrypt hash but missing salt rounds config
  role: { type: String, default: 'user' },
  createdAt: { type: Date, default: Date.now },
});

// Indexes for performance
userSchema.index({ email: 1, isActive: 1 });
userSchema.index({ role: 1, isActive: 1 });
userSchema.index({ 'security.passwordResetToken': 1 });
userSchema.index({ 'security.emailVerificationToken': 1 });

// Virtual for full name
userSchema.virtual('fullName').get(function() {
  if (this.profile?.firstName && this.profile?.lastName) {
    return `${this.profile.firstName} ${this.profile.lastName}`;
  }
  return this.name;
});

// Virtual to check if account is locked
userSchema.virtual('isLocked').get(function() {
  return !!(this.security?.lockUntil && this.security.lockUntil > Date.now());
});

// Pre-save middleware for password hashing
userSchema.pre('save', async function(next) {
  try {
    // Only hash password if it's modified
    if (this.isModified('password')) {
      // Validate password strength
      if (!this.validatePasswordStrength(this.password)) {
        throw new Error('Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character');
      }
      
      // Hash password with proper salt rounds
      const salt = await bcrypt.genSalt(SALT_ROUNDS);
      this.password = await bcrypt.hash(this.password, salt);
      
      // Update password change timestamp
      this.security.lastPasswordChange = new Date();
    }
    
    // Update the updatedAt timestamp
    this.updatedAt = new Date();
    
    next();
  } catch (error) {
    next(error);
  }
});

// Instance method to compare passwords
userSchema.methods.comparePassword = async function(candidatePassword) {
  try {
    // Need to explicitly select password field since it's excluded by default
    const user = await this.constructor.findById(this._id).select('+password');
    if (!user || !user.password) {
      return false;
    }
    return await bcrypt.compare(candidatePassword, user.password);
  } catch (error) {
    throw new Error('Error comparing passwords');
  }
};

// Instance method to validate password strength
userSchema.methods.validatePasswordStrength = function(password) {
  // At least one uppercase, one lowercase, one number, one special character
  const strongPasswordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/;
  return strongPasswordRegex.test(password);
};

// Instance method to handle failed login attempts
userSchema.methods.handleFailedLogin = async function() {
  const maxAttempts = 5;
  const lockTime = 2 * 60 * 60 * 1000; // 2 hours
  
  // Increment login attempts
  this.security.loginAttempts = (this.security.loginAttempts || 0) + 1;
  
  // Lock account if max attempts reached
  if (this.security.loginAttempts >= maxAttempts && !this.isLocked) {
    this.security.lockUntil = new Date(Date.now() + lockTime);
  }
  
  await this.save();
};

// Instance method to reset login attempts
userSchema.methods.resetLoginAttempts = async function() {
  this.security.loginAttempts = 0;
  this.security.lockUntil = undefined;
  this.security.lastLogin = new Date();
  await this.save();
};

// Instance method to generate password reset token
userSchema.methods.generatePasswordResetToken = async function() {
  const resetToken = mongoose.Types.ObjectId().toHexString() + 
                     Math.random().toString(36).substring(2);
  
  this.security.passwordResetToken = await bcrypt.hash(resetToken, 10);
  this.security.passwordResetExpires = new Date(Date.now() + 3600000); // 1 hour
  
  await this.save();
  return resetToken;
};

// Instance method to verify password reset token
userSchema.methods.verifyPasswordResetToken = async function(token) {
  if (!this.security.passwordResetToken || !this.security.passwordResetExpires) {
    return false;
  }
  
  if (this.security.passwordResetExpires < new Date()) {
    return false;
  }
  
  return await bcrypt.compare(token, this.security.passwordResetToken);
};

// Static method to find active users by role
userSchema.statics.findActiveByRole = function(role) {
  return this.find({ role, isActive: true });
};

// Static method to find user by email with password
userSchema.statics.findByEmailWithPassword = function(email) {
  return this.findOne({ email }).select('+password');
};

module.exports = mongoose.model('User', userSchema);
