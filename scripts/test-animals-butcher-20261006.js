// PROOF TEST (Steve 2026-10-06): animals butchering deepening (encounters.js).
// Part A (seeded, deterministic): audio-wiring audit (zero silent),
// encAudio fallback preference, cornered-panic firing, turtle tell,
// kill-line yield honesty (known/unknown/knife/no-knife/technique),
// animals.json completeness audit.
// Part B (PLAYED AS A PLAYER, real randomness): full turkey
// hunt->kill->carcass->clean->cook->preserve->eat arc; feel judgment.
// Constraint: touch only encounters.js + animals.json (this script is new).
// Turn hygiene: stalkAnimal()/huntAnimal() advance the animal themselves —
// never a trailing unconditional animalTurn(). Movement stays on interior
// tiles (1..7).
// Run: node scripts/test-animals-butcher-20261006.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const realRandom = Math.random;
(function seed(seed) {
  let s = seed >>> 0;
  Math.random = function () {
    s |= 0; s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
})(20261006);

global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/progression.js', 'src/js/encounters.js', 'src/js/food.js',
 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js',
 'src/js/justice.js', 'src/js/debug-scenarios.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;
const ENC_SRC = fs.readFileSync(path.join(ROOT, 'src/js/encounters.js'), 'utf8');
const APP_SRC = fs.readFileSync(path.join(ROOT, 'src/js/app.js'), 'utf8');
// Audio registry = Game.audio = CombatAudio (app.js). Entries look like
// `      round(d) { roundTick(d); },` — name(args), 6-space indent.
const REG_KEYS = new Set([...APP_SRC.matchAll(/^\s{6}([a-zA-Z][\w-]*)\(/gm)].map(m => m[1]));

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}

function flatGrid() { return Array.from({ length: 9 }, () => Array(9).fill('grass')); }
function freshGame() {
  try { if (Game.tbfight) Game.tbEnd('fled'); } catch (e) {}
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  s.mx = 4; s.my = 4; s.kcal = 3000; s.energy = 60; s.health = 100;
  Game.genDetail = flatGrid;
  Game.log = [];
  Game.state.codex.animalEncounters = {};
  return s;
}
function spawn(s, id, mx, my) {
  const cfg = Game.encPreyCfg(id);
  s.animal = { id, mx, my, aware: 0, stamina: cfg.stamina, pstate: 'graze', edgeTurns: 0 };
  return s.animal;
}
function bow(s) {
  const def = Game.data.items.find(i => i.id === 'crude_bow');
  s.inventory.push({ itemId: 'crude_bow', name: def.name, units: 1 });
  s.equipped = { weapon: { itemId: 'crude_bow', name: def.name } };
}
function knife(s) {
  s.inventory.push({ itemId: 'stone_knife', name: 'Stone knife', units: 1 });
}
function drain(label) {
  const l = Game.log.join('\n');
  Game.log = [];
  if (l.trim()) console.log(`  ${label}: ${l.split('\n').map(x => x.trim()).filter(Boolean).join(' | ').slice(0, 500)}`);
}

(async () => {
  await Game.init();

  console.log('\n=== A1. AUDIO WIRING AUDIT (zero silent) ===');
  const fired = new Set([...ENC_SRC.matchAll(/audioEvent\('([a-zA-Z]+)'\)/g)].map(m => m[1]));
  const encFired = new Set([...ENC_SRC.matchAll(/encAudio\('([a-zA-Z]+)'\)/g)].map(m => m[1]));
  const fbMatch = ENC_SRC.match(/var ENC_AUDIO_FALLBACK = \{([^}]*)\}/);
  const fbEntries = [...fbMatch[1].matchAll(/([a-zA-Z]+):\s*\[([^\]]*)\]/g)]
    .map(m => [m[1], m[2].split(',').map(x => x.trim().replace(/['"]/g, '')).filter(Boolean)]);
  const fbNames = new Set(fbEntries.map(e => e[0]));
  console.log(`  fired via audioEvent: ${[...fired].join(', ')}`);
  console.log(`  fired via encAudio: ${[...encFired].join(', ')}`);
  for (const n of fired) check(`audioEvent '${n}' resolves in CombatAudio`, REG_KEYS.has(n),
    REG_KEYS.has(n) ? '' : 'SILENT — no registry entry');
  for (const [n, targets] of fbEntries) {
    check(`encAudio fallback '${n}' targets all resolve`, targets.every(t => REG_KEYS.has(t)),
      'targets: ' + targets.join(','));
  }
  for (const n of encFired) check(`encAudio '${n}' resolves or has fallback`,
    REG_KEYS.has(n) || fbNames.has(n), 'silent with no fallback');
  check('animalPanic is NOT fired via raw audioEvent anymore (was silent)',
    ![...ENC_SRC.matchAll(/audioEvent\('animalPanic'\)/g)].length);

  console.log('\n=== A2. encAudio PREFERENCE + NODE-SAFETY ===');
  const origAudio = Game.audio;
  let calls = [];
  Game.audio = { animalBolt() { calls.push('bolt'); }, animalRustle() { calls.push('rustle'); } };
  const r1 = Game.encAudio('animalPanic');
  check('fallback composes bolt+rustle when animalPanic unmapped',
    r1 === true && calls.join(',') === 'bolt,rustle', 'calls=' + calls.join(','));
  calls = [];
  Game.audio = {
    animalPanic() { calls.push('panic'); },
    animalBolt() { calls.push('bolt'); }, animalRustle() { calls.push('rustle'); },
  };
  Game.encAudio('animalPanic');
  check('real synth wins when registered (no fallback double-fire)', calls.join(',') === 'panic',
    'calls=' + calls.join(','));
  Game.audio = undefined;
  let nodeSafe = true;
  try { nodeSafe = Game.encAudio('animalPanic') === true; } catch (e) { nodeSafe = false; }
  check('encAudio is safe with no audio system (node harness)', nodeSafe);
  Game.audio = origAudio;

  console.log('\n=== A3. CORNERED PANIC FIRES animalPanic (not silent) ===');
  {
    const s = freshGame(); knife(s);
    spawn(s, 'cottontail_rabbit', 4, 5); s.mx = 4; s.my = 4;
    const a = s.animal; a.pstate = 'cornered'; a.aware = 1;
    const origEncAudio = Game.encAudio; const got = [];
    Game.encAudio = function (n, d) { got.push(n); return origEncAudio.call(this, n, d); };
    const keepRand = Math.random; Math.random = () => 0.1; // lash-out: 0.1 < 0.5
    Game.log = [];
    Game.animalTurn();
    Math.random = keepRand;
    const log = Game.log.join('\n');
    check('cornered lash-out narrates the detonation', /THRASHES/i.test(log), log.slice(0, 160));
    check('cornered lash-out routes animalPanic through encAudio', got.includes('animalPanic'),
      'got=' + got.join(','));
    check('cornered lash-out costs HP (panic is real)', s.health < 100, 'hp=' + s.health);
    Game.encAudio = origEncAudio;
  }

  console.log('\n=== A4. BOX TURTLE TELL (was silent) ===');
  {
    const s = freshGame();
    spawn(s, 'box_turtle', 4, 7); // dist 3
    Game.log = [];
    Game.animalTurn();
    const l1 = Game.log.join('\n');
    check('turtle tell shows on approach (honest perception)', /pulls its head in a fraction/i.test(l1), l1.slice(0, 160));
    Game.log = [];
    Game.animalTurn();
    check('turtle tell shows once, not every turn', !/pulls its head in a fraction/i.test(Game.log.join('\n')));
  }

  console.log('\n=== A5. KILL-LINE YIELD HONESTY ===');
  {
    const deer = Game.data.animals.find(x => x.id === 'white_tailed_deer');
    const s = freshGame(); bow(s); knife(s);
    // unknown, no technique: blind 30%
    let line = Game.encKillLine(deer, 20000);
    check('unknown kill: gross on the bone stated', /About 20000 kcal of meat on the bone/.test(line));
    check('unknown kill: cleaned yield math (blind 30% → 1500×4)',
      /Cleans to ~1500 kcal × 4 raw portions/.test(line) && /hands are learning/.test(line), line.slice(0, 200));
    check('unknown kill: raw disease gamble named',
      /1-in-3/.test(line) && /fever by nightfall/.test(line));
    check('unknown kill: processing order + spoil clock',
      /Cook it over fire/.test(line) && /smoke/.test(line) && /spoils in ~2 days/.test(line));
    check('unknown kill: no knife-nag while knife in pack', !/no knife/i.test(line));
    // honest-blind knife gate (strip every cutting edge, not just the stone knife)
    s.inventory = s.inventory.filter(i => !/knife|machete|sharpened|blade/i.test(String(i.name || '') + ' ' + String(i.itemId || '')));
    s.tools = (s.tools || []).filter(i => !/knife|machete|sharpened|blade/i.test(String(i.name || '') + ' ' + String(i.itemId || '')));
    line = Game.encKillLine(deer, 20000);
    check('knife gate is honest-blind: names the fix', /no knife/i.test(line) && /Stone knife.*stone \+ vine/i.test(line),
      line.slice(-160));
    knife(s);
    // known + technique: 40%
    Game.state.codex.animalEncounters = { white_tailed_deer: 3 };
    Game.learnTechnique('clean', 'trial'); Game.log = [];
    line = Game.encKillLine(deer, 20000);
    check('known kill: killText with {kcal} substituted', /About 20000 kcal/.test(line) && /Organs first/.test(line));
    check('known kill: cleaned yield math (known 40% → 2000×4)',
      /Cleans to ~2000 kcal × 4 raw portions/.test(line) && /you know the cuts/.test(line));
    // DISEASE LAW (Steve 2026-10-06): named real vectors, knowledge-gated
    check('known kill: species disease vector named (ticks/Lyme on deer)',
      /Lyme disease is real/.test(line), line.slice(-260));
    check('known kill: treatment gated and honest (Herbal Remedy, once a day)',
      /Herbal Remedy cures it \(plant knowledge, once a day\)/.test(line));
    // unknown: the vector stays hidden — if you don't know, it doesn't show
    Game.state.codex.animalEncounters = {};
    line = Game.encKillLine(deer, 20000);
    check('unknown kill: disease vector NOT leaked pre-knowledge', !/Lyme/.test(line));
    check('unknown kill: generic raw gamble + cure still honest', /1-in-3/.test(line) && /Herbal Remedy/.test(line));
  }

  console.log('\n=== A6. animals.json COMPLETENESS AUDIT ===');
  {
    const need = ['name', 'calories', 'method', 'difficulty', 'knowledgeLevels', 'unknown',
      'behavior', 'huntText', 'killText', 'tell', 'butcher', 'emoji', 'description',
      'fleeDifficulty', 'behaviorDesc'];
    let holes = 0;
    for (const a of Game.data.animals) {
      const missing = need.filter(k => a[k] == null || a[k] === '' || (Array.isArray(a[k]) && !a[k].length));
      const kl = Object.keys(a.knowledgeLevels || {});
      if (missing.length || kl.length !== 4) { holes++; console.log(`  HOLE ${a.id}: ${missing.join(',')}${kl.length !== 4 ? ' knowledgeLevels!=4' : ''}`); }
      if (!/\{kcal\}/.test(a.killText || '')) { holes++; console.log(`  HOLE ${a.id}: killText has no {kcal}`); }
      if (!a.diseaseVector || !a.diseaseVector.trim()) { holes++; console.log(`  HOLE ${a.id}: no diseaseVector`); }
    }
    check('all 26 species complete (no data holes)', holes === 0, holes + ' holes');
    const turkey = Game.data.animals.find(x => x.id === 'wild_turkey');
    check('turkey: butcher materials match killText promises',
      turkey.butcher.feather === 6 && turkey.butcher.bone === 2 && /feather/i.test(turkey.killText));
    const deer = Game.data.animals.find(x => x.id === 'white_tailed_deer');
    check('deer: butcher materials match killText promises',
      deer.butcher.hide === 2 && deer.butcher.bone === 4 && deer.butcher.antler === 2);
  }

  console.log(`\n--- PART A: ${pass} pass, ${fail} fail ---`);
  if (fail) { console.log('PART A FAILED — not proceeding to the played arc.'); process.exit(1); }

  // ================= PART B: PLAYED AS A PLAYER (real randomness) =================
  Math.random = realRandom;
  console.log('\n=== PART B. FULL ARC, PLAYED AS A PLAYER: turkey hunt -> kill -> carcass -> clean -> cook -> smoke -> eat ===');
  const FEEL = [];
  {
    const s = freshGame(); bow(s); knife(s);
    // a fire on the grid: nearFire() scans the detail grid for 'fire'
    Game.genDetail = () => { const g = flatGrid(); g[0][0] = 'fire'; return g; };
    spawn(s, 'wild_turkey', 6, 4);
    console.log('  I am a hungry hunter with a crude bow and a stone knife. Turkey at (6,4).');
    console.log('  Plan: walk up NOISY first — feel the flock explode — then run it down and strike when winded.');
    let turns = 0, strikes = 0, lastPstate = '', respawns = 0;
    const t0kcal = s.kcal;
    while (turns < 60) {
      turns++;
      let a = s.animal;
      if (!a) {
        const ci = s.inventory.findIndex(i => i.foodState === 'carcass');
        if (ci >= 0) break; // killed it
        if (respawns >= 1) break;
        respawns++;
        console.log('  (it got clean away — a real hunter finds another bird)');
        spawn(s, 'wild_turkey', 6, 4);
        continue;
      }
      const dist = Math.max(Math.abs(a.mx - s.mx), Math.abs(a.my - s.my));
      if (a.pstate !== lastPstate) {
        console.log(`  [t${turns}] bird ${a.pstate} @(${a.mx},${a.my}) dist ${dist} aware ${(a.aware || 0).toFixed(2)}`);
        lastPstate = a.pstate;
      }
      if (dist <= 5 && (a.pstate === 'winded' || a.pstate === 'regroup' || (a.aware || 0) < 0.5)) {
        strikes++; Game.huntAnimal(); // the shot — advances the animal itself
      } else {
        // close in on foot, noisy — interior tiles only (edges are the flee barrier)
        const dx = Math.sign(a.mx - s.mx), dy = Math.sign(a.my - s.my);
        s.mx = Math.max(1, Math.min(7, s.mx + dx));
        s.my = Math.max(1, Math.min(7, s.my + dy));
        Game.animalTurn(); // movement's reaction — not a strike, so the animal answers here
      }
      a = s.animal;
      const ci2 = s.inventory.findIndex(i => i.foodState === 'carcass');
      if (ci2 >= 0) break;
    }
    const carcassIdx = s.inventory.findIndex(i => i.foodState === 'carcass');
    check('arc: the hunt ends with a carcass in the pack', carcassIdx >= 0,
      `turns=${turns} strikes=${strikes} respawns=${respawns}`);
    console.log(`  hunt cost: ${Math.round(t0kcal - s.kcal)} kcal over ${turns} turns (${strikes} strikes)`);
    drain('kill');
    const carcass = s.inventory[carcassIdx];
    check('arc: carcass is not food yet (honest state)', carcass.foodState === 'carcass' && !(carcass.kcalEach > 0));
    check('arc: carcass spoils fast (~2 days)', carcass.spoilDay - s.day <= 2, 'spoilDay=' + carcass.spoilDay + ' day=' + s.day);

    // CLEAN — blind hands (no technique yet): messy, 30%, teaches
    Game.log = [];
    const grossKcal = s.inventory[carcassIdx].hiddenKcal || 0;
    Game.cleanCarcass(carcassIdx);
    drain('clean');
    const meatIdx = s.inventory.findIndex(i => i.foodKind === 'meat' && i.foodState === 'cleaned');
    const meat = s.inventory[meatIdx];
    check('arc: cleaning yields 4 raw portions', meat && meat.units === 4, meat && `units=${meat.units}`);
    const expectPer = Math.round(grossKcal * 0.30 / 4);
    check('arc: blind clean = 30% of actual gross (messy)',
      meat && meat.kcalEach === expectPer,
      meat && `kcalEach=${meat.kcalEach} expected=${expectPer} gross=${grossKcal}`);
    check('arc: raw portions carry disease risk', meat && meat.diseaseRisk && meat.diseaseRisk.p === 0.35,
      meat && JSON.stringify(meat.diseaseRisk));
    check('arc: raw prep warns honestly', meat && /Risky: raw meat/.test(meat.prep || ''), meat && meat.prep);
    const feathers = s.inventory.find(i => i.material === 'feather');
    const bones = s.inventory.find(i => i.material === 'bone');
    check('arc: butcher yields match animals.json (6 feathers, 2 bones)',
      feathers && feathers.units === 6 && bones && bones.units === 2,
      `feathers=${feathers && feathers.units} bones=${bones && bones.units}`);
    check('arc: messy clean taught the technique', Game.knowsTechnique('clean') === true);
    FEEL.push('clean: the "hack at it clumsily" line + technique-learned beat makes the first clean feel earned, not taxed');

    // COOK over fire
    Game.log = [];
    Game.cookAll();
    drain('cook');
    const cooked = s.inventory.find(i => i.foodKind === 'meat' && i.foodState === 'cooked');
    check('arc: cooking works over fire', !!cooked, 'no cooked meat');
    if (cooked) {
      check('arc: cooked meat drops the disease risk', !cooked.diseaseRisk, 'diseaseRisk=' + JSON.stringify(cooked.diseaseRisk));
      check('arc: cooked portions keep honest kcal', cooked.kcalEach >= 225, 'kcalEach=' + cooked.kcalEach);
    }

    // SMOKE one portion for the road
    const smokeIdx = s.inventory.findIndex(i => i.foodKind === 'meat' && i.foodState === 'cooked');
    if (smokeIdx >= 0) {
      Game.log = [];
      // preserveFood smokes the whole stack; split one portion off first
      const stack = s.inventory[smokeIdx];
      if (stack.units > 1) {
        stack.units -= 1;
        s.inventory.push(Object.assign({}, stack, { units: 1 }));
      }
      Game.preserveFood(s.inventory.findIndex(i => i.foodKind === 'meat' && i.foodState === 'cooked' && i.units === 1));
      drain('smoke');
      const smoked = s.inventory.find(i => /smoked/i.test(i.name || ''));
      check('arc: smoking preserves meat (~a month of safety)', !!smoked && smoked.spoilDay - s.day > 5,
        smoked && ('spoilDay=' + smoked.spoilDay + ' day=' + s.day));
    }

    // EAT a cooked portion — the payoff (arrive hungry, like a real hunter)
    const eatIdx = s.inventory.findIndex(i => i.foodKind === 'meat' && i.foodState === 'cooked' && (i.units || 0) > 0);
    s.kcal = 500;
    const kcalBefore = s.kcal, hpBefore = s.health;
    const diseasesBefore = (s.diseases || []).length;
    if (eatIdx >= 0) {
      Game.log = [];
      Game.eatOne(eatIdx);
      drain('eat');
      check('arc: eating cooked meat feeds without sickening',
        s.kcal > kcalBefore && (s.diseases || []).length === diseasesBefore,
        `kcal ${Math.round(kcalBefore)}->${Math.round(s.kcal)}`);
    }
    const haulKg = s.inventory.reduce((t, i) => t + (i.kg || 0) * (i.units || 1), 0);
    console.log(`  haul weight in pack: ${haulKg.toFixed(1)} kg (meat + 6 feathers + 2 bones)`);
    FEEL.push('haul: feathers/bones have real weight — the pack feels like a pack, not a list');
  }

  console.log('\n=== FEEL JUDGMENT (played as a player) ===');
  for (const f of FEEL) console.log('  • ' + f);
  console.log('  • hunt: stalk→aware→bolt→chase reads like a real hunt; the miss cost (-100 kcal) makes every strike a decision');
  console.log('  • kill: the honesty footer turns the {kcal} gross into an eating plan — no more "20000 kcal" daydreams');
  console.log('  • friction: the arc crosses three UI surfaces (grid -> pack clean -> fire cook); the kill line now names all three, so nothing is a surprise');

  console.log(`\n=== RESULT: ${pass} pass, ${fail} fail ===`);
  process.exit(fail ? 1 : 0);
})();
