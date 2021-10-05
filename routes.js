module.exports = function setRoutes(app) {
    app.get('/', (req, res) => res.redirect('/start'))
}