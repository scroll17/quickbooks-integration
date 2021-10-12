// external modules
const express = require('express');
const qs = require('querystring')
// services
const QuickBooksService = require('../services/quickBooks/QuickBooksService')
// db
const db = require('../../data/index')

const router = express.Router();

router.get('/callback', async (req, res) => {
    console.info('GET /integration/callback')
    console.debug('TRACE req.url', req.url)

    const queryParams = qs.parse(req.url.slice(req.url.indexOf('?') + 1));
    console.debug('TRACE queryParams', queryParams)

    const userId = queryParams['state']
    if(!userId) {
        return res.status(400).send({
            error: 'userId not exist'
        })
    }

    console.debug('userId = ', userId)

    const oauthClient = QuickBooksService.getClient();

    const authResponse = await oauthClient.createToken(req.url);
    const authTokens = JSON.stringify(authResponse.getJson(), null, 2);
    console.debug('TRACE auth token\n', authTokens)

    db.data = (db.data ?? {})
    db.data.users = (db.data.users ?? {});
    db.data.users[userId] = {
        tokens: authResponse.getJson()
    }

    await db.write();
    console.debug('DB: SAVED')

    console.log('')
    return res.send({ status: 'OK' })
})

router.get('/:userId', (req, res) => {
    console.info('GET /integration/:userId')
    console.info('RENDER intuit.ejs')

    const userId = req.params['userId']
    if(!userId) {
        return res.status(400).send({
            error: 'userId required in params!'
        })
    }

    console.debug('userId = ', userId)
    console.log('')

    return res.render('intuit.ejs', {
        port: process.env.PORT,
        appCenter: QuickBooksService.Constants.APP_CENTER_BASE,
        userId
    })
})

router.get('/requestToken/:userId', (req, res) => {
    console.info('GET /integration/requestToken/:userId')

    const userId = req.params['userId']
    if(!userId) {
        return res.status(400).send({
            error: 'userId required in params!'
        })
    }

    console.debug('userId = ', userId)

    const oauthClient = QuickBooksService.getClient();
    const authUri = QuickBooksService.Auth.buildAuthUri(oauthClient, userId);

    console.info('REDIRECT TO ', authUri)
    console.log('')
    return res.redirect(authUri);
})

module.exports = router;