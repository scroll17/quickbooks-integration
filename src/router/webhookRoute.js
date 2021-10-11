// external modules
const crypto = require('crypto');
const express = require('express');
// services
const QuickBooksService = require('../services/quickBooks/QuickBooksService')
// db
const db = require('../../data/index')

const router = express.Router();

const WEBHOOK_SECRET_TOKEN = process.env.QUCIK_BOOKS_WEBHOOK_TOKEN;

// https://developer.intuit.com/app/developer/qbo/docs/develop/webhooks
router.post('/', async (req, res) => {
    const webhookPayload = JSON.stringify(req.body);
    if (!webhookPayload) {
        return res.status(200).send('SUCCESS');
    }

    if(!req.get('intuit-signature')) {
        return res.status(401).send('FORBIDDEN');
    }
    const signature = Buffer
        .from(req.get('intuit-signature'), 'base64')
        .toString('hex');

    /**
     * Validates the payload with the intuit-signature hash
     */
    const hash = crypto
        .createHmac('sha256', WEBHOOK_SECRET_TOKEN)
        .update(webhookPayload)
        .digest('hex');
    if(hash !== signature) {
        return res.status(401).send('FORBIDDEN');
    }

    // some work
    console.debug('WEBHOOK: payload =>');
    console.dir(webhookPayload, { depth: 20 });

    return res.status(200).send('SUCCESS');
})

module.exports = router;