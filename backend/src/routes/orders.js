const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { authenticate } = require('../middleware/auth');

/**
 * POST /api/v1/orders
 * Create a new order
 */
router.post('/', authenticate, async (req, res) => {
    try {
        const { amount, currency = 'INR', receipt } = req.body;

        // Validation
        if (!amount || amount <= 0) {
            return res.status(400).json({
                error: {
                    code: 'BAD_REQUEST_ERROR',
                    description: 'Amount must be a positive integer',
                },
            });
        }

        // Generate order ID
        const orderId = `order_${generateRandomString(16)}`;

        // Insert order
        const result = await db.query(
            `INSERT INTO orders (id, merchant_id, amount, currency, receipt, status)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
            [orderId, req.merchant.id, amount, currency, receipt, 'created']
        );

        const order = result.rows[0];

        res.status(201).json({
            id: order.id,
            amount: order.amount,
            currency: order.currency,
            receipt: order.receipt,
            status: order.status,
            created_at: order.created_at,
        });
    } catch (error) {
        console.error('Error creating order:', error);
        res.status(500).json({
            error: {
                code: 'SERVER_ERROR',
                description: 'Internal server error',
            },
        });
    }
});

/**
 * GET /api/v1/orders/:id
 * Get order details
 */
router.get('/:id', authenticate, async (req, res) => {
    try {
        const { id } = req.params;

        const result = await db.query(
            'SELECT * FROM orders WHERE id = $1 AND merchant_id = $2',
            [id, req.merchant.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                error: {
                    code: 'NOT_FOUND_ERROR',
                    description: 'Order not found',
                },
            });
        }

        const order = result.rows[0];

        res.json({
            id: order.id,
            amount: order.amount,
            currency: order.currency,
            receipt: order.receipt,
            status: order.status,
            created_at: order.created_at,
        });
    } catch (error) {
        console.error('Error fetching order:', error);
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
