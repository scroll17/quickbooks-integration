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
 *      - "Client approved payment" (Owner approve payout)
 *      - "Approved Change Order"
 *   4. Now ignore "Timeclock Entries"
 *
 *    For Subscription only:
 *      - Wait "Client paid" from QuickBooks after "Client approved payment"
 * */

// external modules
const _ = require('lodash')
const dotenv = require('dotenv');
const OAuthClient = require('intuit-oauth');

const QuickBooksService = (() => {
    dotenv.config();

    const isDevEnv = process.env.ENV === 'develop';

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
     *  @param {object} oauthClient
     *  @param {object} options
     * */
    async function select(oauthClient, options) {
        const selectStatement = buildSelectStatement(options);

        return oauthClient.makeApiCall({
            url: `https://sandbox-quickbooks.api.intuit.com/v3/company/${REALM_ID}/query?query=${selectStatement}&${MINOR_VERSION}`,
            method: 'GET'
        })
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

        // offset
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
                    const authTokens = JSON.stringify(authResponse.getJson(), null, 2);
                    console.debug('TRACE auth token\n', authTokens)

                    return {
                        ...authResponse.getJson(),
                        createdAt: Date.now()
                    }
                }

                return null;
            }

            /**
             *  @param {object} oauthClient
             *  @return {string} result
             * */
            function buildAuthUri(oauthClient) {
                return oauthClient.authorizeUri({
                    scope: [
                        OAuthClient.scopes.Accounting,
                        OAuthClient.scopes.Payment,
                        OAuthClient.scopes.OpenId
                    ],
                    state: 'test',
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

            return {
                getById
            }
        })(),
        Customer: (() => {

            return {}
        })(),
        Invoice: (() => {

            return {}
        })(),
        Constants: {
            REALM_ID,
            APP_CENTER_BASE
        },
        getClient,
        select
    }
})()

module.exports = QuickBooksService