const db = require('../config/database');

/**
 * Authentication middleware for API endpoints
 * Validates X-Api-Key and X-Api-Secret headers
 */
async function authenticate(req, res, next) {
    try {
        const apiKey = req.headers['x-api-key'];
        const apiSecret = req.headers['x-api-secret'];

        if (!apiKey || !apiSecret) {
            return res.status(401).json({
                error: {
                    code: 'AUTHENTICATION_ERROR',
                    description: 'API credentials are required',
                },
            });
        }

        // Fetch merchant by API key
        const result = await db.query(
            'SELECT * FROM merchants WHERE api_key = $1',
            [apiKey]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({
                error: {
                    code: 'AUTHENTICATION_ERROR',
                    description: 'Invalid API key',
                },
            });
        }

        const merchant = result.rows[0];

        // Verify API secret
        if (merchant.api_secret !== apiSecret) {
            return res.status(401).json({
                error: {
                    code: 'AUTHENTICATION_ERROR',
                    description: 'Invalid API secret',
                },
            });
        }

        // Attach merchant to request
        req.merchant = merchant;
        next();
    } catch (error) {
        console.error('Authentication error:', error);
        res.status(500).json({
            error: {
                code: 'SERVER_ERROR',
                description: 'Internal server error',
            },
        });
    }
}

module.exports = { authenticate };
