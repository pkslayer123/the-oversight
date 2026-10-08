#!/usr/bin/env node
// ALIEN PLAYERS INTEGRATION PROOF (Steve 2026-10-08) — wire the exclusive
// alien-player pool into contests, codex, and gossip, knowledge-gated.
//
// What changed:
//   contests.js  — _contestVerdict calls apContestInterference(ac) directly;
//                  winMod bends winOdds, deathSave turns a player death roll
//                  into a loss (sequence still runs — interruption law holds).
//   alienPlayers.js — the old _contestVerdict self-wrap REMOVED (it would
//                  double-fire); apCodexEntry knowledge-gating fixed (species/
//                  title/disposition gated, pre-reveal note softened to
//                  suspicion); apCodexEntry now fires on apOnCombatEnd and
//                  apRevealAlien.
//   game.js      — spreadGossip() calls apVillageGossip() (gossip section).
//
// NOTE: src/js/alienPlayers.js is NOT yet in index.html (follow-up for the
// coordinator: one script tag after contests.js). The harness evals it in
// exactly that position.
//
// What this proves:
//   A — contest interference fires: rigging/lifeline/favor messages speak,
//       winMod bends the verdict odds, deathSave converts a player death
//       roll into a loss, and the sequence always terminates (no skip).
//   B — codex: encounters write state.codex.aliens entries with progressive
//       disclosure (encountered -> identified -> understood).
//   C — gossip: alien-player rumors surface through the village gossip flow.
//   D — knowledge gating: pre-reveal surfaces (codex entry, combat intro,
//       fighter name) never name the alien truth.
//
// HARNESS: full src/js/*.js list in index.html order + alienPlayers.js after
// contests.js, minus DOM-only app.js/sprites.js/tile-scenes.js/move-anim.js
// and minus drama.js. global.window stub for eval, deleted before play
// (sync combat path). RNG seeded (mulberry32, fixed default 20261008, SEED
// env override); scripted RNG for deterministic interference assertions.
//
// Exit code non-zero on any assertion failure.
// Run: node scripts/test-alien-players-integration-20261008.js
//      SEED=7 node scripts/test-alien-players-integration-20261008.js
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
const SEED = parseInt(process.env.SEED || '20261008', 10);
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
Math.random = mulberry32(SEED); // BEFORE eval: modules capture it at load
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(read(f))) });
global.window = global; // equipment.js touches window at load
const _SCRIPTS = ['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/conversation.js', 'src/js/convo-mood.js',
 'src/js/convoTopics.js', 'src/js/convo-wants.js', 'src/js/convo-dialogue.js', 'src/js/convo-beats.js',
 'src/js/examine.js', 'src/js/equipment.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/party-formal.js', 'src/js/truth.js', 'src/js/contests.js',
 // alienPlayers.js: recommended index.html placement is right after contests.js
 'src/js/alienPlayers.js',
 'src/js/storage.js',
 'src/js/perceive.js', 'src/js/carexplore.js', 'src/js/justice.js', 'src/js/food.js',
 'src/js/betrayal.js', 'src/js/corpses.js', 'src/js/lifeseed.js', 'src/js/progression.js',
 'src/js/ledger.js', 'src/js/abilityActions.js', 'src/js/monsterBehaviors.js',
 'src/js/statusEffects.js', 'src/js/villager-agency.js', 'src/js/codex-people.js',
 'src/js/membership.js', 'src/js/hierarchy.js', 'src/js/debug-scenarios.js',
 'src/js/build.js'];
// drama.js excluded: DOM at load. All Game.drama calls are try/caught.
_SCRIPTS.forEach(f => eval(read(f)));
delete global.window; // sync combat path for tbAfterPlayerAction
const Game = globalThis.Scattering.Game;

// ---------- assertions ----------
let passN = 0, failN = 0;
const fails = [];
function ok(name, cond, extra) {
  if (cond) { passN++; }
  else { failN++; fails.push(name + (extra ? ' — ' + extra : '')); console.log(`   [FAIL] ${name}${extra ? ' — ' + extra : ''}`); }
}
function drain() { const l = Game.log || []; const s = l.map(x => x.text || x).join('\n'); l.length = 0; return s; }
async function freshRun() {
  Game.genDetail = () => Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => 'grass'));
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  s.day = 15; Game.state.systemArrived = true;
  Game.state.waveKills = { 1: 4 }; // unlockedWave() >= 2
  s.health = 500; s.maxHealth = 500; s.kcal = 2400; s.hydration = 100; s.trauma = 0;
  drain();
}
function scriptedRandom(seq, fn) {
  const r = Math.random; let i = 0;
  Math.random = () => (i < seq.length ? seq[i++] : 0.99);
  try { return fn(); } finally { Math.random = r; }
}
function apFresh() { delete Game.state.alienPlayers; }
function mkAc(contestId, pids) {
  return { contestId, participant: pids[0], participants: pids.slice(), phase: 'verdict', phaseIdx: 0 };
}
// Alien-truth words that must NEVER appear on a pre-reveal surface.
const LEAK_WORDS = ['Vexari', 'Meridian', "K'thari", 'Burlap', 'Trophy Hunter',
  'Collector of Despair', 'Pain Enthusiast', 'Extreme Tourist', 'Xenobiologist',
  'wearing a human suit', 'wasn\'t human'];
function leakScan(name, text) {
  const hits = LEAK_WORDS.filter(w => text.indexOf(w) >= 0);
  ok(name + ': no alien-truth leak', hits.length === 0, 'leaked: ' + hits.join(', '));
}

(async () => {
  await Game.init();
  console.log('== ALIEN PLAYERS INTEGRATION PROOF — SEED ' + SEED + ' ==');
  ok('alienPlayers module loaded (apContestInterference)', typeof Game.apContestInterference === 'function');
  ok('alienPlayers module loaded (apCodexEntry)', typeof Game.apCodexEntry === 'function');
  ok('alienPlayers module loaded (apVillageGossip)', typeof Game.apVillageGossip === 'function');
  ok('alienPlayers module loaded (apContactedVillager)', typeof Game.apContactedVillager === 'function');
  ok('alienPlayers module loaded (apCarePackage)', typeof Game.apCarePackage === 'function');
  ok('alienPlayers module loaded (apContactWarning)', typeof Game.apContactWarning === 'function');
  ok('alien eligibility gate works (post-System, wave 2+)',
    (await freshRun(), Game.apEligible()) === true);

  // ---------- ACT 0 — static wiring ----------
  console.log('\n-- ACT 0: wiring (static) --');
  const cxSrc = read('src/js/contests.js');
  ok('contests.js _contestVerdict calls apContestInterference(ac) directly',
    /_contestVerdict = function\(ac\)[\s\S]{0,2000}this\.apContestInterference\(ac\)/.test(cxSrc));
  ok('contests.js applies apWinMod to winOdds', cxSrc.indexOf('winBase + cheer + apWinMod') >= 0);
  ok('contests.js honors apDeathSave on the death branch', cxSrc.indexOf('apDeathSave && pid') >= 0);
  const apSrc = read('src/js/alienPlayers.js');
  ok('alienPlayers.js _contestVerdict self-wrap removed (no double-fire)',
    apSrc.indexOf('var _verdict = G._contestVerdict') < 0);
  const gSrc = read('src/js/game.js');
  ok('game.js spreadGossip calls apVillageGossip', /spreadMonsterNews\(\)[\s\S]{0,600}this\.apVillageGossip\(\)/.test(gSrc));

  // ---------- ACT 1 — contest interference, played ----------
  console.log('\n-- ACT 1: contest interference --');

  // 1a. Favor bends the odds (deterministic: favor>=40 -> +0.08, no RNG in interference)
  // Each trial gets its own 2-roll script so trials stay independent.
  for (const [favor, label] of [[100, 'loved'], [0, 'neutral']]) {
    await freshRun(); apFresh();
    Game.apState().favor = favor;
    let wins = 0; const trials = 300;
    for (let i = 0; i < trials; i++) {
      const w = 0.40 + (i % 20) * 0.005; // win roll 0.40..0.495
      scriptedRandom([0.5, w], () => { // death roll (no death), win roll
        const ac = mkAc('pit', ['player']);
        const res = Game._contestVerdict(ac);
        if (res.outcome === 'won') wins++;
        if (!res.done || Game.state.activeContest !== null) throw new Error('sequence did not terminate');
      });
    }
    drain();
    console.log(`   favor ${label}: ${wins}/${trials} wins (winOdds ${favor >= 40 ? '0.48' : '0.40'})`);
    if (favor === 100) var winsLoved = wins; else var winsNeutral = wins;
  }
  ok('favor +100 beats favor 0 over identical rolls (odds bend)', winsLoved > winsNeutral,
    `${winsLoved} vs ${winsNeutral}`);
  ok('loved win rate sane (not rigged to always win)', winsLoved > 0 && winsLoved < 300, String(winsLoved));

  // 1b. Sadistic rigging fires with a beat, bends one verdict (played end-to-end)
  await freshRun(); apFresh();
  Game.apState().met = { vex_marlowe: { encounters: 2, bond: 0, lastOutcome: 'lost', lastDay: 10 } };
  let res1b;
  const log1b = scriptedRandom([0.1, 0.5, 0.30], () => { // rig roll, death roll, win roll
    res1b = Game._contestVerdict(mkAc('pit', ['player']));
    return drain();
  });
  // winOdds = 0.40 - 0.12 = 0.28; win roll 0.30 -> lost
  ok('rigged verdict terminates (sequence not skipped)', res1b.done === true && Game.state.activeContest === null);
  ok('rigging bends the verdict (0.30 roll loses at 0.28 odds)', res1b.outcome === 'lost', res1b.outcome);
  ok('rigging speaks its beat (pre-reveal: no name)', /judges is smiling too widely/.test(log1b), log1b.slice(0, 120));
  leakScan('rigging beat pre-reveal', log1b);

  // 1c. Benevolent lifeline: death roll becomes a loss, player lives (played)
  await freshRun(); apFresh();
  Game.apState().met = { old_tam: { encounters: 1, bond: 3, lastOutcome: 'won', lastDay: 10 } };
  let res1c;
  const log1c = scriptedRandom([0.1, 0.05], () => { // lifeline roll, death roll (<0.10 -> death)
    res1c = Game._contestVerdict(mkAc('pit', ['player']));
    return drain();
  });
  ok('lifeline converts player death roll to a loss', res1c.outcome === 'lost', res1c.outcome);
  ok('lifeline: player survives', (Game.state.scholar.health || 0) > 0 && !Game.state.over);
  ok('lifeline speaks its beat', /killing blow\.\.\. misses/.test(log1c));
  ok('lifeline verdict terminates', res1c.done === true && Game.state.activeContest === null);
  // control: same death roll, no lifeline -> died
  await freshRun(); apFresh();
  let resCtl;
  scriptedRandom([0.05], () => { resCtl = Game._contestVerdict(mkAc('pit', ['player'])); drain(); });
  ok('control: same death roll without lifeline kills', resCtl.outcome === 'died', resCtl.outcome);

  // ---------- ACT 2 — codex ----------
  console.log('\n-- ACT 2: codex (discoverable truth, knowledge-gated) --');
  await freshRun(); apFresh();
  Game.apOnCombatEnd('vex_marlowe', 'lost');
  let entry = (Game.state.codex.aliens || {}).vex_marlowe;
  ok('encounter writes a codex entry', !!entry);
  ok('entry stage is encountered', entry && entry.stage === 'encountered', entry && entry.stage);
  ok('entry keeps the human persona name', entry && entry.name === 'Vex Marlowe', entry && entry.name);
  ok('pre-reveal: disposition hidden', entry && entry.disposition === 'unknown', entry && entry.disposition);
  ok('pre-reveal: species hidden', entry && entry.species === 'unknown', entry && entry.species);
  ok('pre-reveal: title hidden', entry && entry.title === 'stranger', entry && entry.title);
  leakScan('pre-reveal codex entry', JSON.stringify(entry));
  const log2 = drain();
  leakScan('combat-end lines pre-reveal', log2);

  // pre-reveal combat intro + fighter name never name the truth
  await freshRun(); apFresh();
  Game.apCombatIntro('rax_dentist');
  leakScan('pre-reveal combat intro', drain());
  const f = Game.apBuildFighter('pip_quindle', 4, 4);
  ok('pre-reveal fighter is a Stranger, not a named alien', f && f.name === 'Stranger', f && f.name);
  ok('fighter kind is hostile (a person), not monster', f && f.kind === 'hostile', f && f.kind);

  // reveal: the book catches up
  await freshRun(); apFresh();
  Game.apOnCombatEnd('vex_marlowe', 'lost');
  Game.apRevealAlien('vex_marlowe', 'test reveal');
  entry = (Game.state.codex.aliens || {}).vex_marlowe;
  ok('reveal marks the persona known', Game.apKnowsAlien('vex_marlowe') === true);
  ok('post-reveal entry stage is identified', entry && entry.stage === 'identified', entry && entry.stage);
  ok('post-reveal entry names the truth', entry && entry.species === 'Vexari' && entry.disposition === 'sadistic',
    entry && (entry.species + '/' + entry.disposition));

  // 3rd encounter auto-reveals (pattern recognition)
  await freshRun(); apFresh();
  Game.apOnCombatEnd('sarge', 'lost');
  Game.apOnCombatEnd('sarge', 'lost');
  ok('2 encounters: still hidden', Game.apKnowsAlien('sarge') === false);
  const log3 = drain();
  Game.apOnCombatEnd('sarge', 'lost');
  ok('3rd encounter reveals (fighting style recognized)', Game.apKnowsAlien('sarge') === true);
  ok('reveal speaks in-fiction', /wasn't human/.test(drain() + log3));

  // 5 encounters -> understood
  Game.apOnCombatEnd('sarge', 'lost');
  Game.apOnCombatEnd('sarge', 'lost');
  entry = (Game.state.codex.aliens || {}).sarge;
  ok('5 encounters: stage understood', entry && entry.stage === 'understood', entry && entry.stage);

  // ---------- ACT 3 — gossip ----------
  console.log('\n-- ACT 3: village gossip --');
  await freshRun(); apFresh();
  const g1 = scriptedRandom([0.05, 0], () => { Game.apVillageGossip(); return drain(); });
  ok('alien-player gossip surfaces', /💬/.test(g1) && /audience|watching|stranger/i.test(g1), g1.slice(0, 140));
  // through the game.js gossip flow (spreadGossip says nothing with an empty gossip array)
  await freshRun(); apFresh();
  const g2 = scriptedRandom([0.05, 0], () => { Game.spreadGossip(); return drain(); });
  ok('gossip flows via game.js spreadGossip wiring', /💬/.test(g2) && /audience|watching|stranger/i.test(g2), g2.slice(0, 140));
  ok('gossip cooldown holds (no double-speak same day)',
    scriptedRandom([0.05, 0], () => { Game.apVillageGossip(); return drain(); }) === '');
  // daily tick smoke: the whole off-screen suite runs without throwing
  await freshRun(); apFresh();
  let tickOk = true;
  try { scriptedRandom(new Array(60).fill(0.99), () => Game.apDailyTick()); drain(); }
  catch (e) { tickOk = false; console.log('   apDailyTick threw: ' + e.message); }
  ok('apDailyTick runs clean', tickOk);

  // ---------- ACT 4 — audit: the rest ----------
  console.log('\n-- ACT 4: contacted villager / warnings / care packages --');
  await freshRun(); apFresh();
  ok('apContactedVillager: too early (day<20) stays unwired', Game.apContactedVillager() === null);
  ok('apContactWarning: no contact -> silent', Game.apContactWarning() === false);
  Game.state.scholar.day = 25;
  const vid = scriptedRandom([0.1, 0], () => Game.apContactedVillager());
  ok('apContactedVillager: establishes a contact', !!vid && Game.apState().contactedVid === vid, String(vid));
  ok('contact scene plays', /pulls you aside/.test(drain()));
  const w1 = scriptedRandom([0.1, 0], () => { const r = Game.apContactWarning(); const t = drain(); return { r, t }; });
  ok('apContactWarning: warns through the contact', w1.r === true && /Dreamed|north|proud/.test(w1.t), w1.t.slice(0, 120));
  await freshRun(); apFresh();
  ok('apCarePackage: unfavored crowd sends nothing', Game.apCarePackage() === false);
  Game.apState().favor = 80;
  const kcalBefore = Game.state.scholar.kcal || 0;
  const pkg = scriptedRandom([0.1, 0.1], () => Game.apCarePackage());
  ok('apCarePackage: favored crowd sends a package', pkg === true);
  ok('care package feeds (kcal up)', (Game.state.scholar.kcal || 0) > kcalBefore);
  ok('care package announces', /care package drops from the sky/i.test(drain()));

  console.log(`\n== ${passN} passed, ${failN} failed ==`);
  if (failN) { console.log('FAILURES:\n - ' + fails.join('\n - ')); process.exit(1); }
  console.log('GREEN');
})();
