// SOCIAL SCENARIOS REGRESSION TESTS, ROUND 2 (Steve 2026-10-06).
// Asserts the behaviors fixed/verified by the 2026-10-06 social-scenarios
// worker: ambush talk-down, whoTag collision disambiguation, weregild echo
// fix, juror press via the real convo choice id, exile petition gift honesty.
// Exits non-zero on failure. Randomness is statistical (loops), not seeded —
// R() is captured at module load.
// Usage: node scripts/test-social-scenarios-20261006.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js',
 'src/js/justice.js', 'src/js/betrayal.js', 'src/js/corpses.js', 'src/js/codex-people.js', 'src/js/progression.js',
 'src/js/ledger.js', 'src/js/debug-scenarios.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let sayLog = [];
Game.say = (t) => { sayLog.push(String(t)); };
function fresh(id) { sayLog = []; Game.debugScenario(id); }

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}
function sprungPlot() {
  fresh('ambush');
  return (Game.betrayalState().plots || []).find(p => p.sprung && Game.isPlayer(p.target));
}

(async () => {
  await Game.init();

  // ---- 1. ambush talk-down: terminates, resolves, both branches reachable ----
  console.log('## 1. ambush talk-down');
  let down = 0, snap = 0, stuck = 0;
  for (let i = 0; i < 40; i++) {
    const plot = sprungPlot();
    if (!plot) { stuck++; continue; }
    let rounds = 0, res = null;
    while (!plot.outcome && rounds < 6) {
      rounds++;
      res = Game.ambushExchange(plot, 'talk');
      if (res && res.continue === false) break;
    }
    // a real player now runs/fights; the confrontation must always resolve
    let r2 = { continue: true }, rr = 0;
    while (r2 && r2.continue && !plot.outcome && rr < 8) { rr++; r2 = Game.ambushExchange(plot, 'run'); }
    if (!plot.outcome) { stuck++; continue; }
    if (plot.outcome === 'talked_down') down++; else snap++;
  }
  ok('talk sequence always reaches an outcome', stuck === 0, `stuck=${stuck}/40`);
  ok('talk-down happens (likely path)', down > 10, `talked_down=${down}/40`);
  ok('snap-back happens (risk is real)', snap > 0, `snap=${snap}/40`);

  // talked_down aftermath invariants (statistical: keep trying until one lands)
  let td = null;
  for (let i = 0; i < 30 && !td; i++) {
    const plot = sprungPlot();
    let guard = 0;
    while (!plot.outcome && guard < 6) { guard++; const r = Game.ambushExchange(plot, 'talk'); if (r && r.continue === false) break; }
    if (plot.outcome === 'talked_down') td = plot;
  }
  if (td) {
    ok('talked_down: plot resolved + aftermath state', td.resolved === true && td.state === 'aftermath');
    const cc = (Game.betrayalState().cases || []).find(x => x.plotId === td.id);
    ok('talked_down: case opened with talkedDown evidence flag', !!(cc && cc.talkedDown));
    ok('talked_down: leaves trauma (shaken, not wounded)', (Game.state.scholar.trauma || 0) > 0);
    ok('talked_down: player unwounded', (td.woundsTaken || 0) === 0);
  } else {
    ok('talked_down invariants', false, 'no talked_down in 30 tries — rate suspiciously low');
  }

  // raw talk-spam never loops forever
  {
    const p2 = sprungPlot();
    let rounds = 0, lc = true;
    while (rounds < 12 && lc !== false && !p2.outcome) { rounds++; const r = Game.ambushExchange(p2, 'talk'); lc = r && r.continue; }
    ok('raw talk-spam terminates', rounds < 12 || !!p2.outcome, `rounds=${rounds}`);
  }

  // ---- 2. whoTag disambiguates colliding descriptors (unique-person law) ----
  console.log('## 2. whoTag collision');
  {
    fresh('mootJuror');
    const roster = Game.state.village.roster.filter(id => id !== Game.villagerId);
    const byBase = {};
    for (const id of roster) {
      const b = (() => { try { return Game.descriptorBase(id); } catch (e) { return null; } })();
      if (b) { byBase[b] = byBase[b] || []; byBase[b].push(id); }
    }
    const colliding = Object.values(byBase).find(g => g.length > 1);
    if (colliding) {
      const tags = colliding.map(id => Game.whoTag(id));
      ok('colliding villagers get distinct whoTags', new Set(tags).size === tags.length, tags.join(' / '));
    } else {
      ok('whoTag collision (no collision in this roster — vacuous)', true);
    }
  }

  // ---- 3. weregild: no "you pay / you pay" echo ----
  console.log('## 3. weregild sentence flow');
  {
    // force the weregild band directly: assault (sev 3) needs avgBelief in
    // [-25, -10) — exile below, schism/cold-war above.
    fresh('mootAccused');
    const c = (Game.betrayalState().cases || []).find(x => x.playerRole === 'accused');
    c.charge = 'assault';
    c.status = 'open';
    for (const vid of Game.npcIds()) { if (!c.accused.includes(vid)) c.belief[vid] = -15; }
    Game.sentenceCase(c);
    const lines = sayLog.filter(l => !l.startsWith('🐞'));
    const spoken = lines.find(l => /And stays — this time/.test(l));
    const detail = lines.find(l => /The price of staying/.test(l));
    ok('weregild path reached', c.resolution === 'weregild', `resolution=${c.resolution}`);
    ok('sentence spoken once', !!spoken);
    ok('weregild detail does not repeat "Weregild. You pay"', !!detail && !/^Weregild\. You pay/.test(detail), detail ? detail.slice(0, 80) : 'missing');
  }

  // ---- 4. juror press via the REAL convo UI choice id finds inconsistencies ----
  console.log('## 4. juror press (real choice id)');
  {
    fresh('mootJuror');
    const c = (Game.betrayalState().cases || []).find(x => x.playerRole === 'juror');
    for (const vid of c.accused) {
      try { Game.startConvo(vid); Game.betrayalTurn(vid, 'betrayal:press:' + c.id + ':' + vid); } catch (e) {}
    }
    const found = (c.inconsistencies || []).filter(i => i.found).length;
    ok('press via betrayal:press:<case>:<vid> finds planted inconsistencies', found === 2, `found=${found}/2`);
  }

  // ---- 5. exile petition: gift spent even on refusal (no free re-roll) ----
  console.log('## 5. exile petition gift');
  {
    fresh('exile');
    try { Game.addItem('dried_meat', 10); } catch (e) {}
    const p0 = Game.packKcal(Game.villagerId);
    const ov = (Game.state.otherVillages || [])[0];
    Game.petitionVillage(ov.id, { giftKcal: 700 });
    const p1 = Game.packKcal(Game.villagerId);
    ok('gift kcal actually leaves the pack', p1 <= p0 - Math.min(700, p0), `${p0}→${p1}`);
    const said = sayLog.join(' ');
    ok('refusal is honest about kept food', /take your food/.test(said) || /You can stay/.test(said));
  }

  console.log(`\n##### RESULT: ${pass} passed, ${fail} failed #####`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS CRASH:', e.message); process.exit(2); });
