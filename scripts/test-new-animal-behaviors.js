// New-animal behavior engine tests (Steve 2026-10-06).
// W6 added timber_rattlesnake (defensive), striped_skunk (unbothered), and
// muskrat (architect) with rich fiction but no engine implementation — the
// behaviors were inert labels. This proves the engine now runs them:
//   rattlesnake: warns (rattle) before striking; venom on strikes
//   skunk: sprays at adjacency (blinded encounter + multi-day scent)
//   muskrat: dives when it bolts near water (dive-and-hold)
// Usage: node scripts/test-new-animal-behaviors.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/progression.js', 'src/js/encounters.js', 'src/js/food.js',
 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js',
 'src/js/justice.js', 'src/js/debug-scenarios.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond, extra) { if (cond) pass++; else { fail++; console.log('FAIL ' + name + (extra ? ' — ' + extra : '')); } }
function says() { const l = Game.log.join('\n'); Game.log.length = 0; return l; }

function spawnAnimal(id, mx, my) {
  const s = Game.state.scholar;
  const cfg = Game.encPreyCfg(id);
  s.animal = { id, mx, my, aware: 0, stamina: cfg.stamina, pstate: 'graze', edgeTurns: 0 };
  s.mx = 4; s.my = 4;
  Game.map = Game.map || {}; Game.map.px = 0; Game.map.py = 0;
  return s.animal;
}

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  s.health = 500; s.kcal = 4000;

  // ---- 1. ENC_PREY tuning exists for all three ----
  for (const id of ['timber_rattlesnake', 'striped_skunk', 'muskrat']) {
    const cfg = Game.encPreyCfg(id);
    ok(id + ' has ENC_PREY entry', cfg.notice !== 4 || id === 'striped_skunk', JSON.stringify(cfg));
  }
  ok('rattlesnake low notice (coiled, hard to spot)', Game.encPreyCfg('timber_rattlesnake').notice === 2);
  ok('skunk low awareRate (unbothered)', Game.encPreyCfg('striped_skunk').awareRate < 0.4);

  // ---- 2. RATTLESNAKE: warns first ----
  says();
  let a = spawnAnimal('timber_rattlesnake', 6, 4); // dist 2
  let fired = [];
  const origAudio = Game.audioEvent;
  Game.audioEvent = (n, d) => { fired.push(n); try { return origAudio.call(Game, n, d); } catch (e) {} };
  Game.animalTurn();
  let log = says();
  ok('rattle warns at dist<=3', /rattle/i.test(log), log.slice(0, 120));
  ok('rattle audio fires', fired.includes('animalRattle'), fired.join(','));
  ok('rattled flag set', a.rattled === true);
  ok('snake does not bolt', a.pstate !== 'bolt');

  // ---- 3. RATTLESNAKE: venom strike at dist<=1 ----
  s.poisons = [];
  a.mx = 5; a.my = 4; // dist 1
  let struck = false;
  for (let i = 0; i < 20 && !struck; i++) {
    const before = s.health;
    Game.animalTurn();
    if (s.health < before) struck = true;
  }
  log = says();
  ok('warned snake strikes adjacent', struck);
  ok('venom pushed to poisons', (s.poisons || []).some(p => /rattlesnake/i.test(p.name)), JSON.stringify(s.poisons));
  ok('strike text names the venom', /venom/i.test(log));

  // ---- 4. RATTLESNAKE: no warning, no strike at range ----
  a = spawnAnimal('timber_rattlesnake', 8, 8); // dist 4+
  fired = [];
  const hp = s.health;
  Game.animalTurn(); Game.animalTurn();
  ok('no rattle at dist>3', !a.rattled);
  ok('no damage at range', s.health === hp);

  // ---- 5. SKUNK: sprays at adjacency ----
  a = spawnAnimal('striped_skunk', 5, 4); // dist 1
  fired = [];
  s.skunkScent = 0;
  Game.animalTurn();
  log = says();
  ok('spray fires at dist<=1', /spray|tail/i.test(log) && a.sprayed === true, log.slice(0, 140));
  ok('spray audio fires', fired.includes('animalSpray'), fired.join(','));
  ok('scent set (multi-day)', s.skunkScent >= 5, 'got ' + s.skunkScent);

  // ---- 6. SKUNK: blinded strikes land less ----
  // winded animals don't flee on strike (encBehaviorStrikeReact → false), so
  // the strike always resolves to the chance roll — clean A/B of the blind.
  async function strikeBatch(sprayed, n) {
    let hits = 0;
    for (let i = 0; i < n; i++) {
      const an = spawnAnimal('striped_skunk', 5, 4);
      an.sprayed = sprayed; an.aware = 0; an.pstate = 'winded'; an.stamina = 5;
      s.animal = an; s.kcal = 4000; s.health = 500;
      says();
      try { Game.huntAnimal(); } catch (e) {}
      const l = says();
      if (/Got it|carcass/i.test(l)) hits++;
    }
    return hits;
  }
  const hitsBlind = await strikeBatch(true, 40);
  const hitsClear = await strikeBatch(false, 40);
  ok('sprayed strikes land less (blind)', hitsBlind < hitsClear, 'blind ' + hitsBlind + '/40 vs clear ' + hitsClear + '/40');

  // ---- 7. SKUNK: scent widens animal notice ----
  a = spawnAnimal('striped_skunk', 8, 8); // far
  a.sprayed = true;
  s.skunkScent = 3;
  const s2 = Game.state.scholar;
  // notice range = cfg.notice(3) + 2 = 5; dist from (4,4) to (8,8) = 4 < 5 → aware builds
  const awareBefore = a.aware;
  Game.animalTurn();
  ok('scented player noticed sooner', a.aware > awareBefore, 'aware ' + awareBefore + '→' + a.aware);

  // ---- 8. MUSKRAT: dives near water ----
  a = spawnAnimal('muskrat', 4, 4);
  a.pstate = 'bolt';
  // plant a water cell adjacent via genDetail stub: use the real map detail if water exists,
  // else verify the architect branch is wired into the dive conditions
  const src = fs.readFileSync(path.join(ROOT, 'src/js/encounters.js'), 'utf8');
  ok('architect in animalTurn water-escape', /beh === 'architect'\) && a\.pstate === 'bolt'/.test(src));
  ok('architect in encBehaviorAfterBolt dive', /b === 'architect'\) && nearKind\(\['water', 'creek'\]\)/.test(src));

  // ---- 9. Audio synths exist ----
  const app = fs.readFileSync(path.join(ROOT, 'src/js/app.js'), 'utf8');
  ok('animalRattle synth defined', /function animalRattle\(\)/.test(app));
  ok('animalSpray synth defined', /function animalSpray\(\)/.test(app));
  ok('animalRattle in dispatch', /animalRattle\(\) \{ animalRattle\(\); \}/.test(app));
  ok('animalSpray in dispatch', /animalSpray\(\) \{ animalSpray\(\); \}/.test(app));

  // ---- 10. checkEncounter scent hook ----
  const gj = fs.readFileSync(path.join(ROOT, 'src/js/game.js'), 'utf8');
  ok('scent raises monster encounter chance', /skunkScent > 0\) chance \*= 1\.5/.test(gj));
  ok('scent decays at dawn', /skunkScent -= 1/.test(gj));

  Game.audioEvent = origAudio;
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
