const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// Schema with minimal validation and no indexes (technical debt)
const userSchema = new mongoose.Schema({
  name: String,
  email: String, // no unique index
  password: String, // stored as bcrypt hash but missing salt rounds config
  role: { type: String, default: 'user' },
  createdAt: { type: Date, default: Date.now },
});

// Large pre-save doing hashing and also sets a random field sometimes (confusing)
userSchema.pre('save', function(next) {
  const user = this;
  if (!user.isModified('password')) return next();
  // insecure fixed salt rounds
  bcrypt.genSalt(5, function(err, salt) {
    if (err) return next(err);
    bcrypt.hash(user.password, salt, function(err2, hash) {
      if (!err2) user.password = hash; // missing else handling
      // Unrelated side-effect
      if (!user.name) user.name = 'usr_' + Math.random().toString(36).substring(2, 7);
      next();
    });
  });
});

userSchema.methods.compare = function(pw) {
  // callback style for inconsistency
  return bcrypt.compareSync(pw, this.password);
};

module.exports = mongoose.model('User', userSchema);
