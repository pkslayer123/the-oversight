// PROOF / REGRESSION TEST (Steve 2026-10-06): The Understudy passive-stall gap.
//
// The gap (evidence/2026-10-06/wave2-gap-reverify-20261006.md, section 4):
// a passive player faced an Understudy that stayed in `watching` forever —
// steps away, re-says the watch line, never acts. The prescribed prod
// ("after ~3 watching turns with zero observations") existed nowhere in the
// code. This is a monster that "was sent to fight" refusing to fight.
//
// HISTORY: this script first ran as a pure reproduction while the gap was
// open (pre-fix: 10 passive rounds, player HP 300->300, zero observations,
// phases {watching} only, fight unresolved — stall REPRODUCED, exit 1).
// MID-RUN, a sibling landed the fix as commit 6658389 ("Understudy COLD
// READ: anti-stall prod after ~3 watching turns (Steve 2026-10-06)"), which
// closed the gap with its own design: after ~3 watching turns with no real
// move learned, the Understudy performs a COLD READ — it learned your
// stillness, comes at you, body-copy attack [8,12] at 50%, phase
// 'rehearsing'. This script is now the REGRESSION test for that landed fix:
// it asserts the FIXED behavior. Played AS A PLAYER via node harness (NOT
// jest), passive player for 10 rounds, both knowledge states.
// Expected: ALL GREEN, exit 0. Any FAIL means the stall (or a regression
// of the cold read) is back.
//
// Run: node scripts/test-understudy-stall-20261006.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
(function seed(seed) {
  let s = seed >>> 0;
  Math.random = function () {
    s |= 0; s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
})(20261006);

global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/progression.js', 'src/js/encounters.js', 'src/js/food.js',
 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js',
 'src/js/justice.js', 'src/js/debug-scenarios.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;
const APP_SRC = fs.readFileSync(path.join(ROOT, 'src/js/app.js'), 'utf8');
// Registry check: a fired hook resolves if app.js defines it as a method
// (the CombatAudio table pattern: six-space indent, name, paren — matches the
// verified pattern in the wave-2 reverify harness).
function inRegistry(name) {
  return new RegExp('^      ' + name + '\\(', 'm').test(APP_SRC);
}

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}
function note(name, detail) { console.log(`  NOTE ${name}${detail ? ' — ' + detail : ''}`); }

const P = () => Game.tbFighter('p');
const M = () => Game.tbfight && Game.tbfight.fighters.find(x => x.kind === 'monster');
function endTurn() {
  if (!Game.tbfight || Game.tbfight.over) return;
  if (!Game.tbIsPlayerTurn()) return;
  const p = P(); p.moveLeft = 0; p.acted = true;
  Game.tbAfterPlayerAction();
}
function playRound() {
  const f0 = Game.tbfight; // tbEnd nulls Game.tbfight in a finally — read result off the object
  const st = { over: false, php: P() ? P().hp : 0, tg: false, phase: null };
  if (!f0 || f0.over) { st.over = true; return st; }
  if (Game.tbIsPlayerTurn() && P() && P().alive && !P().acted) { /* passive: never strikes, never moves */ }
  endTurn();
  st.over = !Game.tbfight || Game.tbfight.over || f0.over;
  st.php = P() && P().alive ? P().hp : 0;
  st.tg = !!(M() && M().telegraph);
  st.phase = M() ? M().beamPhase : null;
  return st;
}
const SPEAR = { itemId: 'fire_hardened_spear', name: 'Fire-hardened spear' };
function newFight() {
  try { if (Game.tbfight && !Game.tbfight.over) Game.tbEnd('fled'); } catch (e) {}
  Game.startCombat('understudy');
  const m = M(); if (!m) throw new Error('newFight: startCombat produced no monster');
  m.hp = m.maxHp = 400; // tough enough that a fix prod is the only actor
  const pl = P(); pl.hp = pl.maxHp = 300;
  pl.mx = Math.min(7, Math.max(1, m.mx - 2)); pl.my = Math.min(7, Math.max(1, m.my));
  Game.state.scholar.mx = pl.mx; Game.state.scholar.my = pl.my;
  Game.state.scholar.equipped.weapon = Object.assign({}, SPEAR);
  return m;
}
const says = [];
const audioFired = [];

function runPassive(label, known) {
  says.length = 0;
  const audioMark = audioFired.length;
  if (known) {
    Game.state.codex.monsters = Game.state.codex.monsters || {};
    Game.state.codex.monsters.understudy = { stage: 'slain' };
  } else {
    if (Game.state.codex.monsters) delete Game.state.codex.monsters.understudy;
  }
  const m = newFight();
  const hp0 = P().hp;
  const phases = new Set(); let sawTg = false, lastPhp = hp0, over = false, rounds = 0;
  let prodRound = null, actRound = null;
  for (let r = 0; r < 10; r++) {
    const st = playRound();
    rounds++;
    phases.add(st.phase);
    if (st.tg && !sawTg) { sawTg = true; if (actRound === null) actRound = r + 1; }
    lastPhp = st.php;
    if (lastPhp < hp0 && actRound === null) actRound = r + 1;
    if (/cold read|nothing\? then|stands the way you stand/i.test(says.join('\n')) && prodRound === null) prodRound = r + 1;
    if (st.over) { over = true; break; }
  }
  const obsCount = Object.keys(m.usSeen || {}).length;
  const sayText = says.join('\n');
  const leak = known ? false : /(fire.hardened spear|sharp stick)/i.test(sayText); // unknown player must never see the weapon named
  const newAudio = audioFired.slice(audioMark);
  const stall = !over && obsCount === 0 && lastPhp === hp0 && phases.size === 1 && phases.has('watching');
  console.log(`== ${label} (${known ? 'known' : 'unknown'} knowledge) ==`);
  note('passive 10 rounds', `player hp ${hp0}->${lastPhp}, observations ${obsCount}, phases {${[...phases].join(',')}}, telegraph seen: ${sawTg}, fight over: ${over}`);
  if (stall) {
    console.log('  *** STALL REPRODUCED: never acted, zero observations, phases {watching} only, fight unresolved ***');
  } else {
    console.log(`  *** NO STALL: prod narrated ~round ${prodRound}, acted ~round ${actRound} ***`);
  }
  check('prod narrated within ~5 passive rounds (cold read)', prodRound !== null && prodRound <= 5, prodRound === null ? 'no cold-read text in say log' : `prod at round ${prodRound}`);
  check('monster ACTS against a passive player by round 10 (telegraph or damage)', sawTg || lastPhp < hp0, `telegraph: ${sawTg}, hp ${hp0}->${lastPhp}`);
  check('phase arc leaves watching (watching -> rehearsing, cold read)', phases.has('rehearsing') || phases.has('performing'), `phases: {${[...phases].join(',')}}`);
  check('no free info leaked to unknown-knowledge player', !leak, leak ? 'weapon name leaked in say text' : '');
  check('all fired audio resolves in the app.js registry', newAudio.every(inRegistry), newAudio.filter(n => !inRegistry(n)).join(','));
  return { stall, prodRound, actRound, phases: [...phases], hp0, hp1: lastPhp, obsCount };
}

(async () => {
  await Game.init();
  Game.genDetail = () => Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => 'grass'));
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart(); Game.dayPart = 1;
  Game.state.scholar.health = 500;
  Game.state.scholar.equipped = { weapon: Object.assign({}, SPEAR) };
  Game.canSee = () => true;
  Game.say = (t) => { says.push(String(t)); };
  const origAudio = Game.audioEvent;
  Game.audioEvent = function (name, d) { audioFired.push(name); return origAudio.call(this, name, d); };

  const r1 = runPassive('understudy passive stall', false);
  const r2 = runPassive('understudy passive stall (known player)', true);

  const unregistered = [...new Set(audioFired)].filter(n => !inRegistry(n));
  console.log(`\n${pass} pass, ${fail} fail${unregistered.length ? ' — UNREGISTERED AUDIO: ' + unregistered.join(',') : ''}`);
  if (r1.stall && r2.stall) {
    console.log('VERDICT: STALL REPRODUCED — the Understudy never acts against a passive player. The anti-stall prod is missing or broken.');
  } else {
    console.log('VERDICT: NO STALL — the cold-read prod fired and the monster acted. Gap 4 is closed in this tree.');
  }
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
