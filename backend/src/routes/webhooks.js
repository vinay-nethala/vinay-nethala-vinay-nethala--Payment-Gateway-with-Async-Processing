const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { webhookQueue } = require('../config/queue');
const { v4: uuidv4 } = require('uuid');

/**
 * GET /api/v1/webhooks
 * List webhook logs for authenticated merchant with pagination
 */
router.get('/', authenticate, async (req, res) => {
    try {
        const merchantId = req.merchant.id;
        const limit = parseInt(req.query.limit) || 10;
        const offset = parseInt(req.query.offset) || 0;

        // Get total count
        const countResult = await db.query(
            'SELECT COUNT(*) FROM webhook_logs WHERE merchant_id = $1',
            [merchantId]
        );
        const total = parseInt(countResult.rows[0].count);

        // Get paginated logs
        const logsResult = await db.query(
            `SELECT id, event, status, attempts, created_at, last_attempt_at, 
                    next_retry_at, response_code, response_body
             FROM webhook_logs
             WHERE merchant_id = $1
             ORDER BY created_at DESC
             LIMIT $2 OFFSET $3`,
            [merchantId, limit, offset]
        );

        res.json({
            data: logsResult.rows,
            total,
            limit,
            offset
        });
    } catch (error) {
        console.error('Error fetching webhook logs:', error);
        res.status(500).json({
            error: {
                code: 'SERVER_ERROR',
                description: 'Failed to fetch webhook logs'
            }
        });
    }
});

/**
 * POST /api/v1/webhooks/test
 * Send a test webhook to merchant's configured URL
 */
router.post('/test', authenticate, async (req, res) => {
    try {
        const merchantId = req.merchant.id;

        // Check if webhook URL is configured
        const merchantResult = await db.query(
            'SELECT webhook_url FROM merchants WHERE id = $1',
            [merchantId]
        );

        if (!merchantResult.rows[0].webhook_url) {
            return res.status(400).json({
                error: {
                    code: 'BAD_REQUEST_ERROR',
                    description: 'Webhook URL not configured'
                }
            });
        }

        // Create test payload
        const payload = {
            event: 'webhook.test',
            timestamp: Math.floor(Date.now() / 1000),
            data: {
                test: true,
                message: 'This is a test webhook from your payment gateway'
            }
        };

        // Insert webhook log
        const logResult = await db.query(
            `INSERT INTO webhook_logs (merchant_id, event, payload, status, attempts)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING id`,
            [merchantId, 'webhook.test', JSON.stringify(payload), 'pending', 0]
        );

        const webhookLogId = logResult.rows[0].id;

        // Enqueue delivery job
        await webhookQueue.add('deliver-webhook', {
            webhookLogId,
            merchantId,
            event: 'webhook.test',
            payload
        });

        res.json({
            id: webhookLogId,
            message: 'Test webhook enqueued for delivery'
        });
    } catch (error) {
        console.error('Error sending test webhook:', error);
        res.status(500).json({
            error: {
                code: 'SERVER_ERROR',
                description: 'Failed to send test webhook'
            }
        });
    }
});

/**
 * POST /api/v1/webhooks/:webhook_id/retry
 * Manually retry a failed webhook delivery
 */
router.post('/:webhook_id/retry', authenticate, async (req, res) => {
    try {
        const { webhook_id } = req.params;
        const merchantId = req.merchant.id;

        // Fetch webhook log
        const logResult = await db.query(
            'SELECT * FROM webhook_logs WHERE id = $1 AND merchant_id = $2',
            [webhook_id, merchantId]
        );

        if (logResult.rows.length === 0) {
            return res.status(404).json({
                error: {
                    code: 'NOT_FOUND',
                    description: 'Webhook log not found'
                }
            });
        }

        const log = logResult.rows[0];

        // Reset attempts and status
        await db.query(
            `UPDATE webhook_logs
             SET attempts = 0, status = 'pending', next_retry_at = NULL
             WHERE id = $1`,
            [webhook_id]
        );

        // Re-enqueue delivery job
        await webhookQueue.add('deliver-webhook', {
            webhookLogId: webhook_id,
            merchantId,
            event: log.event,
            payload: log.payload
        });

        res.json({
            id: webhook_id,
            status: 'pending',
            message: 'Webhook retry scheduled'
        });
    } catch (error) {
        console.error('Error retrying webhook:', error);
        res.status(500).json({
            error: {
                code: 'SERVER_ERROR',
                description: 'Failed to retry webhook'
            }
        });
    }
});

/**
 * PUT /api/v1/webhooks/config
 * Update merchant's webhook configuration
 */
router.put('/config', authenticate, async (req, res) => {
    try {
        const merchantId = req.merchant.id;
        const { webhook_url } = req.body;

        if (!webhook_url) {
            return res.status(400).json({
                error: {
                    code: 'BAD_REQUEST_ERROR',
                    description: 'webhook_url is required'
                }
            });
        }

        // Validate URL format
        try {
            new URL(webhook_url);
        } catch (e) {
            return res.status(400).json({
                error: {
                    code: 'BAD_REQUEST_ERROR',
                    description: 'Invalid webhook URL format'
                }
            });
        }

        // Update merchant
        await db.query(
            'UPDATE merchants SET webhook_url = $1 WHERE id = $2',
            [webhook_url, merchantId]
        );

        res.json({
            message: 'Webhook configuration updated successfully',
            webhook_url
        });
    } catch (error) {
        console.error('Error updating webhook config:', error);
        res.status(500).json({
            error: {
                code: 'SERVER_ERROR',
                description: 'Failed to update webhook configuration'
            }
        });
    }
});

/**
 * POST /api/v1/webhooks/secret/regenerate
 * Regenerate merchant's webhook secret
 */
router.post('/secret/regenerate', authenticate, async (req, res) => {
    try {
        const merchantId = req.merchant.id;

        // Generate new secret
        const newSecret = 'whsec_' + require('crypto').randomBytes(16).toString('hex');

        // Update merchant
        await db.query(
            'UPDATE merchants SET webhook_secret = $1 WHERE id = $2',
            [newSecret, merchantId]
        );

        res.json({
            message: 'Webhook secret regenerated successfully',
            webhook_secret: newSecret
        });
    } catch (error) {
        console.error('Error regenerating webhook secret:', error);
        res.status(500).json({
            error: {
                code: 'SERVER_ERROR',
                description: 'Failed to regenerate webhook secret'
            }
        });
    }
});

module.exports = router;
