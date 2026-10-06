// eatOne tasting test (Steve 2026-10-05): the plant L2->L3 knowledge beat
// ("Eat it 3 times, you learn what it does to you") must work through the
// LIVE eat path — Game.eatOne, the per-item Pack menu eat. The old bulk
// Game.eat() held the tasting logic, but the Eat button was removed in the
// UI restructure, stranding L3 as unreachable. This test pins the port.
// Usage: node scripts/test-eatone-tastings.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js',
 'src/js/justice.js', 'src/js/corpses.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond) { if (cond) { pass++; } else { fail++; console.log('FAIL: ' + name); } }
function drain() { const l = Game.log.join('\n'); Game.log.length = 0; return l; }

function freshGame() {
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  drain();
  return Game.state.scholar;
}
function giveEdible(s, pid, units) {
  const p = Game.data.plants.find(x => x.id === pid);
  s.inventory.push({ plantId: pid, name: p.name, units, kcalEach: p.caloriesPerUnit || 50, edible: true, spoilDay: s.day + 5, unit: p.unit || 'unit' });
}
function eatOneByPid(s, pid) {
  const idx = s.inventory.findIndex(i => i.plantId === pid && (i.units || 0) > 0 && (i.kcalEach || 0) > 0);
  if (idx < 0) return false;
  s.kcal = 0; // never "full enough" — keep the eat path open
  Game.eatOne(idx);
  return true;
}

(async () => {
  await Game.init();
  const pid = 'dandelion';
  const plant = Game.data.plants.find(p => p.id === pid);

  // --- 1. tastings accumulate at L2 via eatOne ---
  {
    const s = freshGame();
    Game.identifyPlant(pid, 'taught');
    Game.state.codex.plants[pid].level = 2;
    giveEdible(s, pid, 5);
    drain();
    eatOneByPid(s, pid); eatOneByPid(s, pid);
    let e = Game.state.codex.plants[pid];
    ok('2 tastings recorded via eatOne', e.tastings === 2);
    ok('still L2 after 2 tastings', e.level === 2);
    eatOneByPid(s, pid);
    e = Game.state.codex.plants[pid];
    ok('L3 reached after 3rd tasting via eatOne', e.level === 3);
    const log = drain();
    ok('L3 is an EVENT (Deeper knowledge)', /Deeper knowledge/i.test(log));
    ok('L3 announces all uses known', /All uses known/i.test(log));
    console.log('   L3 moment: ' + (log.split('\n').find(l => /Deeper knowledge/i.test(l)) || '').slice(0, 140));
  }

  // --- 2. no tasting progress at L1 (tastings only count once you know parts) ---
  {
    const s = freshGame();
    Game.identifyPlant(pid, 'taught'); // L1
    giveEdible(s, pid, 3);
    eatOneByPid(s, pid); eatOneByPid(s, pid); eatOneByPid(s, pid);
    const e = Game.state.codex.plants[pid];
    ok('L1 eating does not accrue tastings', !e.tastings);
    ok('L1 eating does not level up', e.level === 1);
  }

  // --- 3. L3 benefit: +5 health when eating a deeply-known plant ---
  {
    const s = freshGame();
    Game.identifyPlant(pid, 'taught');
    Game.state.codex.plants[pid].level = 3;
    giveEdible(s, pid, 2);
    s.health = 80;
    drain();
    eatOneByPid(s, pid);
    ok('L3 plant heals +5 on eat (as announced)', s.health === 85);
    drain();
  }

  // --- 4. prepKnown still works (no regression) ---
  {
    const s = freshGame();
    Game.identifyPlant(pid, 'taught');
    giveEdible(s, pid, 1);
    drain();
    eatOneByPid(s, pid);
    const log = drain();
    ok('prepKnown teaching intact', /Eating it teaches you/i.test(log));
  }

  // --- 5. unknown plant: honest, no crash, no tasting entry level-up ---
  {
    const s = freshGame();
    const other = Game.data.plants.find(p => p.id !== pid);
    giveEdible(s, other.id, 1);
    drain();
    eatOneByPid(s, other.id);
    const log = drain();
    const e = Game.state.codex.plants[other.id];
    ok('unknown plant: honest about not knowing', /don't know what it is/i.test(log));
    ok('unknown plant: entry stays L0', (e.level || 0) === 0);
  }

  console.log(`\nRESULTS: ${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
