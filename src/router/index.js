// external modules
const express = require('express');
// routes
const integrationRoute = require('./integrationRoute')
const functionalRoute = require('./functionalRoute')
const webhookRoute = require('./webhookRoute')

const router = express.Router();

router.use('/integration', integrationRoute);
router.use('/functional', functionalRoute);
router.use('/webhook', webhookRoute);

module.exports = router;