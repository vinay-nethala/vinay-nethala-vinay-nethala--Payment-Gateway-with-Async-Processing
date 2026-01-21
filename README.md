# ⚡ Async Payment Gateway – Production-Ready System

 A real-world **asynchronous payment gateway** built using modern backend architecture  
 Designed to demonstrate scalability, reliability, and secure payment workflows

**Tech Stack:** Node.js, Express, Bull (Redis), PostgreSQL, React, Docker

---

## 📌 Overview

This project implements a **production-style payment gateway** where payments are processed **asynchronously** using background workers instead of blocking API requests.

The system follows the same architectural patterns used by real payment companies, focusing on:
- Reliability
- Scalability
- Fault tolerance
- Secure merchant communication

This is **not a basic CRUD project**, but a system-design-oriented implementation.

---

## 🧠 Core Concepts Used

| Concept | Purpose |
|------|------|
| Async Processing | Prevents blocking API calls |
| Redis Queues | Reliable job execution |
| Background Workers | Handles long-running tasks |
| Webhooks | Notifies merchants of events |
| HMAC Security | Verifies webhook authenticity |
| Idempotency | Prevents duplicate charges |
| Docker | Production-like deployment |

---

## 🏗️ High-Level Architecture

```
Merchant App
     |
     |  (API Requests)
     v
API Server (Node + Express)
     |
     |  (Jobs)
     v
Redis Queue
     |
     |  (Workers)
     v
Worker Service
     |
     |  (DB Updates + Webhooks)
     v
PostgreSQL & Merchant Webhook

```

---

## 🔄 Payment Lifecycle

1. Merchant creates an **order**
2. Merchant initiates a **payment**
3. API responds immediately with `pending`
4. Worker processes payment in background
5. Status updated (`success` / `failed`)
6. Webhook sent to merchant
7. Retry mechanism handles failures

---

## 🪝 Webhook Delivery System

- Webhooks are delivered **as background jobs**
- Each webhook is signed using **HMAC-SHA256**
- Failed deliveries are retried automatically

### Retry Strategy

| Attempt | Delay |
|------|------|
| 1 | Immediate |
| 2 | 1 minute |
| 3 | 5 minutes |
| 4 | 30 minutes |
| 5 | 2 hours |

After maximum retries, the webhook is marked as **failed**.

---

## 🗄️ Database Tables

- `merchants`
- `orders`
- `payments`
- `refunds`
- `webhook_logs`
- `idempotency_keys`

### Design Benefits

✔ Full payment audit trail  
✔ Safe retry handling  
✔ Clean separation of concerns  
✔ Scalable schema  

---

## 🔐 Security Features

- API Key + Secret authentication
- HMAC signature verification
- Idempotency keys for duplicate protection
- Input validation
- SQL injection prevention

---

## ✨ Features

### Core Features
- Asynchronous payment processing
- Webhook delivery with retry logic
- Refund handling (full & partial)
- Idempotent APIs

### Developer Experience
- Embeddable JavaScript checkout SDK
- Test mode for fast evaluation
- Dashboard for webhook monitoring

### Operational Features
- Worker health checks
- Queue monitoring
- Graceful shutdown support
- Docker-based setup

---

## 🚀 Getting Started
## Prerequisites

Docker & Docker Compose

Node.js 18+

Git
```
git clone https://github.com/vinay-nethala/Payment-Gateway-with-Async-Processing-and-Webhooks
cd Payment-Gateway-with-Async-Processing-and-Webhooks
docker-compose up -d
```
## 🌐 Service URLs
## Service	URL
API Server	http://localhost:8000

Dashboard	http://localhost:3000

Checkout	http://localhost:3001

## 🔑 Test Credentials
```
API Key: key_test_abc123
API Secret: secret_test_xyz789
Webhook Secret: whsec_test_abc123
```
## 📡 API Example
## Create Payment (Async)
```
curl -X POST http://localhost:8000/api/v1/orders \
  -H "X-Api-Key: key_test_abc123" \
  -H "X-Api-Secret: secret_test_xyz789" \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 50000,
    "currency": "INR",
    "receipt": "receipt_123"
  }'
```
## Response:
```
{
  "id": "order_NXhj67fGH2jk9mPq",
  "amount": 50000,
  "currency": "INR",
  "receipt": "receipt_123",
  "status": "created",
  "created_at": "2024-01-15T10:30:00Z"
}
```
## 2. Create Payment (Async)
```
curl -X POST http://localhost:8000/api/v1/payments \
  -H "X-Api-Key: key_test_abc123" \
  -H "X-Api-Secret: secret_test_xyz789" \
  -H "Idempotency-Key: unique_request_id_123" \
  -H "Content-Type: application/json" \
  -d '{
    "order_id": "order_NXhj67fGH2jk9mPq",
    "method": "upi",
    "vpa": "user@paytm"
  }'
```
## Response:
```
{
  "id": "pay_H8sK3jD9s2L1pQr",
  "order_id": "order_NXhj67fGH2jk9mPq",
  "amount": 50000,
  "currency": "INR",
  "method": "upi",
  "vpa": "user@paytm",
  "status": "pending",
  "created_at": "2024-01-15T10:31:00Z"
}
```
## 3. Payment Status
```
curl http://localhost:8000/api/v1/payments/pay_H8sK3jD9s2L1pQr \
  -H "X-Api-Key: key_test_abc123" \
  -H "X-Api-Secret: secret_test_xyz789"
```
## create Refund
```
curl http://localhost:8000/api/v1/webhooks?limit=10&offset=0 \
  -H "X-Api-Key: key_test_abc123" \
  -H "X-Api-Secret: secret_test_xyz789"
```
##  Job Queue Status 
```
curl http://localhost:8000/api/v1/test/jobs/status
```
## Response 
```
{
  "pending": 5,
  "processing": 2,
  "completed": 100,
  "failed": 0,
  "worker_status": "running"
}
```
## 🔌 SDK Integration
## Installation
Add the SDK script to your website:
```
<script src="http://localhost:3001/checkout.js"></script>
```
## usage
```
<button id="pay-button">Pay ₹500.00</button>

<script>
document.getElementById('pay-button').addEventListener('click', function() {
  const checkout = new PaymentGateway({
    key: 'key_test_abc123',
    orderId: 'order_xyz',
    onSuccess: function(response) {
      console.log('Payment successful:', response.paymentId);
      // Redirect to success page
      window.location.href = '/success?payment_id=' + response.paymentId;
    },
    onFailure: function(error) {
      console.log('Payment failed:', error);
      // Show error message
      alert('Payment failed: ' + error.error);
    },
    onClose: function() {
      console.log('Payment modal closed');
    }
  });
  
  checkout.open();
});
</script>
```
### 🪝 Webhook Integration
Configure Webhook URL
Option 1: Via Dashboard
```
Go to http://localhost:3000/webhooks
Enter your webhook URL
Copy the webhook secret
Click "Save Configuration"
```



## Option 2: Via Database

UPDATE merchants 
```

SET webhook_url = 'https://yoursite.com/webhook',
    webhook_secret = 'whsec_test_abc123'
WHERE email = 'test@example.com';
```

## Verify Webhook Signature
```

const crypto = require('crypto');
const express = require('express');
const app = express();

app.use(express.json());

app.post('/webhook', (req, res) => {
  const signature = req.headers['x-webhook-signature'];
  const payload = JSON.stringify(req.body);
  
  // Verify HMAC signature
  const expectedSignature = crypto
    .createHmac('sha256', 'whsec_test_abc123')
    .update(payload)
    .digest('hex');
  
  if (signature !== expectedSignature) {
    console.log('❌ Invalid signature');
    return res.status(401).send('Invalid signature');
  }
  
  console.log('✅ Webhook verified');
  console.log('Event:', req.body.event);
  console.log('Data:', req.body.data);
  
  // Process webhook
  // ...
  
  res.status(200).send('OK');
});

app.listen(4000);
```
## 🪝 Webhook Events

The system notifies merchants about important payment and refund actions using **webhooks**.  
Each event contains a signed payload so merchants can safely process it.

### Supported Events

| Event Name | Description | Payload |
|-----------|------------|---------|
| `payment.created` | Payment entry is created | Payment object |
| `payment.pending` | Payment is under processing | Payment object |
| `payment.success` | Payment completed successfully | Payment object |
| `payment.failed` | Payment failed during processing | Payment object with error details |
| `refund.created` | Refund request initiated | Refund object |
| `refund.processed` | Refund successfully completed | Refund object |

---

## 🔁 Webhook Retry Mechanism

If a webhook delivery fails (non-2xx HTTP response), the system **automatically retries** the delivery using **exponential backoff**.

### Retry Schedule

| Attempt | Delay Before Retry | Total Elapsed Time |
|-------|------------------|------------------|
| 1 | Immediate | 0 seconds |
| 2 | 1 minute | 1 minute |
| 3 | 5 minutes | 6 minutes |
| 4 | 30 minutes | 36 minutes |
| 5 | 2 hours | 2 hours 36 minutes |

### Failure Handling

- After **5 unsuccessful attempts**, the webhook is marked as **permanently failed**
- All attempts are logged in the database
- Merchants can **manually retry failed webhooks** from the Dashboard UI

This approach ensures **reliable event delivery** while preventing unnecessary load on merchant servers.
## 🧪 Test Payment Flow

Follow the steps below to verify the complete payment lifecycle, including async processing and webhook delivery.

### 1️⃣ Create an Order

```bash
curl -X POST http://localhost:8000/api/v1/orders \
  -H "X-Api-Key: key_test_abc123" \
  -H "X-Api-Secret: secret_test_xyz789" \
  -H "Content-Type: application/json" \
  -d '{"amount": 50000, "currency": "INR", "receipt": "test_123"}'
```
## 2️⃣ Open Checkout Page

Open the checkout UI in your browser using the generated order ID:
```
http://localhost:3001/checkout?order_id=ORDER_ID

```
## 3️⃣ Complete the Payment

Choose UPI or Card

Enter test details

Submit the payment

Payment will be processed asynchronously by the worker.

## 4️⃣ Verify Webhook Delivery

Check your webhook receiver server logs

Confirm receipt of payment.success or payment.failed events

## 🧪 Test SDK Integration

You can test the embeddable checkout SDK using the provided HTML file.
```
# Windows
Start-Process test-sdk.html

# macOS / Linux
open test-sdk.html

```
## ⚙️ Test Mode Configuration

To speed up testing and demos, enable test mode in docker-compose.yml.
```
environment:
  TEST_MODE: "true"
  TEST_PROCESSING_DELAY: "1000"          # 1 second instead of 5–10 seconds
  TEST_PAYMENT_SUCCESS: "true"           # Force payment success
  WEBHOOK_RETRY_INTERVALS_TEST: "true"   # Fast webhook retries (5–20 seconds)
```
## License

This project is released under the **MIT License**.

---

## 👤 Author

**vinay-nethala**  
GitHub: https://github.com/vinay-nethala

---

## Repository

Source Code:  
https://github.com/https://github.com/vinay-nethala/Payment-Gateway-with-Async-Processing



