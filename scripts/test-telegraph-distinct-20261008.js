#!/usr/bin/env node
// Telegraph distinctness proof (Steve 2026-10-08) — wave-2 telegraph voices.
// Asserts the 5 fixes from the flesh-out assignment, against the REAL code:
//   1. Each of the 5 direct monsters (understudy/landlord/heckler/union_rep/
//      moderator) resolves to a DISTINCT telegraph class.
//   2. paparazzo's `exposure` burstStyle hits a real STYLE_BUCKETS entry
//      (pzFlash), not the generic orange burst.
//   3. bright_idea's `detonation` burstStyle hits ideaHeat on windup ticks,
//      and biHot STILL wins the last tick (precedence guard).
//   4. voice_mimic_radio's w2aStatic is shape-distinct (concentric ripple
//      ring + sound-wave glyph), not a hue shift on lockOn purple.
//   5. Phantoms gone: no camera_swarm / delegate_beast / w2aSwarm in the
//      telegraph section of app.js (dead code only — no behavior change).
// Knowledge gating is preserved: unknown patterns populate NOTHING.
// Seeded (mulberry32, SEED env override) — seeded BEFORE any module eval.
// Usage: node scripts/test-telegraph-distinct-20261008.js
//        SEED=7 node scripts/test-telegraph-distinct-20261008.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

// ---------- seeded RNG BEFORE anything else ----------
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const SEED = parseInt(process.env.SEED || '20261008', 10);
const _rng = mulberry32(SEED);
Math.random = _rng;

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}${extra ? ' — ' + extra : ''}`); }
}

const appSrc = fs.readFileSync(path.join(ROOT, 'src/js/app.js'), 'utf8');

// ---------- extract the REAL tbAllTelegraphCells from app.js ----------
function extractTb() {
  const m = appSrc.match(/function tbAllTelegraphCells\(\) \{[\s\S]*?\n  \}\n/);
  if (!m) return null;
  return eval('(' + m[0].replace(/^function tbAllTelegraphCells/, 'function') + ')');
}
const tbAllTelegraphCells = extractTb();
ok('tbAllTelegraphCells extracts from app.js', typeof tbAllTelegraphCells === 'function');

// ---------- minimal Game stub; knowledge gate toggled per scenario ----------
let KNOWN = true;
const cells345 = [{ cx: 3, cy: 3 }, { cx: 3, cy: 4 }, { cx: 4, cy: 3 }, { cx: 4, cy: 4 }, { cx: 5, cy: 4 }];
function monFighter(mid, ptype, opts) {
  opts = opts || {};
  const pattern = { type: ptype };
  if (opts.burstStyle) pattern.burstStyle = opts.burstStyle;
  if (opts.chargeStyle) pattern.chargeStyle = opts.chargeStyle;
  const tg = { pattern: { type: ptype }, turnsLeft: opts.turnsLeft != null ? opts.turnsLeft : 2 };
  if (ptype === 'direct') { tg.kind = 'direct'; tg.targetKey = 'player1'; }
  else { tg.cells = cells345.slice(); }
  return {
    kind: 'monster', alive: true, key: 'm-' + mid, mx: 4, my: 2,
    mdef: { id: mid, attack: { pattern } },
    telegraph: tg,
  };
}
function playerFighter() { return { kind: 'player', key: 'player1', mx: 4, my: 4, alive: true }; }
function runFor(fighters) {
  globalThis.Game = { tbfight: { fighters }, encTelegraphKnown: () => KNOWN };
  return tbAllTelegraphCells();
}

// ---------- 1. direct family: 5 distinct identities ----------
const DIRECTS = ['understudy', 'landlord', 'heckler', 'union_rep', 'moderator'];
// Parse the per-monster class routing from app.js (_w2aCls ternaries).
const classMap = {};
const clsRe = /_w2aMon === '([a-z_0-9]+)'(?: && ![^\s?]+)? \? ' ([a-zA-Z0-9]+)'/g;
let cm;
while ((cm = clsRe.exec(appSrc)) !== null) classMap[cm[1]] = cm[2];
KNOWN = true;
const directClasses = {};
for (const mid of DIRECTS) {
  const r = runFor([monFighter(mid, 'direct'), playerFighter()]);
  ok(`1a: ${mid} direct marks the player's tile`, r.direct.has('4,4'));
  ok(`1b: ${mid} records its own identity (mon map)`, r.mon['4,4'] === mid, JSON.stringify(r.mon));
  directClasses[mid] = classMap[mid];
  ok(`1c: ${mid} has a per-monster class`, !!classMap[mid], classMap[mid]);
}
const distinctDirects = new Set(Object.values(directClasses));
ok('1d: the 5 direct monsters resolve to 5 DISTINCT classes',
  distinctDirects.size === 5 && !Object.values(directClasses).includes(undefined),
  JSON.stringify(directClasses));
ok('1e: none of the direct voices is just lockOn', !Object.values(directClasses).includes('lockOn'), JSON.stringify(directClasses));

// ---------- 2. paparazzo exposure -> pzFlash bucket ----------
KNOWN = true;
{
  const r = runFor([monFighter('paparazzo', 'burst', { burstStyle: 'exposure' }), playerFighter()]);
  ok('2a: exposure routes to pzFlash bucket', r.pzFlash.size === cells345.length, 'pzFlash=' + r.pzFlash.size);
  ok('2b: exposure no longer falls through to generic burst', r.burst.size === 0, 'burst=' + r.burst.size);
  ok('2c: app.js renders the pzFlash class', /_tg\.pzFlash\.has\(_k\) \? ' pzFlash'/.test(appSrc));
  ok('2d: pzFlash shares the flash voice (combined selector)', /\.cell\.w2bPz, \.cell\.pzFlash/.test(appSrc));
  ok('2e: STYLE_BUCKETS maps exposure -> pzFlash', /exposure: 'pzFlash'/.test(appSrc));
}

// ---------- 3. bright_idea detonation -> ideaHeat; biHot wins last tick ----------
KNOWN = true;
{
  const windup = runFor([monFighter('bright_idea', 'burst', { burstStyle: 'detonation', turnsLeft: 2 }), playerFighter()]);
  ok('3a: detonation windup routes to ideaHeat bucket', windup.ideaHeat.size === cells345.length, 'ideaHeat=' + windup.ideaHeat.size);
  ok('3b: detonation windup not generic burst', windup.burst.size === 0, 'burst=' + windup.burst.size);
  ok('3c: app.js renders the ideaHeat class', /_tg\.ideaHeat\.has\(_k\) \? ' ideaHeat'/.test(appSrc));
  const lastTick = runFor([monFighter('bright_idea', 'burst', { burstStyle: 'detonation', turnsLeft: 1 }), playerFighter()]);
  ok('3d: last tick STILL goes white-hot (biHot)', lastTick.biHot.size === cells345.length, 'biHot=' + lastTick.biHot.size);
  ok('3e: biHot precedence — last tick NOT in ideaHeat', lastTick.ideaHeat.size === 0, 'ideaHeat=' + lastTick.ideaHeat.size);
  ok('3f: biHot precedence guard in STYLE_BUCKETS routing', /targetSet !== out\.biHot/.test(appSrc));
}

// ---------- 4. static ripple is shape-distinct ----------
KNOWN = true;
{
  const r = runFor([monFighter('voice_mimic_radio', 'direct'), playerFighter()]);
  ok('4a: radio keeps its own identity', r.mon['4,4'] === 'voice_mimic_radio');
  ok('4b: radio class is w2aStatic', classMap.voice_mimic_radio === 'w2aStatic', classMap.voice_mimic_radio);
  ok('4c: w2aStatic has a concentric ripple ring (::before, border-radius 50%)',
    /\.cell\.w2aStatic::before \{[^}]*border-radius: 50%/.test(appSrc));
  ok('4d: w2aStatic has a sound-wave glyph (::after, \u224b)', /\.cell\.w2aStatic::after \{[^}]*content: '\u224b'/.test(appSrc));
  ok('4e: w2aStatic outline is color-distant from lockOn purple (#9d4edd)',
    !/#9d4edd/.test((appSrc.match(/\.cell\.w2aStatic \{[^}]*\}/) || [''])[0]));
}

// ---------- 5. phantoms gone from the telegraph section ----------
{
  const teleSection = appSrc.slice(appSrc.indexOf('function tbAllTelegraphCells'));
  ok('5a: no camera_swarm in telegraph section', !/camera_swarm/.test(teleSection));
  ok('5b: no delegate_beast in telegraph section', !/delegate_beast/.test(teleSection));
  ok('5c: no w2aSwarm anywhere in app.js', !/w2aSwarm/.test(appSrc));
  ok('5d: W2A_IDS has no phantom ids',
    !/W2A_IDS = \{[^}]*camera_swarm/.test(appSrc) && !/W2A_IDS = \{[^}]*delegate_beast/.test(appSrc));
  ok('5e: reduced-motion list covers the new buckets', /\.cell\.pzFlash, \.cell\.ideaHeat \{ animation: none/.test(appSrc));
}

// ---------- knowledge gate intact ----------
{
  KNOWN = false;
  const r = runFor([monFighter('landlord', 'direct'), monFighter('paparazzo', 'burst', { burstStyle: 'exposure' }), playerFighter()]);
  const allEmpty = ['burst', 'direct', 'pzFlash', 'ideaHeat', 'biHot'].every(b => r[b].size === 0) && Object.keys(r.mon).length === 0;
  ok('6a: unknown patterns show NOTHING (knowledge gate intact)', allEmpty,
    'direct=' + r.direct.size + ' pzFlash=' + r.pzFlash.size + ' monKeys=' + Object.keys(r.mon).length);
  KNOWN = true;
  const r2 = runFor([monFighter('landlord', 'direct'), playerFighter()]);
  ok('6b: learned patterns still show', r2.direct.size === 1 && r2.mon['4,4'] === 'landlord');
}

// ---------- 7. statickite mon-map identity + w2bKite class ----------
KNOWN = true;
{
  const r = runFor([monFighter('statickite', 'burst'), playerFighter()]);
  ok('7a: statickite records its own identity (mon map)', r.mon['3,3'] === 'statickite' || Object.values(r.mon).includes('statickite'), JSON.stringify(r.mon));
  ok('7b: statickite class is w2bKite', classMap.statickite === 'w2bKite', classMap.statickite);
  ok('7c: w2bKite voice is NOT the generic orange burst', classMap.statickite !== undefined && classMap.statickite !== 'burstRadius');
}

// ---------- 8. player-tile alert rings (tgPlayerAlertClasses) ----------
{
  const m = appSrc.match(/function tgPlayerAlertClasses\([\s\S]*?\n  \}\n/);
  ok('8a: tgPlayerAlertClasses extracts from app.js', !!m);
  const tgPlayerAlertClasses = eval('(' + m[0].replace(/^function tgPlayerAlertClasses/, 'function') + ')');
  const RINGS = { voice_mimic_radio: 'staticTarget', understudy: 'underTarget', landlord: 'lordTarget', heckler: 'heckTarget', union_rep: 'unionTarget', moderator: 'modTarget' };
  const seen = new Set();
  for (const mid of Object.keys(RINGS)) {
    const tg = runFor([monFighter(mid, 'direct'), playerFighter()]);
    const cls = tgPlayerAlertClasses(tg, null, 4, 4);
    ok(`8b: ${mid} on player tile rings the marker (${RINGS[mid]})`, cls.includes(RINGS[mid]), JSON.stringify(cls));
    seen.add(RINGS[mid]);
    // ring CSS exists for each class
    ok(`8c: .vent.${RINGS[mid]} ring CSS exists`, new RegExp('\\.vent\\.' + RINGS[mid] + '::before').test(appSrc));
  }
  ok('8d: all 6 ring classes are distinct', seen.size === 6, JSON.stringify([...seen]));
}

console.log(`\n${pass} passed, ${fail} failed (seed ${SEED})`);
process.exit(fail ? 1 : 0);
