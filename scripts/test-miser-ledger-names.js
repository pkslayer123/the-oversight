// Stash ledger names: entries must never collapse to bare "A".
// Steve's knowledge law: unknown villagers show descriptors, known ones
// show first names — and the ledger must distinguish people either way.
// Regression: stashLedgerText used displayName.split(' ')[0], rendering
// every unknown villager as "A" ("day 1: A took 3x Wood log").
// Usage: node scripts/test-miser-ledger-names.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/party.js', 'src/js/justice.js',
 'src/js/conversation.js', 'src/js/truth.js', 'src/js/betrayal.js',
 'src/js/journal.js', 'src/js/storage.js', 'src/js/perceive.js'
].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log('FAIL:', name, extra === undefined ? '' : String(extra).slice(0, 200)); }
}

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  Game.log.length = 0;
  const s = () => Game.state.scholar;
  const ME = () => s().villagerId;
  const others = (Game.state.village.roster || []).filter(id => id !== ME());
  ok('roster has others', others.length >= 2, 'got ' + others.length);

  // --- 1. nobody known yet: log takes/gives by several villagers ---
  const v1 = others[0], v2 = others[1];
  ok('v1 name unknown at start', !Game.nameKnown(v1));
  Game.stashLog('give', 'Wood log', 5, v1);
  Game.stashLog('take', 'Branch', 2, v2);
  Game.stashLog('take', 'Stone', 1, null); // anonymous skim: vid null
  const text = Game.stashLedgerText(5);
  const lines = text.split('\n');
  ok('3 ledger lines', lines.length === 3, text);
  // no bare "A" who — the regression
  ok('no bare-A who', !lines.some(l => /: A (took|left) /.test(l)), text);
  // each named entry matches firstRef exactly
  ok('v1 entry uses firstRef', lines.some(l => l.includes(Game.firstRef(v1)) && l.includes('left 5× Wood log')), text);
  ok('v2 entry uses firstRef', lines.some(l => l.includes(Game.firstRef(v2)) && l.includes('took 2× Branch')), text);
  ok('null-vid entry says someone', lines.some(l => l.includes('someone took 1× Stone')), text);
  // unknown villagers get distinguishing descriptors, not one shared "A"
  const who1 = lines.find(l => l.includes('Wood log')).split(': ')[1].split(' left')[0];
  const who2 = lines.find(l => l.includes('Branch')).split(': ')[1].split(' took')[0];
  ok('unknown whos differ per person', who1 !== who2, `${who1} vs ${who2}`);
  ok('unknown who is descriptor-like', /the /.test(who1), who1);

  // --- 2. after learning a name: first name appears ---
  Game.revealName(v1, 'intro');
  Game.log.length = 0;
  ok('v1 name known now', Game.nameKnown(v1));
  Game.stashLog('give', 'Plant fiber', 3, v1);
  const text2 = Game.stashLedgerText(5);
  const firstName = String((Game.data.villagers.find(v => v.id === v1) || {}).name || '').split(' ')[0];
  ok('known villager shows first name', text2.split('\n')[0].includes(`${firstName} left 3× Plant fiber`), text2.split('\n')[0]);

  // --- 3. firstRef never returns bare "A" for any roster member ---
  const bad = others.filter(id => Game.firstRef(id) === 'A' || /^A /.test(Game.firstRef(id)));
  ok('firstRef never bare-A across roster', bad.length === 0, JSON.stringify(bad));

  // --- 4. player donate/take round-trip keeps ledger attribution ---
  Game.addMaterial('wood', 6);
  Game.donateMaterial('wood', 4);
  Game.takeMaterial('wood', 2);
  Game.log.length = 0;
  const text3 = Game.stashLedgerText(6);
  const meRef = Game.firstRef(ME());
  ok('player donate attributed', text3.includes(`${meRef} left 4× Wood log`), text3);
  ok('player take attributed', text3.includes(`${meRef} took 2× Wood log`), text3);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('THREW:', e && e.stack || e); process.exit(1); });
