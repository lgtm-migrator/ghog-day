var express = require('express')
var router = express.Router()
const DB = require('better-sqlite3-helper')

/* GET predictions listing. */
router.get('/', function (req, res) {
  let rows = DB().query('SELECT * FROM predictions')
  res.send(rows)
})

module.exports = router
