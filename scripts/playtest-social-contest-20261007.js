#!/usr/bin/env node
// SOCIAL + CONTEST SCENARIO PLAYTEST (Steve 2026-10-06).
// Plays as a PLAYER through the middle-third scenarios:
//   social: uprising, starving, language (+regression check on moot/ambush/liars/exile already covered today)
//   contests: contestPit, contestHide, contestForage, contestWatch, showWhyEat, contestEligible
// Judges: playable? enjoyable? clear? softlocks? visuals complete? knowledge-gated?
// Harness: FULL production script list in index.html order (minus DOM-only),
// window stubbed during eval then deleted so combat takes the sync path.
// Usage: node scripts/playtest-social-contest-20261007.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });

// Stub window for load (equipment.js needs it), delete after for sync combat path.
global.window = global;
const FILES = [
  'src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
  'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
  'src/js/game.js', 'src/js/encounters.js', 'src/js/conversation.js', 'src/js/convo-mood.js',
  'src/js/convoTopics.js', 'src/js/convo-wants.js', 'src/js/convo-dialogue.js', 'src/js/convo-beats.js',
  'src/js/examine.js', 'src/js/equipment.js', 'src/js/journal.js', 'src/js/party.js',
  'src/js/party-formal.js', 'src/js/truth.js', 'src/js/contests.js', 'src/js/storage.js',
  'src/js/perceive.js', 'src/js/carexplore.js', 'src/js/justice.js', 'src/js/food.js',
  'src/js/betrayal.js', 'src/js/corpses.js', 'src/js/lifeseed.js', 'src/js/progression.js',
  'src/js/ledger.js', 'src/js/villager-agency.js', 'src/js/codex-people.js', 'src/js/membership.js',
  'src/js/hierarchy.js', 'src/js/debug-scenarios.js', 'src/js/build.js',
];
for (const f of FILES) {
  try { eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); }
  catch (e) { console.error('LOAD FAIL', f, e.message); process.exit(1); }
}
delete global.window;
const Game = globalThis.Scattering.Game;

let sayLog = [];
const _say = Game.say.bind(Game);
Game.say = (t) => { sayLog.push(String(t)); return _say(t); };
function fresh(id) { sayLog = []; const ok = Game.debugScenario(id); return ok; }
const narr = () => sayLog.filter(l =>
  !l.startsWith('🐞') && !l.startsWith('📖') && !l.startsWith('📓') &&
  !/^Travel \d+ tile/i.test(l) && l.trim().length > 0);
const LEAK_RE = /🐞|\(debug\)|TODO|FIXME|\[object Object\]|console\.log|\bNaN\b|undefined/i;

const verdicts = [];
function judge(scenario, ok, note) {
  verdicts.push({ scenario, ok, note });
  console.log(`  ${ok ? '✓' : '✗'} [${scenario}] ${note}`);
}
function driveContest(scenario, maxSteps = 25) {
  // Returns {steps, done, stalled, died, phases:[]}
  const out = { steps: 0, done: false, stalled: false, died: false, phases: [] };
  let guard = maxSteps;
  while (Game.state.activeContest && guard-- > 0) {
    const ac = Game.state.activeContest;
    const phase = ac.phases[ac.phaseIdx || 0];
    if (!phase || !phase.choices || !phase.choices.length) { out.stalled = true; out.phases.push(`phase${ac.phaseIdx}:NO-CHOICES`); break; }
    out.phases.push(`${phase.id || ac.phaseIdx}:${phase.choices.length}ch`);
    sayLog = [];
    let res;
    try { res = Game.contestChoose(0); }
    catch (e) { out.phases.push('THREW:' + e.message.slice(0, 80)); out.stalled = true; break; }
    out.steps++;
    if (res && res.done) { out.done = true; out.died = res.outcome === 'died'; out.outcome = res.outcome; break; }
  }
  if (guard <= 0 && Game.state.activeContest) { out.stalled = true; out.phases.push('GUARD-HIT'); }
  if (Game.state.activeContest && !out.done) out.stalled = true;
  return out;
}
function resolveIfPending() {
  // fireContest leaves pendingContest (next-day telegraph); resolve to interruption
  if (Game.state.pendingContest && !Game.state.activeContest) {
    try { Game.resolveContest(); } catch (e) { sayLog.push('resolve error: ' + e.message); }
  }
}
function leakSweep(scenario) {
  const bad = narr().filter(l => LEAK_RE.test(l) && !l.includes('🐞 SCENARIO'));
  if (bad.length) judge(scenario, false, `LEAK: ${bad[0].slice(0, 130)}`);
  else judge(scenario, true, 'no dev-marker leaks in player text');
}
function dump(label, n = 6) {
  const lines = narr().slice(0, n);
  console.log(`  --- ${label} ---`);
  lines.forEach(l => console.log('   | ' + l.slice(0, 140)));
}

(async () => {
  await Game.init();

  // ================= 1. UPRISING =================
  console.log('\n##### 1. UPRISING — stage-4 justice, they come at you #####');
  if (!fresh('uprising')) { judge('uprising', false, 'scenario failed to start'); }
  else {
    dump('uprising intro');
    const s0 = Game.state.scholar;
    // Player tries to talk (desperate) — is there a talk path?
    let talked = false;
    try {
      const roster = Object.keys((Game.state.village && Game.state.village.trust) || {});
      if (roster.length && Game.talkTo) { sayLog = []; Game.talkTo(roster[0]); talked = narr().length > 0; }
    } catch (e) {}
    judge('uprising', true, `talk attempt during uprising: ${talked ? 'villager responds (desperate talk exists)' : 'no talk response — check if intended (stage 4 = nobody came to talk)'}`);
    // Does the uprising resolve or softlock? Advance time.
    const hp0 = s0.health;
    try { sayLog = []; Game.wait && Game.wait('a while'); } catch (e) {}
    const st = Game.justiceState ? Game.justiceState() : null;
    judge('uprising', true, `after waiting: justice stage=${st && st.stage}, player hp ${Math.round(hp0 || 0)}→${Math.round((Game.state.scholar.health) || 0)}`);
    // Flee path: can the player leave?
    let fled = false;
    try { sayLog = []; if (Game.flee) { Game.flee(); fled = true; } } catch (e) {}
    judge('uprising', true, `flee verb ${fled ? 'exists' : 'missing/unavailable'} — stage-4 must have an out`);
    leakSweep('uprising');
  }

  // ================= 2. STARVING =================
  console.log('\n##### 2. STARVING — day 4, pantry nearly empty, everyone notices #####');
  if (!fresh('starving')) { judge('starving', false, 'scenario failed to start'); }
  else {
    dump('starving intro');
    // Take food: do people notice? (social consequence, not mechanical)
    const pan0 = JSON.stringify(Game.state.village.pantry);
    sayLog = [];
    let took = false;
    try {
      if (Game.takeFromPantry) { Game.takeFromPantry(0, 1); took = true; }
      else if (Game.pantryTake) { Game.pantryTake(0, 1); took = true; }
    } catch (e) { sayLog.push('take error: ' + e.message); }
    const reacted = narr().join(' ').length > 0;
    judge('starving', took, `take-from-pantry ${took ? 'works' : 'FAILED'}; villager reaction text: ${reacted ? 'present' : 'ABSENT — taking in a starving village should be noticed'}`);
    if (reacted) dump('take reaction', 4);
    // Knowledge gate: does the UI reveal kcal?
    const lines = narr().join(' ');
    judge('starving', true, `scarcity legible: pantry lines mention ${/kcal|calorie/i.test(lines) ? 'kcal' : 'NO kcal — numbers should be visible here'}`);
    leakSweep('starving');
  }

  // ================= 3. LANGUAGE =================
  console.log('\n##### 3. LANGUAGE — nobody speaks English #####');
  if (!fresh('language')) { judge('language', false, 'scenario failed to start'); }
  else {
    dump('language intro');
    // Talk to a villager: is the barrier legible and playable?
    let talkOut = '';
    try {
      const roster = Object.keys((Game.state.village && Game.state.village.trust) || {});
      if (roster.length && Game.talkTo) { sayLog = []; Game.talkTo(roster[0]); talkOut = narr().join(' '); }
    } catch (e) { talkOut = 'ERR: ' + e.message; }
    const barrierLegible = /gesture|point|mim|don't understand|not understand|foreign|strange tongue/i.test(talkOut);
    judge('language', talkOut.length > 0, `talk with barrier: ${talkOut.length ? (barrierLegible ? 'barrier LEGIBLE ("' + talkOut.slice(0, 90) + '...")' : 'talks but barrier NOT legible — "' + talkOut.slice(0, 90) + '"') : 'NO RESPONSE — softlock risk'}`);
    // Is there a path forward (learn words)?
    const hasLearnPath = /learn|teach|word|phrase/i.test(talkOut);
    judge('language', true, `progression hint: ${hasLearnPath ? 'present — player can see a way forward' : 'ABSENT — barrier with no visible path = frustration'}`);
    leakSweep('language');
  }

  // ================= 4. CONTEST: PIT =================
  console.log('\n##### 4. CONTEST PIT — grabbed, phases, verdict #####');
  if (!fresh('contestPit')) { judge('contestPit', false, 'scenario failed to start'); }
  else {
    dump('pit intro', 8);
    const pc = Game.state.pendingContest;
    judge('contestPit', !!pc, pc ? `contest pending: ${pc.id || pc.contestId}, participant=${pc.participant || '?'}` : 'NO pending contest — fireContest did not set one up');
    if (pc) {
      // The interruption: resolve pending -> active, then drive phases
      sayLog = [];
      resolveIfPending();
      const ac = Game.state.activeContest;
      judge('contestPit', !!ac, ac ? `interruption live: ${ac.phases.length} phases` : 'resolveContest did NOT create activeContest — interruption missing!');
      if (ac) {
        const r = driveContest('contestPit');
        judge('contestPit', r.done && !r.stalled, `played ${r.steps} phases [${r.phases.slice(0, 6).join(' → ')}${r.phases.length > 6 ? '…' : ''}] → ${r.done ? 'outcome=' + r.outcome : 'STALLED'}`);
        if (r.stalled) dump('pit stall point', 5);
        else dump('pit verdict', 5);
      }
    }
    leakSweep('contestPit');
  }

  // ================= 5. CONTEST: HIDE =================
  console.log('\n##### 5. CONTEST HIDE — extreme risk, seeker predator #####');
  if (!fresh('contestHide')) { judge('contestHide', false, 'scenario failed to start'); }
  else {
    const pc = Game.state.pendingContest;
    judge('contestHide', !!pc, pc ? 'hide contest fired' : 'NO pending contest');
    if (pc) {
      sayLog = []; resolveIfPending();
      const hp0 = Game.state.scholar.health;
      const r = driveContest('contestHide');
      const hp1 = Game.state.scholar.health;
      judge('contestHide', r.done && !r.stalled, `played ${r.steps} phases → ${r.done ? 'outcome=' + r.outcome : 'STALLED'}; hp ${Math.round(hp0)}→${Math.round(hp1)} ${r.died ? '(DIED — extreme risk legible)' : ''}`);
      if (r.stalled) dump('hide stall point', 5);
      else dump('hide end', 4);
    }
    leakSweep('contestHide');
  }

  // ================= 6. CONTEST: CALORIE RUN =================
  console.log('\n##### 6. CONTEST CALORIE RUN — foraging competition #####');
  if (!fresh('contestForage')) { judge('contestForage', false, 'scenario failed to start'); }
  else {
    const pc = Game.state.pendingContest;
    judge('contestForage', !!pc, pc ? 'calorie_run fired' : 'NO pending contest');
    if (pc) {
      sayLog = []; resolveIfPending();
      const r = driveContest('contestForage');
      judge('contestForage', r.done && !r.stalled, `played ${r.steps} phases → ${r.done ? 'outcome=' + r.outcome : 'STALLED'}`);
      if (r.stalled) dump('forage stall point', 5);
      else dump('forage end', 4);
    }
    leakSweep('contestForage');
  }

  // ================= 7. CONTEST WATCH MODE =================
  console.log('\n##### 7. CONTEST WATCH — villager taken, you watch #####');
  if (!fresh('contestWatch')) { judge('contestWatch', false, 'scenario failed to start'); }
  else {
    // Scenario resolves internally; check BOTH pending and active
    const pc = Game.state.pendingContest, ac = Game.state.activeContest;
    const taken = (ac && (ac.taken || ac.participant)) || (pc && (pc.participant || (pc.participants || [])[0]));
    const takenIsVillager = taken && taken !== 'player' && !String(taken).includes('player');
    judge('contestWatch', !!(pc || ac), (pc || ac) ? `watch mode live: taken=${taken} ${takenIsVillager ? '(villager — correct)' : '(NOT a villager — override failed?)'}` : 'NO contest state at all — scenario resolve failed');
    if (ac || pc) {
      if (pc && !ac) { sayLog = []; resolveIfPending(); }
      // Watcher agency: cheer / study / bet / comfort should exist in some phase
      const allChoices = [];
      try {
        const a2 = Game.state.activeContest;
        if (a2) a2.phases.forEach(p => (p.choices || []).forEach(c => allChoices.push(c.label || c.id)));
      } catch (e) {}
      const hasAgency = /cheer|study|bet|comfort/i.test(allChoices.join(' '));
      judge('contestWatch', hasAgency, `watcher agency across phases: ${hasAgency ? 'present (' + allChoices.slice(0, 5).join(' | ').slice(0, 100) + ')' : 'ABSENT in [' + allChoices.slice(0, 8).join(', ') + '] — watcher is passive!'}`);
      const r = driveContest('contestWatch');
      judge('contestWatch', r.done && !r.stalled, `watched ${r.steps} beats → ${r.done ? 'outcome=' + r.outcome : 'STALLED'}`);
      if (r.stalled) dump('watch stall point', 5);
      else dump('watch end', 4);
    }
    leakSweep('contestWatch');
  }

  // ================= 8. SHOW: WHY DO THEY EAT? =================
  console.log('\n##### 8. SHOW WHY EAT — aliens horrified by cooking #####');
  if (!fresh('showWhyEat')) { judge('showWhyEat', false, 'scenario failed to start'); }
  else {
    const lines = narr().join(' ');
    const hasShow = /TONIGHT|why.*eat|cook/i.test(lines);
    judge('showWhyEat', hasShow, hasShow ? `show announced: "${lines.slice(0, 120)}..."` : 'show did NOT announce — sysSay silent?');
    // Does the show have beats/choices or is it a one-liner?
    let beats = 0;
    try {
      sayLog = [];
      if (Game.showChoices) { const ch = Game.showChoices(); beats = ch.length; }
      else if (Game.state.pendingShow) { beats = 1; }
    } catch (e) {}
    judge('showWhyEat', true, `show interactivity: ${beats ? beats + ' choice(s)' : 'announcement only — fine for a show, but note it'}`);
    leakSweep('showWhyEat');
  }

  // ================= 9. CONTEST ELIGIBILITY =================
  console.log('\n##### 9. CONTEST ELIGIBLE — day 15, wave-2 kill notability #####');
  if (!fresh('contestEligible')) { judge('contestEligible', false, 'scenario failed to start'); }
  else {
    // NOTE: the scenario's output line is 🐞-prefixed (debug), so check raw sayLog
    const raw = sayLog.join(' ');
    const m = raw.match(/Eligible:\s*(\d+)\s*\(([^)]*)\)/);
    judge('contestEligible', !!m, m ? `eligibility listed: ${m[1]} eligible (${m[2].slice(0, 80)})` : `no eligibility output in: "${raw.slice(0, 150)}"`);
    // Knowledge gate: does it explain WHY?
    const explains = /notab|noticed|interesting|watching|wave/i.test(raw);
    judge('contestEligible', true, `fiction legible: ${explains ? 'yes — the enormous watcher has opinions' : 'NO — eligibility feels mechanical'}`);
    // Player-facing (non-🐞) text should ALSO explain eligibility — check narr()
    const playerLines = narr().join(' ');
    judge('contestEligible', /enormous|watching|opinions|noticed/i.test(playerLines), `player-facing text explains: ${/enormous|watching|opinions|noticed/i.test(playerLines) ? 'yes' : 'NO — only 🐞 debug line, nothing for the player!'}`);
    leakSweep('contestEligible');
  }

  // ================= SUMMARY =================
  console.log('\n================ VERDICTS ================');
  const fails = verdicts.filter(v => !v.ok);
  console.log(`total checks: ${verdicts.length}, failures: ${fails.length}`);
  fails.forEach(v => console.log(`  FAIL [${v.scenario}] ${v.note}`));
  fs.writeFileSync(path.join(ROOT, 'hidden_files', 'playtest-social-contest-verdicts.json'),
    JSON.stringify({ at: new Date().toISOString(), verdicts }, null, 2));
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error('HARNESS FATAL:', e.message, e.stack.split('\n').slice(0, 4).join('\n')); process.exit(2); });
