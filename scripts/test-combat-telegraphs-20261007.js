// scripts/test-combat-telegraphs-20261007.js
// Proof test for combat telegraph depth (worker A, 2026-10-07).
// Seeded PRNG (mulberry32) per the PROOF-TEST RNG STABILITY lesson.
// Asserts geometry invariants + plays a few monster turns as a player,
// reading the telegraph text and judging distinctness/feel.
// Run: node scripts/test-combat-telegraphs-20261007.js
'use strict';
const fs = require('fs');
const path = require('path');

// --- seeded PRNG ---
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const SEED = parseInt(process.env.SEED || '20261007', 10);
Math.random = mulberry32(SEED);

const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'js', 'engine', 'combat.js'), 'utf8');
eval(src);
const C = globalThis.Scattering.combat;

let pass = 0, fail = 0;
function ok(cond, msg) {
  if (cond) { pass++; }
  else { fail++; console.log('FAIL:', msg); }
}
function cellsKey(cells) {
  return cells.map(c => c.cx + ',' + c.cy).sort().join('|');
}

const TYPES = ['beam', 'line', 'charge', 'burst', 'ambush', 'lockon', 'ambush-zone'];
const BASE_PATTERNS = {
  beam: { type: 'beam', length: 5, width: 1 },
  line: { type: 'line', length: 4, width: 1 },
  charge: { type: 'charge', length: 5, width: 1 },
  burst: { type: 'burst', radius: 2 },
  ambush: { type: 'ambush', radius: 1 },
  lockon: { type: 'lockon' },
  'ambush-zone': { type: 'ambush-zone', radius: 1, center: { x: 4, y: 4 } },
};

// 1. Every pattern produces non-empty in-grid cells.
for (const t of TYPES) {
  const cells = C.patternCells(BASE_PATTERNS[t], 2, 2, 6, 6);
  ok(cells.length > 0, t + ': patternCells non-empty');
  ok(cells.every(c => c.cx >= 0 && c.cx <= 8 && c.cy >= 0 && c.cy <= 8), t + ': all cells in grid');
}

// 2. THE invariant: windup cells == action cells for every pattern,
//    over many positions (dodgeable-by-movement preserved).
for (const t of TYPES) {
  for (let i = 0; i < 12; i++) {
    const ax = 1 + Math.floor(Math.random() * 7), ay = 1 + Math.floor(Math.random() * 7);
    const tx = 1 + Math.floor(Math.random() * 7), ty = 1 + Math.floor(Math.random() * 7);
    const pat = Object.assign({}, BASE_PATTERNS[t]);
    if (t === 'ambush-zone') pat.center = { x: tx, y: ty };
    const w = C.cellsAtPhase(pat, ax, ay, tx, ty, 'windup');
    const a = C.cellsAtPhase(pat, ax, ay, tx, ty, 'action');
    ok(cellsKey(w) === cellsKey(a), t + ': windup==action cells (' + ax + ',' + ay + '->' + tx + ',' + ty + ')');
    ok(w.every(c => c.danger === false) && a.every(c => c.danger === true), t + ': danger flags tag correctly');
  }
}

// 3. lock-on: exactly the target's square; re-lock at fire time is honest.
{
  const cells = C.patternCells({ type: 'lockon' }, 1, 1, 5, 5);
  ok(cells.length === 1 && cells[0].cx === 5 && cells[0].cy === 5, 'lockon: single cell == target square');
  // player moved before fire -> re-lock targets the NEW square
  const relock = C.patternCells({ type: 'lockon' }, 1, 1, 6, 4);
  ok(relock.length === 1 && relock[0].cx === 6 && relock[0].cy === 4, 'lockon: re-lock follows the target');
}

// 4. ambush-zone: cheb circle around pattern.center; zoneArmed trigger.
{
  const pat = { type: 'ambush-zone', radius: 1, center: { x: 4, y: 4 } };
  const cells = C.patternCells(pat, 7, 7, 2, 2); // attacker pos irrelevant
  ok(cells.length === 9, 'ambush-zone: radius-1 circle has 9 cells (got ' + cells.length + ')');
  ok(cells.every(c => Math.max(Math.abs(c.cx - 4), Math.abs(c.cy - 4)) <= 1), 'ambush-zone: centered on pattern.center');
  ok(C.zoneArmed(pat, 4, 4) === true, 'ambush-zone: armed at center');
  ok(C.zoneArmed(pat, 5, 5) === true, 'ambush-zone: armed at edge');
  ok(C.zoneArmed(pat, 6, 6) === false, 'ambush-zone: not armed outside');
  ok(C.zoneArmed({ type: 'burst', radius: 1 }, 4, 4) === false, 'zoneArmed false for non-zone pattern');
  const armText = C.telegraphText(pat, 'arming', true);
  ok(typeof armText === 'string' && armText.length > 0, 'ambush-zone: arming phase text exists');
}

// 5. Coherence metadata: every type carries anatomy the renderer can justify.
for (const t of TYPES) {
  const info = C.patternInfo(t);
  ok(info && info.anatomy && info.anatomy.deliveredBy && info.anatomy.mechanism && info.anatomy.visibleCue,
    t + ': anatomy metadata complete');
  ok(info.phases && info.phases.windup >= 1 && info.phases.action >= 1 && info.phases.recovery >= 1,
    t + ': phase timing weights present');
}
ok(C.patternInfo('nope').label === 'attack', 'unknown type falls back to default info');

// 6. Knowledge gating: knownCue coaching distinct per pattern; unknown honest
//    and distinct; unknown never equals the known cue.
{
  const knowns = new Set(), unknowns = new Set();
  for (const t of TYPES) {
    const info = C.patternInfo(t);
    ok(info.knownCue && info.knownCue.length > 20, t + ': knownCue present');
    ok(info.unknown && info.unknown.length > 20, t + ': unknown text present');
    ok(!knowns.has(info.knownCue), t + ': knownCue distinct from other patterns');
    ok(!unknowns.has(info.unknown), t + ': unknown text distinct from other patterns');
    ok(info.knownCue !== info.unknown, t + ': known != unknown');
    knowns.add(info.knownCue); unknowns.add(info.unknown);
    // "if you don't know, it doesn't show": unknown text must not leak the cue.
    const kt = C.telegraphText(BASE_PATTERNS[t], 'windup', true);
    const ut = C.telegraphText(BASE_PATTERNS[t], 'windup', false);
    ok(kt !== ut, t + ': windup text differs known vs unknown');
    ok(ut === info.unknown, t + ': unknown windup text is the honest unknown text');
    for (const ph of ['windup', 'action', 'recovery']) {
      const txt = C.telegraphText(BASE_PATTERNS[t], ph, true);
      ok(typeof txt === 'string' && txt.length > 10, t + '/' + ph + ': known phase text present');
    }
  }
}

// 7. Variant escalation: pure, keyed off a variant flag, no monster data edits.
{
  const base = { type: 'charge', length: 5, width: 1 };
  const scarred = C.applyVariant(base, 'scarred');
  ok(scarred.width === 2 && base.width === 1, 'scarred charge: wider lane, input untouched');
  const vet = C.applyVariant(base, 'veteran');
  ok(vet.length === 6, 'veteran charge: longer reach');
  const burstBase = { type: 'burst', radius: 2 };
  ok(C.applyVariant(burstBase, 'scarred').radius === 3, 'scarred burst: wider radius');
  ok(C.applyVariant(burstBase, 'veteran').radius === 3, 'veteran burst: wider radius');
  const elder = C.applyVariant(burstBase, 'elder');
  ok(elder.secondPhase === true && !burstBase.secondPhase, 'elder: secondPhase flag, input untouched');
  const fu = C.patternFollowUp(elder);
  ok(fu && fu.type === 'burst' && fu.radius === 1, 'elder follow-up: radial slam');
  ok(C.patternFollowUp(base) === null, 'no follow-up without secondPhase');
  const pl = C.applyVariant(base, 'pack-leader');
  const tBase = C.phaseTiming(base, null), tPL = C.phaseTiming(pl, 'pack-leader');
  ok(tPL.windup < tBase.windup, 'pack-leader: faster windup (' + tBase.windup + '->' + tPL.windup + ')');
  const same = C.applyVariant(base, null);
  ok(JSON.stringify(same) === JSON.stringify(base) && same !== base, 'null variant: equal copy');
}

// 8. dodgeable() still the machine-checkable side of the invariant.
{
  const cells = C.patternCells({ type: 'beam', length: 5, width: 1 }, 4, 1, 4, 7);
  // fighter standing ON the beam at (4,4) with speed 2 can reach (2,4) etc.
  ok(C.dodgeable(cells, 4, 4, 2) === true, 'dodgeable: can escape the beam lane');
}

// --- PLAYED PASS: drive real monster turns, read telegraphs as a player. ---
console.log('\n=== PLAYED PASS: telegraphs as a player would read them ===');
function mkF(o) { return Object.assign({ alive: true, fled: false, hp: 50, maxHp: 100, speed: 3, mx: 4, my: 4, kind: 'monster' }, o); }
const player = mkF({ key: 'player', kind: 'player', mx: 6, my: 4, speed: 3 });
const noBlocked = () => false;
const seen = new Set();
function showTelegraph(monsterName, action, ax, ay, known) {
  if (!action || action.type !== 'telegraph') { console.log(monsterName + ': no telegraph (action=' + (action && action.type) + ')'); return; }
  const pat = action.pattern, tx = action.target.x, ty = action.target.y;
  const w = C.cellsAtPhase(pat, ax, ay, tx, ty, 'windup');
  console.log('\n[' + monsterName + '] telegraphs ' + C.patternInfo(pat.type).label + ' at (' + tx + ',' + ty + '), ' + w.length + ' cells');
  const wt = C.telegraphText(pat, 'windup', known);
  const at = C.telegraphText(pat, 'action', known);
  console.log('  windup (' + (known ? 'KNOWN' : 'UNKNOWN') + '): ' + wt);
  console.log('  action : ' + at);
  const rt = C.telegraphText(pat, 'recovery', known);
  console.log('  recovery: ' + rt);
  if (pat.type === 'lockon') {
    const info = C.patternInfo('lockon');
    console.log('  coaching: ' + info.knownCue);
  }
  seen.add(wt); seen.add(at); seen.add(rt);
  ok(w.length > 0, monsterName + ': telegraph shows cells');
  ok(cellsKey(w) === cellsKey(C.cellsAtPhase(pat, ax, ay, tx, ty, 'action')), monsterName + ': windup==action (dodgeable)');
}

const tactics = [
  ['Ridge Charger', 'charge', { type: 'charge', length: 5, width: 1 }],
  ['Spine Poppa', 'burst', { type: 'burst', radius: 2 }],
  ['Flanker', 'circle', null],
  ['Scrapper', 'skirmish', null],
];
for (const [name, tactic, pat] of tactics) {
  const m = mkF({ key: 'm-' + tactic, tactic, pattern: pat, mx: 2, my: 4, chargeRange: 5 });
  const plan = C.monsterTacticPlan(m, [m, player], noBlocked, null);
  console.log('\n' + name + ' (' + tactic + ') -> intent: ' + plan.intent + ', action: ' + plan.action.type);
  showTelegraph(name, plan.action, 2, 4, true);
}
// lock-on and ambush-zone are emitted by game.js telegraph actions directly:
const gazer = mkF({ key: 'gazer', mx: 2, my: 2 });
showTelegraph('Gaze Stalker', { type: 'telegraph', pattern: { type: 'lockon' }, target: { x: 6, y: 4 } }, 2, 2, true);
showTelegraph('Gaze Stalker', { type: 'telegraph', pattern: { type: 'lockon' }, target: { x: 6, y: 4 } }, 2, 2, false);
showTelegraph('Trapjaw', { type: 'telegraph', pattern: { type: 'ambush-zone', radius: 1, center: { x: 5, y: 4 } }, target: { x: 5, y: 4 } }, 7, 7, true);
console.log('\n  arming beat (player steps in): ' + C.telegraphText({ type: 'ambush-zone', radius: 1, center: { x: 5, y: 4 } }, 'arming', true));
seen.add(C.telegraphText({ type: 'ambush-zone', radius: 1, center: { x: 5, y: 4 } }, 'arming', true));
// variant escalation in play: scarred veteran of the charger
{
  const m = mkF({ key: 'm-scarred', tactic: 'charge', mx: 2, my: 4, chargeRange: 5,
    pattern: C.applyVariant({ type: 'charge', length: 5, width: 1 }, 'scarred') });
  const plan = C.monsterTacticPlan(m, [m, player], noBlocked, null);
  const w = C.cellsAtPhase(plan.action.pattern, 2, 4, plan.action.target.x, plan.action.target.y, 'windup');
  const base = C.cellsAtPhase({ type: 'charge', length: 5, width: 1 }, 2, 4, plan.action.target.x, plan.action.target.y, 'windup');
  console.log('\nScarred Ridge Charger lane: ' + w.length + ' cells vs base ' + base.length + ' cells');
  ok(w.length > base.length, 'scarred: visibly wider lane');
}

ok(seen.size >= 12, 'played pass: at least 12 distinct telegraph texts read (' + seen.size + ')');

console.log('\n' + pass + ' passed, ' + fail + ' failed (seed ' + SEED + ')');
process.exit(fail ? 1 : 0);
