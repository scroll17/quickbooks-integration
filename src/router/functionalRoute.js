// external modules
const _ = require('lodash')
const express = require('express');
const Joi = require('joi');
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

    const oauthClient = await QuickBooksService.getUpToDateClient(user.tokens, db, user)

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

    const oauthClient = await QuickBooksService.getUpToDateClient(user.tokens, db, user)

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

    const oauthClient = await QuickBooksService.getUpToDateClient(user.tokens, db, user)

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

    const oauthClient = await QuickBooksService.getUpToDateClient(user.tokens, db, user)

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

router.post('/request-payout', async (req, res) => {
    console.info('POST /functional/request-payout')
    console.debug('TRACE req.body', req.body)

    const phaseName = req.body['phaseName']
    if(!phaseName) {
        return res.status(400).send({
            error: 'phase name in body not exist!'
        })
    }
    console.debug('phaseName =', phaseName)

    const oauthClient = await QuickBooksService.getUpToDateClient(user.tokens, db, user)

    const customer = user.Customer;
    const currentProject = user.CurrentProject;
    const projectOwner = currentProject.Owner;

    const phase = currentProject.Estimate.phases.find(p => p.name === phaseName);
    if(!phase) {
        return res.status(404).send({
            error: 'phase not found!'
        })
    }

    console.log('START CREATE INVOICE')
    const invoice = await QuickBooksService.Invoice.create(oauthClient, {
        customer,
        customerEmail: projectOwner.email,
        needPay: true,
        phaseName,
        phaseAmount: _.sumBy(phase.tasks, t => t.cost),
        item: phase.Item
    })
    console.log('INVOICE CREATED')

    console.debug('TRACE INVOICE:')
    console.dir(invoice, { depth: 10 })

    phase.Invoice = invoice;

    await db.write();
    console.log('DB: SAVED');
    console.log('');

    return res
        .contentType('text')
        .send(JSON.stringify(user, null, 2))
})

router.post('/approve-payout', async (req, res) => {
    console.info('POST /functional/approve-payout')
    console.debug('TRACE req.body', req.body)

    const phaseName = req.body['phaseName']
    if(!phaseName) {
        return res.status(400).send({
            error: 'phase name in body not exist!'
        })
    }
    console.debug('phaseName =', phaseName)

    const oauthClient = await QuickBooksService.getUpToDateClient(user.tokens, db, user)

    const customer = user.Customer;
    const currentProject = user.CurrentProject;

    const phase = currentProject.Estimate.phases.find(p => p.name === phaseName);
    if(!phase) {
        return res.status(404).send({
            error: 'phase not found!'
        })
    }

    console.log('START CREATE PAYMENT')
    const payment = await QuickBooksService.Payment.createFakeInvoicePayment(oauthClient, {
        customer,
        amount: phase.Invoice.TotalAmt,
        date: new Date(Date.now() + (1000 * 60 * 60 * 24)), // next day
        invoiceId: phase.Invoice.Id
    })
    console.log('PAYMENT CREATED')

    console.debug('TRACE PAYMENT:')
    console.dir(payment, { depth: 10 })

    phase.Payment = payment;

    await db.write();
    console.log('DB: SAVED');
    console.log('');

    console.log('REQUEST UPDATED INVOICE')
    const updatedInvoice = await QuickBooksService.Invoice.getById(oauthClient, phase.Invoice.Id);

    console.debug('TRACE UPDATED INVOICE:')
    console.dir(updatedInvoice, { depth: 10 })

    phase.UpdatedInvoice = updatedInvoice;

    await db.write();
    console.log('DB: SAVED');
    console.log('');

    return res
        .contentType('text')
        .send(JSON.stringify(user, null, 2))
})

router.post('/create-phase', async (req, res) => {
    console.info('POST /functional/create-phase')
    console.debug('TRACE req.body', req.body)

    const { value, error } = Joi
        .object({
            name: Joi
                .string()
                .required(),
            tasks: Joi
                .array()
                .items(
                    Joi.object({
                        name: Joi.string().required(),
                        cost: Joi.number().required()
                    })
                )
                .required()
        })
        .validate(req.body);
    if(error) {
        throw new Error(error.message)
    }

    const newPhase = value;
    const oauthClient = await QuickBooksService.getUpToDateClient(user.tokens, db, user);

    const currentProject = user.CurrentProject;
    const incomeAccount = user.Accounts.Income;
    const expenseAccount = user.Accounts.Expense;

    const address = _.get(_.split(currentProject.name, '/'), 0);

    const phases = user.CurrentProject.Estimate.phases;
    if(_.find(phases, { name: newPhase.name })) {
        throw new Error(`Phases with passed name already exist`)
    }

    console.log('START CREATE ITEM FOR NEW PHASE')
    const item = await QuickBooksService.Item.create(oauthClient, {
        name: newPhase.name,
        contractAddress: address,
        incomeAccount,
        expenseAccount,
        tasks: newPhase.tasks
    })
    console.debug('ITEM CREATED');
    console.debug('TRACE ITEM:')
    console.dir(item, { depth: 10 })

    newPhase.Item = item;
    phases.push(newPhase);

    await db.write();
    console.log('DB: SAVED');
    console.log('')

    return res
        .contentType('text')
        .send(JSON.stringify(phases, null, 2))
})

router.put('/update-phase', async (req, res) => {
    console.info('PUT /functional/update-phase')
    console.debug('TRACE req.body', req.body)

    const { value, error } = Joi
        .object({
            name: Joi
                .string()
                .required(),
            tasks: Joi
                .array()
                .items(
                    Joi.object({
                        name: Joi.string().required(),
                        cost: Joi.number().required()
                    })
                )
                .required()
        })
        .validate(req.body);
    if(error) {
        throw new Error(error.message)
    }

    let updatedPhase = value;
    const oauthClient = await QuickBooksService.getUpToDateClient(user.tokens, db, user);

    const currentProject = user.CurrentProject;
    const phases = user.CurrentProject.Estimate.phases;

    const oldPhaseIndex = _.findIndex(phases, { name: updatedPhase.name });
    const oldPhase = phases[oldPhaseIndex];
    if(!oldPhase) {
        throw new Error(`Phases not found`)
    }

    if(_.isEqual(oldPhase.tasks, updatedPhase.tasks)) {
        return res.status(202).send({
            message: 'Tasks not updated'
        })
    }

    updatedPhase = phases[oldPhaseIndex] = {
        ...oldPhase,
        ...updatedPhase
    };

    console.log('START UPDATE ITEM')
    const item = await QuickBooksService.Item.update(oauthClient, {
        itemId: updatedPhase.Item.Id,
        tasks: updatedPhase.tasks
    })
    console.debug('ITEM UPDATE');
    console.debug('TRACE ITEM:')
    console.dir(item, { depth: 10 })

    updatedPhase.Item = item;

    await db.write();
    console.log('DB: SAVED');

    if(updatedPhase.Invoice) {
        console.log('PHASE HAVE INVOICE')

        console.log('START UPDATE INVOICE')
        const invoice = await QuickBooksService.Invoice.update(oauthClient, {
            invoiceId: updatedPhase.Invoice.Id,
            phaseAmount: _.sumBy(updatedPhase.tasks, t => t.cost)
        })
        console.debug('INVOICE UPDATE');
        console.debug('TRACE INVOICE:')
        console.dir(item, { depth: 10 })

        updatedPhase.Invoice = invoice;

        await db.write();
        console.log('DB: SAVED');
    }

    return res
        .contentType('text')
        .send(JSON.stringify(user, null, 2))
})

module.exports = router;