// Redis client setup (optional - will work without Redis)
const redis = require('redis');
const config = require('../config');
const logger = require('./logger');

let client = null;

// Only initialize Redis if configuration is provided
if (config.redis.host) {
  try {
    client = redis.createClient({
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password,
      db: config.redis.db,
      retry_strategy: (options) => {
        if (options.error && options.error.code === 'ECONNREFUSED') {
          logger.error('Redis connection refused');
          return new Error('Redis connection refused');
        }
        if (options.total_retry_time > 1000 * 60 * 60) {
          logger.error('Redis retry time exhausted');
          return new Error('Retry time exhausted');
        }
        if (options.attempt > 10) {
          logger.error('Redis max retry attempts reached');
          return undefined;
        }
        // Reconnect after
        return Math.min(options.attempt * 100, 3000);
      }
    });

    client.on('connect', () => {
      logger.info('Redis client connected');
    });

    client.on('error', (err) => {
      logger.error('Redis client error:', err);
    });

    client.on('ready', () => {
      logger.info('Redis client ready');
    });

    // Promisify Redis methods
    const { promisify } = require('util');
    client.get = promisify(client.get).bind(client);
    client.set = promisify(client.set).bind(client);
    client.setex = promisify(client.setex).bind(client);
    client.del = promisify(client.del).bind(client);
    client.exists = promisify(client.exists).bind(client);
    client.expire = promisify(client.expire).bind(client);
    client.ttl = promisify(client.ttl).bind(client);
  } catch (error) {
    logger.warn('Redis initialization failed, running without cache:', error.message);
    client = null;
  }
} else {
  logger.info('Redis not configured, running without cache');
}

module.exports = client;