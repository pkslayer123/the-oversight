#!/usr/bin/env node
// NATIONAL SHAPES PROOF (2026-10-10):
// Steve approved all six national shapes 2026-10-10 (docs/PROGRESSION.md
// section 4 + [NEEDS-STEVE] item 1). hierarchy.js previously supported only
// LEAD and BELONG. This proves the four new shapes:
//   1. COVENANT (confederate as equals) — peer league, no primary: mutual
//      defense + shared pool, council votes played, any member can trigger
//      a succession-style crisis.
//   2. TRADE (trade league) — pooled routes, tariff income (real food),
//      no mutual defense obligation (refusals said aloud).
//   3. CONQUEST — raid-to-subjugate: real casualties, hatred, tribute under
//      duress, rebellion risk; distinct from courtship primacy bids.
//   4. REFUSE — a played, permanent refusal of the scale: keeps all tribute
//      (real benefit), costs the x1.25 logistics + the coalition + the table
//      (real costs; wave-5 gate stays locked — coalition-or-death honest).
// Each shape: reachable + beat fires (played, never a threshold flip) +
// scaleRank() reads correctly + wave-5 gate (unlockedWave) and deed-gate
// scale bar (deedGateReady().scale) integrate.
// Run: SEED=11 node scripts/test-national-shapes-20261010.js (also 222, 3333)
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
  'src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
  'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
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

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  try { Game.depart(); } catch (e) {}

  // the ladder proof needs villages; synthesize extras (cloned shape, unique
  // id) — test setup only, no game code involved.
  while (Game.state.otherVillages.filter(v => v && v.id !== 'haven').length < 7) {
    const base = Game.state.otherVillages.filter(v => v && v.id !== 'haven');
    const t = Object.assign({}, base[base.length - 1]);
    const n = base.length;
    t.id = 'village_nat' + n; t.name = 'Natmere' + n; t.x = (t.x + 3 * n) % 9;
    t.generated = true; t.rumored = false; t.opinion = 0;
    Game.state.otherVillages.push(t);
  }
  const ovs = (Game.state.otherVillages || []).filter(v => v && v.id !== 'haven');
  ovs.forEach(v => { v.generated = true; v.opinion = 0; });
  const stock = (kcal) => { Game.state.village.pantry = Game.state.village.pantry || []; Game.state.village.pantry.push({ name: 'test grain', kcalEach: kcal, units: 1, spoilDay: 9999 }); };
  const pantryKcal = () => (Game.state.village.pantry || []).reduce((a, it) => a + (it.kcalEach || 0) * (it.units || 0), 0);
  const mkPeer = (vid, kind) => Game._formPeerLink(vid, { kind: kind });
  const mkVassal = (vid, conquered) => {
    const l = Game._formLink(vid, { asSubordinate: false, tributeKcalPerWeek: 4000 }, null);
    if (conquered) { l.conquered = true; l.trust = 15; l.tributeKcalPerWeek = 7000; }
    return l;
  };
  function resetPolity() {
    Game.hierarchyState().forEach(l => { l.status = 'broken'; });
    Game.state.nationalLive = false; Game.state.globalLive = false;
    Game.state.pendingNational = null; Game.state.pendingCounter = null;
    Game.state.pendingRaid = null; Game.state.pendingAccord = null;
    Game.state.scaleRefused = false; Game.state._natDefer = {};
    Game.state.leaguePoolKcal = 0; Game.state._leaguePoolWeek = -999;
    Game.state.covenantAway = null; Game.state.tradeAway = null; Game.state.raidParty = null;
    try { Game.state.networkLive = true; } catch (e) {}
  }
  const wave5Ready = () => { Game.state.waveKills = { 4: 5 }; return Game.unlockedWave() === 5; };

  console.log(`[seed ${SEED}] villages: ${ovs.map(v => v.name || v.id).slice(0, 8).join(', ')}`);

  // ================= A: COVENANT (confederate as equals) =================
  console.log('A: COVENANT — league of equals');
  resetPolity();
  const [cA, cB, cC] = ovs;
  // played proposal path: courtship (opinion 100) earns the accept band
  Game._nudgeOpinion(cA.id, 100);
  says.length = 0;
  const covA = Game.proposeCovenant(cA.id);
  ok(!!covA && covA.kind === 'covenant', 'proposeCovenant accepts on earned courtship (played, not rolled)');
  ok(covA.primary === null && covA.subordinate === null && covA.a === 'haven', 'peer link has no primary/subordinate');
  ok(saidHas(/no primary, no kneeling/), 'covenant copy says the shape aloud');
  // counter band: stage directly, answer played
  says.length = 0;
  ok(Game._stagePeerCounter(cB.id, { kind: 'covenant' }, null) === 'counter', 'counter staged for the middle band');
  ok(Game.state.pendingCounter && Game.state.pendingCounter.kind === 'covenant', 'counter carries the peer kind');
  const covB = Game.answerCounter('accept');
  ok(!!covB && covB.kind === 'covenant' && covB.poolKcalPerWeek === 2500, 'counter accepted at THEIR terms (2,500 pool share)');
  const covC = mkPeer(cC.id, 'covenant');
  // no knowledge gate: an unheard-of village can still be bound
  const unknown = ovs[6];
  unknown.generated = false; unknown.rumored = false;
  const covU = Game._formPeerLink(unknown.id, { kind: 'covenant' });
  ok(!!covU, 'peer links are never knowledge-gated');
  covU.status = 'broken'; // keep the polity at 3 for the beat
  // the beat
  says.length = 0;
  Game.hierarchyDaily();
  const pnA = Game.state.pendingNational;
  ok(!!pnA && pnA.shape === 'covenant', `national beat staged with shape=covenant (got ${pnA && pnA.shape})`);
  ok(saidHas(/NO head/) && saidHas(/REFUSE the scale/), 'Founding Council copy fired + refuse offered');
  ok(Game.scaleRank() === 'regional', 'rank regional until the beat is answered');
  const tA0 = covA.trust;
  stock(30000);
  ok(Game.answerNationalChoice('pact') === true, 'council answered: pact');
  ok(Game.state.nationalLive === true && Game.scaleRank() === 'national', 'nationalLive set; rank national via COVENANT');
  ok(covA.warOath && covA.poolLive, 'war-pact + pool live after the founding');
  ok(covA.trust === Math.min(100, tA0 + 8), 'pact trust bump (+8)');
  // wave-5 + deed-gate integration
  ok(wave5Ready(), 'wave-5 gate opens on covenant national (kills + scale, never calendar)');
  ok(Game.deedGateReady().scale === true, 'deed gate scale bar reads covenant national');
  ok(Game.scaleAtLeast(Game.scaleRank(), 'national'), 'scaleAtLeast agrees');
  // shared pool: real food in, real food out
  const poolBefore = Game.leaguePool();
  Game.state._leaguePoolWeek = -999;
  stock(10000);
  const panBefore = pantryKcal();
  Game.covenantTick(covA);
  ok(Game.leaguePool() > poolBefore, `pool grew with real food (was ${poolBefore}, now ${Game.leaguePool()})`);
  ok(pantryKcal() < panBefore, 'Haven\'s pool share left the pantry (real cost)');
  const drawPool = Game.leaguePool();
  const drew = Game.drawLeaguePool(3000);
  ok(drew > 0 && drew <= drawPool, `drawLeaguePool moves real kcal (${drew})`);
  ok(Game.state.village.pantry.some(it => /League granary draw/.test(it.name || '')), 'draw arrives as a real pantry item');
  // mutual defense: send
  covA.pendingDefense = { day: 0 };
  says.length = 0;
  const tD0 = covA.trust;
  ok(Game.answerDefenseCall(covA.id, 'send') === 'sent', 'defense call answered: sent');
  ok(!!Game.state.covenantAway && Game.state.covenantAway.vids.length === 2, 'two villagers away 3 days (real absence)');
  ok(covA.trust === Math.min(100, tD0 + 8), 'answering the call: trust +8');
  // mutual defense: refuse aloud, league-wide cost
  covA.pendingDefense = { day: 0 };
  const tLs = Game._peerLinks('covenant').map(l => l.trust);
  says.length = 0;
  ok(Game.answerDefenseCall(covA.id, 'refuse') === 'refused', 'defense call refused aloud');
  ok(saidHas(/aloud/), 'refusal is said aloud');
  ok(Game._peerLinks('covenant').every((l, i) => l.trust === Math.max(0, tLs[i] - 10)), 'refusal costs trust league-wide (-10)');
  // crisis: any member can trigger — concede / hold / release, all played.
  // (a reactive crisis may already have fired during the daily tick — that
  // itself is member-triggered reactivity. Reset for a deterministic proof.)
  covB.pendingCovenantCrisis = null; covB.trust = 50;
  says.length = 0;
  ok(Game.covenantCrisis(covB.id, 'strain') === 'crisis', 'covenant crisis staged (played)');
  ok(saidHas(/CONCEDE/), 'crisis copy offers concede/hold/release');
  const day0 = Game.state.scholar.day || 0;
  ok(Game.answerCovenantCrisis(covB.id, 'concede') === 'conceded', 'crisis conceded');
  ok(covB.concessionUntil === day0 + 28, 'concession: pool share halves 4 weeks');
  ok(Game.covenantCrisis(covB.id, 'strain') === 'crisis', 'crisis again');
  covB.trust = 60;
  ok(Game.answerCovenantCrisis(covB.id, 'hold') === 'held', 'hold at decent trust: the league holds');
  covB.trust = 25;
  Game.covenantCrisis(covB.id, 'strain');
  ok(Game.answerCovenantCrisis(covB.id, 'hold') === 'seceded', 'hold at low trust: they secede');
  ok(covB.status === 'broken', 'secession breaks the link');
  Game.covenantCrisis(covC.id, 'strain');
  ok(Game.answerCovenantCrisis(covC.id, 'release') === 'released', 'release lets them walk with honor');
  ok(covC.status === 'broken', 'release breaks the link');

  // ================= B: TRADE (trade league) =================
  console.log('B: TRADE — pooled routes, tariff income, no swords');
  resetPolity();
  const [tA, tB, tC] = [ovs[0], ovs[1], ovs[2]];
  // played proposal path
  Game._nudgeOpinion(tA.id, 100);
  const trA = Game.proposeTrade(tA.id);
  ok(!!trA && trA.kind === 'trade', 'proposeTrade accepts on earned courtship');
  ok(saidHas(/no mutual defense/), 'charter copy states the no-defense clause aloud');
  const trB = mkPeer(tB.id, 'trade');
  const trC = mkPeer(tC.id, 'trade');
  // bargain inputs: one friendly fire, two cold
  Game._nudgeOpinion(tA.id, 0); // already 100 from above
  const ovB = Game.state.otherVillages.find(v => v.id === tB.id); ovB.opinion = 0;
  const ovC = Game.state.otherVillages.find(v => v.id === tC.id); ovC.opinion = 0;
  says.length = 0;
  Game.hierarchyDaily();
  const pnB = Game.state.pendingNational;
  ok(!!pnB && pnB.shape === 'trade', `national beat staged with shape=trade (got ${pnB && pnB.shape})`);
  ok(saidHas(/charter/) && saidHas(/REFUSE the scale/), 'Charter copy fired + refuse offered');
  ok(Game.answerNationalChoice('bargain') === true, 'charter answered: bargain (played negotiation)');
  ok(Game.state.nationalLive === true && Game.scaleRank() === 'national', 'rank national via TRADE');
  ok(trA.tariffRate === 1500 && trB.tariffRate === 1000 && trC.tariffRate === 1000,
     `bargain answered per-fire by opinion (1500/1000/1000, got ${trA.tariffRate}/${trB.tariffRate}/${trC.tariffRate})`);
  ok(saidHas(/split table/), 'split table said aloud');
  ok(wave5Ready(), 'wave-5 gate opens on trade national');
  ok(Game.deedGateReady().scale === true, 'deed gate scale bar reads trade national');
  // tariff income: real food in, upkeep real food out
  // (note: _removePantryKcal sorts the pantry by spoilDay, so new items
  // don't land at the end — count matches instead of slicing)
  try { Game.mshipState().lastLinkWeek = -999; } catch (e) {}
  const tariffBefore = Game.state.village.pantry.filter(it => /Route tariff/.test(it.name || '')).length;
  Game.linkTick();
  const tariffs = Game.state.village.pantry.filter(it => /Route tariff/.test(it.name || ''));
  const tariff = tariffs[tariffs.length - 1];
  ok(tariffs.length > tariffBefore, 'tariff income arrives as a real pantry item');
  ok(tariffs.some(t => t.kcalEach === 1500), `bargained tariff pays 1500 (got [${tariffs.map(t => t.kcalEach).join(',')}])`);
  // no mutual defense: refuse aloud is allowed
  trA.pendingTradeCall = { day: 0 };
  says.length = 0;
  const tT0 = trA.trust;
  ok(Game.answerTradeCall(trA.id, 'refuse') === 'refused', 'trade help request refused aloud');
  ok(saidHas(/no mutual defense/) || saidHas(/charter backs it/), 'refusal cites the charter, aloud');
  ok(trA.trust === Math.max(0, tT0 - 4), 'charter refusal costs only -4 (the terms allowed it)');
  // ...or send help as a priced favor
  trA.pendingTradeCall = { day: 0 };
  const panF = Game.state.village.pantry.length;
  ok(Game.answerTradeCall(trA.id, 'send') === 'sent', 'help sent as a priced favor');
  const favor = Game.state.village.pantry.slice(panF).find(it => /Favor repaid/.test(it.name || ''));
  ok(!!favor && favor.kcalEach === 1500, 'favor repaid: 1,500 kcal real food');
  // trade crisis, covenant-style
  Game.covenantCrisis(trB.id, 'strain');
  ok(Game.answerCovenantCrisis(trB.id, 'concede') === 'conceded', 'charter crisis conceded');
  ok(trB.tariffRate === 750, `concession cuts the tariff (1000 -> ${trB.tariffRate})`);

  // ================= C: CONQUEST =================
  console.log('C: CONQUEST — raid to subjugate');
  resetPolity();
  const [qA, qB, qC] = [ovs[3], ovs[4], ovs[5]];
  // muster + withdraw (played)
  says.length = 0;
  ok(Game.raidVillage(qA.id) === true, 'war party musters (played beat)');
  ok(!!Game.state.pendingRaid && saidHas(/WITHDRAW/), 'raid beat staged with strike/terms/withdraw');
  const opA0 = (Game.state.otherVillages.find(v => v.id === qA.id).opinion || 0);
  ok(Game.answerRaid('withdraw') === 'withdrawn', 'withdraw stands the party down');
  ok((Game.state.otherVillages.find(v => v.id === qA.id).opinion || 0) === opA0 - 10, 'withdraw costs face (opinion -10)');
  // strike: blood and fire
  ok(Game.raidVillage(qA.id) === true, 'muster again');
  says.length = 0;
  const slink = Game.answerRaid('strike');
  ok(!!slink && slink.conquered === true, 'strike subjugates: conquered link');
  ok(slink.trust === 15 && slink.tributeKcalPerWeek === 7000, 'duress terms: trust 15, tribute 7,000');
  ok((Game.state.otherVillages.find(v => v.id === qA.id).opinion || 0) <= -40, 'hatred: opinion -40');
  ok(Game.state.village.pantry.some(it => /Raid spoils/.test(it.name || '')), 'loot arrives as real food');
  ok(!!Game.state.raidParty && Game.state.raidParty.vids.length >= 2, 'raiders away 3 days (real absence)');
  ok(saidHas(/said plainly/), 'blood cost said aloud');
  // terms: the strong yield without blood (distinct from courtship climb)
  ok(Game.raidVillage(qB.id) === true, 'muster against a second fire');
  const rTerms = Game.answerRaid('terms');
  if (rTerms === 'refused') {
    ok(Game.answerRaid('strike').conquered === true, 'refused terms -> strike still subjugates');
  } else {
    ok(!!rTerms && rTerms.conquered === true && rTerms.trust === 25, 'strong Haven: they yield without blood (trust 25, lighter yoke)');
  }
  const qCLink = mkVassal(qC.id, true); // third conquered fire (setup)
  ok(Game.polityOf('haven') && Game.polityOf('haven').shape === 'conquest', 'polityOf reads the war-realm (shape=conquest)');
  // the Iron Court
  says.length = 0;
  Game.hierarchyDaily();
  const pnC = Game.state.pendingNational;
  ok(!!pnC && pnC.shape === 'conquest', `national beat staged with shape=conquest (got ${pnC && pnC.shape})`);
  ok(saidHas(/Iron Court/) && saidHas(/REFUSE the scale/), 'Iron Court copy fired + refuse offered');
  const conqueredLinks = Game.hierarchyState().filter(l => l.status === 'active' && l.primary === 'haven' && l.conquered);
  ok(conqueredLinks.length >= 3, `war-realm holds ${conqueredLinks.length} conquered fires`);
  const yokeT = conqueredLinks.map(l => l.tributeKcalPerWeek);
  // mercy branch (tested on a copy of the setup via direct beat re-stage)
  ok(Game.answerNationalChoice('mercy') === true, 'iron court answered: mercy');
  ok(Game.state.nationalLive === true && Game.scaleRank() === 'national', 'rank national via CONQUEST');
  ok(conqueredLinks.every(l => l.conquered === false && l.tributeKcalPerWeek === 4000), 'mercy: yoke eased, courtship terms (4,000)');
  ok(wave5Ready(), 'wave-5 gate opens on conquest national');
  ok(Game.deedGateReady().scale === true, 'deed gate scale bar reads conquest national');
  // rebellion: a conquered fire at low trust sabotages or revolts (reactive)
  resetPolity();
  const rL = mkVassal(ovs[3].id, true);
  rL.trust = 10;
  says.length = 0;
  let rebelled = false;
  for (let w = 0; w < 120 && !rebelled; w++) {
    try { Game.mshipState().lastLinkWeek = -999; } catch (e) {}
    Game.linkTick();
    rebelled = rL.status === 'broken' || saidHas(/lost on the road/);
  }
  ok(rebelled, 'low-trust conquered fire sabotages tribute or revolts (reactive, not scheduled)');
  // yoke branch
  resetPolity();
  const y1 = mkVassal(ovs[3].id, true), y2 = mkVassal(ovs[4].id, true), y3 = mkVassal(ovs[5].id, true);
  Game.hierarchyDaily();
  ok(Game.state.pendingNational && Game.state.pendingNational.shape === 'conquest', 'iron court staged again');
  ok(Game.answerNationalChoice('yoke') === true, 'iron court answered: yoke');
  ok(y1.tributeKcalPerWeek === Math.round(7000 * 1.1) && y1.trust === Math.max(0, 15 - 12), 'yoke: tribute +10%, trust -12');
  ok(Game.scaleRank() === 'national', 'rank national via the yoke');
  // release branch
  resetPolity();
  mkVassal(ovs[3].id, true); mkVassal(ovs[4].id, true); mkVassal(ovs[5].id, true);
  Game.hierarchyDaily();
  ok(Game.answerNationalChoice('release') === 'released', 'iron court answered: release');
  ok(Game.state.nationalLive === false, 'release dissolves the realm — no national');
  ok(Game.hierarchyState().filter(l => l.status === 'active' && l.primary === 'haven').length === 0, 'all conquered links broken');

  // ================= D: REFUSE THE SCALE =================
  console.log('D: REFUSE — the sixth road');
  resetPolity();
  const sL1 = Game._formLink(ovs[0].id, { asSubordinate: false, tributeKcalPerWeek: 4000 }, null);
  Game._formLink(ovs[1].id, { asSubordinate: false, tributeKcalPerWeek: 4000 }, null);
  Game._formLink(ovs[2].id, { asSubordinate: false, tributeKcalPerWeek: 4000 }, null);
  says.length = 0;
  Game.hierarchyDaily();
  ok(!!Game.state.pendingNational && Game.state.pendingNational.shape === 'lead', 'lead beat staged (the offer)');
  ok(Game.answerNationalChoice('refuse') === 'refused', 'refuse: played, permanent');
  ok(Game.state.scaleRefused === true && Game.state.nationalLive === false, 'scaleRefused set; nationalLive never set');
  ok(Game.scaleRank() === 'regional', 'rank stays regional — honestly');
  ok(saidHas(/never ×1\.25/) && saidHas(/walks it alone/), 'costs + benefits both said aloud');
  says.length = 0;
  Game.hierarchyDaily();
  ok(!Game.state.pendingNational, 'the offer never returns after refusal');
  // coalition-or-death stays honest: wave-5 locked, deed-gate scale bar false
  Game.state.waveKills = { 4: 5 }; Game.state.scholar.day = 30; Game.state.waveKills[2] = 8;
  ok(Game.unlockedWave() < 5, `wave-5 stays locked at regional (unlockedWave=${Game.unlockedWave()})`);
  ok(Game.deedGateReady().scale === false, 'deed gate scale bar false after refusal');
  // no x1.25 logistics without national
  sL1.trust = 100;
  try { Game.mshipState().lastLinkWeek = -999; } catch (e) {}
  const panR = Game.state.village.pantry.length;
  Game.linkTick();
  const tribR = Game.state.village.pantry.slice(panR).find(it => /Tribute grain from/.test(it.name || ''));
  ok(!!tribR && tribR.kcalEach === 4000, `tribute arrives whole, no x1.25 (got ${tribR && tribR.kcalEach})`);
  // but the relationships survive refusal (bilateral, not burned)
  ok(sL1.status === 'active', 'refusal keeps the bilateral links — only the polity is refused');

  // ================= E: walk defers one shape, not the scale =================
  console.log('E: walking a league table defers that shape');
  resetPolity();
  mkPeer(ovs[0].id, 'covenant'); mkPeer(ovs[1].id, 'covenant'); mkPeer(ovs[2].id, 'covenant');
  Game.hierarchyDaily();
  ok(!!Game.state.pendingNational && Game.state.pendingNational.shape === 'covenant', 'covenant beat staged');
  const dayE = Game.state.scholar.day || 0;
  ok(Game.answerNationalChoice('walk') === 'deferred', 'walk defers the covenant table');
  ok(Game.state._natDefer.covenant === dayE + 14, 'defer recorded (14 days)');
  Game.hierarchyDaily();
  ok(!Game.state.pendingNational, 'no re-stage while deferred');
  Game.state.scholar.day = dayE + 15;
  Game.hierarchyDaily();
  ok(!!Game.state.pendingNational && Game.state.pendingNational.shape === 'covenant', 'offer returns after the defer');

  // ================= F: priority — lead outranks the leagues =================
  console.log('F: shape priority');
  resetPolity();
  mkPeer(ovs[0].id, 'covenant'); mkPeer(ovs[1].id, 'covenant'); mkPeer(ovs[2].id, 'covenant');
  Game._formLink(ovs[3].id, { asSubordinate: false, tributeKcalPerWeek: 4000 }, null);
  Game._formLink(ovs[4].id, { asSubordinate: false, tributeKcalPerWeek: 4000 }, null);
  Game._formLink(ovs[5].id, { asSubordinate: false, tributeKcalPerWeek: 4000 }, null);
  Game.hierarchyDaily();
  ok(!!Game.state.pendingNational && Game.state.pendingNational.shape === 'lead', 'lead beats covenant in priority (documented)');

  console.log(failures === 0 ? `\nALL GREEN (seed ${SEED})` : `\n${failures} FAILURES (seed ${SEED})`);
  process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error('HARNESS ERROR:', e); process.exit(2); });
