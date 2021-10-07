// external modules
const express = require('express');
// services
const QuickBooksService = require('../services/quickBooks/QuickBooksService')
// db
const db = require('../../data/index')

const router = express.Router();

router.get('/callback', async (req, res) => {
    console.info('GET /integration/callback')
    console.debug('TRACE req.url', req.url)

    const userId = req.cookies['userId']
    if(!userId) {
        res.status(400).send({
            error: 'userId not exist'
        })
    }

    res.clearCookie('userId')
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
    res.send({ status: 'OK' })
})

router.get('/:userId', (req, res) => {
    console.info('GET /integration/:userId')
    console.info('RENDER intuit.ejs')

    const userId = req.params['userId']
    if(!userId) {
        res.status(400).send({
            error: 'userId required in params!'
        })
    }

    console.debug('userId = ', userId)
    console.log('')

    res.render('intuit.ejs', {
        port: process.env.PORT,
        appCenter: QuickBooksService.Constants.APP_CENTER_BASE,
        userId
    })
})

router.get('/requestToken/:userId', (req, res) => {
    console.info('GET /integration/requestToken/:userId')

    const userId = req.params['userId']
    if(!userId) {
        res.status(400).send({
            error: 'userId required in params!'
        })
    }

    console.debug('userId = ', userId)

    const oauthClient = QuickBooksService.getClient();
    const authUri = QuickBooksService.Auth.buildAuthUri(oauthClient);

    console.info('REDIRECT TO ', authUri)
    console.log('')

    res.cookie('userId', userId)
    res.redirect(authUri);
})

module.exports = router;