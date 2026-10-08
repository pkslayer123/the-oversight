#!/usr/bin/env node
// PROOF TEST (Steve 2026-10-07) — social-fixes worker (2026-10-08).
// Three bugs from evidence/2026-10-08/social-play-report.md, verified at HEAD
// before fixing (see /tmp/play-repro.js):
//   BUG 1 (real, fixed here): talked_down resolution ended with the escape
//       fallback "You get out. Breathing hard, alive." — c2b7d59 had already
//       moved it from leader-speech to narration, but the LINE was still an
//       escape beat on a talk-down. Fix: ambushAftermath returns a per-outcome
//       closing line (narration register).
//   BUG 2 (real, ALREADY FIXED at HEAD by c2b7d59): player-convened moots
//       offered the vote only 90%. Fix present: callMoot sets playerConvened
//       when the caller is the player; tallyVotes includes the player vote
//       unconditionally when set; accused-exclusion kept. Proven here with the
//       60/60 trial the brief requires (old gate would fail it: 0.9^60≈0.0018).
//   BUG 3 (minor UX, fixed here): bribery investigate whiff (p=0.8, odds
//       UNCHANGED) said "Nothing you can prove. Yet." — a dead-end read for a
//       new player. Now: "…yet. Dig again; the trail is still warm."
// Played AS A PLAYER: the full ambush -> TALK -> talked_down -> callMoot chain
// is driven through real betrayalTurn calls; the final beat is read like Steve
// would read it. RNG: one shared resettable mulberry32 installed BEFORE module
// eval (betrayal.js captures `const R = Math.random` at load); reseed via
// Math.random.reset() so load-time captures stay deterministic.
// Run: node scripts/test-social-fixes-20261008.js   (SEED=... to override)
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const SEED = parseInt(process.env.SEED || '20261008', 10);
function makeRng(seed) {
  let a = seed | 0;
  const f = function () {
    a |= 0; a = a + 0x6D2B79F5 | 1;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
  f.reset = (s) => { a = s | 0; };
  return f;
}
Math.random = makeRng(SEED);

global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
global.window = global; // equipment.js touches window at load (browser-only in prod)
const SCRIPTS = ['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/conversation.js', 'src/js/convo-mood.js',
 'src/js/convoTopics.js', 'src/js/convo-wants.js', 'src/js/convo-dialogue.js', 'src/js/convo-beats.js',
 'src/js/examine.js', 'src/js/equipment.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/party-formal.js', 'src/js/truth.js', 'src/js/contests.js', 'src/js/storage.js',
 'src/js/perceive.js', 'src/js/carexplore.js', 'src/js/justice.js', 'src/js/food.js',
 'src/js/betrayal.js', 'src/js/corpses.js', 'src/js/lifeseed.js', 'src/js/progression.js',
 'src/js/ledger.js', 'src/js/abilityActions.js', 'src/js/monsterBehaviors.js', 'src/js/statusEffects.js',
 'src/js/villager-agency.js', 'src/js/codex-people.js',
 'src/js/membership.js', 'src/js/hierarchy.js', 'src/js/debug-scenarios.js',
 'src/js/build.js'];
// NOTE: app.js/sprites.js/tile-scenes.js/move-anim.js/drama.js are DOM-only — excluded per convention.
SCRIPTS.forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
delete global.window; // drop the stub: combat/convo take the SYNC path without window
const Game = globalThis.Scattering.Game;

(async () => {
await Game.init();
delete global.window; // in case init re-touches it

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log(`  PASS ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${extra ? ' — ' + extra : ''}`); }
};

function freshGame() {
  Game.genDetail = () => Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => 'grass'));
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  s.health = 500; s.kcal = 2400; s.hydration = 100;
  s.mx = 4; s.my = 4;
  (Game.log || []).length = 0;
  return s;
}
function npcs(n) { return Game.state.village.roster.filter(id => id !== Game.villagerId).slice(0, n); }

// ---------- BUG 1: talked_down ends with its own closing line, never an escape line ----------
// Played as a player: arm a real ambush, TALK x3 until talked_down, read the
// final beat of the conversation transcript like Steve would.
console.log('BUG 1: talked_down final beat');
{
  let play = null;
  for (let attempt = 0; attempt < 40 && !play; attempt++) {
    Math.random.reset(SEED + attempt * 7919);
    freshGame();
    const [leader, a1, a2] = npcs(3);
    const spoken = [];
    const origSayLine = Game.sayLine;
    Game.sayLine = function (vid, line) { spoken.push(String(line)); return origSayLine.call(this, vid, line); };
    try {
      const plot = Game.armPlot(leader, [a1, a2], Game.villagerId, { reasons: ["you've had this coming"], score: 70 });
      Game.startConvo(leader);
      Game.springAmbush(plot);
      let r = null;
      for (let t = 0; t < 3; t++) r = Game.betrayalTurn(leader, 'betrayal:talk');
      if (plot.outcome === 'talked_down') {
        const conv = Game.convoGet(leader);
        play = { r, spoken, last: (conv.transcript || []).slice(-1)[0] };
      }
    } catch (e) { play = { error: e.message }; break; }
    finally { Game.sayLine = origSayLine; }
  }
  ok('talk-down reachable via real TALK chain', !!play && !play.error, play && play.error);
  if (play && !play.error) {
    ok('final beat is the talk-down closing line, not the escape fallback',
      play.r.line === 'You talked them down. Now you have to live next to them.',
      JSON.stringify(play.r.line));
    ok('no escape line on the talk-down resolution',
      play.r.line !== 'You get out. Breathing hard, alive.');
    ok('final beat never spoken as the leader (sayLine)',
      !play.spoken.includes(play.r.line), 'spoken tail=' + JSON.stringify(play.spoken.slice(-2)));
    ok('transcript tags the final beat who:narr',
      !!play.last && play.last.who === 'narr' && play.last.text === play.r.line,
      JSON.stringify(play.last));
  }
}
// Per-outcome closing lines: each ambush outcome gets its own beat.
console.log('BUG 1: per-outcome closing lines');
{
  Math.random.reset(SEED + 31337);
  freshGame();
  const [leader, a1, a2] = npcs(3);
  const expect = {
    escaped: 'You get out. Breathing hard, alive.',
    talked_down: 'You talked them down. Now you have to live next to them.',
    fought_off: 'Down, not dead. And the whole village is about to hear about it.',
    knocked_out: 'Lighter, hurting, alive. And owed an answer.',
  };
  for (const [outcome, line] of Object.entries(expect)) {
    const plot = { id: 'plot_cl_' + outcome, leader, accomplices: [a1], target: Game.villagerId, witnesses: [] };
    let res = null;
    try { res = Game.ambushAftermath(plot, outcome); } catch (e) { res = { error: e.message }; }
    ok(`${outcome} closing line`, res && res.line === line, JSON.stringify(res && (res.line || res.error)));
  }
}

// ---------- BUG 2: player-convened moot always offers the vote (60/60) ----------
// Played as a player: full chain ambush -> talked_down -> 'Call a moot' choice
// on your own ambushers, then conductTrial 60 times. Under the old gate
// (R() < 0.9) P(60/60 no-skip) = 0.9^60 ≈ 0.0018 — 60/60 proves the fix.
console.log('BUG 2: player-convened moot — vote always offered (60 trials)');
{
  let chain = null;
  for (let attempt = 0; attempt < 40 && !chain; attempt++) {
    Math.random.reset(SEED + 5000 + attempt * 7919);
    freshGame();
    const [leader, a1, a2] = npcs(3);
    try {
      const plot = Game.armPlot(leader, [a1], Game.villagerId, { reasons: ["you've had this coming"], score: 70 });
      Game.startConvo(leader);
      Game.springAmbush(plot);
      for (let t = 0; t < 3; t++) Game.betrayalTurn(leader, 'betrayal:talk');
      if (plot.outcome !== 'talked_down') continue;
      const c = (Game.betrayalState().cases || []).find(x => x.plotId === plot.id && x.status === 'open');
      if (!c) continue;
      Game.tickAction = () => {};
      // the REAL player path: the 'Call a moot' convo choice on your ambushers
      const r = Game.betrayalTurn(leader, 'betrayal:moot:' + c.id);
      chain = { c, r };
    } catch (e) { /* try next seed */ }
  }
  ok('ambush -> talked_down -> call-moot chain reached', !!chain, chain ? '' : 'no chain in 40 attempts');
  if (chain) {
    ok('moot is player-convened', chain.c.playerConvened === true, 'playerConvened=' + chain.c.playerConvened);
    let offered = 0; const N = 60;
    for (let i = 0; i < N; i++) {
      chain.c.trial = null; chain.c.status = 'open';
      Math.random.reset(SEED * 7 + i * 991);
      const res = Game.conductTrial(chain.c);
      if (res && res.awaitingPlayerVote) { offered++; Game.castPlayerVote(chain.c.id, true); }
    }
    ok(`vote offered ${offered}/${N} consecutive trials`, offered === N);
    // teeth check: the OLD gate fails this exact bar on the same seeds
    let oldSkips = 0;
    for (let i = 0; i < N; i++) {
      Math.random.reset(SEED * 7 + i * 991);
      if (!(Math.random() < 0.9)) oldSkips++;
    }
    ok('old 90% gate would NOT pass 60/60 (test has teeth)', oldSkips > 0, 'old skips=' + oldSkips);
  }
}
// Accused player still never votes, even player-convened (kept exclusion).
console.log('BUG 2: accused-player exclusion kept');
{
  Math.random.reset(SEED + 6000);
  freshGame();
  const [a1, a2, a3] = npcs(3);
  const plot = { id: 'plot_acc_' + SEED, leader: Game.villagerId, accomplices: [a1], target: a2, witnesses: [] };
  const c = Game.openCase(plot, 'ambush');
  c.playerConvened = true;
  let neverVotes = true;
  for (let i = 0; i < 50; i++) {
    if (Game.tallyVotes(c, false, makeRng(SEED * 5 + i)).playerVoter) { neverVotes = false; break; }
  }
  ok('accused player never votes (even playerConvened)', neverVotes);
}

// ---------- BUG 3: bribery whiff copy names the dig-again path (odds unchanged) ----------
console.log('BUG 3: bribery whiff copy');
{
  Math.random.reset(SEED + 777);
  freshGame();
  const [leader, a1, a2, voter] = npcs(4);
  const plot = { id: 'plot_br_' + SEED, leader, accomplices: [a1], target: a2, witnesses: [] };
  const c = Game.openCase(plot, 'ambush');
  c.bribes.push({ voter, by: leader, amount: 800, day: Game.state.scholar.day, trace: true });
  let whiffLine = null;
  for (let i = 0; i < 50 && !whiffLine; i++) {
    Math.random.reset(SEED * 11 + i * 131);
    c.exposedBribes = [];
    const said = [];
    const origSay = Game.say;
    Game.say = function (m) { said.push(String(m)); return origSay.call(this, m); };
    let f;
    try { f = Game.investigateBribery(c.id); } finally { Game.say = origSay; }
    if (!f.length) whiffLine = said.slice(-1)[0];
  }
  ok('whiff is reachable', !!whiffLine);
  if (whiffLine) {
    ok('whiff copy names the dig-again path', /Dig again/i.test(whiffLine), JSON.stringify(whiffLine));
    ok('whiff copy is honest (a real chance, not a dead end)',
      /trail is still warm/i.test(whiffLine) || /real chance/i.test(whiffLine), JSON.stringify(whiffLine));
  }
  // odds UNCHANGED: p=0.8 per dig — rate over many digs stays ~0.8
  let hits = 0; const N = 1000;
  for (let i = 0; i < N; i++) {
    Math.random.reset(SEED * 13 + i * 37);
    c.exposedBribes = [];
    const origSay = Game.say; Game.say = () => {};
    try { if (Game.investigateBribery(c.id).length) hits++; } finally { Game.say = origSay; }
  }
  const rate = hits / N;
  ok('find odds unchanged (≈0.8)', rate > 0.75 && rate < 0.85, 'rate=' + rate.toFixed(3));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
