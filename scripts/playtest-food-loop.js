// Playtest: the full food/knowledge loop as a player. Usage: node scripts/playtest-food-loop.js
// Forage unknowns -> lump -> camp -> sort -> test -> prep -> feast -> bank -> burn.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/food.js'
].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

const said = [];
const origSay = Game.say;
Game.say = function (t) { said.push(String(t)); return origSay ? origSay.call(this, t) : t; };
const last = (n = 3) => said.slice(-n);

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  s.kcal = 3000;

  console.log('=== 1. FORAGE unknowns ===');
  said.length = 0;
  // plant a forageable cell next to the player; player knows NOTHING
  s.mx = 4; s.my = 4;
  Game.state.codex.plants = {};
  const origGen = Game.genDetail.bind(Game);
  Game.genDetail = function (px, py) {
    const d = origGen(px, py);
    for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) if (d[y][x] === 'plant' || d[y][x] === 'bush' || d[y][x] === 'tree') d[y][x] = 'grass';
    d[4][5] = 'plant'; d[5][4] = 'plant'; d[5][5] = 'plant';
    const t = Game.playerTile(); t.stock = 10; t.maxStock = 10;
    return d;
  };
  Game.doAction('forage');
  Game.doAction('forage');
  Game.doAction('forage');
  console.log(last(8).join('\n')); 
  const inv = s.inventory.map(i => `${i.units || 1}x ${Game.itemDisplayName ? Game.itemDisplayName(i) : i.name}`).join(', ');
  console.log('BAG:', inv || '(empty)');

  console.log('\n=== 2. LUMP check ===');
  const lumps = s.inventory.filter(i => i.lump || /unknown/i.test(i.name || ''));
  console.log('lumped stacks:', lumps.length);
  for (const l of lumps) console.log(' -', Game.itemDisplayName(l), '| secret:', JSON.stringify(l.lump || l.composition || 'none'));

  console.log('\n=== 3. RETURN to village (stash routing) ===');
  said.length = 0;
  Game.returnToVillage();
  console.log(last(3).join('\n'));
  const stash = s.prepStash || [];
  console.log('PREP STASH:', stash.map(i => `${i.units || 1}x ${i.name}`).join(', ') || '(empty)');
  console.log('PANTRY items:', (Game.state.village.pantry || []).length);

  console.log('\n=== 4. SORT the bag at camp ===');
  said.length = 0;
  const stashIdx = (s.prepStash || []).findIndex(i => i.lump);
  console.log('atCamp:', Game.atCamp ? Game.atCamp() : '?', '| lump idx:', stashIdx);
  if (typeof Game.sortBag === 'function' && stashIdx >= 0) { Game.sortBag(null, stashIdx); console.log(last(6).join('\n')); }
  else console.log('(sortBag not found or no lump)');

  console.log('\n=== 5. KNOWLEDGE state ===');
  const kp = (Game.state.codex && Game.state.codex.plants) || {};
  console.log('known plants:', Object.keys(kp).length);

  console.log('\n=== 6. CAUTIOUS TEST (if unknowns remain) ===');
  said.length = 0;
  const remIdx = (s.prepStash || []).findIndex(i => i.lump);
  if (remIdx >= 0 && typeof Game.testCautiously === 'function') {
    Game.testCautiously(remIdx, {}, s.prepStash);
    console.log(last(8).join('\n'));
  } else console.log('(nothing left to test or no testCautiously)');

  console.log('\n=== 7. PREP FLOW (who/how far) ===');
  said.length = 0;
  const batch = (s.prepStash || [])[0];
  if (batch) {
    if (typeof Game.whoOptions === 'function') { const w = Game.whoOptions(batch); console.log('WHO:', JSON.stringify(w).slice(0, 400)); }
    if (typeof Game.howFarOptions === 'function') { const h = Game.howFarOptions(batch); console.log('HOW FAR:', JSON.stringify(h).slice(0, 500)); }
  } else console.log('(stash empty)');

  console.log('\n=== 8. ENERGY BAR ===');
  console.log('kcal:', Math.round(s.kcal), 'cap:', Game.kcalCap ? Math.round(Game.kcalCap()) : '?',
    'banked:', Game.banked ? Math.round(Game.banked()) : '?');

  console.log('\nDONE');
})().catch(e => { console.error('PLAYTEST ERROR:', e.message); process.exit(1); });
