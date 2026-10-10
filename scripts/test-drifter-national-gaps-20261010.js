#!/usr/bin/env node
// DRIFTER BREAK-IT PROOF (2026-10-10): the national ladder's initiation layer
// was engine-only, same class as the 2026-10-08 proposeLink gap this loop
// fixed. Specifically:
//   1. proposeCovenant / proposeTrade / raidVillage had ZERO UI callers — 3 of
//      the 6 national roads were unreachable by any player.
//   2. answerRaid was unreachable -> a mustered war party (pendingRaid) could
//      NEVER be resolved (softlock of the raid mechanic).
//   3. answerDefenseCall / answerTradeCall / answerCovenantCrisis unreachable —
//      the war-pact's core obligation, the charter's priced favor, and the
//      league crisis fired and could never be answered.
//   4. drawLeaguePool unreachable — the covenant's headline benefit (famine
//      draws) could never be used; the pool only grew.
//   5. Copy-only costs: state.raidParty / state.covenantAway / state.tradeAway
//      were written, never read ("raiders gone three days", "two villagers
//      walk out for three days", "1,500 kcal repaid after" — the repayment
//      actually landed INSTANTLY, contradicting the copy). Now all ride the
//      away-party mechanism: real absence, announced returns.
//   6. Their 2,000 kcal/week league pour appeared from thin air — "real food
//      in and out" held only for Haven's share. Every fire pours from its own
//      stores now.
//   7. The Links panel ASSIGNED (html =) the links block, discarding the
//      national/global beat buttons whenever any link existed — and national
//      always requires a polity, so the beats were never answerable.
//   8. A hostile drifter calling the council verbs from exile got a free war
//      party; exiling mid-muster stranded pendingRaid forever. Engine guards
//      + exile dissolves the muster.
// Run: SEED=11 node scripts/test-drifter-national-gaps-20261010.js (also 222, 3333)
// Node harness: full src/js/*.js list in index.html order, minus DOM-only
// (app.js/sprites.js/tile-scenes.js/move-anim.js/drama.js). Math.random is
// seeded BEFORE eval (modules capture it at load).
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

// ---- seeded RNG BEFORE eval ----
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    var t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const SEED = parseInt(process.env.SEED || '11', 10);
Math.random = mulberry32(SEED);

global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
global.window = global; // equipment.js needs window at LOAD; deleted before play
[
  'src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/forage.js',
  'src/js/engine/combat.js', 'src/js/engine/day.js',
  'src/js/game.js', 'src/js/encounters.js', 'src/js/conversation.js',
  'src/js/convo-mood.js', 'src/js/convoTopics.js', 'src/js/convo-wants.js',
  'src/js/convo-dialogue.js', 'src/js/convo-beats.js', 'src/js/convo-scene.js',
  'src/js/examine.js', 'src/js/equipment.js', 'src/js/journal.js', 'src/js/party.js',
  'src/js/party-formal.js', 'src/js/truth.js', 'src/js/contests.js',
  'src/js/broadcast.js', 'src/js/contestEngine.js', 'src/js/alienPlayers.js',
  'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js',
  'src/js/justice.js', 'src/js/food.js', 'src/js/betrayal.js', 'src/js/corpses.js',
  'src/js/corruption.js', 'src/js/lifeseed.js', 'src/js/progression.js',
  'src/js/ledger.js', 'src/js/abilityActions.js', 'src/js/monsterBehaviors.js',
  'src/js/statusEffects.js', 'src/js/villager-agency.js', 'src/js/fieldFights.js',
  'src/js/villager-objectives.js', 'src/js/codex-people.js', 'src/js/membership.js',
  'src/js/hierarchy.js', 'src/js/debug-scenarios.js', 'src/js/build.js',
].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
delete global.window; // sync combat path, per harness lessons
const Game = globalThis.Scattering.Game;

const says = [];
const osay = Game.say.bind(Game);
Game.say = (t) => { says.push(String(t)); return osay(t); };
function saidHas(re) { return says.some(t => re.test(t)); }

let failures = 0;
function ok(cond, label) {
  if (cond) { console.log(`  PASS ${label}`); }
  else { failures++; console.log(`  FAIL ${label}`); }
}

function pantryKcal() {
  try {
    return (Game.state.village.pantry || []).reduce((s, p) => s + (p.kcalEach || 0) * (p.units == null ? 1 : p.units), 0);
  } catch (e) { return 0; }
}
function pantryHas(nameRe) {
  try { return (Game.state.village.pantry || []).some(p => nameRe.test(p.name || '')); } catch (e) { return false; }
}

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  try { Game.depart(); } catch (e) {}

  const ovs = () => (Game.state.otherVillages || []).filter(v => v && v.id !== 'haven');
  const A = ovs()[0], B = ovs()[1], C = ovs()[2];
  if (!A || !B || !C) { console.log('  FAIL need 3 villages, got ' + ovs().length); process.exit(1); }

  console.log('== 1. UI wiring exists (source-level: buttons reach the engine) ==');
  const appSrc = fs.readFileSync(path.join(ROOT, 'src/js/app.js'), 'utf8');
  ok(/data-covenant-propose[\s\S]{0,120}Game\.proposeCovenant/.test(appSrc), 'covenant button -> Game.proposeCovenant');
  ok(/data-trade-propose[\s\S]{0,120}Game\.proposeTrade/.test(appSrc), 'trade button -> Game.proposeTrade');
  ok(/data-raid-muster[\s\S]{0,120}Game\.raidVillage/.test(appSrc), 'muster button -> Game.raidVillage');
  ok(/data-raid-answer[\s\S]{0,120}Game\.answerRaid/.test(appSrc), 'raid answer buttons -> Game.answerRaid');
  ok(/data-defense[\s\S]{0,140}Game\.answerDefenseCall/.test(appSrc), 'defense buttons -> Game.answerDefenseCall');
  ok(/data-tradecall[\s\S]{0,140}Game\.answerTradeCall/.test(appSrc), 'trade-call buttons -> Game.answerTradeCall');
  ok(/data-crisis[\s\S]{0,150}Game\.answerCovenantCrisis/.test(appSrc), 'crisis buttons -> Game.answerCovenantCrisis');
  ok(/data-pool-draw[\s\S]{0,120}Game\.drawLeaguePool/.test(appSrc), 'pool draw buttons -> Game.drawLeaguePool');
  ok(appSrc.indexOf('html = `<div style="margin-top:4px"><p class="small"><b>⛓️') < 0, 'links block no longer overwrites the national/global beat buttons (html = bug)');

  console.log('== 2. covenant arc: propose -> pool week pours real food -> draw ==');
  A.opinion = 80; A.trust = 30;
  let cov = Game.proposeCovenant(A.id);
  if (cov === 'counter') { Game.answerCounter('accept'); cov = Game.linkWith(A.id); }
  ok(cov && cov.kind === 'covenant', 'proposeCovenant forms a covenant link on earned courtship');
  // simulate the Founding Council having opened the pool (beat sets poolLive)
  cov.poolLive = true;
  Game.state.village.pantry = [{ name: 'Test grain', kcalEach: 20000, units: 1, spoilDay: 9999 }];
  A.pantryKcal = 5000;
  const poolBefore = Game.leaguePool();
  const havenBefore = pantryKcal(), aBefore = A.pantryKcal;
  try { Game.mshipState().lastLinkWeek = -1; } catch (e) {}
  Game.state._leaguePoolWeek = -1;
  Game.hierarchyDaily();
  const poured = Game.leaguePool() - poolBefore;
  ok(poured > 0, 'pool week grows the granary (' + poured + ' kcal)');
  ok(pantryKcal() < havenBefore, 'Haven poured real food (pantry ' + havenBefore + ' -> ' + pantryKcal() + ')');
  ok(A.pantryKcal < aBefore, 'their fire poured real food too (their pantry ' + aBefore + ' -> ' + A.pantryKcal + '), not thin air');
  // draw: famine relief is a real verb now
  const drawPool = Game.leaguePool();
  const drew = Game.drawLeaguePool(2000);
  ok(drew === Math.min(2000, drawPool), 'drawLeaguePool draws 2,000 from the granary');
  ok(Game.leaguePool() === drawPool - drew, 'granary debited honestly');
  ok(pantryHas(/League granary draw/), 'draw lands in the pantry as real food');

  console.log('== 3. raid arc: muster -> strike -> fighters really gone -> walk back ==');
  const raidOk = Game.raidVillage(B.id);
  ok(raidOk === true, 'war party musters against an unlinked village');
  ok(!!Game.state.pendingRaid, 'pendingRaid live');
  const day0 = Game.state.scholar.day || 0;
  const slink = Game.answerRaid('strike');
  ok(slink && slink.conquered, 'STRIKE subjugates (conquered link, duress tribute)');
  ok(!Game.state.pendingRaid, 'pendingRaid resolved, not stranded');
  const m = Game.mshipState();
  const party = (m.awayParties || []).find(p => p.kind === 'raid');
  ok(!!party, 'fighters ride the away-party mechanism (not the write-only state.raidParty)');
  ok(party && party.untilDay === day0 + 3, 'party out for 3 days, honestly');
  const away = Game.awayMembers();
  const fighters = party ? party.vids : [];
  ok(fighters.length >= 2 && fighters.every(id => away.indexOf(id) >= 0), 'awayMembers shows the raiders (' + fighters.length + ' out)');
  const bench = Game._musterAway(20, 'raid');
  ok(fighters.every(id => bench.indexOf(id) < 0), '_musterAway cannot re-draft villagers already out');
  // three days pass
  Game.state.scholar.day = day0 + 3;
  Game.membershipDaily();
  ok(!(Game.mshipState().awayParties || []).some(p => p.kind === 'raid'), 'party returns when days are served');
  ok(saidHas(/walk(s)? back in/), 'the return is said aloud');
  // wounds: a wounded raider recovers honestly
  const wvid = (Game.state.village.roster || []).find(id => id !== Game.villagerId && Game.isMember(id));
  Game.mshipState().woundedUntil = Game.mshipState().woundedUntil || {};
  Game.mshipState().woundedUntil[wvid] = Game.state.scholar.day + 7;
  ok(Game.awayMembers().indexOf(wvid) >= 0, 'wounded villager counts as away (recovering)');
  ok(Game._musterAway(20, 'x').indexOf(wvid) < 0, 'wounded villager cannot be mustered');
  Game.state.scholar.day += 7;
  Game.membershipDaily();
  ok(!(Game.mshipState().woundedUntil || {})[wvid], 'wound clears after a week');
  ok(saidHas(/back on their feet/), 'recovery said aloud');

  console.log('== 4. defense + trade calls answerable; favor repaid AFTER, not instantly ==');
  cov.pendingDefense = { day: Game.state.scholar.day };
  const dday = Game.state.scholar.day;
  const dres = Game.answerDefenseCall(cov.id, 'send');
  ok(dres === 'sent', 'defense call answered: send');
  const dparty = (Game.mshipState().awayParties || []).find(p => p.kind === 'defense');
  ok(!!dparty && dparty.untilDay === dday + 3, 'defense party really away 3 days');
  ok(!cov.pendingDefense, 'pendingDefense cleared');
  C.opinion = 80;
  let trd = Game.proposeTrade(C.id);
  if (trd === 'counter') { Game.answerCounter('accept'); trd = Game.linkWith(C.id); }
  ok(trd && trd.kind === 'trade', 'proposeTrade forms a charter');
  trd.pendingTradeCall = { day: Game.state.scholar.day };
  const tday = Game.state.scholar.day;
  const repaidBefore = pantryHas(/Favor repaid/);
  const tres = Game.answerTradeCall(trd.id, 'send');
  ok(tres === 'sent', 'trade call answered: priced favor');
  ok(pantryHas(/Favor repaid/) === repaidBefore, '1,500 kcal NOT in the pantry instantly ("repaid after" is honest now)');
  Game.state.scholar.day = tday + 3;
  Game.membershipDaily();
  ok(pantryHas(/Favor repaid/), 'the favor comes home WITH the party: 1,500 kcal repaid, real food');

  console.log('== 5. crisis answerable; refuse paths priced ==');
  cov.pendingCovenantCrisis = { why: 'strain', day: Game.state.scholar.day };
  cov.trust = 50;
  const cres = Game.answerCovenantCrisis(cov.id, 'hold');
  ok(cres === 'held' && cov.trust === 40, 'crisis held: trust -10, league holds');
  ok(!cov.pendingCovenantCrisis, 'pendingCovenantCrisis cleared');

  console.log('== 6. council verbs refuse the road ==');
  // use a genuinely unlinked village: linked ones refuse for their own
  // reasons, which would make the guard test pass spuriously.
  const D = ovs().find(v => v.id !== A.id && v.id !== B.id && v.id !== C.id && !Game.linkWith(v.id));
  if (!D) { console.log('  SKIP no unlinked village for exile-guard test'); }
  else {
    D.opinion = 80; // courted: the proposal WOULD land without the guard
    Game.state.scholar.exiled = true;
    const pc0 = Game.proposeCovenant(D.id);
    ok(pc0 == null && !Game.linkWith(D.id) && !Game.state.pendingCounter, 'exile cannot propose a covenant for Haven (no link, no counter staged)');
    ok(Game.raidVillage(D.id) == null && !Game.state.pendingRaid, 'exile cannot muster Haven\'s war party');
    ok(Game.drawLeaguePool(1000) == null, 'exile cannot draw the league granary');
    ok(saidHas(/doesn.t take orders from the road|isn.t yours to pledge/), 'refusal said aloud, honestly');
    Game.state.scholar.exiled = false;
    // control: the same verbs work for a member in good standing
    const ctl = Game.proposeCovenant(D.id);
    ok(ctl != null || !!Game.state.pendingCounter || !!Game.linkWith(D.id), 'control: un-exiled scholar can propose (guard is standing-based)');
    // muster, then exile: the muster dissolves, nothing strands
    const E = ovs().find(v => v.id !== D.id && !Game.linkWith(v.id));
    if (E) {
      Game.raidVillage(E.id);
      ok(!!Game.state.pendingRaid, 'muster live before exile');
      Game.exilePlayer('test');
      ok(!Game.state.pendingRaid, 'exile dissolves the muster — no stranded pendingRaid');
      ok(Game.state.scholar.exiled === true, 'exile took');
    } else { console.log('  SKIP no fifth village for exile-muster test'); }
  }

  console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
