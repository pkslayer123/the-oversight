// Proof: break-it monsters run 2 — dead code + stale test (Steve 2026-10-08).
//
// CATCH (DEAD-CODE):
//  a) Game.monsterWaveAvailable() had ZERO game-code callers — its only
//     consumer was scripts/test-wave-system.js, which itself was broken on
//     HEAD (asserted hushwolf=wave 2, gallowdeer=wave 4, and a
//     thornback_boar that no longer exists — 2 FAILs + a TypeError crash).
//     Removed the helper; rewrote the test against the live gate.
//  b) tbFifoBreather still deleted m.hypeDeflateCrowd — a leftover of the
//     retired hype_horn (purged 2026-10-08 run 1). The field is never set.
// This test fails on HEAD (helper exists / stale test crashes / dead ref
// present) and passes patched.
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const H = require('./break-monsters-harness.js');

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('  ok: ' + name); }
  else { fail++; console.log('  FAIL: ' + name + (extra ? ' — ' + extra : '')); }
};

(async () => {
  const Game = await H.freshGame(4242);

  // a) the dead helper is gone
  ok('monsterWaveAvailable removed from Game',
    typeof Game.monsterWaveAvailable === 'undefined',
    `typeof=${typeof Game.monsterWaveAvailable}`);
  const gameSrc = fs.readFileSync(path.join(ROOT, 'src/js/game.js'), 'utf8');
  ok('no monsterWaveAvailable definition remains',
    !/monsterWaveAvailable\s*\(/.test(gameSrc));
  // ...and nothing in game code calls it
  const callers = [];
  for (const f of H.ORDER) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    if (src.includes('monsterWaveAvailable(') && !src.includes('monsterWaveAvailable(monsterId) {'))
      callers.push(f);
  }
  ok('zero game-code callers of monsterWaveAvailable', callers.length === 0,
    `callers=${callers.join(',')}`);

  // b) the hype_horn leftover is gone
  ok('hypeDeflateCrowd reference removed',
    !gameSrc.includes('hypeDeflateCrowd'));

  // c) the stale test file is fixed: no dead-monster refs, no dead helper
  const tsrc = fs.readFileSync(path.join(ROOT, 'scripts/test-wave-system.js'), 'utf8');
  ok('test-wave-system no longer references thornback_boar',
    !tsrc.includes('thornback_boar'));
  ok('test-wave-system no longer calls monsterWaveAvailable',
    !tsrc.includes('monsterWaveAvailable('));
  ok('test-wave-system asserts current wave data (hushwolf/gallowdeer wave 1)',
    tsrc.includes('hushwolf') && tsrc.includes('gallowdeer'));

  // d) the fixed wave test actually passes (run it as a subprocess)
  const { execSync } = require('child_process');
  let out = '', tcode = 0;
  try {
    out = execSync('node scripts/test-wave-system.js', { cwd: ROOT, encoding: 'utf8' });
  } catch (e) { tcode = e.status || 1; out = e.stdout || ''; }
  ok('test-wave-system.js passes on patched code',
    tcode === 0 && /0 failed/.test(out), out.split('\n').slice(-2).join(' '));

  // e) the live wave gate still works without the helper
  Game.state.scholar.day = 8;
  Game.state.waveKills = { 1: 4 };
  ok('unlockedWave gate intact (day 8 + 4 kills = wave 2)', Game.unlockedWave() === 2);

  console.log(`\ndeadcode proof: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
