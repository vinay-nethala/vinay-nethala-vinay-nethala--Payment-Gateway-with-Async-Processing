const { paymentQueue, webhookQueue, refundQueue } = require('../config/queue');
const { processPayment } = require('../jobs/ProcessPaymentJob');
const { deliverWebhook } = require('../jobs/DeliverWebhookJob');
const { processRefund } = require('../jobs/ProcessRefundJob');

console.log('🚀 Starting worker service...');

// Payment processing worker
paymentQueue.process('process-payment', async (job) => {
    return await processPayment(job);
});

// Webhook delivery worker
webhookQueue.process('deliver-webhook', async (job) => {
    return await deliverWebhook(job);
});

// Refund processing worker
refundQueue.process('process-refund', async (job) => {
    return await processRefund(job);
});

// Event listeners for payment queue
paymentQueue.on('completed', (job, result) => {
    console.log(`✅ Payment job completed: ${job.id}`, result);
});

paymentQueue.on('failed', (job, err) => {
    console.error(`❌ Payment job failed: ${job.id}`, err.message);
});

// Event listeners for webhook queue
webhookQueue.on('completed', (job, result) => {
    console.log(`✅ Webhook job completed: ${job.id}`, result);
});

webhookQueue.on('failed', (job, err) => {
    console.error(`❌ Webhook job failed: ${job.id}`, err.message);
});

// Event listeners for refund queue
refundQueue.on('completed', (job, result) => {
    console.log(`✅ Refund job completed: ${job.id}`, result);
});

refundQueue.on('failed', (job, err) => {
    console.error(`❌ Refund job failed: ${job.id}`, err.message);
});

console.log('✅ Worker service started successfully');
console.log('📋 Listening for jobs on:');
console.log('   - payment-processing queue');
console.log('   - webhook-delivery queue');
console.log('   - refund-processing queue');

// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('⏹️  Shutting down worker service...');
    await paymentQueue.close();
    await webhookQueue.close();
    await refundQueue.close();
    process.exit(0);
});
