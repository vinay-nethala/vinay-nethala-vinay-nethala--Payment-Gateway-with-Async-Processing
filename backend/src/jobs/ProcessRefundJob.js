const db = require('../config/database');
const { createWebhookLog } = require('../services/WebhookService');

/**
 * Process Refund Job
 * Processes refund requests asynchronously
 */
async function processRefund(job) {
    const { refundId } = job.data;

    try {
        console.log(`🔄 Processing refund: ${refundId}`);

        // Fetch refund from database
        const result = await db.query(
            'SELECT * FROM refunds WHERE id = $1',
            [refundId]
        );

        if (result.rows.length === 0) {
            throw new Error(`Refund not found: ${refundId}`);
        }

        const refund = result.rows[0];

        // Fetch payment details
        const paymentResult = await db.query(
            'SELECT * FROM payments WHERE id = $1',
            [refund.payment_id]
        );

        if (paymentResult.rows.length === 0) {
            throw new Error(`Payment not found: ${refund.payment_id}`);
        }

        const payment = paymentResult.rows[0];

        // Verify payment is refundable
        if (payment.status !== 'success') {
            throw new Error(`Payment not in refundable state: ${payment.status}`);
        }

        // Verify refund amount doesn't exceed payment amount
        const refundSumResult = await db.query(
            `SELECT COALESCE(SUM(amount), 0) as total_refunded
       FROM refunds
       WHERE payment_id = $1 AND status IN ('pending', 'processed')`,
            [refund.payment_id]
        );

        const totalRefunded = parseInt(refundSumResult.rows[0].total_refunded);
        if (totalRefunded > payment.amount) {
            throw new Error(`Refund amount exceeds payment amount`);
        }

        // Simulate refund processing delay (3-5 seconds)
        const delay = Math.floor(Math.random() * 2000) + 3000;
        await sleep(delay);

        // Update refund status to processed
        await db.query(
            `UPDATE refunds
       SET status = 'processed',
           processed_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
            [refundId]
        );

        console.log(`✅ Refund processed: ${refundId}`);

        // Enqueue webhook for refund.processed
        await createWebhookLog(refund.merchant_id, 'refund.processed', {
            refund: {
                id: refund.id,
                payment_id: refund.payment_id,
                amount: refund.amount,
                reason: refund.reason,
                status: 'processed',
                created_at: refund.created_at,
                processed_at: new Date().toISOString(),
            },
        });

        return { success: true, refundId, status: 'processed' };
    } catch (error) {
        console.error(`Error processing refund ${refundId}:`, error);
        throw error;
    }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = { processRefund };
