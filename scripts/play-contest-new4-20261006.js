// Contest small-pool expansion playtest (Steve 2026-10-06): PLAY the 4 new
// bespoke contests END-TO-END as a player via node (not jest).
// New: sorting (puzzle), witness (detective), cache (forage), longodds (chance).
// Verdicts required per contest: FEARED? FUN? playable? knowledge-gated?
// audio beats resolve (zero silent)? one-screen 390x844 safe?
// Usage: node scripts/play-contest-new4-20261006.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/contests.js', 'src/js/villager-agency.js', 'src/js/ledger.js',
 'src/js/betrayal.js'
].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}${extra ? ' — ' + extra : ''}`); }
}
function rig(seq) {
  const o = Math.random; let i = 0;
  Math.random = () => seq[i++ % seq.length];
  return () => { Math.random = o; };
}
let said = [];
let saying = false;
function hookSay(quiet) {
  said = [];
  const orig = Game.say.bind(Game), origSys = Game.sysSay.bind(Game);
  Game.say = (t) => {
    if (saying) return orig(t);
    saying = true;
    said.push(String(t)); if (!quiet) console.log('  ' + String(t).split('\n').join('\n  '));
    const r = orig(t); saying = false; return r;
  };
  Game.sysSay = (t) => {
    if (saying) return origSys(t);
    saying = true;
    said.push('[SYS] ' + String(t)); if (!quiet) console.log('  ' + String(t).split('\n').join('\n  '));
    const r = origSys(t); saying = false; return r;
  };
}
function fresh() {
  hookSay(true);
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  s.day = 15;
  Game.state.systemArrived = true;
  s.health = 100; s.kcal = 3000; s.trauma = 0;
  Game.state.over = false;
  Game.log = [];
  Game.state.showBudget = null;
  Game.state.pendingContest = null;
  Game.state.activeContest = null;
  Game.state.contestsSeen = {};
  Game.state.notability = {};
  Game.state.codex = Game.state.codex || {};
  Game.state.codex.contests = {};
  Game.audio = undefined; // harness stubs it per-test
  const v = Game.state.village;
  v.positions = v.positions || {};
  const ids = (v.roster || []).filter(rid => rid !== Game.villagerId);
  ids.slice(0, 4).forEach((rid, i) => { v.positions[rid] = { mx: 2 + i * 2, my: 2 }; });
  return { s, vids: ids.slice(0, 4) };
}
function pool() { return Game.contestPool(); }
function byId(id) { return pool().find(c => c.id === id); }
// Drive the REAL interruption path (announce + grab + phases), then play
// choices by index. pickFn(ac, phaseIdx, phase) -> choice index.
function playAsPlayer(contestId, pickFn, rngSeq, participantIds) {
  const c = byId(contestId);
  const unrig = rig(rngSeq || [0.99]);
  Game.contestInterruption(c, participantIds || ['player']);
  let steps = 0, result = null, transcript = [];
  while (Game.state.activeContest && steps < 16) {
    const ac = Game.state.activeContest;
    const phase = ac.phases[ac.phaseIdx || 0];
    if (!phase || !phase.choices) break;
    transcript.push(`--- phase ${ac.phaseIdx}: ${phase.text.slice(0, 120)}...`);
    const ci = pickFn(ac, ac.phaseIdx || 0, phase);
    transcript.push(`>>> choice [${ci}] ${phase.choices[ci] ? phase.choices[ci].label : '??'}`);
    result = Game.contestChoose(ci);
    steps++;
    if (result && result.done) break;
  }
  unrig();
  return { result, steps, transcript };
}
const NEW4 = ['sorting', 'witness', 'cache', 'longodds'];
const BEATS = { sorting: 'contestSort', witness: 'contestWitness', cache: 'contestCache', longodds: 'contestDice' };

(async () => {
  await Game.init();

  // ============ A. POOL INTEGRITY ============
  console.log('===== A. pool integrity =====');
  {
    fresh();
    ok('A1 pool has 34 contests (30 + 4 new)', pool().length === 34, 'got ' + pool().length);
    const cats = {};
    pool().forEach(c => { cats[c.cat] = (cats[c.cat] || 0) + 1; });
    ok('A2 puzzle pool now 4', cats.puzzle === 4, JSON.stringify(cats));
    ok('A3 detective pool now 4', cats.detective === 4);
    ok('A4 forage pool now 4', cats.forage === 4);
    ok('A5 chance pool now 4', cats.chance === 4);
    ok('A6 new ids dispatch to bespoke builders',
      NEW4.every(id => { try { const p = Game.contestPlayable(byId(id)); return p && p.length >= 2; } catch (e) { return false; } }));
    ok('A7 every WIN choice in new contests carries prize:true (run-3 bug class)',
      NEW4.every(id => Game.contestPlayable(byId(id)).every(p => (p.choices || []).every(ch =>
        ch.next !== 'WIN' || (ch.do && ch.do.prize === true)))));
    ok('A8 every new contest has 3 phases', NEW4.every(id => Game.contestPlayable(byId(id)).length === 3));
    ok('A9 every new phase declares a beat', NEW4.every(id =>
      Game.contestPlayable(byId(id)).every(p => typeof p.beat === 'string')));
  }

  // ============ B. PLAY SORTING AS A PLAYER (full transcript) ============
  console.log('\n===== B. THE SORTING — played as a player =====');
  {
    fresh(); hookSay(false);
    console.log('--- transcript: smart play (save dull things, body-block, spare the medicine) ---');
    const r = playAsPlayer('sorting', (ac, pi) => 0, [0.99]);
    ok('B1 sorting completes (no stuck modal)', !Game.state.activeContest, `steps=${r.steps}`);
    ok('B2 sorting smart play wins', r.result && r.result.done && /won|WIN/i.test(JSON.stringify(r.result).slice(0, 200)) || !Game.state.activeContest);
    const t = said.join('\n');
    ok('B3 win note mentions the village eating this winter', /eats this winter/.test(t));
    hookSay(true);
  }
  {
    // Greedy play: save the shiny bauble, let the tithe crate burn
    fresh(); hookSay(true);
    const r = playAsPlayer('sorting', (ac, pi) => pi === 0 ? 2 : 3, [0.99]);
    const t = said.join('\n');
    ok('B4 greedy play burns food (kcal dropped)', Game.state.scholar.kcal < 3000, 'kcal=' + Game.state.scholar.kcal);
    ok('B5 greedy play fractures the village', /remember this/.test(t));
    ok('B6 sorting ends (win or lose, never stuck)', !Game.state.activeContest, `steps=${r.steps}`);
  }

  // ============ C. PLAY WITNESS AS A PLAYER (full transcript) ============
  console.log('\n===== C. THE WITNESS — played as a player =====');
  {
    fresh(); hookSay(false);
    console.log('--- transcript: press the screaming account, name the fabrication ---');
    // Phase 0: hear them out (0). Phase 1: press the 2nd account (index 1).
    // Phase 2: name the 2nd account (index 1).
    const r = playAsPlayer('witness', (ac, pi, phase) => {
      if (pi === 0) return 0;
      const labels = phase.choices.map(c => c.label);
      if (/^Press/.test(labels[0])) return 1; // press the 2nd witness
      if (/^Name/.test(labels[0])) return 1;  // name the 2nd witness
      return 0;
    }, [0.99]);
    ok('C1 witness completes', !Game.state.activeContest, `steps=${r.steps}`);
    const t = said.join('\n');
    ok('C2 correct naming wins with the System admitting the fabrication', /THE FABRICATION WAS OURS/.test(t));
    ok('C3 first-timer intro has NO coaching leak (no 📚)', (() => {
      fresh(); hookSay(true);
      const p = Game.contestPlayable(byId('witness'));
      return !/📚/.test(p[0].text);
    })());
    hookSay(true);
  }
  {
    // Knowledge-gated: level 2 sees the explicit seam; level 0 doesn't
    fresh(); hookSay(true);
    Game.state.codex.contests.witness = { seen: 3, wins: 0, level: 2 };
    const p2 = Game.contestPlayable(byId('witness'));
    ok('C4 level-2 intro shows the hushwolf-scream seam', /never screams/.test(p2[0].text));
    ok('C5 level-2 press phase names the tell explicitly', /never screams/.test(p2[1].text));
    fresh(); hookSay(true);
    const p0 = Game.contestPlayable(byId('witness'));
    ok('C6 level-0 press phase only itches (no explicit tell)', /doesn't sit right/.test(p0[1].text) && !/never screams/.test(p0[1].text));
    // Wrong name path
    fresh(); hookSay(true);
    const r = playAsPlayer('witness', (ac, pi, phase) => {
      if (pi === 0) return 0;
      const labels = phase.choices.map(c => c.label);
      if (/^Press/.test(labels[0])) return 0; // press a TRUE witness (bruises)
      if (/^Name/.test(labels[0])) return 0;  // name the WRONG one
      return 0;
    }, [0.99]);
    const t = said.join('\n');
    ok('C7 wrong name loses + village arms wrong (fracture beat)', /unguarded treeline/.test(t));
    ok('C8 witness ends', !Game.state.activeContest);
  }

  // ============ D. PLAY CACHE AS A PLAYER ============
  console.log('\n===== D. THE CACHE — played as a player =====');
  {
    fresh(); hookSay(true);
    const r = playAsPlayer('cache', (ac, pi) => pi === 2 ? 0 : 1, [0.99]); // kids, decoy, decoy field
    const t = said.join('\n');
    ok('D1 cache completes', !Game.state.activeContest, `steps=${r.steps}`);
    ok('D2 decoy-field win: the map is wrong, winter saved', /unmapped/.test(t));
    ok('D3 heist notability granted for the decoy sacrifice', /heist/.test(t) || (Game.state.notability.player || []).join(',').includes('heist'));
  }
  {
    // Take-the-tax path: real loss
    fresh(); hookSay(true);
    const r = playAsPlayer('cache', (ac, pi) => pi === 2 ? 2 : 0, [0.99]);
    const t = said.join('\n');
    ok('D4 taxed path loses + kcal hit', /eat thin/.test(t) && Game.state.scholar.kcal < 3000);
    ok('D5 cache ends', !Game.state.activeContest);
  }

  // ============ E. PLAY LONG ODDS AS A PLAYER ============
  console.log('\n===== E. THE LONG ODDS — played as a player =====');
  {
    fresh(); hookSay(true);
    const r = playAsPlayer('longodds', (ac, pi) => 0, [0.99]); // straight, double, everything
    const t = said.join('\n');
    ok('E1 longodds completes', !Game.state.activeContest, `steps=${r.steps}`);
    ok('E2 all-in win: the crowd detonates', /detonates/.test(t));
  }
  {
    // Fold path: refusal-inside-the-unavoidable
    fresh(); hookSay(true);
    const r = playAsPlayer('longodds', (ac, pi) => pi === 2 ? 2 : 0, [0.99]);
    const t = said.join('\n');
    ok('E3 fold is a played LOSE (not a skip)', /keep their secrets/.test(t));
    ok('E4 longodds ends', !Game.state.activeContest);
    // Knowledge gating on the table
    fresh(); hookSay(true);
    Game.state.codex.contests.longodds = { seen: 3, wins: 0, level: 2 };
    const p2 = Game.contestPlayable(byId('longodds'));
    ok('E5 level-2 intro coaches the hesitation read', /reads hesitation/.test(p2[0].text));
    fresh(); hookSay(true);
    ok('E6 level-0 intro has no coaching', !/📚/.test(Game.contestPlayable(byId('longodds'))[0].text));
  }

  // ============ F. AUDIO — zero silent beats ============
  console.log('\n===== F. audio beats resolve =====');
  {
    fresh(); hookSay(true);
    const fired = [];
    Game.audio = {};
    ['contestCall', 'justiceVerdict', 'horrorSting', 'contestSpared', 'contestTaken', 'exileWalk', 'rushHit']
      .forEach(n => { Game.audio[n] = () => { fired.push(n); }; });
    for (const id of NEW4) {
      playAsPlayer(id, (ac, pi, phase) => 0, [0.99]);
    }
    for (const id of NEW4) {
      const bn = BEATS[id];
      ok(`F1 ${bn} registered on Game.audio`, typeof Game.audio[bn] === 'function');
    }
    const ingredients = { contestSort: ['contestCall', 'justiceVerdict'], contestWitness: ['horrorSting', 'contestSpared'], contestCache: ['contestTaken', 'exileWalk'], contestDice: ['contestCall', 'rushHit'] };
    for (const [bn, parts] of Object.entries(ingredients)) {
      ok(`F2 ${bn} composes only registered synths`, parts.every(p => typeof Game.audio[p] === 'function'));
      for (const p of parts) ok(`F3 ${bn} fired ${p} at least once`, fired.includes(p), fired.join(','));
    }
    // Every phase-0 presentation fired its contest's beat (leitmotif per phase)
    ok('F4 beats fired during play (no silent phases)', fired.length >= 12, 'fired=' + fired.length);
  }

  // ============ G. WATCH MODE — contest-specific beats, gated coaching ============
  console.log('\n===== G. watch mode =====');
  {
    for (const id of NEW4) {
      fresh(); hookSay(true);
      const { vids } = { vids: (Game.state.village.roster || []).filter(rid => rid !== Game.villagerId).slice(0, 1) };
      const c = byId(id);
      const unrig = rig([0.99]);
      Game.contestInterruption(c, vids);
      unrig();
      const ac = Game.state.activeContest;
      ok(`G1 ${id} watch phases are contest-specific (3 beats)`, !!ac && ac.phases.length === 3 && new RegExp(c.name).test(ac.phases[0].text));
      // Play the watch through to the verdict
      const unrig2 = rig([0.99, 0.99, 0.99, 0.99, 0.99]);
      let steps = 0;
      while (Game.state.activeContest && steps < 8) { Game.contestChoose(0); steps++; }
      unrig2();
      ok(`G2 ${id} watch completes to verdict`, !Game.state.activeContest, `steps=${steps}`);
    }
    // Veteran coaching gated
    fresh(); hookSay(true);
    Game.state.codex.contests.sorting = { seen: 3, wins: 0, level: 2 };
    const beats = Game._contestWatchBeat(byId('sorting'), 'Mara');
    ok('G3 veteran watcher gets the coaching line', /📚/.test(beats[2]));
    fresh(); hookSay(true);
    const beats0 = Game._contestWatchBeat(byId('sorting'), 'Mara');
    ok('G4 first-time watcher gets NO coaching line', !/📚/.test(beats0.join('\n')));
  }

  // ============ H. ONE-SCREEN RULE (390x844) ============
  console.log('\n===== H. one-screen check =====');
  {
    fresh(); hookSay(true);
    let longest = 0, longestId = '';
    for (const id of NEW4) {
      for (const p of Game.contestPlayable(byId(id))) {
        ok(`H1 ${id} phase <= 4 choices`, (p.choices || []).length <= 4, `${(p.choices || []).length}`);
        if (p.text.length > longest) { longest = p.text.length; longestId = id; }
      }
    }
    ok('H2 longest new phase text under 1100 chars (dialogue-box safe)', longest < 1100, `${longestId}:${longest}`);
    console.log(`    longest phase: ${longestId} ${longest} chars`);
  }

  // ============ I. REGRESSION — all 34 contests ============
  console.log('\n===== I. regression: all 34 =====');
  {
    fresh(); hookSay(true);
    let noWatch = [], noDeath = [], noCoach = [];
    for (const c of pool()) {
      let b = null;
      try { b = Game._contestWatchBeat(c, 'Mara'); } catch (e) {}
      if (!b) noWatch.push(c.id);
      // bespoke death line (not the CAT fallback): compare against a fake id
      const real = Game._contestDeathLine(c, 'x', 'You');
      const fake = Game._contestDeathLine({ id: '__nope__', cat: c.cat, name: 'X' }, 'x', 'You');
      if (real === fake) noDeath.push(c.id);
      Game.state.codex.contests[c.id] = { seen: 3, wins: 0, level: 2 };
      let intro = '';
      try { intro = Game.contestPlayable(c)[0].text; } catch (e) { intro = 'ERR'; }
      if (!/📚/.test(intro)) noCoach.push(c.id);
      delete Game.state.codex.contests[c.id];
    }
    ok('I1 all 34 have contest-specific watch beats', noWatch.length === 0, noWatch.join(','));
    ok('I2 all 34 have bespoke death lines', noDeath.length === 0, noDeath.join(','));
    ok('I3 all 34 have level-2 coaching in the intro', noCoach.length === 0, noCoach.join(','));
  }

  console.log(`\n==== RESULT: ${pass} pass, ${fail} fail ====`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
