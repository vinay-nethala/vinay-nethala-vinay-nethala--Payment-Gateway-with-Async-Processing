const axios = require('axios');
const db = require('../config/database');
const { generateWebhookSignature } = require('../services/WebhookService');

/**
 * Deliver Webhook Job
 * Sends webhook to merchant endpoint with retry logic
 */
async function deliverWebhook(job) {
    const { webhookLogId, merchantId, event, payload } = job.data;

    try {
        console.log(`🔄 Delivering webhook: ${webhookLogId} (${event})`);

        // Fetch merchant details
        const merchantResult = await db.query(
            'SELECT webhook_url, webhook_secret FROM merchants WHERE id = $1',
            [merchantId]
        );

        if (merchantResult.rows.length === 0) {
            throw new Error(`Merchant not found: ${merchantId}`);
        }

        const merchant = merchantResult.rows[0];

        if (!merchant.webhook_url) {
            console.log(`Webhook URL not configured for merchant ${merchantId}, skipping`);
            return { success: true, skipped: true };
        }

        // Fetch current webhook log
        const logResult = await db.query(
            'SELECT * FROM webhook_logs WHERE id = $1',
            [webhookLogId]
        );

        if (logResult.rows.length === 0) {
            throw new Error(`Webhook log not found: ${webhookLogId}`);
        }

        const log = logResult.rows[0];
        const currentAttempts = log.attempts + 1;

        // Generate signature
        const payloadString = JSON.stringify(payload);
        const crypto = require('crypto');
        const signature = crypto
            .createHmac('sha256', merchant.webhook_secret)
            .update(payloadString)
            .digest('hex');

        console.log('DEBUG SENDER Payload:', payloadString);
        console.log('DEBUG SENDER Sig:', signature);

        // Send webhook
        let responseCode = null;
        let responseBody = null;
        let deliverySuccess = false;

        try {
            const response = await axios.post(merchant.webhook_url, payloadString, {
                headers: {
                    'Content-Type': 'application/json',
                    'X-Webhook-Signature': signature,
                },
                timeout: 5000,
            });

            responseCode = response.status;
            responseBody = JSON.stringify(response.data).substring(0, 1000);
            deliverySuccess = response.status >= 200 && response.status < 300;

            console.log(`✅ Webhook delivered successfully: ${webhookLogId} (${responseCode})`);
        } catch (error) {
            if (error.response) {
                responseCode = error.response.status;
                responseBody = JSON.stringify(error.response.data).substring(0, 1000);
            } else {
                responseCode = 0;
                responseBody = error.message;
            }

            console.log(`❌ Webhook delivery failed: ${webhookLogId} (${responseCode})`);
        }

        // Update webhook log
        if (deliverySuccess) {
            await db.query(
                `UPDATE webhook_logs
         SET status = 'success',
             attempts = $1,
             last_attempt_at = CURRENT_TIMESTAMP,
             response_code = $2,
             response_body = $3
         WHERE id = $4`,
                [currentAttempts, responseCode, responseBody, webhookLogId]
            );
        } else {
            // Calculate next retry time
            const nextRetryAt = calculateNextRetry(currentAttempts);
            const newStatus = currentAttempts >= 5 ? 'failed' : 'pending';

            await db.query(
                `UPDATE webhook_logs
         SET status = $1,
             attempts = $2,
             last_attempt_at = CURRENT_TIMESTAMP,
             next_retry_at = $3,
             response_code = $4,
             response_body = $5
         WHERE id = $6`,
                [newStatus, currentAttempts, nextRetryAt, responseCode, responseBody, webhookLogId]
            );

            // Schedule retry if not exceeded max attempts
            if (currentAttempts < 5) {
                const retryDelay = getRetryDelay(currentAttempts);
                console.log(`⏰ Scheduling retry ${currentAttempts + 1} in ${retryDelay}ms`);

                const { webhookQueue } = require('../config/queue');
                await webhookQueue.add(
                    'deliver-webhook',
                    { webhookLogId, merchantId, event, payload },
                    { delay: retryDelay }
                );
            } else {
                console.log(`❌ Max retry attempts reached for webhook: ${webhookLogId}`);
            }
        }

        return { success: true, webhookLogId, deliverySuccess, attempts: currentAttempts };
    } catch (error) {
        console.error(`Error delivering webhook ${webhookLogId}:`, error);
        throw error;
    }
}

/**
 * Calculate next retry timestamp
 */
function calculateNextRetry(attemptNumber) {
    const delay = getRetryDelay(attemptNumber);
    return new Date(Date.now() + delay);
}

/**
 * Get retry delay in milliseconds based on attempt number
 */
function getRetryDelay(attemptNumber) {
    const testMode = process.env.WEBHOOK_RETRY_INTERVALS_TEST === 'true';

    if (testMode) {
        // Test intervals: 0s, 5s, 10s, 15s, 20s
        const testIntervals = [0, 5000, 10000, 15000, 20000];
        return testIntervals[attemptNumber] || 20000;
    } else {
        // Production intervals: 0s, 1m, 5m, 30m, 2h
        const prodIntervals = [0, 60000, 300000, 1800000, 7200000];
        return prodIntervals[attemptNumber] || 7200000;
    }
}

module.exports = { deliverWebhook };
