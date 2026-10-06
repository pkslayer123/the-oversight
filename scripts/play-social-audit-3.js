// SOCIAL SCENARIO ROUND-3 PLAY-AUDIT (Steve 2026-10-06).
// Plays moot/exile/ambush/liars as a PLAYER through the real code paths,
// asserting each round-3 fix. Fails (exit 1) on any regression.
// Usage: node scripts/play-social-audit-3.js
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
const _say = Game.say.bind(Game);
Game.say = (t) => { sayLog.push(String(t)); return _say(t); };
function fresh(id) { sayLog = []; Game.debugScenario(id); }
const narr = () => sayLog.filter(l =>
  !l.startsWith('🐞') && !l.startsWith('📖') && !l.startsWith('📓') &&
  !/^Travel \d+ tile/i.test(l) && !/^— .* —$/.test(l) && l.trim().length > 0);

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}

(async () => {
  await Game.init();

  // ============ FIX 1: ambush flank no longer duplicates the inviter ============
  console.log('\n## 1. ambush: inviter/flank coherence');
  for (let i = 0; i < 5; i++) {
    fresh('ambush');
    const beats = narr().slice(-4);
    const b1 = beats[0] || '', b2 = beats[1] || '';
    // the walk-out descriptor must not reappear in the flank beat
    const m = b1.match(/walk out with ([^.]+)\./);
    if (m) {
      const who = m[1].trim();
      ok(`run${i} inviter not repeated in flank`, !b2.includes(who), `"${who}" in beat2: ${b2.slice(0, 80)}`);
    }
  }

  // ============ FIX 2: solo ambush talk — leader can't snap at themselves ============
  console.log('\n## 2. ambush: solo-plot talk coherence');
  fresh('ambush');
  const plot = Game.betrayalState().plots.find(p => p.sprung && Game.isPlayer(p.target));
  plot.accomplices = []; plot.inviter = plot.leader; plot.talksLeft = 3; plot.stalled = 0;
  sayLog = []; Game.ambushExchange(plot, 'talk');
  sayLog = []; Game.ambushExchange(plot, 'talk');
  const t2 = narr().join(' ');
  ok('no "The leader snaps" when leader is alone', !/The leader snaps/i.test(t2), t2.slice(0, 120));
  sayLog = []; Game.ambushExchange(plot, 'talk');
  const t3 = narr().join(' ');
  ok('no "to the leader" self-apology when alone', !/to the leader/i.test(t3), t3.slice(0, 120));
  ok('solo talk2 still frays the plan', /crack is there|hiss/i.test(t2), t2.slice(0, 100));

  // ============ FIX 3: inconsistency claims attributed to real people ============
  console.log('\n## 3. cover-story inconsistencies: no claims[undefined]');
  for (const nAcc of [0, 1, 2]) {
    fresh('ambush');
    const p = Game.betrayalState().plots.find(x => x.sprung && Game.isPlayer(x.target));
    const ids = (Game.state.village.roster || []).filter(id => id !== Game.villagerId);
    p.accomplices = ids.slice(0, nAcc);
    const c = Game.openCase(p, 'ambush');
    let bad = false;
    for (const inc of (c.inconsistencies || [])) {
      for (const k of Object.keys(inc.claims || {})) {
        if (k === 'undefined' || k == null || k === '') bad = true;
      }
    }
    ok(`${nAcc}-accomplice plot: all claims attributable`, !bad);
    if (nAcc === 0) {
      ok('solo plot: self-contradiction flagged', (c.inconsistencies || []).every(i => i.selfContra));
      // pressing the solo leader yields the self-contra line, not "that's not what the ground says"
      sayLog = [];
      Game.pressAccomplice(c.id, p.leader);
      const pl = narr().join(' ');
      ok('solo press: "Same mouth, different story"', /Same mouth, different story/.test(pl), pl.slice(0, 110));
    }
  }

  // ============ FIX 4: hardcoded counts follow the plot ============
  console.log('\n## 4. no hardcoded "three"/"four" in ambush beats');
  fresh('ambush');
  const p4 = Game.betrayalState().plots.find(x => x.sprung && Game.isPlayer(x.target));
  const ids4 = (Game.state.village.roster || []).filter(id => id !== Game.villagerId);
  p4.accomplices = ids4.slice(0, 1); // 2-person plot
  const c4 = Game.openCase(p4, 'ambush');
  // witnesses are seeded by ambushAftermath in real play; seed here
  p4.witnesses = ids4.slice(2, 4);
  sayLog = []; Game.examineAmbushSite(c4.id);
  const site = narr().join(' ');
  ok('site: "Two sets of feet", not "Three"', /Two sets of feet/.test(site) && !/Three sets of feet/.test(site), site.slice(0, 110));
  sayLog = []; Game.nameWitnesses(c4.id);
  const wit = narr().join(' ');
  ok('witnesses: "all three of you", not "all four"', /all three of you/.test(wit) && !/all four of you/.test(wit), wit.slice(0, 120));
  sayLog = []; Game.ambushAftermath(p4, 'escaped');
  const aft = narr().join(' ');
  ok('aftermath: "Two voices", not "Three voices"', /Two voices/.test(aft) && !/Three voices/.test(aft), aft.slice(-160));

  // ============ FIX 5: defendSpeak never repeats verbatim ============
  console.log('\n## 5. moot accused: defendSpeak rotation');
  fresh('mootAccused');
  const ca = Game.betrayalState().cases.find(x => x.playerRole === 'accused');
  const speeches = [];
  for (let i = 0; i < 4; i++) { sayLog = []; Game.defendSpeak(ca.id); speeches.push(narr().join(' ')); }
  let dup = false;
  for (let i = 1; i < speeches.length; i++) if (speeches[i] === speeches[i - 1]) dup = true;
  ok('4 speaks, no adjacent verbatim repeat', !dup, speeches[1] && speeches[1].slice(0, 80));

  // ============ FIX 6: sentence-start capitalization of whoTag ============
  console.log('\n## 6. sentence-start whoTag capitalized');
  fresh('mootJuror');
  const cj = Game.betrayalState().cases.find(x => x.playerRole === 'juror');
  Game.callMoot(cj.id);
  const trialLines = narr().join('\n');
  const badStart = /[.!?]\s+(the (woman|man|person) in (her|his|their) \d0s|you) [a-z]/;
  // the count line specifically
  const countLine = trialLines.split('\n').find(l => /counts on their fingers/.test(l)) || '';
  ok('verdict count line starts capitalized', countLine ? /^[A-Z]/.test(countLine.trim()) : true, countLine.slice(0, 60));
  ok('no lowercase descriptor sentence starts in trial', !badStart.test(trialLines), 'found lowercase start');

  // ============ FIX 7: observation tells never name the truth ============
  console.log('\n## 7. liar observation: crack, not the truth');
  fresh('liars');
  const roster = (Game.state.village.roster || []).filter(id => id !== Game.villagerId);
  const liar = roster[0];
  const vp = Game.vpOf(liar);
  const truthOcc = (vp.formerOccupation || 'tailor').toLowerCase();
  const lie = { told: 'nurse', truth: vp.formerOccupation || 'tailor', motive: 'shame', field: 'occupation' };
  let leaked = false;
  for (let i = 0; i < 4; i++) {
    const line = Game.observationTell(liar, lie);
    const stripped = line.replace(/nurse/gi, '');
    if (new RegExp('\\b' + truthOcc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + 's?\\b', 'i').test(stripped)) {
      leaked = true; console.log('   LEAK:', line.slice(0, 110));
    }
  }
  ok('observeTellOcc never names the true trade', !leaked);
  // mid-conversation slip: same class
  const slipSrc = fs.readFileSync(path.join(ROOT, 'src/js/truth.js'), 'utf8');
  ok('convo slip no longer interpolates the truth', !/only makes sense for ' \+ anTruth/.test(slipSrc));

  // ============ FIX 8: goal-id grammar ============
  console.log('\n## 8. goal ids render as phrases');
  fresh('liars');
  const g2 = roster[1] || roster[0];
  const glie = { told: 'belong', truth: 'escape', motive: 'hiding', field: 'goal' };
  Game.truthSlip(g2, glie);
  const slipLine = narr().join(' ');
  ok('goal slip: no raw "belong"/"escape" ids', !/\bwant belong\b|\bwant escape\b|\bpoints at escape\b/.test(slipLine), slipLine.slice(0, 130));
  ok('goal slip: human phrase present', /to belong somewhere|to leave/.test(slipLine), slipLine.slice(0, 130));

  // ============ FIX 9: juror vote has social consequences ============
  console.log('\n## 9. moot juror: vote lands socially');
  let voted = false;
  for (let tries = 0; tries < 8 && !voted; tries++) {
    fresh('mootJuror');
    const cc = Game.betrayalState().cases.find(x => x.playerRole === 'juror');
    Game.callMoot(cc.id);
    if (cc.trial && cc.trial.awaitingPlayerVote) {
      const memBefore = JSON.stringify(Game.state.village.memory || {});
      Game.castPlayerVote(cc.id, true);
      const memAfter = JSON.stringify(Game.state.village.memory || {});
      voted = true;
      ok('guilty vote recorded socially (memory/grievance delta)', memAfter.length !== memBefore.length, `before ${memBefore.length} after ${memAfter.length}`);
      const line = narr().join(' ');
      ok('vote-out-loud beat plays', /lands in the count, out loud/.test(line));
    }
  }
  if (!voted) { fail++; console.log('  FAIL no player-vote trial in 8 tries'); }

  // ============ FIX 10: exile loop not stuck ============
  console.log('\n## 10. exile: actions available, loop closes');
  fresh('exile');
  const acts = Game.exileSelfActions();
  ok('exiled player has self actions', acts.length >= 2, JSON.stringify(acts.map(a => a.id)));
  ok('drift action present', acts.some(a => a.id === 'drift'));
  ok('found-haven action present', acts.some(a => a.id === 'foundhaven'));
  Game.exileSelfDo('drift');
  ok('drift sets drifting state', !!Game.state.scholar.drifting);
  Game.exileSelfDo('foundhaven');
  ok('found haven ends exile', !Game.state.scholar.exiled && !Game.state.scholar.drifting);

  console.log(`\n##### RESULT: ${pass} passed, ${fail} failed #####`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS CRASH:', e.message); console.error((e.stack || '').split('\n').slice(0, 4).join('\n')); process.exit(2); });
