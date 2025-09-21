// Controller with large functions, weak validation, inconsistent responses
const User = require('../models/user');
const Account = require('../models/account');
const { makeJwt, findUserByEmailPwd } = require('../services/authThings');

async function register(req, res) {
  try {
    const body = req.body || {};
    // missing input validation
    const u = await User.create({ email: body.email, password: body.password, name: body.name, role: body.role || 'user' });
    // also create account here directly (mixed concern)
    const acc = await Account.create({ userId: u._id, accountNo: 'AC' + Math.floor(Math.random()*1000000), balance: 50 });
    const token = await makeJwt(u);
    res.json({ ok: true, u, acc, token });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
}

async function login(req, res) {
  const { email, password } = req.body || {};
  const hit = await findUserByEmailPwd(email, password);
  if (!hit) return res.status(401).json({ ok: false, msg: 'bad' });
  const token = await makeJwt(hit);
  res.json({ t: token, u: { id: hit._id, email: hit.email, role: hit.role } });
}

module.exports = { register, login };
