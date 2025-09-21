// Intentional duplicate logic for Qodo to find
const Account = require('../models/account');
const Tx = require('../models/tx');

async function send(fromAccId, toAccId, amount) {
  const f = await Account.findById(fromAccId);
  const t = await Account.findById(toAccId);
  if (!f || !t) throw new Error('notfound');
  if (f.balance < amount) throw new Error('no$');
  f.balance -= amount;
  t.balance += amount;
  await f.save();
  await t.save();
  return Tx.create({ from: f._id, to: t._id, amt: amount, type: 'transfer', status: 'ok' });
}

module.exports = { send };
