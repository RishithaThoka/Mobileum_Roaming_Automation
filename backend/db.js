// Thin re-export — all routes and services that do require('../db') or
// require('./db') now receive the shared Knex instance.  The real connection
// factory, migration runner, and startup helpers live in db/index.js.
module.exports = require('./db/index');
