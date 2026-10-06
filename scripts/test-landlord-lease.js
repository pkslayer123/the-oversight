// PROOF TEST (Steve 2026-10-06): THE LANDLORD — the lease actually grows.
// Before/after for the wave-2 escalation rework:
//   BEFORE (HEAD): spread is ONE-SHOT (llSpread flag), no rent, no encirclement,
//     +2 heal never matters, silent-ish audio, no knownCue, no armor, codex lies.
//   AFTER: repeated Addendum WAVES, Collect Rent (standing damage, scales with
//     wave), EVICTION (encirclement when you turtle), scaling heal, FORECLOSURE
//     phase, real synths wired, knownCue, armor 3 + psychic 0.5, honest codex.
//
// Played AS A PLAYER via the node harness (NOT jest): turtle fight vs mover
// fight, plus a knownCue check and mechanical audio-registry/codex checks.
//
// Run after:  node scripts/test-landlord-lease.js
// Run before: LL_MODE=before GAMEJS=/tmp/ll-before/game.js MONJSON=/tmp/ll-before/monsters.json node scripts/test-landlord-lease.js
//   (before-files: read-only `git show HEAD:...` extracts; never a stash)
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const MODE = process.env.LL_MODE || 'after';
const GAMEJS = process.env.GAMEJS || 'src/js/game.js';
const MONJSON = process.env.MONJSON || 'src/data/monsters.json';

// Deterministic RNG so before/after are comparable.
let _s = 1234567;
Math.random = () => { _s = (_s * 1103515245 + 12345) & 0x7fffffff; return _s / 0x7fffffff; };

global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(
  f === 'src/data/monsters.json' ? (path.isAbsolute(MONJSON) ? MONJSON : path.join(ROOT, MONJSON)) : path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 GAMEJS, 'src/js/progression.js', 'src/js/encounters.js', 'src/js/food.js',
 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js',
 'src/js/justice.js', 'src/js/debug-scenarios.js'].forEach(f => eval(fs.readFileSync(path.isAbsolute(f) ? f : path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;
function flatGrid() { return Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => 'grass')); }
const P = () => Game.tbFighter('p');
const MM = () => Game.tbfight && Game.tbfight.fighters.find(x => x.kind === 'monster');
const cheb = (ax, ay, bx, by) => Math.max(Math.abs(ax - bx), Math.abs(ay - by));
const claimedCount = () => Object.values((Game.tbfight || {}).terraform || {}).filter(t => t === 'claimed').length;
function snapshotGrid() {
  const p = P(), m = MM(); const rows = [];
  for (let y = 0; y < 9; y++) {
    let row = '';
    for (let x = 0; x < 9; x++) {
      if (p && p.mx === x && p.my === y) row += 'P';
      else if (m && m.mx === x && m.my === y) row += 'M';
      else if (Game.tbTerrainAt(x, y) === 'claimed') row += '#';
      else row += '.';
    }
    rows.push(row);
  }
  return rows.join('\n');
}
// TURN HYGIENE (AGENTS.md): advance ONLY if still the player's turn.
function endTurn() {
  if (!Game.tbfight || Game.tbfight.over) return;
  if (!Game.tbIsPlayerTurn()) return;
  const p = P(); p.moveLeft = 0; p.acted = true;
  Game.tbAfterPlayerAction();
}
const sayLog = [];
const firedAudio = [];
function startFight() {
  sayLog.length = 0; firedAudio.length = 0;
  Game.startCombat('landlord');
  const m = MM(); m.hp = m.maxHp = 100;
  const p = P(); p.hp = p.maxHp = 150;
  m.mx = 5; m.my = 4; p.mx = 2; p.my = 4;
  Game.state.scholar.mx = p.mx; Game.state.scholar.my = p.my;
  m.beamPhase = null;
  return m;
}
function tryStrike(m) {
  const p = P();
  if (!Game.tbIsPlayerTurn()) return false;
  if (cheb(p.mx, p.my, m.mx, m.my) > Game.equippedWeapon().range) return false;
  return Game.tbPlayerStrike(m.key) === true;
}
function parseLog() {
  const rent = sayLog.map(l => l.match(/takes its cut\. \((\d+)\)/)).filter(Boolean).map(x => +x[1]);
  const heal = sayLog.map(l => l.match(/pays rent\. \(\+(\d+)\)/)).filter(Boolean).map(x => +x[1]);
  return {
    rentTotal: rent.reduce((a, b) => a + b, 0), rentHits: rent.length,
    healTotal: heal.reduce((a, b) => a + b, 0), maxHeal: heal.length ? Math.max(...heal) : 0,
    evict: sayLog.filter(l => /NOTICE SERVED/.test(l)).length,
    foreclosure: sayLog.some(l => /FORECLOSURE/.test(l)),
    addenda: sayLog.filter(l => /ADDENDUM #\d+/.test(l)).length,
    absorbs: sayLog.some(l => /absorbs 3/.test(l)),
  };
}
function fightTurtle() {
  const m = startFight();
  let rounds = 0, maxWave = 0, alive = true, gridSnap = null; const claimedHist = [];
  while (rounds < 14 && Game.tbfight && !Game.tbfight.over) {
    maxWave = Math.max(maxWave, m.llAddenda || 0);
    claimedHist.push(claimedCount());
    tryStrike(m); // stand and trade: never move
    endTurn(); rounds++;
    if (rounds === 4) gridSnap = snapshotGrid();
    if (P()) alive = P().alive; // tbfight tears down after a kill; keep last known
  }
  const L = parseLog();
  return { rounds, maxWave, claimedHist, playerAlive: alive, monsterHp: m.hp, phase: m.beamPhase, gridSnap, ...L, fired: [...firedAudio] };
}
function nearestUnclaimed(p, m) {
  let best = null, bestD = 1e9;
  for (let y = 1; y <= 7; y++) for (let x = 1; x <= 7; x++) {
    if (x === m.mx && y === m.my) continue;
    if (Game.tbTerrainAt(x, y) === 'claimed') continue;
    const d = cheb(x, y, p.mx, p.my);
    if (d > 0 && d < bestD) { bestD = d; best = { x, y }; }
  }
  return best;
}
function fightMover() {
  const m = startFight();
  let rounds = 0, maxWave = 0, moves = 0, alive = true; const claimedHist = [];
  while (rounds < 16 && Game.tbfight && !Game.tbfight.over) {
    maxWave = Math.max(maxWave, m.llAddenda || 0);
    claimedHist.push(claimedCount());
    const p = P();
    const dest = nearestUnclaimed(p, m);
    if (dest && Game.tbIsPlayerTurn() && p.moveLeft > 0) {
      if (Game.tbPlayerMove(dest.x, dest.y)) moves++;
    }
    tryStrike(m);
    endTurn(); rounds++;
    if (P()) alive = P().alive;
  }
  const L = parseLog();
  const mm = MM();
  return { rounds, maxWave, claimedHist, moves, playerAlive: alive, monsterDead: mm ? !mm.alive : true, monsterHp: mm ? mm.hp : 0, phase: m.beamPhase, ...L, fired: [...firedAudio] };
}
function checkKnownCue() {
  const m = startFight();
  Game.tbLearnPattern(m); // survived Eviction Notice — pattern learned
  const p = P();
  m.mx = 4; m.my = 4; p.mx = 5; p.my = 4; // adjacent, interior
  m.telegraph = null; m.llLastPx = 99; m.llLastPy = 99; // not "stationary"
  endTurn(); // landlord declares the eviction telegraph
  const cue = Game.tbTelegraphCue(m);
  const kc = ((m.mdef || {}).encounter || {}).knownCue || '';
  return { cueHasKnownCue: !!kc && cue.includes(kc), cueHasCoaching: cue.includes('You know this one: Eviction Notice'), knownCueText: kc };
}
function checkAudioRegistry() {
  const gameSrc = fs.readFileSync(path.join(ROOT, 'src/js/game.js'), 'utf8');
  const appSrc = fs.readFileSync(path.join(ROOT, 'src/js/app.js'), 'utf8');
  const calls = [...new Set([...gameSrc.matchAll(/audioEvent\('(landlord\w+)'/g)].map(x => x[1]))];
  const regKeys = new Set([...appSrc.matchAll(/^\s*(landlord\w+)\(\)\s*\{\s*\1\(\)/gm)].map(x => x[1]));
  const missing = calls.filter(k => !regKeys.has(k));
  // synth reality: brace-match each landlord synth; a stub is a few lines.
  const synthInfo = {};
  for (const k of regKeys) {
    const start = appSrc.indexOf(`function ${k}() {`);
    if (start < 0) { synthInfo[k] = 'MISSING FN'; continue; }
    let depth = 0, i = appSrc.indexOf('{', start);
    for (; i < appSrc.length; i++) {
      if (appSrc[i] === '{') depth++;
      else if (appSrc[i] === '}') { depth--; if (!depth) break; }
    }
    const body = appSrc.slice(start, i + 1);
    synthInfo[k] = { len: body.length, real: body.length > 300 && /createOscillator/.test(body) };
  }
  return { calls, missing, synthInfo };
}
function checkCodex() {
  const def = JSON.parse(fs.readFileSync(path.isAbsolute(MONJSON) ? MONJSON : path.join(ROOT, MONJSON), 'utf8'));
  const ms = def.monsters || def;
  const ll = ms.find(x => x.id === 'landlord');
  const slain = ((ll.codexStages || {}).slain) || '';
  return {
    armor: ll.armor, psychicRes: (ll.resistances || {}).psychic,
    knownCue: !!((ll.encounter || {}).knownCue),
    phases: ((ll.encounter || {}).phases) || [],
    slainHonestRent: /every round you end on claimed ground/.test(slain),
    slainNoFakeMarkers: !/target the claim markers/.test(slain),
    weaknessHonest: (ll.weaknesses || []).every(w => !/fire clears claimed/.test(w)),
  };
}
(async () => {
  await Game.init();
  Game.say = (t) => { sayLog.push(String(t)); };
  const _ae = Game.audioEvent.bind(Game);
  Game.audioEvent = (n, d) => { firedAudio.push(n); return _ae(n, d); };
  Game.genDetail = () => flatGrid();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart(); Game.dayPart = 1;
  Game.state.scholar.health = 500;
  Game.state.scholar.equipped = { weapon: { itemId: 'fire_hardened_spear', name: 'Fire-hardened spear' } };
  Game.canSee = () => true;

  console.log(`=== LANDLORD LEASE PROOF TEST [mode=${MODE}] ===`);
  const T = fightTurtle();
  console.log(`TURTLE: rounds=${T.rounds} waves=${T.maxWave} claimed ${T.claimedHist[0]}->${T.claimedHist[T.claimedHist.length-1]} ` +
    `rent=${T.rentTotal}(${T.rentHits} hits) evictNotices=${T.evict} healTotal=${T.healTotal} maxHeal=${T.maxHeal} ` +
    `foreclosure=${T.foreclosure} playerAlive=${T.playerAlive} phase=${T.phase}`);
  console.log(`  audio fired: ${[...new Set(T.fired)].join(',')}`);
  console.log(`  jurisdiction at round 4 (P=you M=landlord #=claimed):\n${T.gridSnap.split('\n').map(r => '    ' + r).join('\n')}`);
  const V = fightMover();
  console.log(`MOVER: rounds=${V.rounds} moves=${V.moves} waves=${V.maxWave} claimed ${V.claimedHist[0]}->${V.claimedHist[V.claimedHist.length-1]} ` +
    `rent=${V.rentTotal}(${V.rentHits} hits) healTotal=${V.healTotal} playerAlive=${V.playerAlive} monsterDead=${V.monsterDead} phase=${V.phase}`);
  const K = checkKnownCue();
  console.log(`KNOWNCUE: cueHasCoaching=${K.cueHasCoaching} cueHasKnownCue=${K.cueHasKnownCue}`);
  const A = checkAudioRegistry();
  console.log(`AUDIO: callSites=[${A.calls.join(',')}] missing=[${A.missing.join(',')}] ` +
    Object.entries(A.synthInfo).map(([k, v]) => `${k}:${typeof v === 'string' ? v : (v.real ? 'REAL(' + v.len + ')' : 'STUB?(' + v.len + ')')}`).join(' '));
  const C = checkCodex();
  console.log(`CODEX: armor=${C.armor} psychicRes=${C.psychicRes} knownCue=${C.knownCue} phases=[${C.phases.join(',')}] ` +
    `slainHonestRent=${C.slainHonestRent} slainNoFakeMarkers=${C.slainNoFakeMarkers} weaknessHonest=${C.weaknessHonest} armorAbsorbedInFight=${T.absorbs || V.absorbs}`);

  const fails = [];
  const ok = (cond, name) => { if (!cond) fails.push(name); console.log(`  ${cond ? 'PASS' : 'FAIL'} ${name}`); };
  console.log('--- assertions ---');
  if (MODE === 'before') {
    ok(T.maxWave === 0, 'before: no repeated waves (one-shot spread)');
    ok(T.rentTotal === 0, 'before: no rent on standing');
    ok(T.evict === 0, 'before: no eviction encirclement');
    ok(T.healTotal <= 8, 'before: heal negligible');
    ok(!T.foreclosure, 'before: no foreclosure phase');
  } else {
    ok(T.maxWave >= 2, 'turtle: repeated spread waves reach foreclosure');
    ok(T.claimedHist[T.claimedHist.length - 1] > T.claimedHist[0] + 3, 'turtle: claimed tiles visibly grow');
    ok(T.evict >= 1, 'turtle: eviction notice served on stationary player');
    ok(T.rentTotal >= 3, 'turtle: rent collected for standing on leased ground');
    ok(T.healTotal >= 4 && T.maxHeal >= 3, 'turtle: heal fires and scales with waves');
    ok(T.foreclosure, 'turtle: FORECLOSURE phase reached');
    ok(T.fired.includes('landlordSpread') && T.fired.includes('landlordEvict') && T.fired.includes('landlordClaim'), 'turtle: spread/evict/claim audio events fire');
    ok(V.maxWave >= 1, 'mover: waves still fire while moving');
    ok(V.rentTotal < T.rentTotal, 'mover: moving avoids most rent (turtle punished)');
    ok(V.playerAlive, 'mover: keep-moving player survives the lease');
    ok(K.cueHasCoaching && K.cueHasKnownCue, 'knownCue coaching appears after pattern learned');
    ok(A.missing.length === 0, 'audio: every landlord call site resolves in registry');
    ok(Object.values(A.synthInfo).every(v => typeof v !== 'string' && v.real), 'audio: landlord synths are real compositions, not stubs');
    ok(C.armor === 3 && C.psychicRes === 0.5, 'armor 3 + psychic 0.5 on the books');
    ok(T.absorbs || V.absorbs, 'armor absorbs observed in a fight');
    ok(C.knownCue && C.phases.includes('foreclosing'), 'knownCue + foreclosing phase in encounter data');
    ok(C.slainHonestRent && C.slainNoFakeMarkers && C.weaknessHonest, 'codex honest: rent wording true, no fake markers, no fake fire-weakness');
  }
  console.log(fails.length ? `\nRESULT: FAIL (${fails.join('; ')})` : '\nRESULT: ALL PASS');
  process.exit(fails.length ? 1 : 0);
})();
