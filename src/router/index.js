// external modules
const express = require('express');
// routes
const integrationRoute = require('./integrationRoute')
const functionalRoute = require('./functionalRoute')

const router = express.Router();

router.use('/integration', integrationRoute);
router.use('/functional', functionalRoute);

module.exports = router;