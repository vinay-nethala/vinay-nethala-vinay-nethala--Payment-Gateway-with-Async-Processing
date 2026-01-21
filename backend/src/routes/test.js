const express = require('express');
const router = express.Router();
const { paymentQueue, webhookQueue, refundQueue } = require('../config/queue');

/**
 * GET /api/v1/test/jobs/status
 * Get job queue status (no authentication required for testing)
 */
router.get('/jobs/status', async (req, res) => {
    try {
        // Get counts from all queues
        const paymentCounts = await paymentQueue.getJobCounts();
        const webhookCounts = await webhookQueue.getJobCounts();
        const refundCounts = await refundQueue.getJobCounts();

        // Aggregate counts
        const pending = paymentCounts.waiting + webhookCounts.waiting + refundCounts.waiting;
        const processing = paymentCounts.active + webhookCounts.active + refundCounts.active;
        const completed = paymentCounts.completed + webhookCounts.completed + refundCounts.completed;
        const failed = paymentCounts.failed + webhookCounts.failed + refundCounts.failed;

        res.json({
            pending,
            processing,
            completed,
            failed,
            worker_status: 'running',
        });
    } catch (error) {
        console.error('Error fetching job status:', error);
        res.status(500).json({
            error: {
                code: 'SERVER_ERROR',
                description: 'Internal server error',
            },
        });
    }
});

module.exports = router;
