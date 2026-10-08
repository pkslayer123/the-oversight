// Encounter framework tests. Usage: node scripts/test-encounters.js
// Steve: "Don't fix the deer. Fix the pattern."
// Covers:
//  - descriptor gating: no true animal/monster name leaks pre-knowledge
//  - the prey loop: stalk -> strike -> flee, per-species tuning, no
//    teleport-bolt, stamina -> winded, edge escape takes two cornered turns
//  - the shared threat-queue contract (game.js enc* interface)
//  - codex-gated telegraph + phase beats
//  - inline action feedback: results render at the action site
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js',
 'src/js/justice.js', 'src/js/debug-scenarios.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}${extra ? ' — ' + extra : ''}`); }
}

function flatGrid() {
  return Array.from({ length: 9 }, () => Array(9).fill('grass'));
}

function freshGame() {
  try { if (Game.tbfight) Game.tbEnd('fled'); } catch (e) {}
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  s.mx = 4; s.my = 4; s.kcal = 3000; s.energy = 60;
  Game.genDetail = flatGrid;
  Game.log = [];
  return s;
}

function putAnimal(s, id, mx, my) {
  const cfg = Game.encPreyCfg(id);
  s.animal = { id, mx, my, aware: 0, stamina: cfg.stamina, pstate: 'graze', edgeTurns: 0 };
  return s.animal;
}

(async () => {
  await Game.init();

  // ---------- 1. DESCRIPTOR GATING ----------
  {
    const animals = Game.data.animals;
    ok('animals have unknown descriptors', animals.every(a => a.unknown && a.unknown.length > 5));
    const STOP = new Set(['white', 'tailed', 'common', 'virginia', 'eastern', 'american', 'gray', 'wild']);
    let leak = null;
    for (const a of animals) {
      for (const w of a.name.toLowerCase().replace(/-/g, ' ').split(' ')) {
        if (w.length > 4 && !STOP.has(w) && a.unknown.toLowerCase().includes(w)) { leak = a.id + ':' + w; break; }
      }
      if (leak) break;
    }
    ok('no true-name word leaks in unknown descriptors', !leak, leak || '');
  }
  {
    const s = freshGame();
    const deer = Game.data.animals.find(a => a.id === 'white_tailed_deer');
    ok('deer gated pre-knowledge', Game.encDescribeAnimal(deer) === deer.unknown);
    ok('deer label has no "deer"', !/deer/i.test(Game.encDescribeAnimal(deer)));
    Game.state.codex.animalEncounters = { white_tailed_deer: 3 };
    ok('deer named post-knowledge', Game.encDescribeAnimal(deer) === deer.description);
  }
  {
    // spawn message gated
    const s = freshGame();
    Game.playerTile().type = 'meadow';
    // ECOLOGY FIXTURE (2026-10-08): spawns draw from the tile's real wildlife —
    // stock meadow game so the spawn-message assertions measure gating, not ecology.
    { const wl = {}; for (const a of Game.data.animals) if ((a.biomes || []).includes('meadow')) wl[a.id] = 30; Game.playerTile().wildlife = wl; }
    Game.log = [];
    // force spawn: clear animal, rig RNG via many tries
    let spawned = null;
    for (let i = 0; i < 60 && !spawned; i++) { s.animal = null; Game.checkAnimals(); spawned = s.animal; }
    ok('checkAnimals can spawn', !!spawned);
    if (spawned) {
      const msg = Game.log.join(' ');
      const adef = Game.data.animals.find(a => a.id === spawned.id);
      const known = Game.encAnimalKnown(spawned.id);
      ok('spawn message gated', known || !new RegExp(adef.name.split(' ').filter(w => w.length > 4)[0], 'i').test(msg), msg);
    }
  }
  {
    // flee/freeze messages gated
    const s = freshGame();
    const a = putAnimal(s, 'white_tailed_deer', 6, 4);
    Game.log = [];
    for (let i = 0; i < 6; i++) { s.mx = 5; s.my = 4; Game.animalTurn(); if (!s.animal) break; }
    const msg = Game.log.join(' ');
    ok('freeze/bolt messages gated (no deer)', !/deer/i.test(msg), msg.slice(0, 120));
  }
  {
    // preyReaction message gated
    const s = freshGame();
    putAnimal(s, 'white_tailed_deer', 5, 4);
    s.animal.aware = 1;
    Game.log = [];
    Game.preyReaction(s.animal);
    const msg = Game.log.join(' ');
    ok('preyReaction gated (no deer)', !/deer/i.test(msg), msg.slice(0, 120));
  }
  {
    // monster describe gated
    freshGame();
    const mdef = Game.data.monsters.find(m => m.id === 'gallowdeer');
    const label = Game.encDescribeMonster(mdef);
    ok('monster gated pre-System', !/highbeam/i.test(label) && !/gallowdeer/i.test(label), label);
  }

  // ---------- 2. PREY LOOP ----------
  {
    // stalk advances one tile, awareness builds slowly
    const s = freshGame();
    putAnimal(s, 'white_tailed_deer', 7, 4);
    Game.feedbackMark();
    Game.stalkAnimal();
    ok('stalk moves one tile', s.mx === 5 && s.my === 4, `${s.mx},${s.my}`);
    ok('stalk keeps awareness low', (s.animal.aware || 0) < 0.4, s.animal.aware);
    ok('stalk feedback inline', Game.feedbackLines().length > 0 && !/deer/i.test(Game.feedbackLines().join(' ')));
  }
  {
    // walking straight at it bolts it — but ONE tile, and it stays on grid
    const s = freshGame();
    putAnimal(s, 'white_tailed_deer', 6, 4);
    s.mx = 4; s.my = 4;
    Game.animalTurn(); // dist 2 -> wary
    Game.animalTurn(); // dist 2 -> aware ~1 -> bolt, moves 1
    ok('animal still on grid after bolt (no teleport despawn)', !!s.animal, JSON.stringify(s.animal));
    if (s.animal) {
      const moved = Math.abs(s.animal.mx - 6) + Math.abs(s.animal.my - 4);
      ok('bolt moves ~1 tile, not 2+', moved <= 2, 'moved ' + moved);
    }
  }
  {
    // stamina -> winded -> catchable
    const s = freshGame();
    const a = putAnimal(s, 'cottontail_rabbit', 6, 4);
    a.aware = 1; a.pstate = 'bolt'; a.stamina = 1;
    s.mx = 4; s.my = 4;
    Game.log = [];
    Game.animalTurn();
    ok('winded state reached', s.animal && s.animal.pstate === 'winded', s.animal && s.animal.pstate);
    ok('winded narrated', Game.log.join(' ').includes('winded'));
  }
  {
    // edge escape takes two cornered turns, not one
    const s = freshGame();
    const a = putAnimal(s, 'white_tailed_deer', 8, 4);
    a.aware = 1; a.pstate = 'bolt'; a.stamina = 5;
    s.mx = 6; s.my = 4;
    Game.animalTurn();
    ok('still there after one cornered turn', !!s.animal);
    Game.animalTurn();
    ok('gone after two cornered turns', !s.animal);
  }
  {
    // strike: kill identifies + carcasses; miss/hunt gated
    const s = freshGame();
    putAnimal(s, 'white_tailed_deer', 5, 4);
    s.equipped = { weapon: { itemId: 'fire_hardened_spear', name: 'Fire-hardened spear', range: 2 } };
    let kills = 0, hunts = 0;
    const origRandom = Math.random;
    for (let i = 0; i < 30; i++) {
      // winded + dist 2: skips the flee roll (winded) and the dist-1 bite
      // block, so the kill roll itself is what's under test.
      putAnimal(s, 'white_tailed_deer', 6, 4);
      s.animal.aware = 0; s.animal.pstate = 'winded';
      Math.random = () => 0; // always roll under chance -> kill
      Game.log = []; Game.feedbackMark();
      const r = Game.huntAnimal();
      hunts++;
      if (!s.animal) kills++;
      if (kills) break;
    }
    Math.random = origRandom;
    ok('hunt can kill', kills > 0, `${kills}/${hunts}`);
    ok('kill identifies the animal', Game.encAnimalKnown('white_tailed_deer'));
    ok('kill feedback names it (now known)', Game.feedbackLines().join(' ').includes('White-tailed Deer'));
    ok('carcass in inventory', (s.inventory || []).some(it => it && /carcass/i.test(it.name || it.itemId || '')));
  }
  {
    // too far -> feedback, no roll
    const s = freshGame();
    putAnimal(s, 'white_tailed_deer', 8, 4);
    s.equipped = { weapon: { itemId: 'fire_hardened_spear', name: 'Fire-hardened spear', range: 2 } };
    Game.feedbackMark();
    const r = Game.huntAnimal();
    ok('out of range: null + feedback', r === null && Game.feedbackLines().join(' ').includes('Too far'));
    ok('animal unharmed', !!s.animal);
  }
  {
    // no animal -> null
    const s = freshGame();
    s.animal = null;
    ok('hunt with no animal returns null', Game.huntAnimal() === null);
    ok('stalk with no animal feedbacks', (Game.stalkAnimal(), Game.feedbackLines().join(' ').includes('Nothing to stalk')));
  }

  // ---------- 3. SHARED THREAT-QUEUE CONTRACT ----------
  {
    const s = freshGame();
    ok('encThreatQueue exists', typeof Game.encThreatQueue === 'function');
    ok('encNoticeFighter exists', typeof Game.encNoticeFighter === 'function');
    ok('encCurrentTarget exists', typeof Game.encCurrentTarget === 'function');
    ok('encNoticesPain exists', typeof Game.encNoticesPain === 'function');
    ok('encScanThreats exists', typeof Game.encScanThreats === 'function');
    ok('encTelegraphKnown exists', typeof Game.encTelegraphKnown === 'function');
    const m = { key: 'm1', mx: 4, my: 4, mdef: { id: 'gallowdeer', encounter: { fifo: true, noticeRange: 5 } } };
    const q = Game.encThreatQueue(m);
    ok('queue starts empty', Array.isArray(q) && q.length === 0);
    // fake combat context
    const mkF = (key, mx, my) => ({ key, mx, my, alive: true, fled: false, kind: key === 'p' ? 'player' : 'villager', name: key });
    Game.tbfight = { fighters: [Object.assign({ kind: 'monster' }, m), mkF('p', 4, 6), mkF('v1', 6, 4)] };
    const realSee = Game.canSee;
    Game.canSee = () => true;
    const Scat = globalThis.Scattering;
    const realFoe = Scat.combat.isFoe;
    Scat.combat.isFoe = () => true;
    Game.encNoticeFighter(m, 'v1', true);
    Game.encNoticeFighter(m, 'p', true);
    ok('FIFO order', q[0] === 'v1' && q[1] === 'p', q.join(','));
    const cur = Game.encCurrentTarget(m);
    ok('current target is queue head', cur && cur.key === 'v1');
    Game.encNoticesPain(m, 'p');
    ok('pain jumps the queue', Game.encThreatQueue(m)[0] === 'p', Game.encThreatQueue(m).join(','));
    // adjacency override: v2 walks adjacent, jumps even the pained target
    Game.tbfight.fighters.push(mkF('v2', 4, 5));
    Game.encScanThreats(m);
    ok('adjacency overrides pain', Game.encThreatQueue(m)[0] === 'v2', Game.encThreatQueue(m).join(','));
    Game.canSee = realSee;
    Scat.combat.isFoe = realFoe;
    try { if (Game.tbfight) Game.tbEnd('fled'); } catch (e) { Game.tbfight = null; }
  }
  {
    // codex-gated telegraph
    const s = freshGame();
    const m = { mdef: { id: 'gallowdeer', attack: { name: 'Ocular Discharge' } } };
    ok('telegraph unknown pre-knowledge', Game.encTelegraphKnown(m) === false);
    Game.state.codex.monsters = { gallowdeer: { stage: 'slain' } };
    ok('telegraph known post-slaying', Game.encTelegraphKnown(m) === true);
    ok('encPickCue picks by knowledge', Game.encPickCue(false, 'RAW', 'TACTICS') === 'RAW' && Game.encPickCue(true, 'RAW', 'TACTICS') === 'TACTICS');
  }
  {
    // phase beats
    const s = freshGame();
    Game.log = [];
    const ent = {};
    Game.encPhase(ent, 'declare', { declare: { text: 'It freezes. Light gathers.' } });
    ok('phase set + beat said', ent.encPhase === 'declare' && Game.log.join(' ').includes('Light gathers'));
    ok('phase recorded', ent.encPhase === 'declare');
    // the shared badge interface lives in game.js (encPhaseBadge)
  }

  // ---------- 4. INLINE ACTION FEEDBACK ----------
  {
    const s = freshGame();
    Game.log = [];
    Game.say('ambient old line');
    Game.feedbackMark();
    Game.say('action result one');
    Game.feedback('action result two');
    const lines = Game.feedbackLines();
    ok('feedback captures post-mark lines', lines.length === 2 && lines[0] === 'action result one' && lines[1] === 'action result two', JSON.stringify(lines));
    ok('pre-mark lines excluded', !lines.includes('ambient old line'));
  }
  {
    // feedback() without a prior mark still shows
    const s = freshGame();
    Game.log = [];
    try { delete Game.state.fbMark; } catch (e) { Game.state.fbMark = null; }
    Game.feedback('lonely result');
    ok('feedback without mark works', Game.feedbackLines().includes('lonely result'));
  }
  {
    // TURKEY migration: same framework, no leaks, loop works
    const s = freshGame();
    putAnimal(s, 'wild_turkey', 6, 4);
    const label = Game.encAnimalLabel(s.animal);
    ok('turkey gated', !/turkey/i.test(label), label);
    Game.feedbackMark();
    Game.stalkAnimal();
    ok('turkey stalk gated + inline', Game.feedbackLines().length > 0 && !/turkey/i.test(Game.feedbackLines().join(' ')));
    // turkey is warier than deer (awareRate 0.60 > 0.50)
    const cfg = Game.encPreyCfg('wild_turkey');
    ok('turkey warier than deer', cfg.awareRate > Game.encPreyCfg('white_tailed_deer').awareRate);
    // turkey notice range shorter
    ok('turkey notice shorter than deer', cfg.notice < Game.encPreyCfg('white_tailed_deer').notice);
    // glyph gated on map
    Game.state.codex.animalEncounters = {};
    ok('turkey glyph gated pre-ID', !Game.encAnimalKnown('wild_turkey'));
  }

  {
    // checklist present
    ok('registration checklist', Array.isArray(Game.encChecklist()) && Game.encChecklist().length >= 6);
  }

  {
    // NAME LEAK AUDIT (Steve): no true animal name in any player-facing
    // string pre-knowledge — including the turtle path from the screenshot.
    const s = freshGame();
    Game.state.codex.animalEncounters = {};
    for (const aid of ['snapping_turtle', 'white_tailed_deer', 'wild_turkey', 'gray_fox']) {
      const adef = (Game.data.animals || []).find(a => a.id === aid) || {};
      putAnimal(s, aid, 5, 4);
      // perceive hint
      Game.state.scholar.mx = 4; Game.state.scholar.my = 4;
      const hints = Game.perceptionHints();
      const leakH = hints.some(h => new RegExp(adef.name, 'i').test(h));
      ok(aid + ' perceive hint gated', !leakH, hints.join(' | ').slice(0, 80));
      // stalk feedback
      Game.feedbackMark(); Game.stalkAnimal();
      const fb = Game.feedbackLines().join(' ');
      ok(aid + ' stalk feedback gated', !new RegExp(adef.name, 'i').test(fb), fb.slice(0, 80));
      // popup label
      const label = Game.encAnimalLabel(s.animal);
      ok(aid + ' popup label gated', !new RegExp(adef.name, 'i').test(label), label);
    }
  }

  {
    // TYPO SCAN (Steve): "your your hands hisses past" — doubled "your" +
    // verb disagreement. The near-miss line must read clean unarmed AND armed.
    // Rabbit, not deer: unarmed big-game refusal (deer 20000 kcal) would fire
    // before any roll. Rabbit is unarmed-legal and keeps the "your hands" text.
    const s = freshGame();
    putAnimal(s, 'cottontail_rabbit', 5, 4);
    Game.state.scholar.mx = 4; Game.state.scholar.my = 4;
    Game.state.scholar.equipped = {}; // unarmed: fallback name is "your hands"
    Game.feedbackMark();
    // force the near-miss branch: sweep seeds until the jinks line fires
    let fb = '', tries = 0;
    const origR = Math.random;
    while (!/jinks at the last breath/.test(fb) && tries < 40) {
      tries++;
      const s2 = freshGame();
      putAnimal(s2, 'cottontail_rabbit', 5, 4);
      Game.state.scholar.mx = 4; Game.state.scholar.my = 4;
      Game.state.scholar.equipped = {};
      Game.feedbackMark();
      let calls = 0; const seed = tries * 0.137;
      Math.random = () => { calls++; const v = (seed * calls * 7919) % 1; return v; };
      try { Game.huntAnimal(); } catch (e) {}
      fb = Game.feedbackLines().join(' ');
    }
    Math.random = origR;
    ok('near-miss branch reached', /jinks at the last breath/.test(fb));
    ok('no doubled your', !/your your/i.test(fb), fb.slice(0, 100));
    ok('no hands hisses', !/hands hisses/i.test(fb), fb.slice(0, 100));
    // source scan: no "your your" in player-facing strings (comments stripped)
    const src = fs.readFileSync(path.join(ROOT, 'src/js/encounters.js'), 'utf8')
      .replace(/\/\/.*$/gm, '');
    ok('no "your your" in encounters.js strings', !/your your/i.test(src));
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(2); });
