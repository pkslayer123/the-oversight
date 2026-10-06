// Ducks in a row flesh-out test (Steve 2026-10-06)
// Verifies: data flesh-out, audio hooks, formation phases, split→regroup→rejoin,
// enraged head, knowledge gating. Plus a player-feel playtest transcript.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/day.js',
 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}${extra ? ' — ' + extra : ''}`); }
}

// ---- audio stub: record every hook that fires ----
const fired = [];
const hookNames = ['ducksQuack', 'ducksQuackCut', 'duckLineUp', 'duckMarch', 'duckNip',
  'duckRegroup', 'duckScreech', 'ducksRejoin', 'snakeSplit', 'telegraph', 'impact'];
Game.audio = {};
for (const h of hookNames) Game.audio[h] = (() => { const n = h; return () => { fired.push(n); }; })();
const firedCount = (n) => fired.filter(x => x === n).length;

// ---- turn hygiene (from play-feel scripts) ----
function P() { return Game.tbFighter('p'); }
function endTurn() {
  if (!Game.tbfight || Game.tbfight.over) return;
  if (!Game.tbIsPlayerTurn()) return;
  const p = P(); p.moveLeft = 0; p.acted = true;
  Game.tbAfterPlayerAction();
}
function segs() {
  return Game.tbfight.fighters.filter(x => x.kind === 'monster' && x.alive && x.mdef && x.mdef.snake);
}
function headOf(sid) { return segs().find(x => x.snakeId === sid && x.isHead); }

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();

  console.log('=== 1. DATA FLESH-OUT ===');
  const mdef = Game.data.monsters.find(m => m.id === 'ducks_in_a_row');
  ok('aggroAudio ducksQuackCut', mdef.encounter.aggroAudio === 'ducksQuackCut');
  ok('noticeAudio ducksQuack', mdef.encounter.noticeAudio === 'ducksQuack');
  ok('codexStages unknown/observed/slain',
    !!(mdef.codexStages && mdef.codexStages.unknown && mdef.codexStages.observed && mdef.codexStages.slain));
  ok('unknown descriptor has no name-word leak',
    !/ducks in a row/i.test(mdef.codexStages.unknown) && !/\bducks\b/i.test(mdef.unknown),
    `unknown=${mdef.unknown}`);
  ok('phases line_up/march/nip/regroup',
    JSON.stringify(mdef.encounter.phases) === JSON.stringify(['line_up', 'march', 'nip', 'regroup']));
  ok('phaseBadges present', !!mdef.encounter.phaseBadges.line_up);
  ok('knownTactics present', !!mdef.encounter.knownTactics);
  ok('threatLines notice/pain/snap',
    !!(mdef.encounter.threatLines && mdef.encounter.threatLines.notice && mdef.encounter.threatLines.snap));
  ok('systemDesignation', !!mdef.systemDesignation);
  ok('cues curious/warn/fearful', !!(mdef.cues && mdef.cues.curious && mdef.cues.warn));
  ok('attack renamed Coordinated Nip', mdef.attack.name === 'Coordinated Nip');

  console.log('\n=== 2. AUDIO SYNTHS EXIST (app.js) ===');
  const appSrc = fs.readFileSync(path.join(ROOT, 'src/js/app.js'), 'utf8');
  for (const h of ['ducksQuack', 'ducksQuackCut', 'duckLineUp', 'duckMarch', 'duckNip',
    'duckRegroup', 'duckScreech', 'ducksRejoin']) {
    ok(`synth function ${h}`, new RegExp(`function ${h}\\(\\)`).test(appSrc));
    ok(`dispatch ${h}`, new RegExp(`${h}\\(\\) \\{ ${h}\\(\\); \\}`).test(appSrc));
  }

  console.log('\n=== 3. FIGHT: INTACT LINE ===');
  const s = Game.state.scholar;
  s.mx = 4; s.my = 4; s.health = 500; s.maxHealth = 500;
  s.monster = { id: 'ducks_in_a_row', mx: 6, my: 4 };
  Game.startCombat('ducks_in_a_row');
  ok('noticeAudio ducksQuack fired at combat start', firedCount('ducksQuack') >= 1, `fired=${firedCount('ducksQuack')}`);
  ok('14 segments', segs().length === 14, `got ${segs().length}`);
  // knowledge gating: pre-knowledge names must not leak the true name
  const preNames = segs().map(x => x.name).join(' | ');
  ok('segment names gated pre-knowledge', !/ducks in a row/i.test(preNames), preNames.slice(0, 80));

  // play a few rounds as a player (wait each turn)
  const logStart = Game.log.length;
  for (let r = 0; r < 4 && Game.tbfight && !Game.tbfight.over; r++) endTurn();
  const h0 = headOf(segs()[0].snakeId);
  ok('head has formation phase', ['line_up', 'march', 'nip', 'regroup'].includes(h0.beamPhase), `phase=${h0.beamPhase}`);
  ok('quack-cut telegraph fired (silence)', firedCount('ducksQuackCut') >= 1);
  ok('duckLineUp fired', firedCount('duckLineUp') >= 1);
  ok('duckMarch fired', firedCount('duckMarch') >= 1);
  console.log('--- transcript (intact) ---');
  for (const l of Game.log.slice(logStart, logStart + 14)) console.log('  ' + l);

  console.log('\n=== 4. SPLIT: break the middle ===');
  const all = segs();
  const sid0 = all[0].snakeId;
  const mid = all.find(x => x.snakeId === sid0 && x.segmentIndex === 3);
  Game.tbDamage(mid.key, 999, 'test', 'p', { quiet: true });
  const ids = new Set(segs().map(x => x.snakeId));
  ok('split into 2 snakes', ids.size === 2, `got ${ids.size}`);
  ok('snakeSplit audio fired', firedCount('snakeSplit') >= 1);
  const newSid = [...ids].find(id => id !== sid0);
  const tailHead = headOf(newSid);
  ok('tail half is independent (NOT regrouping)', tailHead && tailHead.duckRegroup !== true);
  ok('tail half has no home (no rejoin target)', tailHead && !tailHead.duckHomeId);
  ok('tail half has its own head', tailHead && tailHead.isHead === true);

  console.log('\n=== 5. BOTH HALVES HUNT INDEPENDENTLY (Steve 2026-10-06) ===');
  // Both fragments should close on the PLAYER, not on each other.
  const distToPlayer = (sid) => {
    const h = headOf(sid); if (!h || !Game.tbfight) return null;
    const p = Game.tbFighter('p'); if (!p) return null;
    return Math.max(Math.abs(p.mx - h.mx), Math.abs(p.my - h.my));
  };
  const hh0 = headOf(sid0), tt0 = headOf(newSid);
  if (hh0) { hh0.mx = 1; hh0.my = 1; }
  if (tt0) { tt0.mx = 7; tt0.my = 7; }
  const pBeforeH = distToPlayer(sid0), pBeforeT = distToPlayer(newSid);
  for (let r = 0; r < 3 && Game.tbfight && !Game.tbfight.over; r++) endTurn();
  const pAfterH = distToPlayer(sid0), pAfterT = distToPlayer(newSid);
  ok('head half hunts player (closes distance)',
    pAfterH !== null && pBeforeH !== null && pAfterH <= pBeforeH,
    `before=${pBeforeH} after=${pAfterH}`);
  ok('tail half hunts player independently (closes distance, NOT marching home)',
    pAfterT !== null && pBeforeT !== null && pAfterT <= pBeforeT,
    `before=${pBeforeT} after=${pAfterT}`);
  ok('still 2 snakes (no rejoin)', new Set(segs().map(x => x.snakeId)).size === 2);

  console.log('\n=== 6. RECURSIVE SPLIT: break a fragment again ===');
  // Kill a middle duck of the tail fragment — should yield 3 snakes total.
  const fragSegs = segs().filter(x => x.snakeId === newSid).sort((a, b) => a.segmentIndex - b.segmentIndex);
  if (fragSegs.length >= 3) {
    const fragMid = fragSegs[Math.floor(fragSegs.length / 2)];
    Game.tbDamage(fragMid.key, 999, 'test', 'p', { quiet: true });
  }
  const idsAfter = new Set(segs().map(x => x.snakeId));
  ok('recursive split: 3 snakes from 2 fragments', idsAfter.size === 3, `got ${idsAfter.size}`);
  ok('every fragment has exactly one head',
    [...idsAfter].every(sid => segs().filter(x => x.snakeId === sid && x.isHead).length === 1));

  console.log('\n=== 7. ENRAGED HEAD (<=2 segments) ===');
  // fresh fight, kill down to 2
  try { Game.tbEnd('fled'); } catch (e) {}
  fired.length = 0;
  s.mx = 4; s.my = 4; s.health = 500;
  s.monster = { id: 'ducks_in_a_row', mx: 6, my: 4 };
  Game.startCombat('ducks_in_a_row');
  let ss = segs();
  const sidA = ss[0].snakeId;
  // kill tail-first down to 2 segments (indices 5,4,3,2)
  for (const idx of [5, 4, 3, 2]) {
    const sg = segs().find(x => x.snakeId === sidA && x.segmentIndex === idx);
    if (sg) Game.tbDamage(sg.key, 999, 'test', 'p', { quiet: true });
  }
  ok('2 segments left', segs().filter(x => x.snakeId === sidA).length === 2,
    `got ${segs().filter(x => x.snakeId === sidA).length}`);
  endTurn(); // head's turn: enraged check fires
  const eh = headOf(sidA);
  ok('enraged flag set', !!(eh && eh.duckEnraged));
  ok('enraged speed+1', eh && eh.speed === 8, `speed=${eh && eh.speed}`);
  ok('duckScreech fired', firedCount('duckScreech') >= 1);
  console.log('--- transcript (enraged) ---');
  for (const l of Game.log.slice(-6)) console.log('  ' + l);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
