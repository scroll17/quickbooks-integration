// external modules
const express = require('express');
// services
const QuickBooksService = require('../services/quickBooks/QuickBooksService')
// db
const db = require('../../data/index')

const user = db.data.users['asdas'];

const router = express.Router();

router.get('/user', (_, res) => {
    res.contentType('text').send(JSON.stringify(user, null, 2))
})

router.get('/select-income-account-page', (req, res) => {
    console.info('GET /functional/select-income-account')
    console.info('RENDER select-income-account.ejs')
    console.log('')

    res.render('select-income-account.ejs', {})
})

router.get('/select-expense-account-page', (req, res) => {
    console.info('GET /functional/select-expense-account')
    console.info('RENDER select-expense-account.ejs')
    console.log('')

    res.render('select-expense-account.ejs', {})
})

router.get('/select-expense-account/:id', async (req, res) => {
    console.info('GET /select-expense-account/:id')

    const oauthClient = QuickBooksService.getClient(user.tokens);

    const newTokens = await QuickBooksService.Auth.actualizeTokens(oauthClient);
    if(newTokens) {
        const authTokens = JSON.stringify(newTokens, null, 2);
        console.debug('TRACE auth token\n', authTokens)

        user.tokens = newTokens;
        await db.write();
    }

    const accountId = req.params['id']
    if(!accountId) {
        return res.status(400).send({
            error: 'id in param not exist!'
        })
    }
    console.debug('accountId =', accountId)

    const account = await QuickBooksService.Account.getById(oauthClient, accountId);
    console.debug('TRACE account:\n', account)
    console.log('')

    if(!account.Active) {
        // ERROR
        return res.status(400).send({
            error: 'Account must be Active'
        })
    }

    if(account.AccountType !== 'Expense') {
        // ERROR
        return res.status(400).send({
            error: 'Account.AccountType must be Expense'
        })
    }

    user.Accounts = (user.Accounts ?? {});
    user.Accounts.Expense = account

    await db.write();

    res.send({
        redirectTo: '/functional/user'
    })
})

router.get('/select-income-account/:id', async (req, res) => {
    console.info('GET /select-income-account/:id')

    const oauthClient = QuickBooksService.getClient(user.tokens);

    const newTokens = await QuickBooksService.Auth.actualizeTokens(oauthClient);
    if(newTokens) {
        const authTokens = JSON.stringify(newTokens, null, 2);
        console.debug('TRACE auth token\n', authTokens)

        user.tokens = newTokens;
        await db.write();
    }

    const accountId = req.params['id']
    if(!accountId) {
        return res.status(400).send({
            error: 'id in param not exist!'
        })
    }
    console.debug('accountId =', accountId)

    const account = await QuickBooksService.Account.getById(oauthClient, accountId);
    console.debug('TRACE account:\n', account)
    console.log('')

    if(!account.Active) {
        // ERROR
        return res.status(400).send({
            error: 'Account must be Active'
        })
    }

    if(account.AccountType !== 'Income') {
        // ERROR
        return res.status(400).send({
            error: 'Account.AccountType must be Income'
        })
    }

    user.Accounts = (user.Accounts ?? {});
    user.Accounts.Income = account;

    await db.write();

    res.send({
        redirectTo: '/functional/user'
    })
})

router.get('/find-account', async (req, res) => {
    console.info('GET /functional/find-account')

    const oauthClient = QuickBooksService.getClient(user.tokens);

    const newTokens = await QuickBooksService.Auth.actualizeTokens(oauthClient);
    if(newTokens) {
        const authTokens = JSON.stringify(newTokens, null, 2);
        console.debug('TRACE auth token\n', authTokens)

        user.tokens = newTokens;
        await db.write();
    }

    const accountName = req.query['name']
    if(!accountName) {
        return res.send({
            text: 'in query option "name" is required!',
            status: 400
        })
    }

    const response = await QuickBooksService.select(oauthClient, {
        from: 'Account',
        select: ['Name', 'AccountType', 'AccountSubType'],
        where: {
            'Name': {
                op: 'like',
                value: `${accountName}%`
            }
        }
    });
    console.debug('TRACE response QueryResponse:\n', response.getJson().QueryResponse)
    console.log('')

    res.send({
        data: response.getJson().QueryResponse.Account
    })
})

module.exports = router;