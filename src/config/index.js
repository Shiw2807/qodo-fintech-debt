// Centralized configuration management
require('dotenv').config();

const config = {
  app: {
    name: process.env.APP_NAME || 'FinTech Platform',
    env: process.env.NODE_ENV || 'development',
    port: process.env.PORT || 3111,
    clientUrl: process.env.CLIENT_URL || 'http://localhost:3000'
  },
  
  database: {
    uri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/qodo_fintech',
    options: {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000
    }
  },
  
  jwt: {
    secret: process.env.JWT_SECRET || 'change-this-secret-in-production',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'change-this-refresh-secret-in-production',
    accessTokenExpiry: process.env.JWT_ACCESS_EXPIRY || '15m',
    refreshTokenExpiry: process.env.JWT_REFRESH_EXPIRY || '7d'
  },
  
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD,
    db: process.env.REDIS_DB || 0,
    keyPrefix: 'fintech:'
  },
  
  banking: {
    initialBalance: parseFloat(process.env.INITIAL_BALANCE || '100'),
    maxTransferAmount: parseFloat(process.env.MAX_TRANSFER_AMOUNT || '10000'),
    minTransferAmount: parseFloat(process.env.MIN_TRANSFER_AMOUNT || '0.01')
  },
  
  paymentGateway: {
    url: process.env.PAYMENT_GATEWAY_URL || 'http://localhost:3111/mockpay',
    apiKey: process.env.PAYMENT_GATEWAY_API_KEY,
    timeout: parseInt(process.env.PAYMENT_GATEWAY_TIMEOUT || '30000'),
    retryAttempts: parseInt(process.env.PAYMENT_GATEWAY_RETRY || '3')
  },
  
  security: {
    bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS || '12'),
    maxLoginAttempts: parseInt(process.env.MAX_LOGIN_ATTEMPTS || '5'),
    lockoutDuration: parseInt(process.env.LOCKOUT_DURATION || '7200000'), // 2 hours in ms
    passwordMinLength: parseInt(process.env.PASSWORD_MIN_LENGTH || '8'),
    sessionTimeout: parseInt(process.env.SESSION_TIMEOUT || '3600000') // 1 hour in ms
  },
  
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    format: process.env.LOG_FORMAT || 'json',
    directory: process.env.LOG_DIR || './logs'
  },
  
  cors: {
    origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000'],
    credentials: true
  },
  
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW || '900000'), // 15 minutes
    max: parseInt(process.env.RATE_LIMIT_MAX || '100'),
    message: 'Too many requests from this IP, please try again later.'
  }
};

// Validate required configuration
const requiredEnvVars = ['JWT_SECRET', 'JWT_REFRESH_SECRET'];
const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0 && config.app.env === 'production') {
  throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
}

module.exports = config;