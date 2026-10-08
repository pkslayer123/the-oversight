#!/usr/bin/env node
// CONTEST PLAY-AUDIT (Steve 2026-10-05): play contests end-to-end as a PLAYER.
// Drives the REAL flow: fireContest (announcement/telegraph) -> resolveContest
// (interruption) -> contestChoose through phases -> verdict.
// NOTE: scripts/play-contest-audit-20261006.js is already owned by a sibling
// (content audit + new-variant proof), so this feel-playtest uses its own name.
// Run: node scripts/play-contest-feel-audit-20261006.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });

// Deterministic PRNG so runs are comparable
let seed = 20261006;
Math.random = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };

// equipment.js needs `window` at load; delete it before playing (async-combat flip)
global.window = global;
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/conversation.js',
 'src/js/convo-mood.js', 'src/js/convoTopics.js', 'src/js/convo-wants.js',
 'src/js/convo-dialogue.js', 'src/js/convo-beats.js', 'src/js/examine.js',
 'src/js/equipment.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/party-formal.js', 'src/js/truth.js', 'src/js/contests.js',
 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js',
 'src/js/justice.js', 'src/js/food.js', 'src/js/betrayal.js',
 'src/js/corpses.js', 'src/js/lifeseed.js', 'src/js/progression.js',
 'src/js/ledger.js', 'src/js/villager-agency.js', 'src/js/codex-people.js',
 'src/js/membership.js', 'src/js/hierarchy.js',
 'src/js/debug-scenarios.js', 'src/js/build.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
delete global.window;
const Game = globalThis.Scattering.Game;

// --- capture narration ---
const says = [];
Game.say = (t) => { says.push(String(t)); };
function flushSays(max = 8, prefix = '   |') {
  const take = says.splice(0).slice(0, max);
  for (const t of take) note(`${prefix} ${String(t).slice(0, 170)}`);
  if (says.length) { note(`${prefix} ... (${says.length} more lines suppressed)`); says.length = 0; }
}
function note(t) { console.log(t); }

// --- setup ---
(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  Game.state.scholar.day = 15;
  Game.state.systemArrived = true; // day 7+; sysSay gate
  // Harness fixture: villagers are AT the haven (positions are normally set
  // by NPC placement; contestEligible requires them for drafting).
  for (const rid of (Game.state.village.roster || [])) {
    if (rid !== Game.villagerId) Game.state.village.positions[rid] = { mx: 0, my: 0 };
  }
  const s = Game.state.scholar;
  s.health = 100; s.kcal = 2200; s.trauma = 0; s.water = [];
  const { eligible } = Game.contestEligible();
  note(`SETUP: day=${s.day} eligible=${eligible.length} roster=${(Game.state.village.roster||[]).length}`);
  const villager = eligible.find(e => e.id !== 'player');
  note(`SETUP: player=${Game.villagerId} firstNonPlayer=${villager ? villager.id + ' (' + villager.name + ')' : 'NONE'}`);
  if (!eligible.length || !villager) { note('SETUP FAILED — abort'); process.exit(1); }

  const verdicts = [];

  function resetPlayer() {
    s.health = 100; s.kcal = 2200; s.trauma = 0; s.water = [];
    Game.state.over = false; Game.state.activeContest = null; Game.state.pendingContest = null;
  }

  // risk score for a choice: higher = braver/dumber
  function riskOf(ch) {
    const d = ch.do || {};
    let r = d.die || 0;
    if (d.dieWounds) r = Math.max(r, 0.5);
    if (d.dmg) r += (d.dmg[1] || 0) / 100;
    return r;
  }

  function pickIdx(phase, style, isChoicePhase) {
    const cs = phase.choices || [];
    if (isChoicePhase) return style === 'refuse' ? 1 : 0;
    if (style === 'brave') {
      let bi = 0; for (let i = 1; i < cs.length; i++) if (riskOf(cs[i]) > riskOf(cs[bi])) bi = i;
      return bi;
    }
    if (style === 'smart') {
      let bi = 0; for (let i = 1; i < cs.length; i++) if (riskOf(cs[i]) < riskOf(cs[bi])) bi = i;
      return bi;
    }
    return Math.min(1, cs.length - 1); // middle
  }

  // Play one contest through the REAL flow. Returns verdict object.
  function playContest(id, { taken = ['player'], style = 'middle', forceChoice = false, label, direct = false, softHealth = null } = {}) {
    resetPlayer();
    seed = 20261006; // deterministic per contest
    if (softHealth) Game.state.scholar.health = softHealth;
    const tag = label || `${id}/${style}`;
    note(`\n########## CONTEST: ${tag} (taken: ${taken.join(',')}) ##########`);
    const base = Game.contestPool().find(c => c.id === id);
    if (!base) { note('CONTEST NOT FOUND'); return { id, error: 'not found' }; }
    const contest = Game._contestScaled(base, null);
    if (forceChoice) contest.givesChoice = true;

    if (direct) {
      // REAL interruption path, entered directly (used when the fire->resolve
      // rebuild would drop the givesChoice flag — exercises the real sequence).
      says.length = 0;
      Game.contestInterruption(contest, taken);
      note('--- interruption (direct):');
      flushSays(10);
    } else {
      // REAL FLOW 1: the announcement (telegraph) — one-day warning
      says.length = 0;
      Game.fireContest(contest);
      note('--- fireContest announcement (the telegraph):');
      flushSays(6);
      if (!Game.state.pendingContest) { note('!! fireContest did not set pendingContest'); return { id, error: 'no pending' }; }

      // pin participants (fireContest picks the player 90% of the time anyway)
      Game.state.pendingContest.participants = taken.slice();
      Game.state.pendingContest.participant = taken[0];

      // REAL FLOW 2: the interruption next day
      says.length = 0;
      Game.resolveContest();
      note('--- interruption:');
      flushSays(10);
    }
    const hpBefore = s.health;
    let guard = 25, steps = 0, died = false;
    while (Game.state.activeContest && guard-- > 0) {
      const ac = Game.state.activeContest;
      const phase = ac.phases[ac.phaseIdx || 0];
      if (!phase || !phase.choices || !phase.choices.length) { note(`!! phase ${ac.phaseIdx} has NO choices — stuck screen`); break; }
      const isChoicePhase = ac.phase === 'choice';
      const idx = pickIdx(phase, style, isChoicePhase);
      if (idx < 0 || idx >= phase.choices.length) { note('!! pickIdx out of range'); break; }
      const ch = phase.choices[idx];
      note(`--- phase ${ac.phaseIdx}${isChoicePhase ? ' (CHOICE offered)' : ''}: choose [${idx}] "${ch.label}" (${(ch.sub||'').slice(0,60)})${ch.do && (ch.do.die||ch.do.dieWounds||ch.do.dmg) ? ' RISKY' : ''}`);
      says.length = 0;
      let res;
      try { res = Game.contestChoose(idx); } catch (e) { note('!! contestChoose threw: ' + e.message); break; }
      flushSays(6);
      steps++;
      if (res && res.done) { note(`--- resolved: outcome=${res.outcome}`); if (res.outcome === 'died') died = true; break; }
    }
    if (guard <= 0) note('!! phase loop guard hit — possible infinite sequence');
    if (Game.state.activeContest) note('!! activeContest still set after loop — did not resolve');
    const verdict = { id, style, taken: taken.join(','), outcome: died ? 'died' : 'resolved', steps,
      hpDelta: Math.round(hpBefore - s.health), trauma: Math.round(s.trauma || 0),
      kcal: Math.round(s.kcal || 0), knowledge: JSON.stringify(Game.contestKnowledge(id)) };
    note(`VERDICT ${tag}: outcome=${verdict.outcome} steps=${steps} hpΔ=${verdict.hpDelta} trauma=${verdict.trauma} codex=${verdict.knowledge}`);
    verdicts.push(verdict);
    return verdict;
  }

  // --- THE RUNS ---
  // 1. Gauntlet (blood/extreme, bespoke) — played BRAVE. Marquee blood contest.
  playContest('gauntlet', { style: 'brave' });
  // 2. Pit (blood/high) — middle play. (Refusal is exercised in run 10.)
  playContest('pit', { style: 'middle' });
  // 3. Moot (moot/medium, social) — played smart.
  playContest('moot', { style: 'smart' });
  // 4. Hide (weird/extreme, bespoke) — middle.
  playContest('hide', { style: 'middle' });
  // 5. Riddle (puzzle/high — smallest pool) — smart.
  playContest('riddle', { style: 'smart' });
  // 6. Calorie Run (forage/medium — smallest pool) — middle.
  playContest('calorie_run', { style: 'middle' });
  // 7. Auction (chance/high — new 2026-10-06 contest) — smart.
  playContest('auction', { style: 'smart' });
  // 8. Tithe (blood/extreme) — WATCH MODE: player NOT taken, a villager is.
  playContest('tithe', { taken: [villager.id], style: 'middle' });
  // 9. Exchange (endurance/high — new 2026-10-06, multi-take team contest): player + 2 villagers taken.
  const others = eligible.filter(e => e.id !== 'player').slice(0, 2).map(e => e.id);
  playContest('exchange', { taken: ['player', ...others], style: 'brave' });
  // 10. PIT, real refusal: forced choice path, pick Refuse — refusal is a sequence.
  playContest('pit', { style: 'refuse', forceChoice: true, direct: true, label: 'pit/refuse-real' });
  // 11. GAUNTLET death run: soft player (10 hp), brave — exercises the die path end to end.
  playContest('gauntlet', { style: 'brave', softHealth: 10, label: 'gauntlet/death' });

  note('\n========== RUN SUMMARY ==========');
  for (const v of verdicts) note(`${v.id}/${v.style} taken=[${v.taken}]: ${v.outcome}, steps=${v.steps}, hpΔ=${v.hpDelta}, trauma=${v.trauma}, codex=${v.knowledge}`);
  note(`FINAL: player alive=${!Game.state.over} roster=${(Game.state.village.roster||[]).length}`);
  note('DONE');
})();
