// external modules
const _ = require('lodash')
const crypto = require('crypto');
const express = require('express');
// services
const QuickBooksService = require('../services/quickBooks/QuickBooksService')
// db
const db = require('../../data/index')

const router = express.Router();

const WEBHOOK_SECRET_TOKEN = process.env.QUCIK_BOOKS_WEBHOOK_TOKEN;

const InvoiceHandlers = {
    async OnUpdate(entity) {
        // wait notification about Invoice paid (Invoice.Balance = 0.0)
    }
}

const AccountHandlers = {
    async OnUpdate(entity) {
        // wait notification about Account (Income / Expense) when hes updated own name
    }
}

const CustomerHandlers = {
    async OnUpdate(entity) {
        // wait notification about Customer updated own name (DisplayName)
    }
}

async function handleEntities(entities, handlersObject) {
    await Promise.all(
        _.map(entities, async entity => {
            const handlersByEntity = handlersObject[entity.name];
            if(!handlersByEntity) {
                console.debug(`HANDLERS FOR "${entity.name}" NOT EXIST`)
                return;
            }

            if(!handlersByEntity[entity.operation]) {
                console.debug(`HANDLER "${entity.operation}" FOR "${entity.name}" NOT EXIST`)
                return;
            }

            await handlersByEntity[entity.operation](entity);
        })
    )
}

// https://developer.intuit.com/app/developer/qbo/docs/develop/webhooks
router.post('/', async (req, res) => {
    console.log('POST /webhook/')

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

    console.debug('WEBHOOK: payload =>');
    console.dir(webhookPayload, { depth: 20 });

    /**
     *  Example:
     * {
           "eventNotifications": [{
              "realmId":"1185883450",
              "dataChangeEvent": {
                 "entities": [
                     {
                        "name":"Customer",
                        "id":"1",
                        "operation":"Create",
                        "lastUpdated":"2015-10-05T14:42:19-0700"
                     },
                     {
                        "name":"Vendor",
                        "id":"1",
                        "operation":"Create",
                        "lastUpdated":"2015-10-05T14:42:19-0700"
                     }
                 ]
              }
           }]
        }
     * */
    const [{ dataChangeEvent }] = webhookPayload.eventNotifications;

    // handle entities
    await handleEntities(dataChangeEvent.entities, {
        Invoice: InvoiceHandlers,
        Account: AccountHandlers,
        Customer: CustomerHandlers
    })

    return res.status(200).send('SUCCESS');
})

module.exports = router;