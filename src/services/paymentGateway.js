// Payment gateway service with retry logic and proper error handling
const axios = require('axios');
const config = require('../config');
const logger = require('../utils/logger');
const { AppError, PaymentError } = require('../utils/errors');

/**
 * Process payment through payment gateway
 * @param {Object} paymentData - Payment details
 * @returns {Object} Payment result
 */
async function processPayment(paymentData) {
  const { amount, currency, fromAccountId, toAccountId, transactionId, metadata } = paymentData;
  
  // Validate payment data
  if (!amount || amount <= 0) {
    throw new PaymentError('Invalid payment amount');
  }
  
  const maxRetries = config.paymentGateway.retryAttempts || 3;
  let lastError;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      logger.info(`Payment gateway attempt ${attempt}/${maxRetries}`, {
        transactionId,
        amount,
        currency
      });
      
      const response = await axios.post(
        `${config.paymentGateway.url}/charge`,
        {
          amount,
          currency,
          from: fromAccountId,
          to: toAccountId,
          transactionId,
          metadata: {
            ...metadata,
            attempt,
            timestamp: new Date().toISOString()
          }
        },
        {
          timeout: config.paymentGateway.timeout,
          headers: {
            'Content-Type': 'application/json',
            ...(config.paymentGateway.apiKey && {
              'X-API-Key': config.paymentGateway.apiKey
            })
          }
        }
      );
      
      // Check response status
      if (response.data && response.data.status === 'succeeded') {
        logger.info('Payment processed successfully', {
          transactionId,
          paymentId: response.data.id
        });
        return response.data;
      } else {
        throw new PaymentError(
          `Payment failed: ${response.data?.message || 'Unknown error'}`,
          response.data?.code
        );
      }
    } catch (error) {
      lastError = error;
      
      if (error.response) {
        // Server responded with error
        logger.error(`Payment gateway error (attempt ${attempt})`, {
          status: error.response.status,
          data: error.response.data,
          transactionId
        });
        
        // Don't retry for client errors (4xx)
        if (error.response.status >= 400 && error.response.status < 500) {
          throw new PaymentError(
            error.response.data?.message || 'Payment validation failed',
            error.response.data?.code
          );
        }
      } else if (error.request) {
        // Request made but no response
        logger.error(`Payment gateway timeout (attempt ${attempt})`, {
          transactionId,
          error: error.message
        });
      } else {
        // Error in request setup
        logger.error(`Payment request error (attempt ${attempt})`, {
          transactionId,
          error: error.message
        });
      }
      
      // Wait before retry (exponential backoff)
      if (attempt < maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  // All retries failed
  throw new PaymentError(
    `Payment failed after ${maxRetries} attempts: ${lastError?.message || 'Unknown error'}`,
    'PAYMENT_GATEWAY_ERROR'
  );
}

/**
 * Process refund through payment gateway
 * @param {Object} refundData - Refund details
 * @returns {Object} Refund result
 */
async function processRefund(refundData) {
  const { paymentId, amount, reason, transactionId } = refundData;
  
  try {
    logger.info('Processing refund', {
      paymentId,
      amount,
      transactionId
    });
    
    const response = await axios.post(
      `${config.paymentGateway.url}/refund`,
      {
        id: paymentId,
        amount,
        reason,
        transactionId
      },
      {
        timeout: config.paymentGateway.timeout,
        headers: {
          'Content-Type': 'application/json',
          ...(config.paymentGateway.apiKey && {
            'X-API-Key': config.paymentGateway.apiKey
          })
        }
      }
    );
    
    if (response.data && response.data.status === 'refunded') {
      logger.info('Refund processed successfully', {
        transactionId,
        refundId: response.data.id
      });
      return response.data;
    } else {
      throw new PaymentError(
        `Refund failed: ${response.data?.message || 'Unknown error'}`,
        response.data?.code
      );
    }
  } catch (error) {
    logger.error('Refund processing error', {
      transactionId,
      error: error.message
    });
    
    if (error instanceof PaymentError) {
      throw error;
    }
    
    throw new PaymentError(
      `Refund processing failed: ${error.message}`,
      'REFUND_ERROR'
    );
  }
}

/**
 * Get payment status from gateway
 * @param {string} paymentId - Payment ID
 * @returns {Object} Payment status
 */
async function getPaymentStatus(paymentId) {
  try {
    const response = await axios.get(
      `${config.paymentGateway.url}/charges/${paymentId}`,
      {
        timeout: config.paymentGateway.timeout,
        headers: {
          ...(config.paymentGateway.apiKey && {
            'X-API-Key': config.paymentGateway.apiKey
          })
        }
      }
    );
    
    return response.data;
  } catch (error) {
    logger.error('Get payment status error', {
      paymentId,
      error: error.message
    });
    
    throw new PaymentError(
      `Failed to get payment status: ${error.message}`,
      'STATUS_CHECK_ERROR'
    );
  }
}

/**
 * Validate payment webhook
 * @param {Object} webhookData - Webhook payload
 * @param {string} signature - Webhook signature
 * @returns {boolean} Is valid webhook
 */
function validateWebhook(webhookData, signature) {
  // In production, implement proper webhook signature validation
  // using HMAC or similar cryptographic verification
  
  if (!webhookData || !signature) {
    return false;
  }
  
  // Placeholder for actual signature verification
  // const expectedSignature = crypto
  //   .createHmac('sha256', config.paymentGateway.webhookSecret)
  //   .update(JSON.stringify(webhookData))
  //   .digest('hex');
  // 
  // return signature === expectedSignature;
  
  return true; // For development
}

/**
 * Handle payment webhook
 * @param {Object} webhookData - Webhook payload
 * @returns {Object} Processing result
 */
async function handleWebhook(webhookData) {
  try {
    const { event, data } = webhookData;
    
    logger.info('Processing payment webhook', {
      event,
      paymentId: data?.id
    });
    
    switch (event) {
      case 'payment.succeeded':
        // Handle successful payment
        return { processed: true, action: 'payment_confirmed' };
        
      case 'payment.failed':
        // Handle failed payment
        return { processed: true, action: 'payment_failed' };
        
      case 'refund.succeeded':
        // Handle successful refund
        return { processed: true, action: 'refund_confirmed' };
        
      default:
        logger.warn('Unknown webhook event', { event });
        return { processed: false, action: 'unknown_event' };
    }
  } catch (error) {
    logger.error('Webhook processing error', {
      error: error.message,
      webhookData
    });
    throw error;
  }
}

module.exports = {
  processPayment,
  processRefund,
  getPaymentStatus,
  validateWebhook,
  handleWebhook
};