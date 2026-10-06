// PROOF TEST (Steve 2026-10-06): Heckler → wave-2 escalation bar.
// Played AS A PLAYER (node harness, NOT jest). Demonstrates before/after:
//   1. headliner phase fires within ≤8 rounds vs a specced player
//   2. the compulsion fires and is readable (answer-by-wait clears shame)
//   3. audioEvent names resolve in Game.audio (static: real synths in app.js)
//   4. codex slain move names match implemented code
//   5. armor/resistances are fiction-stated, never blank
// Run: node scripts/test-heckler-escalation.js
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
function flatGrid() { return Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => 'grass')); }
const P = () => Game.tbFighter('p');
const M = () => Game.tbfight && Game.tbfight.fighters.find(x => x.kind === 'monster');
const log = [];
// TURN HYGIENE: endTurn() advances EXACTLY one AI round, never two.
function endTurn() {
  if (!Game.tbfight || Game.tbfight.over) return;
  if (!Game.tbIsPlayerTurn()) return;
  const p = P(); p.moveLeft = 0; p.acted = true;
  Game.tbAfterPlayerAction();
}
function strike() {
  const m = M();
  if (m && Game.tbIsPlayerTurn()) Game.tbPlayerStrike(m.key);
  endTurn();
}
function answerBack() { // compelled: WAIT answers, clears shame, costs the turn
  if (Game.tbIsPlayerTurn()) Game.tbPlayerWait();
  else endTurn();
}
let failures = 0;
function check(name, cond, detail) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
  if (!cond) failures++;
}
(async () => {
  await Game.init();
  Game.say = (t) => { log.push(String(t).slice(0, 400)); }; // long: PILE-ON suffix must survive
  Game.genDetail = () => flatGrid();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart(); Game.dayPart = 1;
  const s = Game.state.scholar;
  s.health = 500;
  s.equipped = { weapon: { itemId: 'fire_hardened_spear', name: 'Fire-hardened spear' } };
  Game.canSee = () => true;

  // ============ FIGHTS: played as a player ============
  // Fight 1: DEFY the compulsion (exercises pile-on + mockery chip at high shame)
  // Fight 2: ANSWER the compulsion (proves WAIT clears shame)
  function runFight(policy, tag) {
    try { if (Game.tbfight) Game.tbEnd('fled'); } catch (e) {}
    Game.startCombat('heckler');
    const m = M();
    m.hp = m.maxHp = 100; // pin HP: buy the arc a round against spear variance
    const p = P(); p.hp = p.maxHp = 200;
    p.mx = 4; p.my = 4; s.mx = 4; s.my = 4; m.mx = 5; m.my = 4; // interior, adjacent
    const st = { headlinerRound: -1, compulsionRound: -1, pileOns: 0, jibes: 0, chip: 0, answered: 0, defied: 0, answerWorked: false };
    console.log(`--- ${tag} (HP=100 armor=${m.mdef.armor} res=${JSON.stringify(m.mdef.resistances)})`);
    for (let r = 1; r <= 14 && Game.tbfight && !Game.tbfight.over; r++) {
      const before = log.length;
      if (P().hkCompelled) {
        if (st.compulsionRound < 0) st.compulsionRound = r;
        if (policy === 'defy') { strike(); st.defied++; }
        else {
          const mm0 = M(), shameBefore = mm0 ? (mm0.hkShame || 0) : 0;
          answerBack(); st.answered++;
          const mm1 = M(), shameAfter = mm1 ? (mm1.hkShame || 0) : 0;
          if (shameAfter < shameBefore) st.answerWorked = true;
          console.log(`  [answer: shame ${shameBefore} -> ${shameAfter}]`);
        }
      } else {
        strike();
      }
      for (const l of log.slice(before)) {
        if (/SHAME \d+/.test(l) && /grandmother|landslide|crowd goes mild|laugh/i.test(l)) st.jibes++;
        if (/PILE-ON/i.test(l)) st.pileOns++;
        const chipM = l.match(/The words find the soft places\. \((\d+) psychic/);
        if (chipM) st.chip += parseInt(chipM[1], 10);
      }
      const mm = M();
      if (!mm || !mm.alive || (Game.tbfight && Game.tbfight.over)) { console.log(`  r${r}: monster down`); break; }
      if (mm.beamPhase === 'headliner' && st.headlinerRound < 0) st.headlinerRound = r;
      console.log(`  r${r}: phase=${mm.beamPhase} shame=${mm.hkShame || 0} mhp=${Math.round(mm.hp)} php=${Math.round(P().hp)} compelled=${!!P().hkCompelled}`);
    }
    console.log(`  jibes=${st.jibes} pile-ons=${st.pileOns} chip=${st.chip} answered=${st.answered} defied=${st.defied}`);
    return st;
  }
  const f1 = runFight('defy', 'FIGHT 1: defy the compulsion');
  const f2 = runFight('answer', 'FIGHT 2: answer the compulsion');
  check('headliner fires within 8 rounds', f1.headlinerRound > 0 && f1.headlinerRound <= 8, `fired round ${f1.headlinerRound}`);
  check('compulsion fires (readable)', f1.compulsionRound > 0, `first compulsion round ${f1.compulsionRound}`);
  check('pile-on fires at headliner', f1.pileOns > 0, `pile-ons=${f1.pileOns}`);
  check('vicious mockery cuts at headliner (psychic chip)', f1.chip > 0, `chip total=${f1.chip}`);
  check('answering (WAIT) clears shame', f2.answerWorked, `answered=${f2.answered}`);
  check('pattern learned by surviving the set (codex gate)', Game.tbPatternKnown('heckler', 'You Call That A Swing?'), 'tbPatternKnown');

  // ============ AUDIO: names resolve, synths are real (static) ============
  const appSrc = fs.readFileSync(path.join(ROOT, 'src/js/app.js'), 'utf8');
  for (const name of ['hecklerJibe', 'hecklerHeadliner', 'hecklerPileOn']) {
    const re = new RegExp(`function ${name}\\(`);
    const i = appSrc.search(re);
    const body = i >= 0 ? appSrc.slice(i, i + 2500) : '';
    const real = body.includes('createOscillator');
    const registered = new RegExp(`${name}\\(\\) \\{ ${name}\\(\\)`).test(appSrc) || new RegExp(`${name}\\(d\\) \\{ ${name}\\(d\\)`).test(appSrc);
    check(`audio ${name}: real synth + registered`, real && registered, real ? (registered ? 'wired' : 'UNREGISTERED') : 'SILENT STUB');
  }
  const gameSrc = fs.readFileSync(path.join(ROOT, 'src/js/game.js'), 'utf8');
  for (const ev of ['hecklerJibe', 'hecklerHeadliner', 'hecklerPileOn']) {
    check(`game.js fires audioEvent('${ev}')`, gameSrc.includes(`audioEvent('${ev}'`), 'call site present');
  }

  // ============ knownCue wiring: learned pattern -> coaching tail on telegraph ============
  try { if (Game.tbfight) Game.tbEnd('fled'); } catch (e) {}
  Game.startCombat('heckler');
  const m2 = M(); const p2 = P(); p2.hp = p2.maxHp = 200;
  p2.mx = 4; p2.my = 4; m2.mx = 5; m2.my = 4;
  Game.tbLearnPattern(m2); // simulate earned knowledge
  Game.encDeclareDirect(m2, p2, 'test cue'); // sets m.telegraph (cue goes to grid UI, not say-log)
  const cueText = Game.tbTelegraphCue(m2); // the exact string the telegraph UI renders
  const kc = hk0enc().knownCue;
  function hk0enc() { return JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/monsters.json'), 'utf8')).find(x => x.id === 'heckler').encounter; }
  check('knownCue fires in telegraph cue after pattern learned', !!(kc && cueText.includes(kc.slice(0, 40))), kc ? 'wired' : 'MISSING');
  try { if (Game.tbfight) Game.tbEnd('fled'); } catch (e) {}

  // ============ CODEX vs CODE (§2-H): slain move names must exist in code ============
  const monsters = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/monsters.json'), 'utf8'));
  const hk = monsters.find(x => x.id === 'heckler');
  const slain = hk.codexStages.slain;
  const norm = (x) => x.toLowerCase().replace(/[^a-z]/g, '');
  const gameNorm = norm(gameSrc);
  const moves = ['Vicious Mockery', 'Pile-On', 'Compulsion'];
  for (const mv of moves) {
    const inCode = gameNorm.includes(norm(mv));
    check(`codex "${mv}" implemented in code`, inCode && slain.includes(mv), inCode ? 'ok' : 'CODEX LIES');
  }

  // ============ ARMOR / RESISTANCES never blank ============
  const armorStated = typeof hk.armor === 'number';
  const resStated = hk.resistances && typeof hk.resistances === 'object';
  check('armor stated (0=fragility is a statement)', armorStated, `armor=${hk.armor}`);
  check('resistances stated', resStated, `res=${JSON.stringify(hk.resistances)}`);

  // ============ knownCue present ============
  check('encounter.knownCue present', !!(hk.encounter && hk.encounter.knownCue), hk.encounter && hk.encounter.knownCue ? 'present' : 'MISSING');

  // ============ HYGIENE: no duplicated usSeen block ============
  const usSeenBlocks = (gameSrc.match(/\/\/ UNDERSTUDY \(Steve 2026-10-06\): it watches you fight and learns\. Record/g) || []).length;
  check('usSeen recording block not duplicated', usSeenBlocks <= 1, `occurrences=${usSeenBlocks}`);

  console.log(failures === 0 ? '\nALL CHECKS PASS' : `\n${failures} CHECK(S) FAILING`);
  process.exit(failures ? 1 : 0);
})();
