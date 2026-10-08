const H = require('./harness-load.js');
const names = process.argv[2].split(',');
(async () => {
  for (const name of names) {
    const log = await H.runScenario(name);
    console.log('##### SCENARIO ' + name + ' (' + log.length + ' lines)');
    log.slice(0, 40).forEach(l => console.log('  | ' + l.slice(0, 220)));
    console.log('');
  }
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
