const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { paymentQueue, refundQueue } = require('../config/queue');
const { checkIdempotencyKey, storeIdempotencyKey } = require('../services/IdempotencyService');

/**
 * POST /api/v1/payments
 * Create a new payment (async processing with idempotency)
 */
router.post('/', authenticate, async (req, res) => {
    try {
        const { order_id, method, card_number, card_expiry, card_cvv, vpa } = req.body;
        const idempotencyKey = req.headers['idempotency-key'];

        // Check idempotency key
        if (idempotencyKey) {
            const cachedResponse = await checkIdempotencyKey(idempotencyKey, req.merchant.id);
            if (cachedResponse) {
                console.log(`✅ Returning cached response for idempotency key: ${idempotencyKey}`);
                return res.status(201).json(cachedResponse);
            }
        }

        // Validate order exists
        const orderResult = await db.query(
            'SELECT * FROM orders WHERE id = $1 AND merchant_id = $2',
            [order_id, req.merchant.id]
        );

        if (orderResult.rows.length === 0) {
            return res.status(404).json({
                error: {
                    code: 'NOT_FOUND_ERROR',
                    description: 'Order not found',
                },
            });
        }

        const order = orderResult.rows[0];

        // Validate payment method
        if (!['card', 'upi'].includes(method)) {
            return res.status(400).json({
                error: {
                    code: 'BAD_REQUEST_ERROR',
                    description: 'Invalid payment method',
                },
            });
        }

        // Validate method-specific fields
        if (method === 'card' && (!card_number || !card_expiry || !card_cvv)) {
            return res.status(400).json({
                error: {
                    code: 'BAD_REQUEST_ERROR',
                    description: 'Card details are required for card payments',
                },
            });
        }

        if (method === 'upi' && !vpa) {
            return res.status(400).json({
                error: {
                    code: 'BAD_REQUEST_ERROR',
                    description: 'VPA is required for UPI payments',
                },
            });
        }

        // Generate payment ID
        const paymentId = `pay_${generateRandomString(16)}`;

        // Insert payment with status 'pending'
        const paymentResult = await db.query(
            `INSERT INTO payments (id, order_id, merchant_id, amount, currency, method, card_number, card_expiry, card_cvv, vpa, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
            [
                paymentId,
                order_id,
                req.merchant.id,
                order.amount,
                order.currency,
                method,
                card_number || null,
                card_expiry || null,
                card_cvv || null,
                vpa || null,
                'pending',
            ]
        );

        const payment = paymentResult.rows[0];

        // Enqueue payment processing job
        await paymentQueue.add('process-payment', {
            paymentId: payment.id,
        });

        console.log(`✅ Payment created and job enqueued: ${payment.id}`);

        // Prepare response
        const response = {
            id: payment.id,
            order_id: payment.order_id,
            amount: payment.amount,
            currency: payment.currency,
            method: payment.method,
            vpa: payment.vpa || undefined,
            card_number: payment.card_number || undefined,
            status: payment.status,
            created_at: payment.created_at,
        };

        // Store idempotency key
        if (idempotencyKey) {
            await storeIdempotencyKey(idempotencyKey, req.merchant.id, response);
        }

        res.status(201).json(response);
    } catch (error) {
        console.error('Error creating payment:', error);
        res.status(500).json({
            error: {
                code: 'SERVER_ERROR',
                description: 'Internal server error',
            },
        });
    }
});

/**
 * GET /api/v1/payments/:id
 * Get payment details
 */
router.get('/:id', authenticate, async (req, res) => {
    try {
        const { id } = req.params;

        const result = await db.query(
            'SELECT * FROM payments WHERE id = $1 AND merchant_id = $2',
            [id, req.merchant.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                error: {
                    code: 'NOT_FOUND_ERROR',
                    description: 'Payment not found',
                },
            });
        }

        const payment = result.rows[0];

        res.json({
            id: payment.id,
            order_id: payment.order_id,
            amount: payment.amount,
            currency: payment.currency,
            method: payment.method,
            vpa: payment.vpa || undefined,
            card_number: payment.card_number || undefined,
            status: payment.status,
            error_code: payment.error_code || undefined,
            error_description: payment.error_description || undefined,
            captured: payment.captured,
            created_at: payment.created_at,
            updated_at: payment.updated_at,
        });
    } catch (error) {
        console.error('Error fetching payment:', error);
        res.status(500).json({
            error: {
                code: 'SERVER_ERROR',
                description: 'Internal server error',
            },
        });
    }
});

/**
 * POST /api/v1/payments/:id/capture
 * Capture a successful payment
 */
router.post('/:id/capture', authenticate, async (req, res) => {
    try {
        const { id } = req.params;
        const { amount } = req.body;

        const result = await db.query(
            'SELECT * FROM payments WHERE id = $1 AND merchant_id = $2',
            [id, req.merchant.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                error: {
                    code: 'NOT_FOUND_ERROR',
                    description: 'Payment not found',
                },
            });
        }

        const payment = result.rows[0];

        if (payment.status !== 'success') {
            return res.status(400).json({
                error: {
                    code: 'BAD_REQUEST_ERROR',
                    description: 'Payment not in capturable state',
                },
            });
        }

        if (amount && amount !== payment.amount) {
            return res.status(400).json({
                error: {
                    code: 'BAD_REQUEST_ERROR',
                    description: 'Capture amount must match payment amount',
                },
            });
        }

        // Update captured status
        await db.query(
            'UPDATE payments SET captured = true WHERE id = $1',
            [id]
        );

        const updatedResult = await db.query(
            'SELECT * FROM payments WHERE id = $1',
            [id]
        );

        const updatedPayment = updatedResult.rows[0];

        res.json({
            id: updatedPayment.id,
            order_id: updatedPayment.order_id,
            amount: updatedPayment.amount,
            currency: updatedPayment.currency,
            method: updatedPayment.method,
            status: updatedPayment.status,
            captured: updatedPayment.captured,
            created_at: updatedPayment.created_at,
            updated_at: updatedPayment.updated_at,
        });
    } catch (error) {
        console.error('Error capturing payment:', error);
        res.status(500).json({
            error: {
                code: 'SERVER_ERROR',
                description: 'Internal server error',
            },
        });
    }
});

/**
 * POST /api/v1/payments/:id/refunds
 * Create a refund
 */
router.post('/:payment_id/refunds', authenticate, async (req, res) => {
    try {
        const { payment_id } = req.params;
        const { amount, reason } = req.body;

        // Validate payment exists
        const paymentResult = await db.query(
            'SELECT * FROM payments WHERE id = $1 AND merchant_id = $2',
            [payment_id, req.merchant.id]
        );

        if (paymentResult.rows.length === 0) {
            return res.status(404).json({
                error: {
                    code: 'NOT_FOUND_ERROR',
                    description: 'Payment not found',
                },
            });
        }

        const payment = paymentResult.rows[0];

        // Verify payment is refundable
        if (payment.status !== 'success') {
            return res.status(400).json({
                error: {
                    code: 'BAD_REQUEST_ERROR',
                    description: 'Payment not in refundable state',
                },
            });
        }

        // Calculate total refunded amount
        const refundSumResult = await db.query(
            `SELECT COALESCE(SUM(amount), 0) as total_refunded
       FROM refunds
       WHERE payment_id = $1 AND status IN ('pending', 'processed')`,
            [payment_id]
        );

        const totalRefunded = parseInt(refundSumResult.rows[0].total_refunded);
        const availableAmount = payment.amount - totalRefunded;

        // Validate refund amount
        if (!amount || amount <= 0) {
            return res.status(400).json({
                error: {
                    code: 'BAD_REQUEST_ERROR',
                    description: 'Refund amount must be a positive integer',
                },
            });
        }

        if (amount > availableAmount) {
            return res.status(400).json({
                error: {
                    code: 'BAD_REQUEST_ERROR',
                    description: 'Refund amount exceeds available amount',
                },
            });
        }

        // Generate refund ID
        const refundId = `rfnd_${generateRandomString(16)}`;

        // Insert refund
        const refundResult = await db.query(
            `INSERT INTO refunds (id, payment_id, merchant_id, amount, reason, status)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
            [refundId, payment_id, req.merchant.id, amount, reason, 'pending']
        );

        const refund = refundResult.rows[0];

        // Enqueue refund processing job
        await refundQueue.add('process-refund', {
            refundId: refund.id,
        });

        console.log(`✅ Refund created and job enqueued: ${refund.id}`);

        res.status(201).json({
            id: refund.id,
            payment_id: refund.payment_id,
            amount: refund.amount,
            reason: refund.reason,
            status: refund.status,
            created_at: refund.created_at,
        });
    } catch (error) {
        console.error('Error creating refund:', error);
        res.status(500).json({
            error: {
                code: 'SERVER_ERROR',
                description: 'Internal server error',
            },
        });
    }
});

function generateRandomString(length) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

module.exports = router;
