'use strict';
const db = require('../db');
db('category_routing').select('*').orderBy('step_order').then(rows => {
  console.log(JSON.stringify(rows, null, 2));
  db.destroy();
}).catch(err => {
  console.error('Query failed:', err.message);
  db.destroy();
  process.exit(1);
});
