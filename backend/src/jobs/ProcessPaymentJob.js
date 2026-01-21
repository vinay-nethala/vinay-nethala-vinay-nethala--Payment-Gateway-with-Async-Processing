const db = require('../config/database');
const { createWebhookLog } = require('../services/WebhookService');

/**
 * Process Payment Job
 * Simulates payment processing with random success/failure
 */
async function processPayment(job) {
  const { paymentId } = job.data;

  try {
    console.log(`🔄 Processing payment: ${paymentId}`);

    // Fetch payment from database
    const result = await db.query(
      'SELECT * FROM payments WHERE id = $1',
      [paymentId]
    );

    if (result.rows.length === 0) {
      throw new Error(`Payment not found: ${paymentId}`);
    }

    const payment = result.rows[0];

    // Simulate processing delay
    const testMode = process.env.TEST_MODE === 'true';
    const delay = testMode
      ? parseInt(process.env.TEST_PROCESSING_DELAY || '1000')
      : Math.floor(Math.random() * 5000) + 5000; // 5-10 seconds

    await sleep(delay);

    // Determine payment outcome
    let isSuccess;
    if (testMode) {
      isSuccess = process.env.TEST_PAYMENT_SUCCESS !== 'false';
    } else {
      // Random success based on payment method
      const successRate = payment.method === 'upi' ? 0.9 : 0.95;
      isSuccess = Math.random() < successRate;
    }

    if (isSuccess) {
      // Update payment to success
      await db.query(
        `UPDATE payments
         SET status = 'success', updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [paymentId]
      );

      console.log(`✅ Payment successful: ${paymentId}`);

      // Enqueue webhook for payment.success
      await createWebhookLog(payment.merchant_id, 'payment.success', {
        payment: {
          id: payment.id,
          order_id: payment.order_id,
          amount: payment.amount,
          currency: payment.currency,
          method: payment.method,
          vpa: payment.vpa || undefined,
          status: 'success',
          created_at: payment.created_at,
        },
      });
    } else {
      // Update payment to failed
      await db.query(
        `UPDATE payments
         SET status = 'failed',
             error_code = 'PAYMENT_FAILED',
             error_description = 'Payment processing failed',
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [paymentId]
      );

      console.log(`❌ Payment failed: ${paymentId}`);

      // Enqueue webhook for payment.failed
      await createWebhookLog(payment.merchant_id, 'payment.failed', {
        payment: {
          id: payment.id,
          order_id: payment.order_id,
          amount: payment.amount,
          currency: payment.currency,
          method: payment.method,
          vpa: payment.vpa || undefined,
          status: 'failed',
          error_code: 'PAYMENT_FAILED',
          error_description: 'Payment processing failed',
          created_at: payment.created_at,
        },
      });
    }

    return { success: true, paymentId, status: isSuccess ? 'success' : 'failed' };
  } catch (error) {
    console.error(`Error processing payment ${paymentId}:`, error);
    throw error;
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = { processPayment };
