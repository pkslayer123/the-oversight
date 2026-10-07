// RED TEST (2026-10-07): offerSplit threat-count grammar.
// "Four hum-mice are one threat" (party-formal.js) — but the count word
// renders "1 threats" for a single threat group. Expect "One threat".
const fs = require('fs');
const path = require('path');
const ROOT = '/home/hatch/workspace/the-scattering';
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
const { execSync } = require('child_process');
const order = execSync("grep -o 'src/js/[^\"'']*\\.js' index.html | head -60", { cwd: ROOT }).toString().split('\n').filter(s => s && !/app\.js|sprites\.js|tile-scenes\.js|move-anim\.js/.test(s));
global.window = global;
order.forEach(f => { eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); });
delete global.window;
const Game = globalThis.Scattering.Game;

(async () => {
  await Game.init();
  const said = [];
  // 4 hum-mice = ONE threat group (grouped by mdef.id), but >= 2 foes so the split offer fires
  const foes = [0, 1, 2, 3].map(i => ({ key: 'm_' + i, name: 'the humming in the grass ' + (i + 1), mdef: { id: 'hummice' } }));
  const fake = {
    detectSplitOpportunity: () => foes,
    partyMembers: () => [],
    displayName: () => 'You',
    say: (t) => said.push(String(t)),
  };
  Game.offerSplit.call(fake);
  const text = said.join('\n');
  if (/1 threats/.test(text)) {
    console.log('RED: offerSplit says "1 threats" for a single threat group:');
    console.log(text.split('\n')[0]);
    process.exit(1);
  }
  if (!/One threat/.test(text)) {
    console.log('RED: expected "One threat", got:');
    console.log(text.split('\n')[0]);
    process.exit(1);
  }
  console.log('GREEN: single threat group reads "One threat".');
})().catch(e => { console.error('TEST ERROR:', e.message); process.exit(2); });
