const express = require('express');
const crypto = require('crypto');

const app = express();

// Capture raw body for signature verification
app.use(express.json({
    verify: (req, res, buf) => {
        req.rawBody = buf;
    }
}));

const WEBHOOK_SECRET = 'whsec_test_abc123';

app.post('/webhook', (req, res) => {
    const signature = req.headers['x-webhook-signature'];

    // Use raw body for signature verification
    const payloadBuffer = req.rawBody;
    const payloadString = payloadBuffer ? payloadBuffer.toString('utf8') : '';

    console.log('\n📨 Webhook received:');
    console.log('Event:', req.body.event);

    if (!payloadBuffer) {
        console.log('❌ ERROR: req.rawBody is undefined! Check express.json config.');
    }

    // Verify signature
    const hmac = crypto.createHmac('sha256', WEBHOOK_SECRET);
    hmac.update(payloadBuffer || JSON.stringify(req.body));
    const expectedSignature = hmac.digest('hex');

    console.log('DEBUG: Payload Length:', payloadString.length);
    console.log('DEBUG: Received Sig:', signature);
    console.log('DEBUG: Expected Sig:', expectedSignature);
    console.log('DEBUG: Payload Preview:', payloadString.substring(0, 100));

    if (signature !== expectedSignature) {
        console.log('❌ Invalid signature');
        return res.status(401).send('Invalid signature');
    }

    console.log('✅ Webhook verified');
    res.status(200).send('OK');
});

const PORT = 4000;
app.listen(PORT, () => {
    console.log(`🚀 Test merchant webhook receiver running on port ${PORT}`);
    console.log(`📍 Webhook URL: http://localhost:${PORT}/webhook`);
    console.log(`🔑 Webhook Secret: ${WEBHOOK_SECRET}`);
    console.log('\nWaiting for webhooks...\n');
});
