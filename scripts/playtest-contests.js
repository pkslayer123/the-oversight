// CONTESTS PLAYTEST (Steve 2026-10-06): drive the contest system as a PLAYER.
// Eligibility -> countdown -> unavoidable interruption -> full sequence
// (grab, choice+refusal, watch mode) -> shows -> frequency cap -> evasion attempts.
// Narrated beat by beat. Judge: playable? scary? fun? one-screen UI?
// Usage: node scripts/playtest-contests.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/party.js',
 'src/js/carexplore.js', 'src/js/contests.js', 'src/js/debug-scenarios.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

// seeded RNG — same felt run every time, but decisions are player-like
let _seed = 987654321;
Math.random = function () { _seed = (_seed * 1103515245 + 12345) % 2147483648; return _seed / 2147483648; };

// capture everything the game says
let said = [];
const _say = Game.say.bind(Game);
Game.say = function (t) { said.push('SAY ' + t); return _say(t); };
const _sysSay = Game.sysSay.bind(Game);
Game.sysSay = function (t) { said.push('SYS ' + t); return _sysSay(t); };
function drainSaid(prefix) {
  const out = said.slice(); said = [];
  for (const l of out) console.log((prefix || '  ') + String(l).replace(/\n/g, '\n  ').slice(0, 420));
  return out;
}
function beat(title) {
  console.log('\n' + '='.repeat(70));
  console.log(title);
  console.log('='.repeat(70));
}
function vitals() {
  const s = Game.state.scholar;
  console.log(`  [you hp:${Math.round(s.health)} kcal:${Math.round(s.kcal)} trauma:${s.trauma || 0} day:${s.day} over:${!!Game.state.over}]`);
}
function freshGame(day) {
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  Game.state.scholar.day = day || 15;
  Game.state.systemArrived = true;
  Game.state.scholar.health = 100;
  Game.state.scholar.kcal = 2000;
  Game.state.scholar.trauma = 0;
  Game.state.activeContest = null;
  Game.state.pendingContest = null;
  said = [];
}
function placeSomeVillagers() {
  // contest-eligible villagers need grid positions (per debug scenario note)
  const roster = Game.state.village.roster || [];
  const spots = [[2, 2], [6, 6], [3, 5]];
  Game.state.village.positions = Game.state.village.positions || {};
  roster.slice(0, 3).forEach((vid, i) => { Game.state.village.positions[vid] = { x: spots[i][0], y: spots[i][1] }; });
  return roster.slice(0, 3);
}
// Play one choice of the active contest as a player, narrating the decision.
function playChoice(idx, why) {
  const ac = Game.state.activeContest;
  if (!ac || ac.phase === 'done') { console.log('  (no active contest)'); return null; }
  const phase = ac.phases[ac.phaseIdx || 0];
  const c = phase && phase.choices && phase.choices[idx];
  console.log(`\n  > DECIDE: "${c ? c.label : '?'}${c && c.sub ? ' (' + c.sub + ')' : ''}" — ${why}`);
  const before = ac.phaseIdx;
  let r = null;
  try { r = Game.contestChoose(idx); } catch (e) { console.log('  CRASH: ' + e.message); return 'crash'; }
  drainSaid('  | ');
  if (r && r.done) { console.log(`  = SEQUENCE OVER: ${r.outcome}`); vitals(); return 'done:' + r.outcome; }
  return 'next';
}

(async () => {
  await Game.init();

  // ============ PLAY 1: ELIGIBILITY ============
  beat('PLAY 1 — ELIGIBILITY: who can go, and why? (day 15)');
  freshGame(15);
  placeSomeVillagers();
  Game.addNotability('player', 'wave2Kill');
  const el = Game.contestEligible();
  console.log(`  eligible (${el.eligible.length}):`);
  for (const e of el.eligible) console.log(`   🎯 ${e.name}${e.notability && e.notability.length ? ' — ' + e.notability.join('; ') : ' — no deeds on the record. the show decides.'}`);
  console.log(`  reason: ${el.reason || '(none — casting is open)'}`);
  beat('PLAY 1b — ELIGIBILITY pre-day-14');
  freshGame(5);
  const el2 = Game.contestEligible();
  console.log(`  eligible: ${el2.eligible.length} | reason: "${el2.reason}"`);

  // ============ PLAY 2: COUNTDOWN ============
  beat('PLAY 2 — THE COUNTDOWN: contest fires, status bar shows it coming');
  freshGame(15);
  placeSomeVillagers();
  const gauntlet = Game.contestPool().find(c => c.id === 'gauntlet');
  Game.fireContest(gauntlet);
  drainSaid('  | ');
  const pc = Game.state.pendingContest;
  console.log(`  pendingContest: ${pc ? pc.contestId + ' / participant=' + pc.participant + ' / firesDay=' + pc.firesDay : 'NONE'}`);
  vitals();

  // ============ PLAY 3: THE GRAB (full Gauntlet, player) ============
  beat('PLAY 3 — INTERRUPTION: the grab. Gauntlet, wave by wave.');
  // force the grab branch (usually grabbed, not choice)
  const g2 = Object.assign({}, gauntlet, { givesChoice: false });
  Game.state.pendingContest = { contestId: 'gauntlet', participant: 'player', firesDay: 15, variant: null };
  Game.state.scholar.day = 15;
  try { Game.resolveContest(); } catch (e) { console.log('  CRASH: ' + e.message); }
  drainSaid('  | ');
  // wave 1: player brain — don't spend everything on wave one (coaching line
  // says the closer smells blood). Use the arena.
  let r = playChoice(2, 'player brain: save my body for wave three, use the arena');
  // wave 2: desperate defense
  if (r === 'next') r = playChoice(1, 'player brain: survive the wave, arrive intact');
  // wave 3 (closer): read the wound readout first, then run the clock
  if (r === 'next') {
    const ac = Game.state.activeContest;
    const phase = ac.phases[ac.phaseIdx];
    console.log(`  [closer readout shown: wounds=${ac.wounds}]`);
    r = playChoice(1, 'player brain: the odds display says standing is suicide at these wounds — RUN');
  }

  // ============ PLAY 4: REFUSAL ============
  beat('PLAY 4 — SAY NO: the choice branch, refusal is a sequence');
  freshGame(15);
  placeSomeVillagers();
  const pitC = Object.assign({}, Game.contestPool().find(c => c.id === 'pit'), { givesChoice: true });
  Game.state.pendingContest = { contestId: 'pit', participant: 'player', firesDay: 15, variant: null };
  try { Game.resolveContest(); } catch (e) { console.log('  CRASH: ' + e.message); }
  // NOTE: resolveContest rebuilds from pool — givesChoice flag is LOST on the rebuild.
  // Force the choice branch directly to test refusal.
  drainSaid('  | ');
  const pit2 = Object.assign({}, Game.contestPool().find(c => c.id === 'pit'), { givesChoice: true });
  try { Game.contestInterruption(pit2, 'player'); } catch (e) { console.log('  CRASH: ' + e.message); }
  drainSaid('  | ');
  const ac4 = Game.state.activeContest;
  console.log(`  choice phase present: ${!!(ac4 && ac4.phases[0] && ac4.phases[0].choices.some(c => c.next === 'REFUSE'))}`);
  r = playChoice(1, 'player brain: I refuse. Let the galaxy watch me say no.');
  console.log(`  activeContest after refusal: ${Game.state.activeContest ? 'STILL UP (bad — stuck)' : 'cleared (good)'}`);

  // ============ PLAY 5: EVASION ATTEMPTS ============
  beat('PLAY 5a — EVASION: far from haven when dawn hits');
  freshGame(15);
  placeSomeVillagers();
  Game.state.pendingContest = { contestId: 'pit', participant: 'player', firesDay: 15, variant: null };
  Game.state.scholar.mx = 40; Game.state.scholar.my = 40; // deep on expedition, nowhere near haven
  try { Game.resolveContest(); } catch (e) { console.log('  CRASH: ' + e.message); }
  console.log(`  interruption fired while away: ${Game.state.activeContest ? 'YES (unavoidable ✓)' : 'NO (evasion hole ✗)'}`);
  drainSaid('  | ');

  beat('PLAY 5b — EVASION: participant DIES before the countdown fires');
  freshGame(15);
  placeSomeVillagers();
  Game.state.pendingContest = { contestId: 'pit', participant: 'player', firesDay: 16, variant: null };
  Game.state.scholar.health = 0; Game.state.over = true; // player died overnight
  Game.state.scholar.day = 16;
  try { Game.resolveContest(); } catch (e) { console.log('  CRASH on dead-player resolve: ' + e.message); }
  const ac5b = Game.state.activeContest;
  console.log(`  activeContest after dead-player resolve: ${ac5b ? 'MODAL FOR A CORPSE (bad)' : 'dropped (good)'}`);
  drainSaid('  | ');

  beat('PLAY 5c — EVASION: villager participant vanishes before countdown');
  freshGame(15);
  const vils = placeSomeVillagers();
  const deadV = vils[0];
  Game.state.pendingContest = { contestId: 'pit', participant: deadV, firesDay: 16, variant: null };
  Game.state.village.roster = (Game.state.village.roster || []).filter(id => id !== deadV); // died overnight
  Game.state.scholar.day = 16;
  try { Game.resolveContest(); } catch (e) { console.log('  CRASH: ' + e.message); }
  const ac5c = Game.state.activeContest;
  console.log(`  activeContest after dead-villager resolve: ${ac5c ? 'participant=' + ac5c.participant : 'dropped'}`);
  drainSaid('  | ');

  // ============ PLAY 6: WATCH MODE ============
  beat('PLAY 6 — WATCH MODE: a villager is taken (Hide and Seek, extreme)');
  freshGame(15);
  const vils6 = placeSomeVillagers();
  const taken = vils6[0];
  const tname = Game.displayName(taken);
  const hide = Game.contestPool().find(c => c.id === 'hide');
  try { Game.contestInterruption(hide, taken); } catch (e) { console.log('  CRASH: ' + e.message); }
  drainSaid('  | ');
  r = playChoice(0, 'player brain: cheer for them — they can hear it');
  if (r === 'next') r = playChoice(0, 'player brain: shout advice');
  if (r === 'next') r = playChoice(0, 'player brain: go to them after');
  console.log(`  ${tname} in roster after: ${(Game.state.village.roster || []).includes(taken) ? 'alive' : 'GONE (died on camera)'}`);
  vitals();

  beat('PLAY 6b — WATCH VERDICT stats: do villagers actually die on camera?');
  const risks = { pit: 'high', gauntlet: 'extreme', hide: 'extreme', lottery: 'low', moot: 'medium' };
  for (const [cid, risk] of Object.entries(risks)) {
    let died = 0, won = 0;
    for (let i = 0; i < 400; i++) {
      const fakeAc = { contestId: cid, participant: 'v1', phase: 'watching', phaseIdx: 2, phases: [], wounds: 0 };
      let dead = false;
      const _die = Game._contestDie.bind(Game);
      Game._contestDie = function (ac, how) { dead = true; ac.phase = 'done'; return { done: true, outcome: 'died' }; };
      const _end = Game._contestEnd.bind(Game);
      Game._contestEnd = function (ac, outcome) { ac.phase = 'done'; return { done: true, outcome }; };
      try { Game._contestVerdict(fakeAc); } catch (e) {}
      Game._contestDie = _die; Game._contestEnd = _end;
      if (dead) died++; else won++;
    }
    console.log(`  ${cid} (${risk}): died ${died}/400 (${(died / 4).toFixed(1)}%) — design odds: ${{ low: 0, medium: 3, high: 10, extreme: 20 }[risk]}%`);
  }

  // ============ PLAY 7: TV SHOWS ============
  beat('PLAY 7 — TV SHOWS: the in-between');
  freshGame(15);
  placeSomeVillagers();
  for (let i = 0; i < 4; i++) {
    const show = Game.pickShow();
    console.log(`\n  --- show ${i + 1}: ${show.name} ---`);
    let fs7 = null;
    try { fs7 = Game.fireShow(show); } catch (e) { console.log('  CRASH: ' + e.message); }
    drainSaid('  | ');
    console.log(`  returned: ${fs7 ? fs7.id : 'null'}`);
  }

  // ============ PLAY 8: FREQUENCY CAP ============
  beat('PLAY 8 — FREQUENCY CAP: 28 days of dawn ticks, seeded');
  freshGame(15);
  placeSomeVillagers();
  _seed = 42424242;
  let fired = 0, contests = 0, shows = 0;
  const perWeek = {};
  for (let d = 15; d < 43; d++) {
    Game.state.scholar.day = d;
    Game.state.pendingContest = null; Game.state.activeContest = null;
    Game.state.showBudget = Game.state.showBudget || { week: 0, used: 0 };
    const ev = Game.contestTick();
    if (ev && ev.id) {
      const wk = Math.floor(d / 7);
      perWeek[wk] = perWeek[wk] || { contests: 0, shows: 0 };
      const isC = !!Game.contestPool().find(c => c.id === ev.id);
      if (isC) { contests++; perWeek[wk].contests++; } else { shows++; perWeek[wk].shows++; }
      fired++;
    }
  }
  console.log(`  28 days: ${fired} events (${contests} contests, ${shows} shows)`);
  let capOK = true;
  for (const [wk, c] of Object.entries(perWeek)) {
    const total = c.contests + c.shows;
    console.log(`  week ${wk}: ${total} events (${c.contests}c/${c.shows}s)${total > 2 ? ' ← OVER CAP' : ''}`);
    if (total > 2) capOK = false;
  }
  console.log(`  frequency cap respected: ${capOK ? 'YES' : 'NO'}`);

  // ============ PLAY 9: UI FIT ============
  beat('PLAY 9 — UI FIT: phase text lengths vs one-screen dialogue box');
  let longest = { id: '', len: 0, idx: 0 };
  let over1200 = 0, total = 0;
  for (const c of Game.contestPool()) {
    let phases = null;
    try { phases = Game.contestPlayable(c); } catch (e) {}
    if (!phases) continue;
    phases.forEach((p, i) => {
      const len = String(p.text || '').length;
      total++;
      if (len > longest.len) longest = { id: c.id, len, idx: i };
      if (len > 1200) over1200++;
    });
    // watch phases
    try {
      const wp = Game._contestWatchPhases(c, 'player');
      wp.forEach((p, i) => {
        const len = String(p.text || '').length;
        total++;
        if (len > longest.len) longest = { id: c.id + ' (watch)', len, idx: i };
        if (len > 1200) over1200++;
      });
    } catch (e) {}
  }
  console.log(`  phases measured: ${total} | longest: ${longest.id} phase ${longest.idx} (${longest.len} chars) | phases over 1200 chars: ${over1200}`);
  // choice-phase prepend shift check: refusal must still resolve (covered in PLAY 4)

  // ============ PLAY 10: THE FEAR — Gauntlet closer odds readout ============
  beat('PLAY 10 — THE FEAR: closer odds scale with wounds, displayed by the System');
  console.log('  stand @0 wounds:  ' + Math.round(Game._contestCloserOdds('stand', 0) * 100) + '%');
  console.log('  stand @25 wounds: ' + Math.round(Game._contestCloserOdds('stand', 25) * 100) + '%');
  console.log('  stand @45 wounds: ' + Math.round(Game._contestCloserOdds('stand', 45) * 100) + '%');
  console.log('  run   @45 wounds: ' + Math.round(Game._contestCloserOdds('run', 45) * 100) + '%');
  console.log('  (readable, escalating, earned — the System displays your odds)');

  console.log('\n' + '='.repeat(70));
  console.log('PLAYTEST COMPLETE. See verdict in the parent report.');
})().catch(e => { console.error('PLAYTEST CRASH: ' + e.stack); process.exit(1); });
