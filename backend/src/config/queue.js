const Queue = require('bull');
const Redis = require('ioredis');

// Parse Redis URL for Docker networking
const redisUrl = process.env.REDIS_URL || 'redis://redis_gateway:6379';

// Redis client configuration
const redisConfig = {
    redis: redisUrl,
    defaultJobOptions: {
        attempts: 3,
        backoff: {
            type: 'exponential',
            delay: 2000,
        },
        removeOnComplete: 100,
        removeOnFail: 100,
    },
};

// Create job queues
const paymentQueue = new Queue('payment-processing', redisConfig);
const webhookQueue = new Queue('webhook-delivery', redisConfig);
const refundQueue = new Queue('refund-processing', redisConfig);

// Redis client for direct operations
const redisClient = new Redis(redisUrl);

redisClient.on('connect', () => {
    console.log('✅ Redis connected successfully');
});

redisClient.on('error', (err) => {
    console.error('❌ Redis connection error:', err.message);
});

module.exports = {
    paymentQueue,
    webhookQueue,
    refundQueue,
    redisClient,
};
