// Simple seeder with sync style and hardcoded secrets
const mongoose = require('mongoose');
const User = require('./src/models/user');
const Account = require('./src/models/account');

async function go() {
  await mongoose.connect('mongodb://127.0.0.1:27017/qodo_fintech_debt');
  await User.deleteMany({});
  await Account.deleteMany({});
  const admin = await User.create({ email: 'admin@x.com', password: 'admin123', role: 'admin', name: 'Boss' });
  const u1 = await User.create({ email: 'a@x.com', password: 'a', role: 'user' });
  const u2 = await User.create({ email: 'b@x.com', password: 'b', role: 'user' });
  await Account.create({ userId: admin._id, accountNo: 'AC111111', balance: 9999 });
  await Account.create({ userId: u1._id, accountNo: 'AC222222', balance: 200 });
  await Account.create({ userId: u2._id, accountNo: 'AC333333', balance: 300 });
  console.log('seeded');
  process.exit(0);
}

go();
