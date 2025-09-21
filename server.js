// Intentionally messy server setup with hardcoded config and mixed concerns
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const morgan = require('morgan');
const jwt = require('jsonwebtoken');

// Hardcoded config/secrets (technical debt)
const MONGO_URL = 'mongodb://127.0.0.1:27017/qodo_fintech_debt';
const JWT_SECRET = 'super-secret-not-env'; // weak secret and hardcoded
const PORT = 3111; // hardcoded port

// Global state (technical debt)
let globalCache = { usersLoggedInCount: 0 };

// Connect to DB with large function and missing retry/backoff logic
mongoose
  .connect(MONGO_URL, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('db ok'))
  .catch((err) => {
    console.log('db err', err.message);
  });

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(morgan('dev'));

// Middleware that does too much (parse JWT, count users, attach models)
const User = require('./src/models/user');
const Transaction = require('./src/models/tx');
const Account = require('./src/models/account');

app.use((req, res, next) => {
  // messy auth parsing and weak checks
  const header = req.headers['authorization'] || req.headers['auth'] || '';
  let token = header.replace('Bearer ', '') || req.query.token || req.body.token;
  if (token) {
    try {
      const payload = jwt.verify(token, JWT_SECRET);
      req.__u = payload; // unclear naming
      globalCache.usersLoggedInCount += 1; // wrong: increments on each request
    } catch (e) {
      // swallow error (inconsistent error handling)
    }
  }
  // attach models for convenience (tight coupling)
  req.$models = { User, Transaction, Account };
  req.JWT_SECRET = JWT_SECRET; // leaking secret into request object
  next();
});

// Routes
app.use('/api/v1/auth', require('./src/routes/auth-routes'));
app.use('/api/v1/bank', require('./src/routes/bankRoutes'));
app.use('/api/v1/admin', require('./src/routes/admin_routes'));

// Mock payment gateway (mounted as route for simplicity and confusion)
app.use('/mockpay', require('./src/mock/mockPaySvc'));

// Health and debug routes
app.get('/healthz', (req, res) => {
  res.json({ status: 'ok', logins: globalCache.usersLoggedInCount });
});

// catch-all with vague messaging
app.use((err, req, res, next) => {
  console.log('ERR', err && err.message);
  res.status(500).json({ ok: false, e: 'bad things' });
});

app.listen(PORT, () => console.log('server up on ' + PORT));
