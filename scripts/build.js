const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const schedule = JSON.parse(fs.readFileSync(path.join(root, 'lib/schedule.json'), 'utf8'));
const logic = fs.readFileSync(path.join(root, 'lib/logic.js'), 'utf8');
for (const [name, content] of [['SCHEDULE', 'const SCHEDULE = ' + JSON.stringify(schedule).replace(/</g, '\\u003c') + ';'], ['LOGIC', logic], ['ACCOUNT', fs.readFileSync(path.join(root,'lib/account-client.js'),'utf8')]]) {
  const pattern = new RegExp('/\\* ' + name + ':START \\*/[\\s\\S]*?/\\* ' + name + ':END \\*/');
  if (!pattern.test(html)) throw new Error('Missing build markers: ' + name);
  html = html.replace(pattern, () => '/* ' + name + ':START */\n' + content.trim() + '\n/* ' + name + ':END */');
}
fs.writeFileSync(path.join(root, 'index.html'), html);
fs.mkdirSync(path.join(root, 'public'), {recursive:true});
fs.writeFileSync(path.join(root, 'public/index.html'), html);
console.log('Inlined shared rules and unchanged 2026 schedule into index.html.');
