// extended modules
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios')
const dotenv = require('dotenv');

dotenv.config();

// constants
const port = process.env.PORT
const consumerKey = process.env.CONSUMER_KEY;
const consumerSecret = process.env.CONSUMER_SECRET;

// def app
const app = express();

app.set('port', port)
app.set('views', 'views');

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.listen(app.get('port'), function () {
    console.log('Express server listening on port ' + app.get('port'));
});

const { setRoutes } = require('./routes')
setRoutes(app);