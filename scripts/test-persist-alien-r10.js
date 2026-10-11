// PROBE r10: save/load of alien-player state, fresh angle from commit 2babaa41.
// BEFORE=1: asserts the VULNERABLE behavior (demonstrates the kill on unfixed code).
// default:  asserts the FIXED behavior.
// Run: node scripts/test-persist-harness.js scripts/test-persist-alien-r10.js
//      BEFORE=1 node scripts/test-persist-harness.js scripts/test-persist-alien-r10.js
'use strict';
const BEFORE = (typeof process !== 'undefined' && process.env && process.env.BEFORE === '1');
let fails = 0, passes = 0;
function check(name, cond, extra) {
  if (!cond) { fails++; console.log('FAIL:', name, extra === undefined ? '' : JSON.stringify(extra).slice(0, 300)); }
  else { passes++; console.log('ok:', name); }
}
function newRun() {
  storage.clear();
  freshGame();
  G.state.systemArrived = true;
  return G.state.runKey;
}

const PID = 'countess_sable';
const P = G.apPersona(PID);
check('persona data loads', !!(P && P.name));

// ============ K1: ungated codex names in OLD saves leak through load ============
// Pre-2026-10-10 apCodexEntry wrote entry.name = p.name UNGATED ("the human
// persona's name - safe pre-reveal" - the false assumption r11 disproved).
// Those entries persist in save blobs; the codex renderer prints entry.name
// verbatim. A player with 1-2 pre-reveal encounters who loads an old save
// sees the true persona name in the codex with no reveal ever happening.
newRun();
G.state.codex = G.state.codex || {};
G.state.codex.aliens = {};
G.state.codex.aliens[PID] = {
  name: P.name, title: 'stranger', species: 'unknown', disposition: 'unknown',
  stage: 'encountered',
  note: "A stranger crossed you out in the wild. Moved wrong - too smooth, too practiced. You can't place why."
};
G.apState().met[PID] = { encounters: 2, bond: 0 }; // fought twice, never revealed
delete G.apState().known[PID];
G.save();
const k1 = G.state.runKey;
check('K1 setup: load succeeds', G.load(k1) !== false);
const e1 = (G.state.codex.aliens || {})[PID] || {};
if (BEFORE) {
  check('K1 DEMO (before fix): old ungated name leaks through load', e1.name === P.name, e1.name);
} else {
  check('K1 FIX: load re-gates old codex entry (name)', e1.name === 'someone', e1.name);
  check('K1 FIX: load re-gates old codex entry (title/species)', e1.title === 'stranger' && e1.species === 'unknown',
    e1.title + '/' + e1.species);
  check('K1 FIX: met/encounters record untouched by scrub', (G.apState().met[PID] || {}).encounters === 2);
}

// K1b: a REVEALED persona must keep its true name (no over-scrubbing).
newRun();
const PID2 = 'pip_quindle';
const P2 = G.apPersona(PID2);
G.state.codex = G.state.codex || {};
G.state.codex.aliens = {};
G.state.codex.aliens[PID2] = { name: P2.name, title: P2.title, species: P2.species,
  disposition: P2.disposition, stage: 'identified', note: 'known' };
G.apState().met[PID2] = { encounters: 4, bond: 1 };
G.apState().known[PID2] = 'you recognized the fighting style';
G.save();
const k1b = G.state.runKey;
G.load(k1b);
const e1b = (G.state.codex.aliens || {})[PID2] || {};
check('K1b: revealed persona keeps true name after load', e1b.name === P2.name, e1b.name);
check('K1b: revealed persona keeps stage', e1b.stage === 'identified', e1b.stage);

// ============ K2: state.alienEncounter.fighter is dead save payload ============
// apStartEncounter used to store { pid, fighter } in state; only .pid was
// ever read (tbEnd wrapper). The fighter was a stale fight-start duplicate
// of the live tbfight fighter - pure bloat in every mid-fight alien save.
// Fixed at both ends: apStartEncounter stores pid-only going forward, and
// load() strips the dead copy from older blobs.
newRun();
G.state.alienEncounter = { pid: PID, fighter: G.apBuildFighter(PID, 3, 3) }; // old blob shape
G.save();
const k2 = G.state.runKey;
check('K2 setup: load succeeds', G.load(k2) !== false);
const aeL = G.state.alienEncounter || {};
if (BEFORE) {
  check('K2 DEMO (before fix): stale fighter survives load', !!aeL.fighter, Object.keys(aeL));
} else {
  check('K2 FIX: load strips the dead fighter copy', !aeL.fighter && aeL.pid === PID, Object.keys(aeL));
  G.save(); // re-save after load: the blob itself must be clean now
  let raw2b = null;
  try { raw2b = JSON.parse(storage.getItem(k2)); } catch (e) {}
  const ae2b = raw2b && raw2b.alienEncounter;
  check('K2 FIX: re-saved blob carries pid only', !!(ae2b && ae2b.pid === PID && !ae2b.fighter),
    ae2b ? Object.keys(ae2b) : null);
}

// ============ HELD: r13 wealth-stance flags round-trip mid-fight save/load ============
// The r13 fix made _enraged/_wantsRetreat unconditional. syncRun serializes
// fighters via JSON round-trip (minus mdef/functions); load() restores them
// verbatim. A mid-fight save must not disarm an enraged rich persona.
newRun();
const af = G.apBuildFighter(PID, 3, 3);
af.hp = Math.floor(af.maxHp * 0.3); // rich + hurt -> enraged
const stance = G.apApplyWealthStance(PID, af);
check('setup: rich hurt persona enrages', stance === 'enraged' && af._enraged === true, stance);
const pf = { key: 'p', kind: 'player', name: 'You', hp: 100, maxHp: 100, mx: 4, my: 4,
  alive: true, fled: false, acted: false, moveLeft: 3 };
G.tbfight = { id: 'f_r10', fighters: [pf, af], order: ['p', 'ap_' + PID],
  turnIdx: 1, round: 2, over: false, terraform: {} };
G.save();
const k3 = G.state.runKey;
G.tbfight = null; // simulate a fresh page
check('setup: load succeeds', G.load(k3) !== false);
const raf = (G.tbfight && G.tbfight.fighters || []).find(f => f.alienPid === PID);
check('HELD: enraged flag survives save/load', !!(raf && raf._enraged === true), raf && raf._enraged);
check('HELD: stance survives save/load', !!(raf && raf._stance === 'enraged'), raf && raf._stance);
check('HELD: retreat flag stays false', !!(raf && raf._wantsRetreat === false), raf && raf._wantsRetreat);
check('HELD: fight id survives (once-per-fight gates)', G.tbfight && G.tbfight.id === 'f_r10',
  G.tbfight && G.tbfight.id);

// ============ HELD: fanClubs lazy migration through save/load ============
// fanClubs postdates older saves; apState() seeds every lane from legacy favor.
newRun();
G.apState(); // create alienPlayers
delete G.state.alienPlayers.fanClubs;
G.state.alienPlayers.favor = 30;
G.save();
const k4 = G.state.runKey;
G.load(k4);
// apState() lazily seeds fanClubs from legacy favor on first read - trigger it.
check('HELD: apFavor reads migrated lanes', G.apFavor() === 30, G.apFavor());
const fc = (G.state.alienPlayers || {}).fanClubs || {};
check('HELD: legacy favor seeds fanClubs on load', fc.fight === 30 && fc.survival === 30 &&
  fc.social === 30 && fc.showbiz === 30, JSON.stringify(fc));

// ============ HELD: dead-drop cooldown is fail-safe, not farmable ============
// lastDropDay is recorded BEFORE the kcal grant, and the grant is try/caught:
// a grant failure consumes the cooldown (denies the player) rather than
// leaving it unrecorded (which would duplicate on retry).
newRun();
const ap = G.apState();
let granted = 0;
for (let i = 0; i < 25; i++) { // retry past the 50% careful-gate; record only on success
  ap.lastDropDay = -999;
  const before = G.state.scholar.kcal || 0;
  const r = G.apDeadDrop();
  if (r === true) { granted++; break; }
}
check('HELD: dead drop eventually succeeds (wren helps from start)', granted === 1);
check('HELD: cooldown recorded on success', (G.state.scholar.day || 1) - ap.lastDropDay === 0);
check('HELD: second call same day refused (no farm)', G.apDeadDrop() === false);
// Fail-safe direction: even if the kcal grant throws, the cooldown stands.
ap.lastDropDay = -999;
const origCap = G.kcalCap;
G.kcalCap = function () { throw new Error('boom'); };
let okThrow = 0;
for (let i = 0; i < 25; i++) {
  ap.lastDropDay = -999;
  try { if (G.apDeadDrop() === true) { okThrow++; break; } } catch (e) { /* must not throw */ }
}
G.kcalCap = origCap;
check('HELD: grant throw does not escape apDeadDrop', okThrow === 1);
check('HELD: cooldown still recorded after grant throw (no dupe on retry)', G.apDeadDrop() === false);

console.log('----');
console.log(BEFORE ? 'BEFORE mode' : 'AFTER mode', passes + ' passed, ' + fails + ' failed');
process.exit(fails ? 1 : 0);
