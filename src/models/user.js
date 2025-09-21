const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// Configuration constants
const SALT_ROUNDS = 12; // Industry standard for bcrypt
const PASSWORD_MIN_LENGTH = 8;

// User schema with proper validation, indexes, and security
const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true,
    minlength: [2, 'Name must be at least 2 characters'],
    maxlength: [100, 'Name cannot exceed 100 characters']
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    index: true,
    validate: {
      validator: function(email) {
        // RFC 5322 compliant email regex
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
      },
      message: 'Please provide a valid email address'
    }
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters`],
    select: false // Don't include password in queries by default
  },
  role: {
    type: String,
    enum: ['user', 'admin', 'moderator'],
    default: 'user',
    index: true
  },
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },
  isEmailVerified: {
    type: Boolean,
    default: false
  },
  profile: {
    firstName: {
      type: String,
      trim: true,
      maxlength: 50
    },
    lastName: {
      type: String,
      trim: true,
      maxlength: 50
    },
    phone: {
      type: String,
      validate: {
        validator: function(phone) {
          // Basic international phone validation
          return !phone || /^\+?[\d\s-()]+$/.test(phone);
        },
        message: 'Please provide a valid phone number'
      }
    },
    dateOfBirth: Date,
    address: {
      street: String,
      city: String,
      state: String,
      country: String,
      postalCode: String
    }
  },
  security: {
    loginAttempts: {
      type: Number,
      default: 0
    },
    lockUntil: Date,
    lastLogin: Date,
    lastPasswordChange: Date,
    passwordResetToken: String,
    passwordResetExpires: Date,
    emailVerificationToken: String,
    emailVerificationExpires: Date,
    twoFactorSecret: {
      type: String,
      select: false
    },
    twoFactorEnabled: {
      type: Boolean,
      default: false
    }
  },
  preferences: {
    language: {
      type: String,
      default: 'en',
      enum: ['en', 'es', 'fr', 'de', 'ja', 'zh']
    },
    timezone: {
      type: String,
      default: 'UTC'
    },
    notifications: {
      email: {
        type: Boolean,
        default: true
      },
      sms: {
        type: Boolean,
        default: false
      },
      push: {
        type: Boolean,
        default: true
      }
    }
  },
  createdAt: {
    type: Date,
    default: Date.now,
    immutable: true
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  toJSON: {
    transform: function(doc, ret) {
      delete ret.password;
      delete ret.__v;
      return ret;
    }
  }
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
