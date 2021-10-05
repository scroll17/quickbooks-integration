// external modules
const express = require('express');
// routes
const integrationRoute = require('./integrationRoute')

const router = express.Router();

router.use('/integration', integrationRoute);

module.exports = router;