#!/usr/bin/env node
// tracker self-test: verifies the vest-event wrapper in winrate-iter4.js
// records a BELONG vest when _checkNational stages it.
'use strict';
const path = require('path');
const ROOT = path.join(__dirname, '..');
const { loadGame, setupGame } = require('./sim-harness');

function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    var t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
Math.random = mulberry32(99);

(async () => {
  const { Game } = await loadGame({ seed: 99, mode: 'vest-selftest' });
  await setupGame(Game);
  const ctx = {};
  // inline copy of the trackVests wrapper shape (structure check only)
  const lines = require('fs').readFileSync(path.join(ROOT, 'scripts', 'winrate-iter4.js'), 'utf8').split('\n');
  // trackVests spans the line range starting at 'function trackVests' up to
  // the first subsequent line that is exactly '}'
  const start = lines.findIndex(l => l.indexOf('function trackVests(Game, ctx)') === 0);
  let end = start + 1;
  while (end < lines.length && lines[end] !== '}') end++;
  if (start < 0 || end >= lines.length) { console.log('FAIL: trackVests not found in driver'); process.exit(1); }
  (0, eval)(lines.slice(start, end + 1).join('\n'));
  globalThis.trackVests(Game, ctx);

  while (Game.state.otherVillages.filter(v => v && v.id !== 'haven').length < 3) {
    const base = Game.state.otherVillages.filter(v => v && v.id !== 'haven');
    const t = Object.assign({}, base[base.length - 1]);
    const n = base.length;
    t.id = 'village_vt' + n; t.name = 'Vt' + n; t.generated = false;
    Game.state.otherVillages.push(t);
  }
  const ovs = Game.state.otherVillages.filter(v => v && v.id !== 'haven');
  const [vA, vB, vC] = ovs;
  const day = (Game.state.scholar || {}).day || 0;
  const link = Game._formLink(vA.id, { asSubordinate: true, tributeKcalPerWeek: 4000 }, null);
  if (!link) { console.log('ABORT: no link'); process.exit(1); }
  link.trust = 55; link.arrears = 0; link.day = day - 14; link.status = 'active';
  Game.foreignPolities().push({ primary: vA.id, subs: [vB.id, vC.id], day: 0 });
  // trigger the national check path the way the game does
  try { Game._checkNational(); } catch (e) { console.log('checkNational threw (ok if no beat):', e.message); }
  // also call polityOf directly (what _havenPolity does)
  const bp = Game.polityOf(vA.id);
  console.log('polityOf:', bp ? bp.shape + ' size ' + bp.size : null);
  console.log('ctx.vests:', JSON.stringify(ctx.vests));
  const ev = (ctx.vests || [])[0];
  const ok = ev && ev.shape === 'belong' && ev.trust === 55 && ev.linkAgeDays === 14;
  console.log(ok ? 'TRACKER GREEN' : 'TRACKER FAIL');
  process.exit(ok ? 0 : 1);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
