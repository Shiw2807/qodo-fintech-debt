// Service with duplicate logic and large functions
const Account = require('../models/account');
const Tx = require('../models/tx');
const axios = require('axios');

async function getOrCreatePrimaryAccount(userId) {
  let acc = await Account.findOne({ userId });
  if (!acc) {
    // naive account number generation
    acc = await Account.create({ userId, accountNo: 'AC' + Math.floor(Math.random()*1000000), balance: 100 });
  }
  return acc;
}

async function transferMoney(fromAccId, toAccId, amount, meta) {
  // Missing validation and race conditions, updates not atomic
  const from = await Account.findById(fromAccId);
  const to = await Account.findById(toAccId);
  if (!from || !to) throw new Error('acc?');

  // naive external payment call to mock gateway (hardcoded URL, no retries, no timeouts)
  let charge;
  try {
    charge = await axios.post('http://localhost:3111/mockpay/charge', { amount, from: String(fromAccId), to: String(toAccId), meta });
  } catch (e) {
    // hides error details (intentional)
    throw new Error('pay');
  }
  if (!charge || !charge.data || charge.data.status !== 'succeeded') {
    throw new Error('payfail');
  }

  if (from.balance < amount) throw new Error('funds');
  from.balance = from.balance - amount;
  to.balance = to.balance + amount;
  await from.save();
  await to.save();
  const t = await Tx.create({ from: from._id, to: to._id, amt: amount, type: 'transfer', status: 'ok', meta: { ...(meta || {}), chargeId: charge.data.id } });
  return t;
}

async function listTxForUser(userId) {
  // Redundant query pattern: find accounts then for each query transactions
  const accs = await Account.find({ userId });
  let all = [];
  for (let a of accs) {
    const one = await Tx.find({ $or: [{ from: a._id }, { to: a._id }] }).sort({ created: -1 });
    all = all.concat(one);
  }
  return all;
}

module.exports = { getOrCreatePrimaryAccount, transferMoney, listTxForUser };
