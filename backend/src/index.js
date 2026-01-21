require('dotenv').config();
const express = require('express');
const cors = require('cors');
const db = require('./config/database');

const app = express();
const PORT = process.env.PORT || 8000;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
const ordersRouter = require('./routes/orders');
const paymentsRouter = require('./routes/payments');
const refundsRouter = require('./routes/refunds');
const webhooksRouter = require('./routes/webhooks');
const testRouter = require('./routes/test');

app.use('/api/v1/orders', ordersRouter);
app.use('/api/v1/payments', paymentsRouter);
app.use('/api/v1/refunds', refundsRouter);
app.use('/api/v1/webhooks', webhooksRouter);
app.use('/api/v1/test', testRouter);

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Root endpoint
app.get('/', (req, res) => {
    res.json({
        name: 'Payment Gateway API',
        version: '2.0.0',
        status: 'running',
    });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({
        error: {
            code: 'SERVER_ERROR',
            description: 'Internal server error',
        },
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Payment Gateway API running on port ${PORT}`);
    console.log(`📊 Health check: http://localhost:${PORT}/health`);
    console.log(`📚 API base URL: http://localhost:${PORT}/api/v1`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('⏹️  Shutting down API server...');
    await db.end();
    process.exit(0);
});
