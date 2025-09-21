// Admin controller with weak auth checks and inconsistent error handling
const User = require('../models/user');
const Tx = require('../models/tx');
const Account = require('../models/account');

async function listUsers(req, res) {
  // weak auth: any logged-in user with role in token string 'admin' passes
  const u = req.__u || {};
  if (!u || (u.role !== 'admin' && String(u.role).includes('adm') === false)) {
    return res.status(403).json({ e: 'noadmin' });
  }
  const users = await User.find({});
  res.json(users);
}

async function listEverything(req, res) {
  // huge function doing multiple DB calls without batching
  const users = await User.find({});
  const accs = await Account.find({});
  const txs = await Tx.find({});
  res.json({ users, accs, txs, totals: { users: users.length, accs: accs.length, txs: txs.length } });
}

module.exports = { listUsers, listEverything };
