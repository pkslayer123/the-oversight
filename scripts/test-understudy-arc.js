// PROOF TEST (Steve 2026-10-06): The Understudy — wave-2 escalation bar.
// Played AS A PLAYER via node harness (NOT jest). Demonstrates before/after:
//
// BEFORE (baseline /tmp/us-baseline.js, 2026-10-06, pre-fix):
//   - died in ~2.5 spear rounds (80 HP), having NEVER attacked (player 120→120)
//   - a duplicated usSeen recording block doubled observations: 1 strike = 2
//     obs, so phases blew by (rehearsing after 1 strike, performing after 2)
//   - "performing" never got a turn; Opening Steal + Desperate Improv were
//     codex promises with no code; 3 audio events fired; no knownCue;
//     no armor/resistances at all.
//
// AFTER (this test asserts):
//   1. Arc timing: watching → rehearsing (~r2) → performing (~r3) → improv
//      (<30% HP, after the performance), each beat readable, monster survives
//      4+ rounds of a normal spear fight.
//   2. Performing threatens: the player takes real copy damage.
//   3. Opening Steal fires: next stolen-weapon strike halved + answered; a
//      different weapon does NOT trigger it (switch-weapons counterplay).
//   4. Desperate Improv fires: chains the two best-learned moves, reads in
//      declare AND resolution text.
//   5. Audio: every fired audioEvent name resolves in the app.js registry to
//      a real (non-stub) synth body.
//   6. knownCue: after surviving the copy (pattern learned), tbTelegraphCue
//      carries the earned coaching.
//   7. Codex honesty: every move named in codexStages.slain exists in game.js.
//   8. Armor: 0 while watching (data), learns YOUR guard when performing.
//
// Run: node scripts/test-understudy-arc.js
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
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}
function flatGrid() { return Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => 'grass')); }
const P = () => Game.tbFighter('p');
const M = () => Game.tbfight && Game.tbfight.fighters.find(x => x.kind === 'monster');
const totalSeen = (m) => Object.values(m.usSeen || {}).reduce((a, r) => a + r.count, 0);
// TURN HYGIENE: endTurn() advances EXACTLY one AI round, never two.
function endTurn() {
  if (!Game.tbfight || Game.tbfight.over) return;
  if (!Game.tbIsPlayerTurn()) return;
  const p = P(); p.moveLeft = 0; p.acted = true;
  Game.tbAfterPlayerAction();
}
function chaseAndStrike() {
  // interior tiles only (1..7): edges are the flee-by-barrier
  const d = () => Math.max(Math.abs(P().mx - M().mx), Math.abs(P().my - M().my));
  while (Game.tbIsPlayerTurn() && !P().acted && M() && M().alive && d() > 2 && P().moveLeft > 0) {
    const nx = Math.min(7, Math.max(1, P().mx + Math.sign(M().mx - P().mx)));
    const ny = Math.min(7, Math.max(1, P().my + Math.sign(M().my - P().my)));
    if (!Game.tbPlayerMove(nx, ny)) break;
  }
  if (Game.tbIsPlayerTurn() && !P().acted && M() && M().alive && d() <= 2) Game.tbPlayerStrike(M().key);
  endTurn();
}
const SPEAR = { itemId: 'fire_hardened_spear', name: 'Fire-hardened spear' };
const STICK = { itemId: 'sharp_stick', name: 'Sharp stick' };
function newFight(hp) {
  try { if (Game.tbfight && !Game.tbfight.over) Game.tbEnd('fled'); } catch (e) {}
  Game.startCombat('understudy');
  const m = M(); if (!m) throw new Error('newFight: startCombat produced no monster');
  m.hp = m.maxHp = hp || 115;
  const pl = P(); pl.hp = pl.maxHp = 150;
  pl.mx = Math.min(7, Math.max(1, m.mx - 2)); pl.my = Math.min(7, Math.max(1, m.my));
  Game.state.scholar.mx = pl.mx; Game.state.scholar.my = pl.my;
  Game.state.scholar.equipped.weapon = Object.assign({}, SPEAR);
  return m;
}

(async () => {
  await Game.init();
  let says = [];
  const audioFired = [];
  Game.say = (t) => { says.push(String(t)); };
  const origAudio = Game.audioEvent;
  Game.audioEvent = function (n, o) { audioFired.push(n); try { return origAudio.call(this, n, o); } catch (e) {} };
  Game.genDetail = () => flatGrid();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart(); Game.dayPart = 1;
  Game.state.scholar.health = 500;
  Game.state.scholar.equipped = { weapon: Object.assign({}, SPEAR) };
  Game.canSee = () => true;

  console.log('BEFORE (documented baseline, pre-fix): died in ~2.5 rounds, player 120->120,');
  console.log('performing never got a turn, Opening Steal + Desperate Improv unimplemented.');

  // ---------- FIGHT 1: arc timing + performing threatens ----------
  console.log('\n[1] arc timing + threat');
  says = [];
  let m = newFight(115);
  const php0 = P().hp;
  const phaseByRound = [];
  let rounds = 0, maxRounds = 14, lastPhp = php0;
  while (Game.tbfight && !Game.tbfight.over && rounds < maxRounds && M() && M().alive && P()) {
    phaseByRound.push(`${rounds}:${M().beamPhase || 'stalk'}(seen=${totalSeen(M())})`);
    chaseAndStrike();
    if (P()) lastPhp = P().hp;
    rounds++;
  }
  console.log('  rounds: ' + phaseByRound.join(' '));
  const sawRehearse = says.some(s => s.includes('Badly. But recognizably'));
  const sawPerform = says.some(s => s.includes("I've got it now"));
  check('rehearsing beat fires', sawRehearse);
  check('performing beat fires ("I\'ve got it now")', sawPerform);
  check('monster survives 4+ rounds of a spear fight', rounds >= 4, `died/end in ${rounds}`);
  check('performing THREATENS (player took damage)', lastPhp < php0, `player ${php0}->${lastPhp}`);
  check('phases are readable (>=3 named phases seen)', new Set(phaseByRound.map(x => x.split(':')[1].split('(')[0])).size >= 3, phaseByRound.join(' '));
  check('pattern learned after surviving the copy', Game.tbPatternKnown('understudy', 'Your Move') === true);

  // ---------- FIGHT 2: Opening Steal + switch-weapons counterplay ----------
  console.log('\n[2] Opening Steal');
  says = [];
  m = newFight(200); // fat target so the steal arithmetic is clean
  // strike until performing arms the steal
  let guard = 0;
  while (M() && M().alive && M().beamPhase !== 'performing' && guard++ < 10) chaseAndStrike();
  check('performing reached', M() && M().beamPhase === 'performing');
  check('steal armed on most-used weapon', M() && M().usStealArmed === 'Fire-hardened spear', String(M() && M().usStealArmed));
  // counterplay first: a DIFFERENT weapon must not trigger it
  Game.state.scholar.equipped.weapon = Object.assign({}, STICK);
  says = [];
  const mhpBeforeStick = M().hp;
  chaseAndStrike();
  check('different weapon does NOT trigger steal (counterplay)', !says.some(s => s.includes('OPENING STEAL')) && (M() || {}).usStealArmed === 'Fire-hardened spear');
  // now the stolen weapon: halved + answered
  Game.state.scholar.equipped.weapon = Object.assign({}, SPEAR);
  says = [];
  const mhpBefore = M().hp, phpBefore = P().hp;
  chaseAndStrike();
  const stealSays = says.filter(s => s.includes('OPENING STEAL'));
  check('steal fires on the stolen weapon', stealSays.length > 0);
  check('steal disarms after firing', (M() || {}).usStealArmed === null || (M() || {}).usStealArmed === undefined);
  const dmgDealt = mhpBefore - M().hp;
  check('stolen strike is weak (halved)', dmgDealt < 20, `dealt ${dmgDealt}`);
  check('steal answers with the copy (player hurt on own strike turn)', P().hp < phpBefore, `player ${phpBefore}->${P().hp}`);

  // ---------- FIGHT 3: Desperate Improv ----------
  console.log('\n[3] Desperate Improv');
  says = [];
  m = newFight(115);
  chaseAndStrike(); chaseAndStrike(); // obs 2, learned
  // third strike triggers performing; then wound it below 30% for next turn
  chaseAndStrike();
  check('performing fired before improv', M() && (M().beamPhase === 'performing' || M().usPerformed));
  if (M() && M().alive) { m.hp = Math.min(m.hp, 25); } // <30% of 115
  // park next to it, don't strike: let it improvise
  if (M() && M().alive) { M().mx = P().mx + 1; M().my = P().my; }
  says = [];
  endTurn();
  check('improv phase fires below 30% HP', M() && M().beamPhase === 'improv', String(M() && M().beamPhase));
  check('improv declare reads the chain', says.some(s => s.includes('DESPERATE IMPROV')));
  check('improv telegraph chains two learned moves', !!(M() && M().telegraph && M().telegraph.usImprov && M().telegraph.usImprovNames && M().telegraph.usImprovNames.length === 2),
    JSON.stringify(M() && M().telegraph && M().telegraph.usImprovNames));
  says = [];
  endTurn(); // chain resolves
  check('improv resolution names your moves', says.some(s => s.includes("DESPERATE IMPROV — your")));

  // ---------- FIGHT 4: armor — none watching, learns yours performing ----------
  console.log('\n[4] armor/resistances');
  says = [];
  m = newFight(200);
  Game.state.scholar.equipped.armor = { itemId: 'bark_armor', name: 'Bark armor' };
  chaseAndStrike(); // watching-phase strike
  check('no guard text while watching', !says.some(s => s.includes('stolen guard') || s.includes('wears your guard')));
  guard = 0;
  while (M() && M().alive && M().beamPhase !== 'performing' && guard++ < 10) chaseAndStrike();
  says = [];
  chaseAndStrike(); // performing-phase strike: it wears your guard
  const guardSays = says.filter(s => s.includes('stolen guard'));
  check('performing: it wears your guard (armor learned)', says.some(s => s.includes('wears your guard')));
  check('performing: stolen guard absorbs damage', guardSays.length > 0, says.slice(-6).join(' | '));
  delete Game.state.scholar.equipped.armor;

  // ---------- knownCue ----------
  console.log('\n[5] knownCue (earned coaching)');
  // pattern was learned in fight 1; fake a fresh telegraph to read the cue path
  m = M();
  let cueOk = false, cueText = '';
  if (m && m.alive) {
    m.telegraph = { kind: 'direct', cueText: 'x', attackName: 'Your Move', pattern: { type: 'direct' }, turnsLeft: 1, targetKey: 'p' };
    cueText = Game.tbTelegraphCue(m);
    cueOk = cueText.includes('Switch weapons and the copy falls apart');
  } else {
    // fight 1's monster died; rebuild: learn the pattern, then cue
    Game.startCombat('understudy');
    m = M(); m.hp = m.maxHp = 200;
    Game.tbLearnPattern(m);
    m.telegraph = { kind: 'direct', cueText: 'x', attackName: 'Your Move', pattern: { type: 'direct' }, turnsLeft: 1, targetKey: 'p' };
    cueText = Game.tbTelegraphCue(m);
    cueOk = cueText.includes('Switch weapons and the copy falls apart');
  }
  check('knownCue fires after the pattern is learned', cueOk, cueText.slice(0, 120));

  // ---------- audio registry ----------
  console.log('\n[6] audio events resolve to real synths');
  const appSrc = fs.readFileSync(path.join(ROOT, 'src/js/app.js'), 'utf8');
  const uniqFired = [...new Set(audioFired)].filter(n => n.startsWith('understudy'));
  check('all three phase synths fired during play', ['understudyWatch', 'understudyRehearse', 'understudyPerform'].every(n => uniqFired.includes(n)), uniqFired.join(','));
  check('understudyCopy fired', uniqFired.includes('understudyCopy'));
  for (const n of uniqFired) {
    const wired = new RegExp('^\\s*' + n + '\\(\\) \\{ ' + n + '\\(\\);', 'm').test(appSrc);
    const fnIdx = appSrc.indexOf('function ' + n + '(');
    let bodyLen = 0;
    if (fnIdx >= 0) {
      const nextFn = appSrc.indexOf('\n    function ', fnIdx + 10);
      bodyLen = (nextFn > fnIdx ? appSrc.slice(fnIdx, nextFn) : appSrc.slice(fnIdx, fnIdx + 4000)).length;
    }
    check(`audio ${n}: registry-wired + real synth body`, wired && bodyLen > 500, `wired=${wired} body=${bodyLen}`);
  }

  // ---------- codex honesty ----------
  console.log('\n[7] codex-vs-code honesty');
  const gameSrc = fs.readFileSync(path.join(ROOT, 'src/js/game.js'), 'utf8');
  const mdef = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/monsters.json'), 'utf8')).find(x => x.id === 'understudy');
  for (const mv of ['Mirror Strike', 'Opening Steal', 'Desperate Improv']) {
    check(`codex move "${mv}" implemented in game.js`, gameSrc.toLowerCase().includes(mv.toLowerCase()));
  }
  check('slain text describes the learned-guard armor', (mdef.codexStages.slain || '').includes('wears YOUR guard'));
  check('4 named phases in data + badges', mdef.encounter.phases.length === 4 && !!mdef.encounter.phaseBadges.improv);
  check('armor explicitly 0 in data (none while watching)', mdef.armor === 0 && JSON.stringify(mdef.resistances) === '{}');

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS FAIL', e); process.exit(1); });
