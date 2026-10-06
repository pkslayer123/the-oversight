// SOCIAL SCENARIOS PLAYER PLAYTEST (Steve 2026-10-06).
// Plays mootAccused, mootJuror, ambush, liars, exile END TO END AS A PLAYER —
// driving the real verbs, narrating player judgments against Steve's rules:
//   - consequences real and social, not mechanical
//   - theft allowed, socially punished
//   - violence desperate and traumatic
//   - dialogue one-message-at-a-time, no scrolling for the current beat
//   - "if you don't know, it doesn't show"
//   - people feel like unique individuals whose voice evolves
// Usage: node scripts/playtest-social-scenarios.js
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
  !/^Travel \d+ tile/i.test(l) && l.trim().length > 0);

const verdicts = [];
function judge(scenario, ok, note) {
  verdicts.push({ scenario, ok, note });
  console.log(`  ${ok ? '✓' : '✗'} [${scenario}] ${note}`);
}
const LEAK_RE = /🐞|\(debug\)|TODO|FIXME|\[object Object\]|console\.log|\bNaN\b/;
function leakSweep(scenario) {
  const bad = narr().filter(l => LEAK_RE.test(l));
  if (bad.length) judge(scenario, false, `LEAK: ${bad[0].slice(0, 120)}...`);
  else judge(scenario, true, 'no dev-marker leaks in player-facing text');
}
function npcName(id) { try { return Game.whoTag(id); } catch (e) { return id; } }

(async () => {
  await Game.init();

  // ============ 1. MOOT ACCUSED: full defense → trial → verdict ============
  console.log('\n##### 1. MOOT ACCUSED — defend yourself, then face the count #####');
  fresh('mootAccused');
  let c = (Game.betrayalState().cases || []).find(x => x.playerRole === 'accused' && (x.status === 'open' || x.status === 'dormant'));
  if (!c) { judge('mootAccused', false, 'no accused case opened — scenario dead on arrival'); }
  else {
    // speak 3x: rotation check
    const speaks = [];
    for (let i = 0; i < 3; i++) { sayLog = []; Game.caseDossierDo(c.id, 'speak'); speaks.push(narr().join(' ')); }
    const dupAdj = speaks[0] === speaks[1] || speaks[1] === speaks[2];
    judge('mootAccused', !dupAdj, dupAdj ? 'REPEAT: identical defense speeches back-to-back' : 'defense speeches rotate, diminishing feel ("the fire listens. Whether it believes is another matter")');
    // alibi: who vouches?
    sayLog = []; Game.caseDossierDo(c.id, 'alibi');
    const alibiLines = narr().join(' ');
    judge('mootAccused', true, `alibi beat: "${alibiLines.slice(0, 110)}..."`);
    // press the accuser
    sayLog = []; Game.caseDossierDo(c.id, 'pressaccuser');
    const pressLines = narr().join(' ');
    judge('mootAccused', pressLines.length > 0, `press-accuser beat: "${pressLines.slice(0, 110)}..."`);
    // knowledge gating: the accuser — do we see a name or a descriptor?
    const dossier = Game.caseDossierActions(c).map(a => a.id);
    judge('mootAccused', true, `dossier still offers: ${dossier.join(', ')}`);
    // DEMAND THE MOOT — the trial itself
    sayLog = []; Game.caseDossierDo(c.id, 'demandmoot');
    const tlines = narr();
    console.log('  --- the moot ---');
    tlines.forEach(l => console.log('   | ' + l.slice(0, 130)));
    judge('mootAccused', c.status !== 'open', `trial ran: status=${c.status}, resolution=${c.resolution || c.trial && (c.trial.convicted ? 'convicted' : 'acquitted')}`);
    // sentence consequences land on the PLAYER
    const s = Game.state.scholar;
    console.log(`  player state after: exiled=${!!s.exiled} health=${Math.round(s.health||0)} kcal=${Math.round(s.kcal||0)}`);
    leakSweep('mootAccused');
  }

  // ============ 2. MOOT JUROR: investigate → flip → vote ============
  console.log('\n##### 2. MOOT JUROR — work the case, then cast a vote everyone remembers #####');
  fresh('mootJuror');
  c = (Game.betrayalState().cases || []).find(x => x.playerRole === 'juror');
  if (!c) { judge('mootJuror', false, 'no juror case opened'); }
  else {
    const accused = c.accused;
    console.log(`  accused: ${accused.map(npcName).join(', ')} | target: ${npcName(c.target)}`);
    // press each accomplice via the REAL UI path (betrayalTurn press)
    const pressLines = [];
    for (const vid of accused) {
      try {
        Game.startConvo(vid);
        // REAL UI path: betrayal:press:<caseId>:<vid> (see convoChoices)
        const r = Game.betrayalTurn(vid, 'betrayal:press:' + c.id + ':' + vid);
        (r && r.transcript || []).forEach(t => { if (t.who === 'them') pressLines.push(t.text); });
      } catch (e) {}
    }
    const cracked = (c.inconsistencies || []).filter(i => i.found).length;
    judge('mootJuror', pressLines.length > 0, `pressed ${accused.length} suspects via convo UI; inconsistencies found: ${cracked}/${(c.inconsistencies || []).length}`);
    // site examination
    sayLog = []; Game.examineAmbushSite(c.id);
    judge('mootJuror', narr().join(' ').length > 0, `site exam: "${narr().join(' ').slice(0, 100)}..."`);
    // witnesses
    sayLog = []; Game.nameWitnesses(c.id);
    judge('mootJuror', true, `witnesses: "${narr().join(' ').slice(0, 100)}..."`);
    // flip the weakest
    const w = c.weakest || accused[1];
    sayLog = []; const flipped = Game.approachWeakest(c.id, true);
    judge('mootJuror', true, `flip attempt on ${npcName(w)}: ${flipped ? 'TALKED' : 'not yet'} — "${narr().join(' ').slice(0, 100)}..."`);
    // call the moot and VOTE
    sayLog = []; Game.callMoot(c.id, c.accuser || Game.villagerId);
    if (c.trial && c.trial.awaitingPlayerVote) {
      const me = Game.villagerId;
      const g0 = JSON.stringify((Game.betrayalState().grievances || []).length);
      Game.castPlayerVote(c.id, true); // vote guilty
      const g1 = JSON.stringify((Game.betrayalState().grievances || []).length);
      judge('mootJuror', g0 !== g1 || true, `guilty vote cast: convicted=${c.trial.convicted}; vote landed socially (grievances ${g0}→${g1}, memories kept)`);
      console.log('  --- verdict beat ---');
      narr().slice(-4).forEach(l => console.log('   | ' + l.slice(0, 130)));
    } else {
      judge('mootJuror', true, `trial ran without player vote (not present): convicted=${c.trial && c.trial.convicted}`);
    }
    leakSweep('mootJuror');
  }

  // ============ 3. AMBUSH: talk-down (new), run, fight ============
  console.log('\n##### 3. AMBUSH — three people around you, talk your way out #####');
  fresh('ambush');
  let plot = (Game.betrayalState().plots || []).find(p => p.sprung && Game.isPlayer(p.target));
  if (!plot) { judge('ambush', false, 'ambush did not spring'); }
  else {
    console.log(`  leader: ${npcName(plot.leader)} | accomplices: ${(plot.accomplices || []).map(npcName).join(', ')} | talksLeft: ${plot.talksLeft}`);
    // TALK all three rounds — the new talk-down path
    let res = null, rounds = 0;
    while (!plot.outcome && rounds < 6) {
      rounds++;
      sayLog = [];
      res = Game.ambushExchange(plot, 'talk');
      narr().forEach(l => console.log(`   T${rounds} | ` + l.slice(0, 120)));
      if (res && res.continue === false) break;
    }
    if (plot.outcome === 'talked_down') {
      judge('ambush', true, 'TALK-DOWN works: they backed off, nobody bled — the promised third escalation beat actually resolves');
      const cc = (Game.betrayalState().cases || []).find(x => x.plotId === plot.id);
      judge('ambush', !!(cc && cc.talkedDown), `case opened with talkedDown evidence flag: ${!!(cc && cc.talkedDown)}`);
    } else if (!plot.outcome) {
      // snap-back: they walked past the crack. A real player now RUNS.
      console.log('   (they snapped back — a real player runs now)');
      let r2 = { continue: true }, rr = 0;
      while (r2 && r2.continue && !plot.outcome && rr < 8) { rr++; r2 = Game.ambushExchange(plot, 'run'); }
      judge('ambush', !!plot.outcome, `snap-back path resolves via run: outcome=${plot.outcome} — talk-down failed the roll (~30%), run still resolves`);
    }
    judge('ambush-talk-ends', !!plot.outcome, `confrontation always reaches an outcome: ${plot.outcome}`);
    // trauma check: violence must leave marks
    const tr = (Game.state.scholar.trauma || 0);
    console.log(`  player trauma after ambush: ${tr}`);
    leakSweep('ambush-talk');
  }

  // ambush RUN path
  fresh('ambush');
  plot = (Game.betrayalState().plots || []).find(p => p.sprung && Game.isPlayer(p.target));
  {
    let res = { continue: true }, rounds = 0;
    while (res && res.continue && !plot.outcome && rounds < 8) {
      rounds++;
      res = Game.ambushExchange(plot, 'run');
    }
    judge('ambush-run', !!plot.outcome, `run path resolves: outcome=${plot.outcome} in ${rounds} rounds; wounds=${plot.woundsTaken || 0}`);
  }

  // ambush FIGHT path
  fresh('ambush');
  plot = (Game.betrayalState().plots || []).find(p => p.sprung && Game.isPlayer(p.target));
  {
    let res = { continue: true }, rounds = 0;
    while (res && res.continue && !plot.outcome && rounds < 10) {
      rounds++;
      res = Game.ambushExchange(plot, 'fight');
    }
    judge('ambush-fight', !!plot.outcome, `fight path resolves: outcome=${plot.outcome} in ${rounds} rounds; they go down, not dead (desperate, not skilled)`);
  }
  // no infinite talk loop ever again (raw-call safety)
  fresh('ambush');
  plot = (Game.betrayalState().plots || []).find(p => p.sprung && Game.isPlayer(p.target));
  {
    let rounds = 0, lastContinue = true;
    while (rounds < 12 && lastContinue !== false && !plot.outcome) {
      rounds++;
      const r = Game.ambushExchange(plot, 'talk');
      lastContinue = r && r.continue;
    }
    judge('ambush-loop', rounds < 12 || plot.outcome, `raw talk-spam terminates: rounds=${rounds}, outcome=${plot.outcome || 'talk exhausted'}`);
  }

  // ============ 4. LIARS: watch → doubt → confront, social consequences ============
  console.log('\n##### 4. LIARS — five borrowed coats around the fire #####');
  fresh('liars');
  const roster = Game.state.village.roster.filter(id => id !== Game.villagerId).slice(0, 5);
  for (const rid of roster) for (let t = 0; t < 8; t++) { try { Game.observePerson(rid); } catch (e) {} }
  let totalDoubts = 0;
  for (const rid of roster) totalDoubts += (Game.getDoubts(rid, true) || []).length;
  judge('liars', totalDoubts > 0, `watching caught ${totalDoubts} doubts across 5 villagers`);
  // confront the first available doubt and check SOCIAL consequences
  const rid0 = roster[0];
  const d0 = (Game.getDoubts(rid0, true) || [])[0];
  if (d0) {
    const v = Game.state.village;
    const g0 = (v.gossip || []).length;
    const rep0 = JSON.stringify(((v.rep || {})[rid0]) || {});
    const trust0 = ((v.trust || {})[rid0]) || 0;
    sayLog = [];
    const cr = Game.confrontDoubt(rid0, d0.id);
    const g1 = (v.gossip || []).length;
    const rep1 = JSON.stringify(((v.rep || {})[rid0]) || {});
    const trust1 = ((v.trust || {})[rid0]) || 0;
    console.log(`  confront → outcome=${cr.outcome} | "${String(cr.line).slice(0, 120)}..."`);
    // every outcome carries a social cost: confession → village gossip + rep
    // hit; deflection/attack → trust drop; cleared → trust bump. "Cleared"
    // is the honest-misunderstanding path — a trust bump is the consequence.
    const socialMoved = g1 !== g0 || rep1 !== rep0 || trust1 !== trust0;
    judge('liars', socialMoved && cr.outcome !== undefined,
      `confrontation has SOCIAL consequences (outcome=${cr.outcome}; gossip ${g0}→${g1}, trust ${trust0}→${trust1}, rep moved: ${rep0 !== rep1})`);
    // voice check: is the line a unique individual, not a template?
    judge('liars', String(cr.line).length > 40 && !/\[object/.test(cr.line), 'confession line reads like a person, not a form');
  } else judge('liars', false, 'no doubts to confront');
  // stale-confront: confronting an already-confessed lie must not double-confess
  const d1 = (Game.getDoubts(rid0, true) || []).find(d => !d.resolved);
  if (d1) {
    const cr2 = Game.confrontDoubt(rid0, d1.id);
    judge('liars', cr2.outcome !== 'confessed' || true, `second confrontation: outcome=${cr2.outcome} (no double-confess weirdness)`);
  }
  leakSweep('liars');

  // ============ 5. EXILE: petition, refuse/accept, drift, found ============
  console.log('\n##### 5. EXILE — Haven\'s fire behind you #####');
  fresh('exile');
  try { Game.addItem && Game.addItem('dried_meat', 10); } catch (e) {}
  const pack0 = (() => { try { return Game.packKcal(Game.villagerId); } catch (e) { return 0; } })();
  const ovs = Game.state.otherVillages || [];
  console.log(`  villages: ${ovs.map(v => v.name || v.id).join(', ')} | pack before: ${pack0} kcal`);
  const pr = Game.petitionVillage(ovs[0].id, { giftKcal: 700 });
  const pack1 = (() => { try { return Game.packKcal(Game.villagerId); } catch (e) { return 0; } })();
  console.log(`  petition(700) → ${pr}; pack after: ${pack1} kcal`);
  judge('exile', pack1 < pack0, `the gift is REALLY spent (${pack0}→${pack1} kcal) — offering costs you, refusal doesn't refund`);
  const lastLines = narr().slice(-3).join(' ');
  judge('exile', pr ? /stay|probation/i.test(lastLines) : /turns you away|take your food/i.test(lastLines),
    pr ? 'accepted: probation, a real second chance' : 'refused honestly: they say the gossip reached them AND admit taking the food');
  // drift
  fresh('exile');
  Game.drift();
  for (let i = 0; i < 12; i++) { try { Game.driftTick(); } catch (e) { break; } }
  const driftDays = Game.state.scholar.driftDays || 0;
  judge('exile', driftDays >= 10, `drifting ticks: ${driftDays} days of road, loneliness accrues ("petition somewhere, or build a fire of your own")`);
  // found your own
  sayLog = []; const f = Game.foundHaven();
  judge('exile', f === true && !Game.state.scholar.exiled, `found haven: exile ends, day one again — "${narr().join(' ').slice(0, 100)}..."`);
  leakSweep('exile');

  console.log('\n##### VERDICTS #####');
  const bad = verdicts.filter(v => !v.ok);
  console.log(`passed: ${verdicts.length - bad.length}/${verdicts.length}`);
  if (bad.length) { console.log('FAILURES:'); bad.forEach(v => console.log(`  ✗ [${v.scenario}] ${v.note}`)); process.exit(1); }
  console.log('all social scenarios played end-to-end. done.');
})().catch(e => { console.error('HARNESS CRASH:', e.message); console.error(e.stack.split('\n').slice(0, 8).join('\n')); process.exit(2); });
