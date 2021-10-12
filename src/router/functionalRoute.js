// external modules
const _ = require('lodash')
const express = require('express');
// services
const QuickBooksService = require('../services/quickBooks/QuickBooksService')
// db
const db = require('../../data/index')

const user = db.data.users['pro'];

const router = express.Router();

router.get('/user', (_, res) => {
    console.info('GET /functional/user')
    console.log('')

    return res
        .contentType('text')
        .send(JSON.stringify(user, null, 2))
})

router.get('/select-expense-account-page', (req, res) => {
    console.info('GET /functional/select-expense-account')
    console.info('RENDER select-expense-account.ejs')
    console.log('')

    res.render('select-expense-account.ejs', {})
})

router.post('/select-expense-account/:id', async (req, res) => {
    console.info('POST /functional/select-expense-account/:id')
    console.debug('TRACE req.body\n', req.body)

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

    if(account.AccountType !== 'Cost of Goods Sold') {
        // ERROR
        return res.status(400).send({
            error: 'Account.AccountType must be Cost of Goods Sold'
        })
    }

    user.Accounts = (user.Accounts ?? {});
    user.Accounts.Expense = account

    await db.write();

    res.send({
        redirectTo: '/functional/user'
    })
})

router.get('/select-income-account-page', (req, res) => {
    console.info('GET /functional/select-income-account')
    console.info('RENDER select-income-account.ejs')
    console.log('')

    res.render('select-income-account.ejs', {})
})

router.post('/select-income-account/:id', async (req, res) => {
    console.info('POST /functional/select-income-account/:id')
    console.debug('TRACE req.body\n', req.body)

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
    console.debug('TRACE response QueryResponse:\n', response)
    console.log('')

    res.send({
        data: response.Account
    })
})

router.post('/approve-estimate', async (req, res) => {
    console.info('POST /functional/approve-estimate')
    console.debug('TRACE req.body', req.body)

    const oauthClient = QuickBooksService.getClient(user.tokens);

    const newTokens = await QuickBooksService.Auth.actualizeTokens(oauthClient);
    if(newTokens) {
        const authTokens = JSON.stringify(newTokens, null, 2);
        console.debug('TRACE auth token\n', authTokens)

        user.tokens = newTokens;
        await db.write();
    }

    const currentProject = user.CurrentProject;
    const projectOwner = currentProject.Owner;
    const projectEstimate = currentProject.Estimate;

    const address = _.get(_.split(currentProject.name, '/'), 0);

    let customer = await QuickBooksService.Customer.findByEmail(oauthClient, projectOwner.email);
    if(!customer) {
        console.debug('CUSTOMER by email:', projectOwner.email, 'not exist!');

        customer = await QuickBooksService.Customer.create(oauthClient, {
            ...projectOwner,
            contractAddress: address
        })
        console.debug('CUSTOMER by email:', projectOwner.email, 'created!');
    } else {
        console.debug('CUSTOMER by email:', projectOwner.email, 'exist!');
    }

    console.debug('TRACE CUSTOMER:')
    console.dir(customer, { depth: 10 })

    user.Customer = customer;
    await db.write();
    console.log('DB: SAVED');

    console.log('START CREATE ITEMS')
    const incomeAccount = user.Accounts.Income;
    const expenseAccount = user.Accounts.Expense;

    await Promise.all(
        _.map(projectEstimate.phases, async phase => {
            const item = await QuickBooksService.Item.create(oauthClient, {
                name: phase.name,
                contractAddress: address,
                incomeAccount,
                expenseAccount,
                tasks: phase.tasks
            })
            console.debug('ITEM by phase:', phase.name, 'created!');
            console.debug('TRACE ITEM:')
            console.dir(item, { depth: 10 })

            phase.Item = item;
        })
    )

    await db.write();
    console.log('DB: SAVED');

    console.log('END CREATE ITEMS')
    console.log('')

    return res
        .contentType('text')
        .send(JSON.stringify(user, null, 2))
})

module.exports = router;