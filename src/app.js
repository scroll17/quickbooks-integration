// extended modules
const express = require('express');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const dotenv = require('dotenv');
const path = require('path')
const ngrok = require('ngrok')
// db
const db = require('../data/index.js')

dotenv.config();

// constants
const PORT = process.env.PORT

// def app
const app = express();

app.set('port', PORT)
app.set('views', path.join(__dirname, 'views'));

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser())

app.use(require('./router'))

const server = app.listen(app.get('port'), async () => {
    console.log('Express server listening on port ' + app.get('port') + '\n');

    const url = await ngrok.connect(app.get('port'));
    console.log('NGROK url:', url, '\n')
});

// exit
process.on('SIGINT', () => {
    console.info('-- SIGINT signal received. --');

    server.close(() => {
        console.log('-- SERVER CLOSED --')
    });

    db.writeSync();
    console.log('-- DB SAVED --');

    console.log('-- EXIT --')
    process.exit()
})