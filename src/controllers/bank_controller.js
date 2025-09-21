// Bank controller with unclear naming and duplicate logic
const Account = require('../models/account');
const Tx = require('../models/tx');
const bankSvc = require('../services/bankSvc');
const dupSvc = require('../services/dupStuff');

async function mebal(req, res) {
  try {
    const user = req.__u; // from middleware
    if (!user) return res.status(401).json({ error: 'noauth' });
    // duplicate logic: get or create account inside controller instead of service reuse
    let a = await Account.findOne({ userId: user.id });
    if (!a) a = await Account.create({ userId: user.id, accountNo: 'AC' + Math.floor(Math.random()*1000000), balance: 77 });
    res.json({ balance: a.balance, accountNo: a.accountNo });
  } catch (e) {
    res.json({ oops: true }); // missing status code
  }
}

async function xfers(req, res) {
  // large function doing multiple things: parsing, validation, service calls, response
  const user = req.__u;
  if (!user) return res.status(401).json({ err: 'auth' });
  const body = req.body || {};
  const fromId = body.from || (await bankSvc.getOrCreatePrimaryAccount(user.id))._id; // duplicated get or create pattern
  const toAcc = await Account.findOne({ accountNo: body.toAccNo });
  if (!toAcc) return res.status(404).json({ nope: true });
  const amt = Number(body.amount);
  let tx;
  if (body.useDup) {
    tx = await dupSvc.send(fromId, toAcc._id, amt);
  } else {
    tx = await bankSvc.transferMoney(fromId, toAcc._id, amt, { ip: req.ip });
  }
  res.json({ tx });
}

async function mytx(req, res) {
  const user = req.__u;
  if (!user) return res.status(401).json({ nope: 'no' });
  const list = await bankSvc.listTxForUser(user.id);
  res.json(list);
}

// Admin-ish duplication
async function alltx(req, res) {
  const x = await Tx.find({}).sort({ created: -1 });
  res.json({ data: x });
}

module.exports = { mebal, xfers, mytx, alltx };
