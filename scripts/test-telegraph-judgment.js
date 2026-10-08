#!/usr/bin/env node
// Telegraph judgment-call fixes (Steve 2026-10-06): asserts for the 4 items
// from evidence/2026-10-06/proof-notes.md "Observations for Steve / later runs".
//  (a) Unknown cue promises no visible line (dread kept). Originally written
//      against the Middle Manager; that monster retired 2026-10-08, so the
//      same judgment call is now guarded on the paparazzo — the live wave-2
//      monster with the closest comparable telegraph voice (bespoke unknown
//      cue, knowledge-gated coaching via knownCue/knownTactics).
//  (b) tgPlayerAlertClasses emits player-coincident shadow/lock markers
//      (helper-level, not pixels) + renderDetail wires them into the vent marker.
// Usage: node scripts/test-telegraph-judgment.js
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
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}${extra ? ' — ' + extra : ''}`); }
}

function mdef(id) {
  const md = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/monsters.json'), 'utf8'));
  const mlist = Array.isArray(md) ? md : md.monsters;
  return mlist.find(m => m.id === id);
}

// Extract the REAL helper from app.js (same verbatim-extraction pattern as
// scripts/render-telegraph-proof.js uses for tbAllTelegraphCells).
function extractHelper() {
  const src = fs.readFileSync(path.join(ROOT, 'src/js/app.js'), 'utf8');
  const m = src.match(/function tgPlayerAlertClasses\(tgBuckets, gwDive, px, py\) \{[\s\S]*?\n  \}\n/);
  if (!m) return { fn: null, src: null };
  const fnSrc = m[0].replace(/^function tgPlayerAlertClasses/, 'function');
  return { fn: eval('(' + fnSrc + ')'), src: fnSrc };
}

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);

  // ---------- (a) Paparazzo unknown cue: no visible-line promise ----------
  const pz = { mdef: mdef('paparazzo'), telegraph: { turnsLeft: 1 } };
  Game.state.codex.monsters = Game.state.codex.monsters || {};
  delete Game.state.codex.monsters['paparazzo'];
  const unknownCue = Game.tbTelegraphCue(pz);
  const promisesVisibleLine = [
    /on that line/, /line on the ground/, /see the line/, /the line is visible/,
    /projected line/, /line on the dirt/, /look at the line/, /the glowing line/,
  ];
  ok('a1: unknown cue exists', typeof unknownCue === 'string' && unknownCue.length > 20, String(unknownCue).slice(0, 60));
  for (const rx of promisesVisibleLine) {
    ok(`a2: unknown cue has no visible-line promise (${rx})`, !rx.test(unknownCue), unknownCue);
  }
  ok('a3: unknown cue keeps dread (shutter + break loose)', /shutter/.test(unknownCue) && /break loose/.test(unknownCue), unknownCue);
  ok('a4: unknown cue keeps the paparazzo voice', /lens steadies/.test(unknownCue), unknownCue.slice(0, 60));
  ok('a5: unknown cue has no earned coaching', !/You know this one/.test(unknownCue) && !/break line of sight/.test(unknownCue));

  // Known cue / coaching untouched.
  Game.state.codex.monsters['paparazzo'] = { patterns: { 'Flash Photography': 'x' } };
  const knownCue = Game.tbTelegraphCue(pz);
  ok('a6: known cue still tactical (Four shots)', /Four shots/.test(knownCue), knownCue.slice(0, 120));
  ok('a7: known cue still appends earned coaching', /You know this one: Flash Photography/.test(knownCue) && /break line of sight/.test(knownCue), knownCue.slice(0, 120));
  delete Game.state.codex.monsters['paparazzo'].patterns;

  // ---------- (b) tgPlayerAlertClasses: player-coincident markers ----------
  const { fn: alert, src: alertSrc } = extractHelper();
  ok('b1: helper extracts from app.js', typeof alert === 'function');
  if (alert) {
    const diveOnMe = { phase: 'dive', tile: { x: 4, y: 4 }, turnsLeft: 1, streak: [] };
    const diveAway = { phase: 'dive', tile: { x: 6, y: 4 }, turnsLeft: 2, streak: [] };
    const circle = { phase: 'circle', monster: { x: 4, y: 4 } };
    const buckets = (keys) => ({ sbLock: new Set(keys) });
    ok('b2: dive shadow ON player -> diveTarget', JSON.stringify(alert(buckets([]), diveOnMe, 4, 4)) === '["diveTarget"]');
    ok('b3: dive shadow elsewhere -> no marker', alert(buckets([]), diveAway, 4, 4).length === 0);
    ok('b4: dive circle phase -> no marker', alert(buckets([]), circle, 4, 4).length === 0);
    ok('b5: sbLock ON player -> sbLockTarget', JSON.stringify(alert(buckets(['4,4']), null, 4, 4)) === '["sbLockTarget"]');
    ok('b6: sbLock elsewhere -> no marker', alert(buckets(['6,4']), null, 4, 4).length === 0);
    ok('b7: both coincide -> both markers', JSON.stringify(alert(buckets(['4,4']), diveOnMe, 4, 4)) === '["diveTarget","sbLockTarget"]');
    ok('b8: nothing -> empty', alert(buckets([]), null, 4, 4).length === 0);
    ok('b9: no Game/codex reads (positional only, gate untouched)', !/codex|known|learn|Game\./i.test(alertSrc));
  }
  // Wiring: renderDetail feeds the helper into the player marker + styles the ring.
  const appSrc = fs.readFileSync(path.join(ROOT, 'src/js/app.js'), 'utf8');
  ok('b10: renderDetail wires helper into pmark', appSrc.includes('tgPlayerAlertClasses(_tg, _gwDive, pmx, pmy)'));
  ok('b11: diveTarget ring styled on marker ::before', appSrc.includes('.cell.me .vent.diveTarget::before'));
  ok('b12: sbLockTarget ring styled on marker ::before', appSrc.includes('.cell.me .vent.sbLockTarget::before'));
  ok('b13: dive ▼ skipped on player tile (ring carries the read)', appSrc.includes('if (!isMe) g += `<span style="position:absolute;inset:0;'));

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(2); });
