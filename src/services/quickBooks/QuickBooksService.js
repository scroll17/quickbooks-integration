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

    return {
        getClient,
        Auth: (() => {
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
                buildAuthUri
            };
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
        }
    }
})()

module.exports = QuickBooksService