const db = require('../db');
(async () => {
  try {
    const wfRows = await db('document_workflow_state').select('*');
    console.log('=== document_workflow_state ===');
    console.log(JSON.stringify(wfRows, null, 2));
    
    const docs = await db('documents').select('id','title','doc_type','operator_id');
    console.log('\n=== documents ===');
    console.log(JSON.stringify(docs, null, 2));

    const versions = await db('document_versions').select('id','document_id','version_number','original_filename');
    console.log('\n=== document_versions ===');
    console.log(JSON.stringify(versions, null, 2));

    const diffs = await db('diffs').select('id','document_id','total_changes','status');
    console.log('\n=== diffs ===');
    console.log(JSON.stringify(diffs, null, 2));
  } catch(e) {
    console.error(e);
  }
  process.exit(0);
})();
