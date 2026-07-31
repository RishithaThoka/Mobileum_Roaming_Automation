const { Document, Packer, Paragraph, TextRun, HeadingLevel } = require('/home/claude/ir21-portal/backend/node_modules/docx');
const fs = require('fs');

function section(title) {
  return new Paragraph({ text: title, heading: HeadingLevel.HEADING_2, spacing: { before: 300, after: 150 } });
}
function field(label, value) {
  return new Paragraph({ children: [new TextRun({ text: `${label}: `, bold: true }), new TextRun(value)], spacing: { after: 80 } });
}

function build(fields, outPath) {
  const children = [
    new Paragraph({ text: 'T-Mobile US — IR.21 Master Document', heading: HeadingLevel.TITLE, spacing: { after: 300 } }),
  ];
  for (const [sectionTitle, rows] of Object.entries(fields)) {
    children.push(section(sectionTitle.toUpperCase()));
    rows.forEach(([label, value]) => children.push(field(label, value)));
  }
  const doc = new Document({ sections: [{ properties: {}, children }] });
  return Packer.toBuffer(doc).then(buf => fs.writeFileSync(outPath, buf));
}

const v1 = {
  'Network Technical': [
    ['HLR Global Title', '13125550000'],
    ['Signalling Point Code', '7-88-3'],
    ['GRX IPX Provider', 'Syniverse'],
    ['APN Roaming', 'tmo.us.roaming'],
  ],
  Security: [
    ['Steering Of Roaming Supported', 'true'],
    ['Fraud Contact Email', 'fraud@tmobile-test.example'],
  ],
  Commercial: [
    ['Roaming Agreement Type', 'Bilateral'],
    ['Preferred Roaming Partner Tier', 'Tier1'],
  ],
  'Financial Billing': [
    ['Wholesale Voice Rate', '0.0220'],
    ['Wholesale Data Rate Per MB', '0.0060'],
    ['Currency', 'USD'],
    ['Settlement Contact', 'settlements@tmobile-test.example'],
  ],
  Operations: [
    ['Roaming Operations Manager', 'Jordan Blake'],
    ['Support Hours', '24x7'],
    ['Effective Date', '2026-04-01'],
  ],
};

const v2 = JSON.parse(JSON.stringify(v1));
v2['Network Technical'][0] = ['HLR Global Title', '13125559999'];
v2['Network Technical'][2] = ['GRX IPX Provider', 'BICS'];
v2['Financial Billing'][0] = ['Wholesale Voice Rate', '0.0195'];
v2['Financial Billing'][1] = ['Wholesale Data Rate Per MB', '0.0071'];
v2.Operations[2] = ['Effective Date', '2026-10-01'];
v2.Commercial[1] = ['Preferred Roaming Partner Tier', 'Tier2'];

Promise.all([
  build(v1, '/home/claude/ir21-portal/sample-documents/ir21-docx/TMobileUS_IR21_v1.docx'),
  build(v2, '/home/claude/ir21-portal/sample-documents/ir21-docx/TMobileUS_IR21_v2.docx'),
]).then(() => console.log('done'));
