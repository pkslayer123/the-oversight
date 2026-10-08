#!/usr/bin/env node
// PROOF TEST (Steve 2026-10-07) — betrayal.js fixes (2026-10-08).
// Fixes under test:
//   F1. talked-down ambush escape beat was sayLine'd as the LEADER's dialogue
//       ("You get out. Breathing hard, alive." rendered as ambusher speech).
//       Now: narration via this.say, transcript tagged who:'narr'.
//   F2. tallyVotes gave the player a vote only 90% even on player-convened
//       moots (despite the "always at the moot" comment). Now: c.playerConvened
//       set in callMoot when the caller is the player; tallyVotes includes
//       the player vote unconditionally when set; 90% preserved otherwise.
// Played AS A PLAYER: talk-down driven through real betrayalTurn calls, and a
// moot convened through real callMoot. RNG seeded (mulberry32, SEED override).
// Run: node scripts/test-betrayal-fixes-20261008.js
//      SEED=99 node scripts/test-betrayal-fixes-20261008.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const SEED = parseInt(process.env.SEED || '20261008', 10);
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 1; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
Math.random = mulberry32(SEED);

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
delete global.window; // drop the stub: combat takes the SYNC advance path without window
const Game = globalThis.Scattering.Game;

(async () => {
await Game.init();
delete global.window; // in case init re-touches it

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log(`  PASS ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${extra ? ' — ' + extra : ''}`); }
};
const drain = () => { const l = (Game.log || []).slice(); (Game.log || []).length = 0; return l; };

function freshGame() {
  Game.genDetail = () => Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => 'grass'));
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  s.health = 500; s.kcal = 2400; s.hydration = 100;
  s.mx = 4; s.my = 4;
  drain();
  return s;
}

// ---------- F1: talked-down escape is narration, never the leader's voice ----------
// Drive a real ambush through real betrayalTurn calls (played as a player:
// TALK, TALK, TALK — stall them until the plan breaks). Talk-down is p=0.7 per
// third talk, so reseed attempts until it lands (bounded, deterministic).
console.log('F1: talked-down ambush escape beat');
{
  let win = null;
  for (let attempt = 0; attempt < 30 && !win; attempt++) {
    Math.random = mulberry32(SEED + attempt * 7919);
    freshGame();
    const roster = Game.state.village.roster.filter(id => id !== Game.villagerId);
    const leader = roster[0], acc = [roster[1], roster[2]];
    const spoken = [], narr = [];
    const origSayLine = Game.sayLine, origSay = Game.say;
    Game.sayLine = function (vid, line) { spoken.push({ vid, line }); return origSayLine.call(this, vid, line); };
    Game.say = function (m) { narr.push(String(m)); return origSay.call(this, m); };
    try {
      const plot = Game.armPlot(leader, acc, Game.villagerId, { reasons: ["you've had this coming"], score: 70 });
      Game.startConvo(leader);
      Game.springAmbush(plot);
      let r = null;
      for (let t = 0; t < 3; t++) r = Game.betrayalTurn(leader, 'betrayal:talk');
      if (plot.outcome === 'talked_down') {
        const conv = Game.convoGet(leader);
        const last = (conv.transcript || []).slice(-1)[0];
        win = { leader, narr, spoken, last, line: r && r.line };
      }
    } catch (e) { win = { error: e.message }; break; }
    finally { Game.sayLine = origSayLine; Game.say = origSay; }
  }
  ok('talk-down outcome reachable via real betrayalTurn', !!win && !win.error, win && win.error);
  if (win && !win.error) {
    // SUPERSEDED 2026-10-08 (social-fixes): the fallback was an escape line
    // landing on a talk-down. ambushAftermath now returns a per-outcome
    // closing line; talked_down gets its own beat, still narration.
    ok('closing beat is the talk-down line, not the escape fallback',
      win.line === 'You talked them down. Now you have to live next to them.', JSON.stringify(win.line));
    ok('no escape line on the talk-down resolution',
      win.line !== 'You get out. Breathing hard, alive.');
    ok('escape beat NOT spoken by the leader', !win.spoken.some(s => String(s.line) === win.line),
      'spoken=' + JSON.stringify(win.spoken.map(s => String(s.line).slice(0, 40))));
    ok('escape beat rendered as narration', win.narr.some(m => m === win.line),
      'narr tail=' + JSON.stringify(win.narr.slice(-3).map(m => m.slice(0, 40))));
    ok('transcript tags the beat who:narr', !!win.last && win.last.who === 'narr' && win.last.text === win.line,
      JSON.stringify(win.last));
    const leaderName = (() => { try { return Game.displayName(win.leader); } catch (e) { return '?'; } })();
    ok('no leader name prefix on the beat', !win.narr.some(m => m === win.line && m.includes(leaderName)));
  }
}

// ---------- F2a: player-convened moot always takes the player's vote ----------
console.log('F2a: player-convened moot — player always votes');
{
  Math.random = mulberry32(SEED);
  freshGame();
  const roster = Game.state.village.roster.filter(id => id !== Game.villagerId);
  const leader = roster[0], acc = [roster[1]];
  const plot = { id: 'plot_t' + SEED, leader, accomplices: acc, target: roster[2], witnesses: [] };
  const c = Game.openCase(plot, 'ambush');
  ok('case opened as bystander (not accused)', !c.accused.includes(Game.villagerId));
  Game.tickAction = () => {};
  const before = (c.trial || {}).playerVoter;
  Game.callMoot(c.id); // no byId: the PLAYER convenes
  ok('callMoot set playerConvened', !!c.playerConvened === true, 'playerConvened=' + c.playerConvened);
  // tallyVotes with many distinct seeds — the player vote must ALWAYS be present
  let always = true, n = 0;
  for (let i = 0; i < 200; i++) {
    const t = Game.tallyVotes(c, false, mulberry32(SEED + i * 131));
    n++;
    if (!t.playerVoter) { always = false; break; }
  }
  ok('player vote present on 200/200 seeded tallies', always, n + ' trials');
}

// ---------- F2b: non-convened moots keep the 90% behavior ----------
console.log('F2b: non-player-convened moot — 90% attendance preserved');
{
  Math.random = mulberry32(SEED);
  freshGame();
  const roster = Game.state.village.roster.filter(id => id !== Game.villagerId);
  const leader = roster[0], acc = [roster[1]];
  const plot = { id: 'plot_t2_' + SEED, leader, accomplices: acc, target: roster[2], witnesses: [] };
  const c = Game.openCase(plot, 'ambush');
  c.playerConvened = false; // an NPC called this one
  let yes = 0; const N = 2000;
  for (let i = 0; i < N; i++) {
    const t = Game.tallyVotes(c, false, mulberry32(SEED * 3 + i * 17));
    if (t.playerVoter) yes++;
  }
  const rate = yes / N;
  ok('non-convened player vote rate ≈ 0.90', rate > 0.87 && rate < 0.93, 'rate=' + rate.toFixed(4));
  // accused player still never votes, even when they convened
  const plot2 = { id: 'plot_t3_' + SEED, leader: Game.villagerId, accomplices: acc, target: roster[2], witnesses: [] };
  const c2 = Game.openCase(plot2, 'ambush');
  ok('accused-player case built right', c2.accused.includes(Game.villagerId));
  c2.playerConvened = true;
  let neverVotes = true;
  for (let i = 0; i < 50; i++) {
    if (Game.tallyVotes(c2, false, mulberry32(SEED * 5 + i)).playerVoter) { neverVotes = false; break; }
  }
  ok('accused player never votes (even playerConvened)', neverVotes);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
