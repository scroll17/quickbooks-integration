/**
 *  Description:
 *    - Integration only for Pro
 *    - Integration like Stripe
 *
 *  Plan:
 *    1. On Setting page user can connect to QuickBooks
 *    2. Define webhooks for work with QuickBooks
 *    3. Realise QuickBooksService
 *    4. Integration
 *    5. Test
 *
 *  Work:
 *    1. On "Approve Estimate" -> create Customer/Job
 *    2. Skip "Actual Cost per Payout Request"
 *    3. Create / update (or not) Invoice if:
 *      - "Pro Request Payout"
 *      - "Client approved payment" (Owner approve payout) (Skip for Subscription Plan)
 *      - "Approved Change Order"
 *   4. Now ignore "Timeclock Entries"
 *
 *    For Subscription only:
 *      - Wait "Client paid" from QuickBooks after "Client approved payment"
 *
 *   Updated Plan:
 *      +1. Pro connect QuickBooks Account (Income type)
 *      +2. When "Estimate Approve" we create Customer(if not exist) for selected QuickBooks Account by current Project
 *        2.1. Create by each Phase Item in QuickBooks and in description write list tasks
 *        2.2. If Item with passed name exist - create Item with Name - Contract Name
 *      +3. When Pro request Payout - need create Invoice (QuickBooks)
 *      -4. Client approve payment / Client paid:
 *          For Subscription Plan:
 *            -4.1. By webhook we wait notification about Invoice paid (Invoice.Balance = 0.0) and then make Payment Release as succeeded
 *            +4.2. We block Mutation releaseFundPhase
 *          For default plan:
 *            +4.2. In QuickBooks we make Invoice as paid
 *      +5. When Approve Change Order in short - we need create or update Item cost / description
 *      -6. Implement a webhook:
 *          6.1. Wait Invoice update (for check is paid and "Balance"=0)
 *          +6.2. Wait Item update (updated Name)
 *          6.3. Wait Customer update (update Display Name)
 *          6.4. Wait Account update (update Name)
 *      N:
 *          + need job for check refresh token expires (if <= week then need refresh)
 *
 *  Helpful links:
 *      https://help.developer.intuit.com/s/question/0D5G000004Dk6N0/can-you-use-the-api-to-mark-an-invoice-as-paid
 * */

// external modules
const _ = require('lodash')
const dotenv = require('dotenv');
const OAuthClient = require('intuit-oauth');

const QuickBooksService = (() => {
    dotenv.config();

    const isDevEnv = process.env.ENV === 'develop';

    const COMPANY_NAME = process.env.COMPANY_NAME
    const COMPANY_URL = `http:${process.env.HOST}:${process.env.PORT}/`

    const REALM_ID = process.env.REALM_ID
    const CONSUMER_KEY = process.env.QUICK_BOOKS_CONSUMER_KEY;
    const CONSUMER_SECRET = process.env.QUICK_BOOKS_CONSUMER_SECRET;
    const ENVIRONMENT = process.env.QUICK_BOOKS_ENVIRONMENT;
    const REDIRECT_URI = process.env.QUICK_BOOKS_REDIRECT_URI;

    const APP_CENTER_BASE = 'https://appcenter.intuit.com';
    const MINOR_VERSION = 'minorversion=62'

    function getClient(tokenOptions) {
        const oauthClient = new OAuthClient({
            clientId: CONSUMER_KEY,
            clientSecret: CONSUMER_SECRET,
            environment: ENVIRONMENT,
            redirectUri: REDIRECT_URI,
            logging: isDevEnv
        })

        if(tokenOptions) oauthClient.setToken(tokenOptions)

        return oauthClient;
    }

    /**
     *  @param {object} tokens
     *  @param {object} db
     *  @param {object} userData
     * */
    async function getUpToDateClient(tokens, db, userData) {
        const oauthClient = QuickBooksService.getClient(tokens);

        const newTokens = await QuickBooksService.Auth.actualizeTokens(oauthClient);
        if(newTokens) {
            const authTokens = JSON.stringify(newTokens, null, 2);
            console.debug('TRACE auth token\n', authTokens)

            userData.tokens = newTokens;
            await db.write();
        }

        return oauthClient
    }

    /**
     *  @param {object} oauthClient
     *  @param {object} options
     * */
    async function select(oauthClient, options) {
        const selectStatement = buildSelectStatement(options);

        const response = await oauthClient.makeApiCall({
            url: `https://sandbox-quickbooks.api.intuit.com/v3/company/${REALM_ID}/query?query=${selectStatement}&${MINOR_VERSION}`,
            method: 'GET'
        })

        return response.getJson().QueryResponse;
    }

    /**
     *  @param {object} oauthClient
     *  @param {string} entityName
     *  @param {string} entityId
     * */
    async function getActualSyncToken(oauthClient, entityName, entityId) {
        const selectStatement = buildSelectStatement({
            from: entityName,
            select: ['SyncToken'],
            where: {
                Id: entityId
            }
        });

        const response = await oauthClient.makeApiCall({
            url: `https://sandbox-quickbooks.api.intuit.com/v3/company/${REALM_ID}/query?query=${selectStatement}&${MINOR_VERSION}`,
            method: 'GET'
        })

        const jsonResponse = response.getJson();
        return _.get(jsonResponse, ['QueryResponse', entityName, 0, 'SyncToken']);
    }


    /**
     *  @param {string} options.from
     *  @param {string[] | undefined} options.select
     *  @param {object | undefined} options.where
     *  @param {number | undefined} options.offset
     *  @param {number | undefined} options.limit
     *
     *  @return string
     * */
    function buildSelectStatement(options) {
        let result = `select `;

        // select
        if(!_.isEmpty(options.select)) {
            result += options.select.join(',') + ' '
        } else {
            result += '*' + ' '
        }

        // from
        result += `from ${options.from} `

        // where
        if(!_.isEmpty(options.where)) {
            const statements = _.map(
                Object.entries(options.where),
                ([key, value]) => {
                    if(_.isObject(value)) {
                        if(_.isString(value.value) && _.includes(value.value, '%')) {
                            value.value = value.value.replace('%', '%25')
                        }

                        return `${key} ${value.op} ${
                            _.isBoolean(value.value) ? value.value : `'${value.value}'`
                        }`
                    }

                    return `${key} = ${
                        _.isBoolean(value) ? value : `'${value}'` 
                    }`
                }
            )

            result += 'where ' + statements.join(' AND ') + ' '
        }

        // offset
        if(options.offset) {
            result += `STARTPOSITION ${options.offset}` + ' '
        }

        // limit
        if(options.limit) {
            result += `MAXRESULTS ${options.limit}`
        }

        console.debug('SELECT STATEMENT =', result)

        return result;
    }

    return {
        Auth: (() => {
            /**
             *  @param {object} oauthClient
             *  @return {null | object} result
             * */
            async function actualizeTokens(oauthClient) {
                if(!oauthClient.isAccessTokenValid()) {
                    const authResponse = await oauthClient.refresh();

                    return {
                        ...authResponse.getJson(),
                        createdAt: Date.now()
                    }
                }

                return null;
            }

            /**
             *  @param {object} oauthClient
             *  @param {string | undefined} payload
             *  @return {string} result
             * */
            function buildAuthUri(oauthClient, payload) {
                return oauthClient.authorizeUri({
                    scope: [
                        OAuthClient.scopes.Accounting,
                        OAuthClient.scopes.Payment,
                        OAuthClient.scopes.OpenId
                    ],
                    state: payload,
                    /**
                     *   The purpose of the state field is to validate if the client (i.e. your app) gets back what was sent in the original request.
                     *   Thus, the state is maintained from send to response.
                     *
                     *   By default OAuthClient use CSRF token
                     **/
                });
            }

            return {
                buildAuthUri,
                actualizeTokens
            };
        })(),
        Account: (() => {
            /**
             *  @param {object} oauthClient
             *  @param {string} accountId
             * */
            async function getById(oauthClient, accountId) {
                const response = await oauthClient.makeApiCall({
                    url: `https://sandbox-quickbooks.api.intuit.com/v3/company/${REALM_ID}/account/${accountId}?${MINOR_VERSION}`,
                    method: 'GET'
                })

                return response.getJson().Account
            }

            /**
             *  @param {object} oauthClient
             *  @param {object} params
             * */
            async function create(oauthClient, params) {
                const response = await oauthClient.makeApiCall({
                    url: `https://sandbox-quickbooks.api.intuit.com/v3/company/${REALM_ID}/account?${MINOR_VERSION}`,
                    method: 'POST',
                    body: params
                })

                return response.getJson().Account
            }

            return {
                getById,
                create,
            }
        })(),
        Customer: (() => {
            /**
             *  @param {object} oauthClient
             *  @param {string} email
             * */
            async function findByEmail(oauthClient, email) {
                const response = await QuickBooksService.select(oauthClient, {
                    from: 'Customer',
                    select: ['*'],
                    where: {
                        'PrimaryEmailAddr': email
                    }
                });

                return response.Customer
            }

            /**
             *  @param {object} oauthClient
             *  @param {object} params
             * */
            async function create(oauthClient, params) {
                const {
                    username,
                    email,
                    firstName,
                    lastName,
                    phone,
                    contractAddress
                } = params;

                const [
                    city,
                    state,
                    postalCodeRaw
                ] = contractAddress.trim().split(',');

                let postalCode = postalCodeRaw.trim();
                postalCode = postalCode.slice(postalCode.indexOf(' ') + 1);

                const response = await oauthClient.makeApiCall({
                    url: `https://sandbox-quickbooks.api.intuit.com/v3/company/${REALM_ID}/customer?${MINOR_VERSION}`,
                    method: 'POST',
                    body: {
                        ...(username ? { Title: username } : {}),
                        GivenName: firstName,
                        FamilyName: lastName,
                        PrimaryEmailAddr: {
                            Address: email
                        },
                        PrimaryPhone: {
                            FreeFormNumber: phone
                        },
                        BillAddr: {
                            Country: 'USA',
                            CountrySubDivisionCode: state,
                            City: city,
                            PostalCode: postalCode
                        },
                        CompanyName: COMPANY_NAME,
                        WebAddr: {
                            URI: COMPANY_URL
                        },
                        PreferredDeliveryMethod: 'Email',
                        // IsProject: true // TODO: is need ?
                    }
                })

                return response.getJson().Customer
            }

            return {
                findByEmail,
                create
            }
        })(),
        Item: (() => {
            /**
             *  @param {string} name
             *  @param {string} contractName
             *  @return string
             * */
            function buildItemName(name, contractName) {
                contractName = contractName.trim();

                const nameLen = name.length;
                const contractNameLen = contractName.length;

                const separator = ' - ';
                const separatorLen = separator.length;

                if((nameLen + contractNameLen + separatorLen) <= 100) {
                    return name + separator + contractName;
                }

                const partsOfContractName = _.chain(contractName)
                    .split(',')
                    .map(part => part.trim())
                    .value();

                let resultName = name + separator;
                let partsToConcatenate = [];
                while(partsOfContractName.length > 0) {
                    const part = partsOfContractName.pop();
                    const otherPartsLen = _.sumBy(partsToConcatenate, part => part.length + ', '.length);

                    if((resultName.length + otherPartsLen + part.length) > 100) {
                        break;
                    }

                    partsToConcatenate.push(part);
                }

                if(partsToConcatenate.length) {
                    return resultName + partsToConcatenate.reverse().join(', ')
                }

                return resultName.slice(0, -separatorLen)
            }

            /**
             *  @param {object} oauthClient
             *  @param {object} params
             * */
            async function create(oauthClient, params) {
                const {
                    name,
                    contractAddress,
                    incomeAccount,
                    expenseAccount,
                    tasks
                } = params;

                const itemName = buildItemName(name, contractAddress);

                const price = _.sumBy(tasks, t => t.cost);
                const description = _.map(tasks, (t, i) => `[${i + 1}]: ${t.name}`).join(';\n');

                const response = await oauthClient.makeApiCall({
                    url: `https://sandbox-quickbooks.api.intuit.com/v3/company/${REALM_ID}/item?${MINOR_VERSION}`,
                    method: 'POST',
                    body: {
                        Name: itemName,
                        Type: 'Service',
                        IncomeAccountRef: {
                            name: incomeAccount.Name,
                            value: incomeAccount.Id
                        },
                        ExpenseAccountRef: {
                            name: expenseAccount.Name,
                            value: expenseAccount.Id
                        },
                        Description: description,
                        UnitPrice: price
                    }
                })

                return response.getJson().Item
            }

            /**
             *  @param {object} oauthClient
             *  @param {object} params
             * */
            async function update(oauthClient, params) {
                const {
                    itemId,
                    tasks
                } = params;

                const price = _.sumBy(tasks, t => t.cost);
                const description = _.map(tasks, (t, i) => `[${i + 1}]: ${t.name}`).join(';\n');

                const syncToken = await getActualSyncToken(oauthClient, 'Item', itemId)

                const response = await oauthClient.makeApiCall({
                    url: `https://sandbox-quickbooks.api.intuit.com/v3/company/${REALM_ID}/item?${MINOR_VERSION}`,
                    method: 'POST',
                    body: {
                        sparse: true,
                        Id: itemId,
                        SyncToken: syncToken,
                        Description: description,
                        UnitPrice: price
                    }
                })

                return response.getJson().Item
            }

            return {
                create,
                update
            }
        })(),
        Invoice: (() => {
            /**
             *  @param {object} oauthClient
             *  @param {object} params
             * */
            async function create(oauthClient, params) {
                const {
                    customer,
                    customerEmail,
                    needPay,
                    phaseName,
                    phaseAmount,
                    item
                } = params;

                const response = await oauthClient.makeApiCall({
                    url: `https://sandbox-quickbooks.api.intuit.com/v3/company/${REALM_ID}/invoice?${MINOR_VERSION}`,
                    method: 'POST',
                    body: {
                        CurrencyRef: {
                            value: 'USD',
                            name: 'United States Dollar'
                        },
                        CustomerRef: {
                            value: customer.Id,
                            name: customer.DisplayName
                        },
                        Line: [{
                            DetailType: 'SalesItemLineDetail',
                            LineNum: 1,
                            Description: `Pay for ${phaseName}`,
                            Amount: phaseAmount,
                            SalesItemLineDetail: {
                                ItemRef: {
                                    value: item.Id,
                                    name: item.Name
                                }
                            }

                        }],
                        BillEmail: {
                            Address: customerEmail
                        },
                        PrintStatus: needPay ? 'NeedToPrint' : 'NotSet',
                        EmailStatus: needPay ? 'NeedToSend' : 'EmailSent'
                    }
                })

                return response.getJson().Invoice
            }

            /**
             *  @param {object} oauthClient
             *  @param {object} params
             * */
            async function update(oauthClient, params) {
                const {
                    invoiceId,
                    phaseAmount,
                } = params;

                const queryResult = await select(oauthClient, {
                    from: 'Invoice',
                    select: ['Line', 'SyncToken'],
                    where: {
                        Id: invoiceId
                    }
                })

                const invoice = queryResult.Invoice[0];
                const syncToken = invoice.SyncToken
                const lines = invoice.Line;

                const lineForUpdate = _.find(lines, { Id: '1' });
                lineForUpdate.Amount = phaseAmount;

                const response = await oauthClient.makeApiCall({
                    url: `https://sandbox-quickbooks.api.intuit.com/v3/company/${REALM_ID}/invoice?${MINOR_VERSION}`,
                    method: 'POST',
                    body: {
                        sparse: true,
                        Id: invoiceId,
                        SyncToken: syncToken,
                        TxnTaxDetail: null,
                        Line: lines
                    }
                })

                return response.getJson().Invoice
            }

            /**
             *  @param {object} oauthClient
             *  @param {string} invoiceId
             * */
            async function getById(oauthClient, invoiceId) {
                const response = await oauthClient.makeApiCall({
                    url: `https://sandbox-quickbooks.api.intuit.com/v3/company/${REALM_ID}/invoice/${invoiceId}?${MINOR_VERSION}`,
                    method: 'GET'
                })

                return response.getJson().Invoice
            }

            return {
                create,
                update,
                getById
            }
        })(),
        Payment: (() => {
            /**
             *  @param {object} oauthClient
             *  @param {object} params
             * */
            async function createFakeInvoicePayment(oauthClient, params) {
                const {
                    customer,
                    amount,
                    invoiceId,
                    date
                } = params;

                const response = await oauthClient.makeApiCall({
                    url: `https://sandbox-quickbooks.api.intuit.com/v3/company/${REALM_ID}/payment?${MINOR_VERSION}`,
                    method: 'POST',
                    body: {
                        ...(date ? { TxnDate: date } : {}),
                        TotalAmt: amount,
                        CustomerRef: {
                            value: customer.Id,
                            name: customer.DisplayName
                        },
                        CurrencyRef: {
                            value: 'USD',
                            name: 'United States Dollar'
                        },
                        Line: [
                            {
                                Amount: amount,
                                LinkedTxn: [
                                    {
                                        TxnId: invoiceId,
                                        TxnType: 'Invoice'
                                    }
                                ]
                            }
                        ]
                    }
                })

                return response.getJson().Payment
            }

            return {
                createFakeInvoicePayment
            }
        })(),
        Constants: {
            REALM_ID,
            APP_CENTER_BASE,
            MINOR_VERSION
        },
        getClient,
        getUpToDateClient,
        getActualSyncToken,
        select
    }
})()

module.exports = QuickBooksService