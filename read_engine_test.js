// read_engine_unit_test.js -- temp utility to view file contents
const fs = require('fs');
const content = fs.readFileSync('./backend/tests/test_workflow_engine_unit.js', 'utf8');
// Print first 200 lines
const lines = content.split('\n').slice(0, 200);
lines.forEach((l, i) => console.log(`${i+1}: ${l}`));
