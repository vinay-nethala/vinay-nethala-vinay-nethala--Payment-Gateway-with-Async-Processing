const crypto = require('crypto');
const db = require('../config/database');

/**
 * Generate HMAC-SHA256 signature for webhook payload
 * @param {Object} payload - The webhook payload object
 * @param {string} webhookSecret - The merchant's webhook secret
 * @returns {string} Hex-encoded signature
 */
function generateWebhookSignature(payload, webhookSecret) {
    const payloadString = JSON.stringify(payload);
    const hmac = crypto.createHmac('sha256', webhookSecret);
    hmac.update(payloadString);
    return hmac.digest('hex');
}

/**
 * Create a webhook log entry and enqueue delivery job
 * @param {string} merchantId - Merchant UUID
 * @param {string} event - Event type (e.g., 'payment.success')
 * @param {Object} data - Event data
 */
async function createWebhookLog(merchantId, event, data) {
    try {
        // Fetch merchant to check if webhook_url is configured
        const merchantResult = await db.query(
            'SELECT webhook_url, webhook_secret FROM merchants WHERE id = $1',
            [merchantId]
        );

        if (merchantResult.rows.length === 0) {
            console.log(`Merchant ${merchantId} not found, skipping webhook`);
            return;
        }

        const merchant = merchantResult.rows[0];

        // Skip if webhook URL is not configured
        if (!merchant.webhook_url) {
            console.log(`Webhook URL not configured for merchant ${merchantId}, skipping`);
            return;
        }

        // Create payload
        const payload = {
            event,
            timestamp: Math.floor(Date.now() / 1000),
            data,
        };

        // Insert webhook log
        const result = await db.query(
            `INSERT INTO webhook_logs (merchant_id, event, payload, status, attempts)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
            [merchantId, event, JSON.stringify(payload), 'pending', 0]
        );

        const webhookLogId = result.rows[0].id;

        // Enqueue webhook delivery job
        const { webhookQueue } = require('../config/queue');
        await webhookQueue.add('deliver-webhook', {
            webhookLogId,
            merchantId,
            event,
            payload,
        });

        console.log(`✅ Webhook log created and job enqueued: ${webhookLogId}`);
    } catch (error) {
        console.error('Error creating webhook log:', error);
    }
}

module.exports = {
    generateWebhookSignature,
    createWebhookLog,
};
