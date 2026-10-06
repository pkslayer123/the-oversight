// UNDERSTUDY COLD READ — anti-stall prod proof test (Steve 2026-10-06).
//
// Gap #4 (wave-2 re-verification, evidence/2026-10-06/wave2-gap-reverify-20261006.md):
// a player who never attacks faced a monster that never acts — the understudy
// sat in `watching` forever, zero observations, fight never resolved.
// BEFORE (documented, played 2026-10-06): 8 passive rounds → player HP 300→300,
// zero observations, phases {watching} only, fight unresolved.
// AFTER (this test): after ~3 watching turns with zero learned moves the
// understudy COLD READs — it performs the one thing you showed it (your
// stillness), badly, coming at you. Narrated, knowledge-gated, real damage,
// grid telegraph via the standard direct-declare path, audio wired.
//
// Played AS A PLAYER through the real combat loop (tbPlayerStrike / endTurn),
// not grepped. Deterministic RNG (seed 20261006). Turn hygiene per AGENTS.md:
// endTurn = exactly one AI round per player turn; interior tiles 1..7 only.
// Plain node, NOT jest. No concurrent test processes.
//
// Run (after):  node scripts/test-understudy-prod-20261006.js
// Run (before): git show 6658389^:src/js/game.js > /tmp/game-before.js && \
//               GAME_JS_PATH=/tmp/game-before.js node scripts/test-understudy-prod-20261006.js
//   The before-run is expected to FAIL the prod assertions (stall reproduces);
//   that failure IS the proof the test detects the bug.
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
const GAME_JS = process.env.GAME_JS_PATH || 'src/js/game.js';
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/progression.js', 'src/js/encounters.js', 'src/js/food.js',
 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js', 'src/js/storage.js', 'src/js/carexplore.js',
 'src/js/justice.js', 'src/js/debug-scenarios.js'].forEach(f => {
  const p = (f === 'src/js/game.js' && GAME_JS !== 'src/js/game.js') ? GAME_JS : path.join(ROOT, f);
  eval(fs.readFileSync(p, 'utf8'));
});
const Game = globalThis.Scattering.Game;
const APP_SRC = fs.readFileSync(path.join(ROOT, 'src/js/app.js'), 'utf8');
const REG_KEYS = new Set([...APP_SRC.matchAll(/^\s{6}([a-zA-Z][\w-]*)\(/gm)].map(m => m[1]));

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}
function note(name, detail) { console.log(`  NOTE ${name}${detail ? ' — ' + detail : ''}`); }

const P = () => Game.tbFighter('p');
function endTurn() {
  if (!Game.tbfight || Game.tbfight.over) return;
  if (!Game.tbIsPlayerTurn()) return;
  const p = P(); if (!p) return; p.moveLeft = 0; p.acted = true;
  Game.tbAfterPlayerAction();
}
const SPEAR = { itemId: 'fire_hardened_spear', name: 'Fire-hardened spear' };
let says = [], audioFired = [];
function newFight(id, playerHp, monsterHp) {
  try { if (Game.tbfight && !Game.tbfight.over) Game.tbEnd('fled'); } catch (e) {}
  says = [];
  Game.startCombat(id);
  const m = Game.tbfight.fighters.find(x => x.kind === 'monster');
  if (!m) throw new Error('newFight: no monster for ' + id);
  if (monsterHp) m.hp = m.maxHp = monsterHp;
  const pl = P(); pl.hp = pl.maxHp = (playerHp || 100);
  pl.mx = Math.min(7, Math.max(1, m.mx - 3)); pl.my = Math.min(7, Math.max(1, m.my));
  Game.state.scholar.mx = pl.mx; Game.state.scholar.my = pl.my;
  Game.state.scholar.equipped.weapon = Object.assign({}, SPEAR);
  return m;
}
function playRound(strategy) {
  const st = { over: false, lastPhp: P() ? P().hp : 0, result: null };
  const f0 = Game.tbfight;
  if (!f0 || f0.over) { st.over = true; st.result = f0 && f0.result; return st; }
  if (P() && P().alive) st.lastPhp = P().hp;
  if (Game.tbIsPlayerTurn() && P() && P().alive && !P().acted) strategy();
  endTurn();
  st.over = !Game.tbfight || Game.tbfight.over || f0.over;
  st.result = f0.over ? f0.result : null;
  if (P() && P().alive) st.lastPhp = P().hp;
  return st;
}
function strikeKey(key) {
  if (Game.tbIsPlayerTurn() && P() && !P().acted) return Game.tbPlayerStrike(key);
  return null;
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

  console.log('== UNDERSTUDY PROD: 8 rounds fully passive (unknown codex) ==');
  {
    const audioMark = audioFired.length;
    Game.state.codex.monsters = Game.state.codex.monsters || {};
    delete Game.state.codex.monsters.understudy; // unknown branch
    const m = newFight('understudy', 300, 400);
    const hp0 = P().hp, phases = new Set();
    let coldReadRound = 0, sawTelegraph = false, over = false, lastPhp = hp0, declaredCue = null;
    for (let r = 0; r < 8; r++) {
      const st = playRound(() => {}); // passive: never strikes
      phases.add(m.beamPhase);
      if (m.usColdRead && !coldReadRound) coldReadRound = r + 1;
      if (m.telegraph) { sawTelegraph = true; if (m.telegraph.cueText && !declaredCue) declaredCue = m.telegraph.cueText; }
      lastPhp = st.lastPhp;
      if (st.over) { over = true; break; }
    }
    const log = says.join('\n');
    const prodSaid = /COLD READ|learned your stillness|Done waiting/.test(log);
    const obsCount = Object.values(m.usSeen || {}).reduce((a, rec) => a + (rec.count || 0), 0);
    note('passive 8 rounds', `hp ${hp0}->${lastPhp}, observations ${obsCount}, phases {${[...phases].join(',')}}, cold read fired at loop-round ${coldReadRound || 'NEVER'}, fight over: ${over}`);
    check('prod fires: usColdRead set (~3 watching turns, zero learned moves)', !!m.usColdRead && coldReadRound > 0 && coldReadRound <= 3, `fired at loop-round ${coldReadRound}`);
    check('prod is narrated (no silent actions)', prodSaid);
    check('unknown-codex variant gates the coaching text ("hit it first")', /Done waiting/.test(log), 'known variant must not leak to unknown player');
    check('known-codex variant does NOT leak into unknown fight', !/Nothing\? Then I.ll do you/.test(log));
    check('phase advances past watching (rehearsing)', phases.has('rehearsing'));
    check('monster telegraphs on the grid (direct declare)', sawTelegraph);
    check('unknown attack cue on the grid telegraph ("It moves the way you move. Wrong. Fast.")',
      !!declaredCue && /Wrong\. Fast/.test(declaredCue) && !/COLD READ/.test(declaredCue), String(declaredCue).slice(0, 80));
    check('monster acts: player takes real damage (no raw dump — modest body-copy)', lastPhp < hp0 && (hp0 - lastPhp) < 120, `damage taken: ${hp0 - lastPhp}`);
    check('stall broken: not stuck in watching forever', !(phases.size === 1 && phases.has('watching')));
    check('zero observations recorded (passive player showed nothing)', obsCount === 0);
    const newAudio = audioFired.slice(audioMark);
    check('prod audio fires and resolves in CombatAudio registry',
      newAudio.includes('understudyRehearse') && newAudio.every(n => REG_KEYS.has(n)),
      newAudio.filter(n => !REG_KEYS.has(n)).join(','));
  }

  console.log('== UNDERSTUDY PROD: passive but codex-KNOWN (slain) ==');
  {
    Game.state.codex.monsters = Game.state.codex.monsters || {};
    Game.state.codex.monsters.understudy = { stage: 'slain' };
    const m = newFight('understudy', 300, 400);
    let declaredCue = null;
    for (let r = 0; r < 4 && Game.tbfight && !Game.tbfight.over; r++) {
      playRound(() => {});
      if (m.telegraph && m.telegraph.cueText) declaredCue = m.telegraph.cueText;
    }
    const log = says.join('\n');
    check('known-codex watch coaching shown ("every round it watches, it learns")', /every round it watches, it learns/.test(log));
    check('known-codex COLD READ variant shown', /Nothing\? Then I.ll do you/.test(log));
    // The attack cue never enters the say log by design (sayTelegraphOnce:
    // "the visual telegraph on the grid is the warning") — it renders on the
    // grid telegraph UI via tbTelegraphCue. Assert on the declared telegraph.
    check('known attack cue is codex-coached (grid telegraph "COLD READ." cue)', !!declaredCue && /"COLD READ\."/.test(declaredCue), String(declaredCue).slice(0, 80));
    check('prod still fires for the known player (knowledge changes coaching, not the prod)', !!m.usColdRead);
  }

  console.log('== UNDERSTUDY CONTROL: engaged player (strikes R1-R3) ==');
  {
    Game.state.codex.monsters = Game.state.codex.monsters || {};
    delete Game.state.codex.monsters.understudy;
    const m = newFight('understudy', 300, 400);
    const phases = new Set();
    for (let r = 0; r < 3; r++) {
      const st = playRound(() => { strikeKey(m.key); });
      phases.add(m.beamPhase);
      if (st.over) break;
    }
    const obsCount = Object.values(m.usSeen || {}).reduce((a, rec) => a + (rec.count || 0), 0);
    note('engaged 3 rounds', `observations ${obsCount}, phases {${[...phases].join(',')}}, usColdRead=${!!m.usColdRead}`);
    check('engaged player teaches it: observations recorded', obsCount >= 2, `obs=${obsCount}`);
    check('normal arc proceeds (rehearsing/performing), no cold read needed', !m.usColdRead && (m.beamPhase === 'rehearsing' || m.beamPhase === 'performing'), `phase=${m.beamPhase}`);
  }

  const unregistered = [...new Set(audioFired)].filter(n => !REG_KEYS.has(n));
  console.log(`\n${pass} pass, ${fail} fail${unregistered.length ? ' — UNREGISTERED AUDIO: ' + unregistered.join(',') : ''}`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
