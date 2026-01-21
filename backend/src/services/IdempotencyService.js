const db = require('../config/database');

/**
 * Check if idempotency key exists and return cached response
 * @param {string} key - Idempotency key
 * @param {string} merchantId - Merchant UUID
 * @returns {Object|null} Cached response or null
 */
async function checkIdempotencyKey(key, merchantId) {
    try {
        const result = await db.query(
            `SELECT response, expires_at FROM idempotency_keys
       WHERE key = $1 AND merchant_id = $2`,
            [key, merchantId]
        );

        if (result.rows.length === 0) {
            return null;
        }

        const record = result.rows[0];
        const now = new Date();
        const expiresAt = new Date(record.expires_at);

        // Check if expired
        if (now >= expiresAt) {
            // Delete expired key
            await db.query(
                'DELETE FROM idempotency_keys WHERE key = $1 AND merchant_id = $2',
                [key, merchantId]
            );
            return null;
        }

        return record.response;
    } catch (error) {
        console.error('Error checking idempotency key:', error);
        return null;
    }
}

/**
 * Store idempotency key with response
 * @param {string} key - Idempotency key
 * @param {string} merchantId - Merchant UUID
 * @param {Object} response - API response to cache
 */
async function storeIdempotencyKey(key, merchantId, response) {
    try {
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

        await db.query(
            `INSERT INTO idempotency_keys (key, merchant_id, response, expires_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (key, merchant_id) DO UPDATE
       SET response = $3, expires_at = $4`,
            [key, merchantId, JSON.stringify(response), expiresAt]
        );

        console.log(`✅ Idempotency key stored: ${key}`);
    } catch (error) {
        console.error('Error storing idempotency key:', error);
    }
}

module.exports = {
    checkIdempotencyKey,
    storeIdempotencyKey,
};
