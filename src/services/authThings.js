// Mixed concerns and unclear names
const jwt = require('jsonwebtoken');
const User = require('../models/user');

const SECRET = 'super-secret-not-env';

async function makeJwt(u) {
  // Overshared payload
  return jwt.sign({ id: u._id, email: u.email, role: u.role, wholeUser: u }, SECRET, { expiresIn: '3h' });
}

async function findUserByEmailPwd(email, password) {
  // Inefficient: load all users then filter (technical debt)
  const list = await User.find({});
  const hit = list.find(x => x.email === email);
  if (hit && hit.compare(password)) return hit;
  return null;
}

module.exports = { makeJwt, findUserByEmailPwd, SECRET };
