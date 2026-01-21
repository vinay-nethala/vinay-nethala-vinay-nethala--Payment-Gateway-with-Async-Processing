const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { authenticate } = require('../middleware/auth');

/**
 * GET /api/v1/refunds/:id
 * Get refund details
 */
router.get('/:id', authenticate, async (req, res) => {
    try {
        const { id } = req.params;

        const result = await db.query(
            'SELECT * FROM refunds WHERE id = $1 AND merchant_id = $2',
            [id, req.merchant.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                error: {
                    code: 'NOT_FOUND_ERROR',
                    description: 'Refund not found',
                },
            });
        }

        const refund = result.rows[0];

        res.json({
            id: refund.id,
            payment_id: refund.payment_id,
            amount: refund.amount,
            reason: refund.reason,
            status: refund.status,
            created_at: refund.created_at,
            processed_at: refund.processed_at,
        });
    } catch (error) {
        console.error('Error fetching refund:', error);
        res.status(500).json({
            error: {
                code: 'SERVER_ERROR',
                description: 'Internal server error',
            },
        });
    }
});

module.exports = router;
