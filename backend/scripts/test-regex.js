const line = "VPMN: INDAT Sender: INDAT RAEX IOT Created: 2016-07-22 IOT Effective Date: 2016-08-01";
const regex = /([A-Za-z0-9\s\.\-_]+)[:=]\s*(.*?)(?=\s+[A-Za-z0-9\s\.\-_]+[:=]|$)/g;

let matches;
while ((matches = regex.exec(line)) !== null) {
  console.log(`Key: "${matches[1].trim()}"`);
  console.log(`Value: "${matches[2].trim()}"`);
}
