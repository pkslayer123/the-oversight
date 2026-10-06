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
  ok('tail half marked regrouping', tailHead && tailHead.duckRegroup === true);
  ok('tail half knows home', tailHead && tailHead.duckHomeId === sid0);
  ok('tail half phase line_up', tailHead.beamPhase === 'line_up', `phase=${tailHead.beamPhase}`);

  console.log('\n=== 5. TAIL MARCHES HOME ===');
  const distToHome = () => {
    const th = headOf(newSid); if (!th) return null;
    const home = segs().filter(x => x.snakeId === sid0);
    if (!home.length) return null;
    return Math.min(...home.map(h => Math.max(Math.abs(h.mx - th.mx), Math.abs(h.my - th.my))));
  };
  // move the tail head far from home so we can watch it march back
  // (it may already be adjacent — the rejoin path is tested in section 6)
  const th0 = headOf(newSid);
  if (th0) { th0.mx = 1; th0.my = 1; }
  const dBefore = distToHome();
  for (let r = 0; r < 3 && Game.tbfight && !Game.tbfight.over; r++) endTurn();
  const dAfter = distToHome();
  const rejoinedEarly = new Set(segs().map(x => x.snakeId)).size === 1;
  ok('tail half closes distance to home (regrouping, not hunting)',
    rejoinedEarly || (dAfter !== null && dBefore !== null && dAfter < dBefore),
    `before=${dBefore} after=${dAfter} rejoinedEarly=${rejoinedEarly}`);
  // the head half should still be hunting the player (its distance to player shrinks or it nips)
  ok('head half still aggressive (nip or march audio)',
    firedCount('duckNip') >= 1 || firedCount('duckMarch') >= 3);

  console.log('\n=== 6. REJOIN ===');
  // teleport tail head adjacent to a home segment, run a round
  const th2 = headOf(newSid);
  const homeSeg = segs().find(x => x.snakeId === sid0);
  if (th2 && homeSeg) {
    th2.mx = Math.max(1, Math.min(7, homeSeg.mx + 1)); th2.my = homeSeg.my;
    // force march phase so the rejoin check runs this round
    for (const x of segs().filter(x => x.snakeId === newSid)) Game.encSetPhase(x, 'march');
    for (let r = 0; r < 2 && Game.tbfight && !Game.tbfight.over; r++) endTurn();
  }
  const idsAfter = new Set(segs().map(x => x.snakeId));
  ok('rejoin merges back to 1 snake', idsAfter.size === 1, `got ${idsAfter.size}`);
  ok('ducksRejoin audio fired', firedCount('ducksRejoin') >= 1);

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
