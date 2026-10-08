// PROOF (Steve 2026-10-08): aggro-audio leftover decisions.
// Three registered-but-unreachable aggro hooks got design judgments:
//   1. nightcourtTurn  — fires at the ROOST beat, gated to the head-turn say.
//      The dive itself stays silent (the silence IS the telegraph).
//   2. heronUnfold     — already live via the generic declare path (the unfold
//      IS the strike-declare tell); heronStatic is the declare/windup cue.
//      Two-hook split documented in game.js; nothing retired.
//   3. wolfSnarl       — fires at hushwolf rush RESOLVE, after the hit lands,
//      once per wolf per fight. The rush itself stays silent (no warning).
//   4. Bison "horn": 2 — schema extended (horns are not antlers, not tusks).
//
// Run: node scripts/test-audio-leftover-decisions-20261008.js   (SEED env)
// Asserted across seeds: 20261008, 7, 42, 777 (separate processes).
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
// SEED BEFORE EVAL: modules capture Math.random at load time (AGENTS.md).
const SEED = parseInt(process.env.SEED || '20261008', 10);
Math.random = mulberry32(SEED);
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
const order = execSync("grep -o 'src/js/[^\"'']*\\.js' index.html | head -60", { cwd: ROOT }).toString().split('\n')
  .filter(s => s && !/app\.js|sprites\.js|tile-scenes\.js|move-anim\.js|drama\.js/.test(s));
global.window = global; // stub for eval; deleted before play (sync combat path)
global.document = { getElementById: () => null, createElement: () => ({ textContent: '', innerHTML: '', style: {}, setAttribute() {}, appendChild() {} }), head: { appendChild() {} }, body: {} };
order.forEach(f => { eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); });
delete global.window; delete global.document;
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${extra ? ' — ' + extra : ''}`); }
}

const audio = [];
const sayIdx = []; // {audio} -> index into says at fire time
const says = [];
function setupFight(monsterId, px, py, mx, my) {
  audio.length = 0; says.length = 0; sayIdx.length = 0;
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  s.health = 200; s.mx = px; s.my = py;
  Game.ensureVillagerPositions();
  Game.state.village.roster = [];
  const vpos = Game.state.village.positions || {};
  for (const k of Object.keys(vpos)) vpos[k] = { mx: 8, my: 8 };
  s.mx = px; s.my = py;
  s.monster = { id: monsterId, mx, my };
  Game.startCombat(monsterId);
  const mf = Game.tbfight.fighters.find(f => f.kind === 'monster');
  if (mf) { mf.mx = mx; mf.my = my; }
  const pf = Game.tbFighter('p');
  if (pf) { pf.mx = px; pf.my = py; pf.hp = 2000; pf.maxHp = 2000; }
  return Game.tbfight.fighters.filter(f => f.kind === 'monster');
}
function drive(maxTurns, stopWhen) {
  let n = 0;
  while (Game.tbfight && !Game.tbfight.over && n++ < maxTurns) {
    if (stopWhen && stopWhen()) return true;
    if (Game.tbIsPlayerTurn()) Game.tbPlayerWait();
    else Game.tbAdvance();
  }
  return !!(stopWhen && stopWhen());
}

(async () => {
  await Game.init();
  Game.audio = new Proxy({}, { get: (t, n) => (d) => { sayIdx.push({ a: String(n), s: says.length }); audio.push(String(n)); } });
  const osay = Game.say.bind(Game);
  Game.say = (t) => { says.push(String(t)); return osay(t); };
  console.log(`seed=${SEED}`);

  // ---- 1. NIGHTCOURT: nightcourtTurn fires at roost, never after a dive declare.
  // Phase A: the player keeps distance (> dive range 4) so the nightcourt
  // spends roost turns closing; Phase B: the player stands still and lets it
  // dive, proving the dive itself stays silent for this hook.
  setupFight('nightcourt', 7, 7, 0, 0); // far apart: forced roost
  let phaseA = true;
  const ncTurnsAt = () => audio.filter(a => a === 'nightcourtTurn').length;
  const before = ncTurnsAt();
  for (let n = 0; n < 30 && Game.tbfight && !Game.tbfight.over && phaseA; n++) {
    if (Game.tbIsPlayerTurn()) {
      // keep >4 away: farthest corner from the nightcourt
      const m = Game.tbfight.fighters.find(f => f.kind === 'monster');
      const pf = Game.tbFighter('p');
      const corners = [[0, 0], [0, 8], [8, 0], [8, 8]];
      corners.sort((a, b) => (Math.max(Math.abs(b[0] - m.mx), Math.abs(b[1] - m.my))) - (Math.max(Math.abs(a[0] - m.mx), Math.abs(a[1] - m.my))));
      pf.mx = corners[0][0]; pf.my = corners[0][1];
      Game.tbPlayerWait();
    } else Game.tbAdvance();
    if (says.some(t => /moon-shadow is growing|coming again/.test(t))) phaseA = false;
  }
  const roostTurns = ncTurnsAt() - before;
  ok('nightcourtTurn fires at the roost beat', roostTurns >= 1, `count=${roostTurns}`);
  // every nightcourtTurn must be gated to the head-turn say (the most recent
  // nightcourt say at fire time is the roost head-rotation line).
  const turnRecs = sayIdx.filter(r => r.a === 'nightcourtTurn');
  const gated = turnRecs.every(r => {
    for (let i = r.s - 1; i >= Math.max(0, r.s - 4); i--) {
      if (/head rotates/.test(says[i])) return true;
    }
    return false;
  });
  ok('every nightcourtTurn is gated to the head-rotation roost say', gated && turnRecs.length > 0,
    `recs=${turnRecs.length}`);
  // Phase B: stand still, let it dive; the hook must stay silent through the dive.
  drive(30, () => says.some(t => /It lands — silent/.test(t)));
  const diveDeclares = [];
  says.forEach((t, i) => { if (/moon-shadow is growing|No sound\. It\\'s coming again|No sound\. That is the warning/.test(t)) diveDeclares.push(i); });
  const turnAfterDive = sayIdx.filter(r => r.a === 'nightcourtTurn').some(r => diveDeclares.some(d => d < r.s));
  ok('nightcourtTurn never fires at/after a dive declare (dive stays silent)', !turnAfterDive && diveDeclares.length > 0,
    `declares=${diveDeclares.length}`);

  // ---- 2. HERON: heronUnfold fires at the strike-declare; heronStatic still cues.
  setupFight('white_noise_heron', 4, 4, 4, 6);
  drive(25, () => audio.includes('heronUnfold'));
  ok('heronUnfold fires at the strike-declare', audio.includes('heronUnfold'));
  ok('heronStatic still fires as declare/windup cue (two-hook split)', audio.includes('heronStatic'),
    `static=${audio.filter(a => a === 'heronStatic').length}x`);
  ok('heronUnfold is not spammed (<=2 per fight window)', audio.filter(a => a === 'heronUnfold').length <= 2,
    `count=${audio.filter(a => a === 'heronUnfold').length}`);

  // ---- 3. HUSHWOLF: rush silent, snarl only after first contact, once per wolf.
  const wolves = setupFight('hushwolf', 4, 4, 4, 6);
  drive(30, () => audio.filter(a => a === 'wolfSnarl').length >= 1);
  const snarls = sayIdx.filter(r => r.a === 'wolfSnarl');
  ok('wolfSnarl fires at rush resolve (after contact)', snarls.length >= 1, `count=${snarls.length}`);
  // every snarl must be preceded by a "just teeth" hit-landing say: the rush
  // itself stays silent, no warning before contact.
  const contactFirst = snarls.every(r => says.slice(0, r.s).some(t => /no warning, just teeth/.test(t)));
  ok('no snarl before the first rush hit lands (rush stays silent)', contactFirst && snarls.length > 0);
  ok('snarl fires at most once per wolf', snarls.length <= wolves.length,
    `snarls=${snarls.length} wolves=${wolves.length}`);

  // ---- 4. BISON: "horn" is schema-conformant now.
  const schemas = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/schemas.json'), 'utf8'));
  const animalTypes = schemas.animal && schemas.animal.types ? schemas.animal.types
    : (schemas.animals && schemas.animals.types) || {};
  const butcherKeys = Object.keys(animalTypes.butcher || {});
  ok('schemas.json butcher schema allows horn', butcherKeys.includes('horn'), `keys=${butcherKeys.join(',')}`);
  const animals = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/animals.json'), 'utf8'));
  const bison = (Array.isArray(animals) ? animals : animals.animals || []).find(a => a.id === 'bison');
  const bisonHornOk = bison && bison.butcher && bison.butcher.horn === 2 && Object.keys(bison.butcher).every(k => butcherKeys.includes(k));
  ok('bison butcher yields all schema-conformant (horn: 2)', !!bisonHornOk);

  console.log(`\n${pass} pass, ${fail} fail (seed=${SEED})`);
  process.exit(fail ? 1 : 0);
})();
