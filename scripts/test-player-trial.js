// Player stands accused: symmetric jeopardy tests.
// Usage: node scripts/test-player-trial.js
// Covers: crime→accusation threshold, false accusation, defense tools
// (speak/alibi/press), bribery both directions, trial both outcomes,
// all resolutions incl. real exile, flight, conversation integration.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/party.js', 'src/js/justice.js',
 'src/js/conversation.js', 'src/js/truth.js', 'src/js/betrayal.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}`); }
}

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  Game.say = () => {};
  Game.tickAction = () => {};
  Game.WILD_DAY_RATE = 0; // deterministic trials for these tests

  const v = Game.state.village;
  const P = Game.villagerId;
  const npcs = () => v.roster.filter(id => id !== P);
  const [A, B, C, D, E] = npcs();
  const playerCases = () => (Game.betrayalState().cases || []).filter(c => c.accused.includes(P));
  const clearPlayerCases = () => { Game.betrayalState().cases = Game.betrayalState().cases.filter(c => !c.accused.includes(P)); };

  // ---------- 1. threshold: no crimes, no accusation ----------
  for (let i = 0; i < 10; i++) Game.considerPlayerAccusation();
  ok('no crimes -> no accusation', playerCases().length === 0);

  // ---------- 2. crime -> accusation (theft, caught) ----------
  Game.recordCrime('theft', { victim: A, caught: true });
  let pc = null;
  for (let i = 0; i < 30 && !pc; i++) { Game.considerPlayerAccusation(); pc = playerCases()[0]; }
  ok('theft accusation opens', !!pc);
  ok('accused is the player', pc && pc.accused.length === 1 && pc.accused[0] === P);
  ok('playerRole accused', pc && pc.playerRole === 'accused');
  ok('charge is theft', pc && pc.charge === 'theft');
  ok('victim accuses', pc && pc.accuser === A);
  ok('crime marked charged', Game.justiceState().crimes.every(c => c.caseId));
  ok('moot clock set', pc && pc.mootIn >= 2);
  ok('belief starts suspicious', pc && Game.avgBelief(pc) < 10);

  // ---------- 3. defense: speak ----------
  const b0 = Game.avgBelief(pc);
  Game.defendSpeak(pc.id);
  ok('speak moves belief toward acquit', Game.avgBelief(pc) > b0);
  const b1 = Game.avgBelief(pc);
  Game.defendSpeak(pc.id); // diminishing
  ok('second speech still helps (less)', Game.avgBelief(pc) > b1);

  // ---------- 4. defense: alibi ----------
  v.trust[B] = 40; v.trust[C] = 35;
  const b2 = Game.avgBelief(pc);
  ok('alibi works with friends', Game.defendAlibi(pc.id) === true);
  ok('alibi moves belief toward acquit', Game.avgBelief(pc) > b2);
  ok('alibi one-shot', Game.defendAlibi(pc.id) === null);

  // ---------- 5. defense: press truthful accuser backfires ----------
  const b3 = Game.avgBelief(pc);
  ok('pressing truthful accuser fails', Game.defendPressAccuser(pc.id) === false);
  ok('pressing truthful accuser backfires', Game.avgBelief(pc) < b3);

  // ---------- 6. bribery: player bribes, accuser bribes, expose ----------
  const voter = npcs().find(id => id !== A);
  ok('player bribe lands', Game.bribeVoter(pc.id, voter, P, 1600) === true);
  ok('player bribe recorded', pc.bribes.some(b => b.by === P));
  let antiBribe = null;
  for (let i = 0; i < 20 && !antiBribe; i++) { Game.simBriberyTick(); antiBribe = pc.bribes.find(b => b.by === pc.accuser); }
  ok('accuser side bribes against player', !!antiBribe);
  // plant a traced accuser bribe: discovery + exposure, deterministic
  // (simBriberyTick traces are coin-flips — not testable directly)
  const av = npcs().find(id => id !== A && id !== voter);
  pc.bribes.push({ voter: av, by: pc.accuser, amount: 800, day: Game.state.scholar.day, trace: true });
  let found = [];
  for (let i = 0; i < 10 && !found.some(b => b.voter === av); i++) found = Game.investigateBribery(pc.id);
  pc.foundBribes = found;
  ok('bribery discoverable', found.some(b => b.voter === av));
  const b4 = Game.avgBelief(pc);
  Game.exposeBribery(pc.id, av);
  ok('exposing accuser bribery helps player', Game.avgBelief(pc) > b4);
  clearPlayerCases();

  // ---------- 7. false accusation ----------
  Game.justiceState().crimes = [];
  Game.recordGrievance(E, P, 'framing', 80); // motive 64 >= 60
  v.trust[P] = 5;
  const fc = Game.openPlayerCase(E, 'theft', [], true);
  ok('false accusation opens', !!fc && fc.fabricated === true);
  ok('fabricated case has seams', fc.inconsistencies.length === 2);
  const eTrustBefore = (v.trust[E] == null ? 10 : v.trust[E]);
  const fb0 = Game.avgBelief(fc);
  ok('pressing liar works', Game.defendPressAccuser(fc.id) === true);
  ok('liar exposed, belief swings to player', Game.avgBelief(fc) > fb0 + 10);
  ok('false accuser loses trust', (v.trust[E] == null ? 10 : v.trust[E]) < eTrustBefore);
  clearPlayerCases();

  // ---------- 8. alibi with no friends backfires ----------
  for (const id of npcs()) v.trust[id] = 5;
  const lc = Game.openPlayerCase(D, 'assault', [], false);
  const lb0 = Game.avgBelief(lc);
  ok('no friends -> no vouch', Game.defendAlibi(lc.id) === false);
  ok('silence testifies against you', Game.avgBelief(lc) < lb0);
  clearPlayerCases();

  // ---------- 9. trial: acquittal path ----------
  const ac = Game.openPlayerCase(C, 'theft', [], false);
  for (const id of npcs()) ac.belief[id] = 100; // airtight defense
  Game.conductTrial(ac);
  ok('airtight case acquits', ac.trial && ac.trial.convicted === false);
  ok('acquittal marked', ac.status === 'acquitted');
  clearPlayerCases();

  // ---------- 10. trial: conviction -> EXILE (real) ----------
  for (const id of npcs()) v.trust[id] = 10;
  const xc = Game.openPlayerCase(B, 'murder', [], false);
  for (const id of npcs()) xc.belief[id] = -100; // damning
  Game.conductTrial(xc);
  ok('damning case convicts', xc.trial && xc.trial.convicted === true);
  ok('strong conviction -> exile', xc.resolution === 'exile');
  ok('EXILE IS REAL: scholar.exiled', Game.state.scholar.exiled === true);
  ok('justice exiled flag', Game.justiceState().exiled === true);
  Game.state.scholar.exiled = false;
  try { Game.justiceState().exiled = false; } catch (e) {}
  clearPlayerCases();

  // ---------- 11. weregild costs the player ----------
  Game.state.scholar.kcal = 8000;
  const wc = Game.openPlayerCase(A, 'theft', [], false);
  const pk0 = Game.state.scholar.kcal;
  Game.resolveCase(wc.id, 'weregild');
  ok('weregild resolved', wc.resolution === 'weregild');
  ok('player paid from their stores', Game.state.scholar.kcal < pk0);
  clearPlayerCases();

  // ---------- 12. cold war / schism reachable ----------
  const cc = Game.openPlayerCase(A, 'theft', [], false);
  const pTrustBefore = (v.trust[P] == null ? 10 : v.trust[P]);
  Game.resolveCase(cc.id, 'cold_war');
  ok('cold war reachable', cc.resolution === 'cold_war');
  ok('cold war hits player trust', (v.trust[P] == null ? 10 : v.trust[P]) < pTrustBefore);
  const sc2 = Game.openPlayerCase(A, 'theft', [], false);
  Game.resolveCase(sc2.id, 'schism');
  ok('schism reachable', sc2.resolution === 'schism');
  clearPlayerCases();

  // ---------- 13. flight before verdict ----------
  const flc = Game.openPlayerCase(A, 'assault', [], false);
  ok('flee works', Game.fleeBeforeVerdict(flc.id) === true);
  ok('flight = exile', Game.state.scholar.exiled === true);
  ok('flight resolution recorded', flc.resolution === 'fled');
  Game.state.scholar.exiled = false;
  try { Game.justiceState().exiled = false; } catch (e) {}
  clearPlayerCases();

  // ---------- 14. accuser's clock: moot auto-called ----------
  let mootCalled = null;
  const _callMoot = Game.callMoot;
  Game.callMoot = function (id) { mootCalled = id; return { trial: true, stubbed: true }; };
  const tc = Game.openPlayerCase(A, 'theft', [], false);
  tc.day = Game.state.scholar.day - 5; tc.mootIn = 2;
  Game.playerCaseTick();
  ok('accuser calls the moot when clock runs out', mootCalled === tc.id);
  Game.callMoot = _callMoot;
  clearPlayerCases();

  // ---------- 15. demand moot (player forces it early) ----------
  const dc = Game.openPlayerCase(A, 'theft', [], false);
  for (const id of npcs()) dc.belief[id] = 100;
  const dr = Game.demandMoot(dc.id);
  ok('demand moot runs the trial', dr && dc.trial);
  clearPlayerCases();

  // ---------- 16. conversation integration (moot redesign) ----------
  // Defense strategy lives in the case file — per-person conversation offers
  // only what THIS person can do: ask what they've heard, tell your side
  // (if it matters), press the accuser (only the accuser). speak / alibi /
  // force-moot / flee are dossier moves, never conversation options.
  const ic = Game.openPlayerCase(A, 'theft', [], false);
  const choicesAccuser = Game.betrayalChoices(A).map(x => x.id); // A is the accuser
  ok('press-accuser offered to the actual accuser', choicesAccuser.some(id => id.startsWith('betrayal:pressaccuser:')));
  ok('accuser is not asked what they heard (press covers them)', !choicesAccuser.some(id => id.startsWith('betrayal:askheard:')));
  const choicesOther = Game.betrayalChoices(B).map(x => x.id);
  ok('press-accuser NOT offered to non-accusers', !choicesOther.some(id => id.startsWith('betrayal:pressaccuser:')));
  ok('ask-heard offered per person', choicesOther.some(id => id.startsWith('betrayal:askheard:')));
  const allCh = npcs().flatMap(id => Game.betrayalChoices(id).map(x => x.id)).filter(x => typeof x === 'string');
  for (const gone of ['betrayal:defend_speak:', 'betrayal:defend_alibi:', 'betrayal:defend_press:', 'betrayal:demand_moot:', 'betrayal:flee:']) {
    ok(gone + ' NOT in conversation', !allCh.some(id => id.startsWith(gone)));
  }
  // the dossier holds the strategic moves instead
  const dActs = Game.caseDossierActions(ic.id).map(a => a.id);
  for (const want of ['speak', 'alibi', 'pressaccuser', 'demandmoot', 'flee']) {
    ok('dossier holds ' + want, dActs.includes(want));
  }
  // bribe is gated: C becomes a committed, bribable voter; the player can pay
  const cvp = (Game.data.villagers || []).find(x => x.id === C) || {};
  cvp.personality = cvp.personality || {}; cvp.personality.temperament = 'warm';
  ic.belief[C] = -60;
  v.pantryKcal = 50000;
  ok('bribe choice offered pre-trial (involved+bribable+affordable)',
    Game.betrayalChoices(C).map(x => x.id).filter(x => typeof x === 'string').some(x => x.startsWith('betrayal:bribe:')));
  clearPlayerCases();

  // ---------- 17. one case at a time ----------
  Game.recordCrime('attack', { victim: B, caught: true });
  for (let i = 0; i < 30; i++) Game.considerPlayerAccusation();
  ok('single player case at a time', playerCases().length <= 1);
  clearPlayerCases();
  Game.justiceState().crimes = [];

  // ---------- 18. charge-weighted sentencing bands ----------
  const mkSent = (charge, avgVal) => {
    const c = Game.openPlayerCase(A, charge, [], false);
    for (const id of npcs()) c.belief[id] = avgVal;
    c.flipped = null;
    return c;
  };
  const resetExile = () => { Game.state.scholar.exiled = false; try { Game.justiceState().exiled = false; } catch (e) {} clearPlayerCases(); };
  let sc = mkSent('murder', -20); Game.sentenceCase(sc);
  ok('murder conviction (natural belief) -> exile', sc.resolution === 'exile'); resetExile();
  sc = mkSent('murder', -3); Game.sentenceCase(sc);
  ok('shaky murder conviction -> at least weregild', sc.resolution === 'weregild'); resetExile();
  sc = mkSent('assault', -30); Game.sentenceCase(sc);
  ok('strong assault conviction -> exile', sc.resolution === 'exile'); resetExile();
  sc = mkSent('assault', -20); Game.sentenceCase(sc);
  ok('mid assault conviction -> weregild', sc.resolution === 'weregild'); resetExile();
  sc = mkSent('ambush', -30); Game.sentenceCase(sc);
  ok('ambush (violent) conviction -> exile', sc.resolution === 'exile'); resetExile();
  sc = mkSent('theft', -20); Game.sentenceCase(sc);
  ok('theft conviction -> weregild, not exile', sc.resolution === 'weregild'); resetExile();
  sc = mkSent('theft', -45); Game.sentenceCase(sc);
  ok('baying-for-blood theft conviction -> exile', sc.resolution === 'exile'); resetExile();
  sc = mkSent('intimidation', -20); Game.sentenceCase(sc);
  ok('intimidation conviction -> weregild', sc.resolution === 'weregild'); resetExile();
  sc = mkSent('theft', -20); sc.flipped = B; Game.sentenceCase(sc);
  ok('flipped accomplice -> exile regardless of charge', sc.resolution === 'exile'); resetExile();

  // ---------- 19. Monte Carlo: natural-play exile rates per charge ----------
  const rates = {};
  for (const ch of ['murder', 'assault', 'theft', 'intimidation']) {
    let ex = 0; const N = 200;
    for (let i = 0; i < N; i++) {
      const c = Game.openPlayerCase(A, ch, [], false);
      const avg = Math.round(-38 + Math.random() * 33); // natural convicted range
      for (const id of npcs()) c.belief[id] = avg;
      c.flipped = null;
      Game.sentenceCase(c);
      if (c.resolution === 'exile') ex++;
      Game.state.scholar.exiled = false;
      try { Game.justiceState().exiled = false; } catch (e) {}
      clearPlayerCases();
    }
    rates[ch] = ex / N;
  }
  console.log('   sentencing exile rates:', JSON.stringify(rates));
  ok('murder exile rate high', rates.murder >= 0.9);
  ok('assault exile rate often', rates.assault >= 0.2 && rates.assault <= 0.8);
  ok('theft exile rate low', rates.theft <= 0.1);
  ok('intimidation exile rate low', rates.intimidation <= 0.1);

  // ---------- 20. moot-caller perspective ----------
  const saidLines = [];
  const _say2 = Game.say;
  Game.say = (t) => saidLines.push(t);
  const _ct2 = Game.conductTrial;
  Game.conductTrial = () => null; // don't run the trial, just check the announcement
  const pc2 = Game.openPlayerCase(A, 'theft', [], false);
  Game.callMoot(pc2.id); // player calls
  ok('player-called moot: "You call a moot"', saidLines.some(l => l.includes('You call a moot')));
  saidLines.length = 0;
  Game.callMoot(pc2.id, A); // accuser calls
  // NOTE: displayName is a random descriptor pre-System, so we can't pin the
  // exact name — pin the perspective instead: SOMEONE calls it, never "you"
  ok('accuser-called moot announces a caller', saidLines.some(l => l.includes('calls the moot')));
  ok('accuser-called moot never says "You call"', !saidLines.some(l => l.includes('You call a moot')));
  Game.conductTrial = _ct2;
  Game.say = _say2;
  clearPlayerCases();

  // ---------- 21. resolution always recorded + verdict ceremony ----------
  const said3 = [];
  Game.say = (t) => said3.push(t);
  const ac2 = Game.openPlayerCase(C, 'theft', [], false);
  for (const id of npcs()) ac2.belief[id] = 100;
  Game.conductTrial(ac2);
  ok('acquittal records resolution', ac2.resolution === 'acquitted');
  ok('verdict ceremony: the count is spoken', said3.some(l => l.includes('for guilty')));
  ok('verdict ceremony: faces and pause', said3.some(l => l.includes('wind past the edge of the light')));
  Game.say = _say2;
  clearPlayerCases();

  // ---------- 22. bribery trace flag is read by investigation ----------
  const bc = Game.openPlayerCase(A, 'theft', [], false);
  bc.bribes.push({ voter: B, by: A, amount: 800, day: 0, trace: true });
  bc.bribes.push({ voter: C, by: A, amount: 800, day: 0, trace: false });
  bc.exposedBribes = [];
  let foundT = 0, foundF = 0;
  for (let i = 0; i < 200; i++) {
    const f = Game.investigateBribery(bc.id);
    if (f.some(b => b.voter === B)) foundT++;
    if (f.some(b => b.voter === C)) foundF++;
  }
  console.log(`   bribery trace: traced found ${foundT}/200, clean found ${foundF}/200`);
  ok('traced bribes found more often than clean ones', foundT > foundF + 30);
  clearPlayerCases();

  Game.WILD_DAY_RATE = null;
  console.log(`\nplayer-trial: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
