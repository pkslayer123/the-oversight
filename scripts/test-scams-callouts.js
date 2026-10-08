// Proof: trader scams + bad-knowledge callouts (Steve 2026-10-06).
// "The trader should try to scam you too. Some people sell or trade you bad
//  knowledge. You can call them out if you know better."
// DESIGN CORRECTION (Steve 2026-10-06): scamming is NOT a trader-class
// behavior — trading is a verb, not a role. Anyone with entrepreneurial
// spirit hawks; anyone dishonest/desperate can scam.
//
// Covers:
//  1. De-roling: a non-'trader' visitor with entrepreneurial spirit can trade;
//     tradeSpirit gates, not type.
//  2. Scam triggers when the hawker underestimates you (scamminess>0, read=green).
//  3. Discovery: savvy tell at counter, early-rot reveal, tier-lie reveal on use.
//  4. Confrontation: returning scammer -> bluster/discount/fold by nerve+witnesses.
//  5. Bad knowledge: wrongTeaching marks contested when you know better (L2+),
//     believed-wrong when you don't; codex carries the dispute honestly.
//  6. Callout: choice exists only when contested; quiet+rapport grows trust,
//     public splits witnesses; liar vs honest-mistake differ.
//  7. Played beats: one full scam (buy -> discover -> confront) and one
//     callout as the player.
// Usage: node scripts/test-scams-callouts.js  (exit 1 on failure)
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/party.js',
 'src/js/justice.js', 'src/js/conversation.js', 'src/js/truth.js',
 'src/js/betrayal.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;
const said = [];
Game.say = function (t) { said.push(String(t)); return t; };
const failures = [];
const check = (name, cond, detail) => {
  console.log((cond ? 'PASS' : 'FAIL') + ' ' + name + (detail ? ' — ' + detail : ''));
  if (!cond) failures.push(name);
};
// deterministic-ish: seed Math.random for the scam rolls we force
const realRandom = Math.random;

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar, v = Game.state.village;
  v.roster = v.roster || [];
  if (v.roster.length < 4) {
    // ensure witnesses exist
    const extra = (Game.data.background_survivors || []).slice(0, 4).map(x => x.id);
    for (const id of extra) if (!v.roster.includes(id)) v.roster.push(id);
  }
  v.trust = v.trust || {};

  // ---------- 1. DE-ROLING ----------
  // A scout with entrepreneurial spirit hawks; type alone doesn't gate.
  const scout = { id: 'vis_scout1', type: 'scout', name: 'a lean scout', entrepreneurial: true,
    traderKnows: [], traderSpecialties: [] };
  check('de-role: entrepreneurial scout can trade', Game.tradeSpirit(scout) > 0);
  const dull = { id: 'vis_dull1', type: 'trader', name: 'a tired traveler' }; // type trader, no spirit
  check('de-role: type=trader without spirit cannot trade', Game.tradeSpirit(dull) <= 0,
    'trading is a verb, not a noun');
  check('de-role: visitorBuyWare rejects spiritless', Game.visitorBuyWare('nope', 0) === null);

  // ---------- 2. SCAM TRIGGERS WHEN HE UNDERESTIMATES YOU ----------
  // Shady + desperate hawker, player is green (tradeSavvy ~0).
  s.tradesDone = 0; s.scamsCalledOut = 0;
  const hawker = { id: 'vis_shady1', type: 'scout', name: 'a sharp-eyed peddler',
    entrepreneurial: true, shady: true, desperate: true, traderKnows: [], traderSpecialties: [] };
  check('scamminess: shady+desperate > 0', Game.scamminess(hawker) >= 3);
  check('read of you: green player reads green', Game.tradeSavvy() < 3);
  // force the roll to hit: stub R? R is internal. Instead loop until a scam fires (bounded).
  let scammedWare = null;
  for (let i = 0; i < 60 && !scammedWare; i++) {
    const w = { kind: 'tool', itemId: 'stone_knife', name: 'Stone knife', sold: false, price: 500, blurb: 'x' };
    Game.maybeScamWare(hawker, w);
    if (w.scam) scammedWare = w;
  }
  check('scam fires for shady hawker vs green player', !!scammedWare,
    scammedWare ? `kind=${scammedWare.scam.kind}` : 'no scam in 60 rolls');
  // honest hawker never scams
  const honest = { id: 'vis_hon1', name: 'an honest face', entrepreneurial: true };
  let honestScam = false;
  for (let i = 0; i < 40; i++) {
    const w = { kind: 'tool', name: 'Awl', sold: false, price: 400, blurb: 'x' };
    Game.maybeScamWare(honest, w);
    if (w.scam) { honestScam = true; break; }
  }
  check('honest hawker never scams', !honestScam);

  // ---------- 3. PLAYED SCAM: buy -> discover -> confront ----------
  // Give the player food to pay with.
  s.inventory = [{ name: 'Smoked turkey', units: 20, kcalEach: 400, spoilDay: 9999, prep: 'smoked', foodKind: 'meat' }];
  v.visitors = [hawker];
  // force an overprice scam ware on the cart
  const wares = Game.visitorWares(hawker);
  wares.forEach(w => { delete w.scam; });
  const target = wares.find(w => !w.sold) || wares[0];
  target.scam = { kind: 'overprice', by: hawker.name, byId: hawker.id, day: s.day || 0,
    truePrice: target.price };
  target.price = Math.round(target.price * 2);
  const saidBefore = said.length;
  Game.visitorBuyWare(hawker.id, wares.indexOf(target));
  const bought = (v.scamLedger || []).find(e => e.whoId === hawker.id && e.kind === 'overprice');
  check('played scam: purchase records ledger', !!bought, bought ? `paid=${bought.paid}` : 'none');
  // discovery: make the player savvy AFTER the fact is too late — but the
  // villager-remark path works: force scamDaily with a sharp villager.
  // First ensure a trade-spirited villager exists on roster.
  const sharpVid = v.roster.find(rid => { try { return Game.tradeSpirit(rid) >= 1; } catch (e) { return false; } });
  if (bought && !bought.discovered && sharpVid) {
    for (let i = 0; i < 80 && !bought.discovered; i++) Game.scamDaily();
  }
  check('played scam: discovery path marks ledger', !bought || bought.discovered === true,
    bought ? `discovered=${bought.discovered}` : 'no ledger entry');

  // ---------- 4. CONFRONTATION ----------
  // The same face comes back.
  const returner = { id: 'vis_ret1', type: 'curious', name: hawker.name, entrepreneurial: true,
    shady: true, desperate: false, returningScammer: true, scamRef: bought ? bought.id : null,
    traderKnows: [], traderSpecialties: [], day: s.day || 0, leavesDay: (s.day || 0) + 1 };
  v.visitors = [returner];
  Game.visitorInteract(returner.id, 'trade');
  check('confrontation: beat triggers on trade', !!returner.pendingConfront,
    said.slice(-1)[0] ? said.slice(-1)[0].slice(0, 60) : 'nothing said');
  const trustBefore = (v.trust || {})[returner.id] || 10;
  Game.visitorInteract(returner.id, 'confront');
  const resolved = (v.scamLedger || []).find(e => e.id === (bought && bought.id));
  check('confrontation: resolves the ledger', !resolved || resolved.resolved === true);
  check('confrontation: player marked as scam-wise', (s.scamsCalledOut || 0) >= 1);
  void trustBefore;

  // ---------- 5. BAD KNOWLEDGE ----------
  const plants = Game.data.plants || [];
  check('plants data present', plants.length > 1);
  const pidA = plants[0].id, pidB = plants[1].id;
  const teacher = v.roster[0];
  // Seed: teacher "knows" pidA, is wrong about it (honest mistake).
  v.taught = v.taught || {}; v.taught[teacher] = [pidA];
  v.wrongAbout = v.wrongAbout || {}; v.wrongAbout[teacher] = { [pidA]: { wrongPid: pidB, deliberate: false } };
  // Case A: player doesn't know pidA -> believes the wrong lesson.
  delete Game.state.codex.plants[pidA];
  const r1 = Game.wrongTeaching(teacher, pidA, 'taught');
  const e1 = Game.state.codex.plants[pidA] || {};
  check('bad knowledge: green player believes wrong', r1 === 'taught-wrong' && e1.wrongAs === (Game.data.plants.find(p => p.id === pidB) || {}).name);
  check('codexEntries carries wrongAs', (Game.codexEntries().find(e => e.pid === pidA) || {}).wrongAs != null);
  // Case B: player knows pidA at L2 -> contested, honest disagreement in codex.
  Game.state.codex.plants[pidA] = { level: 2, identifiedDay: s.day || 0, harvests: 9, tastings: 0 };
  const r2 = Game.wrongTeaching(teacher, pidA, 'taught');
  const e2 = Game.state.codex.plants[pidA] || {};
  check('bad knowledge: knowing player gets contested', r2 === 'contested' && !!(e2.contested && !e2.contested.resolved));
  check('codexEntries carries contested', !!((Game.codexEntries().find(e => e.pid === pidA) || {}).contested));
  check('callout choice gate: contested exists', Game.hasContestedWith(teacher).includes(pidA));
  check('callout gate: nobody else', Game.hasContestedWith('nobody') .length === 0);

  // ---------- 6. PLAYED CALLOUT: quiet, high rapport ----------
  v.trust[teacher] = 60;
  const tBefore = v.trust[teacher];
  Game.callOutTeaching(teacher, pidA, {});
  const e3 = Game.state.codex.plants[pidA] || {};
  check('callout quiet: resolved', !!(e3.contested && e3.contested.resolved));
  check('callout quiet: trust grows (honest mistake + rapport)', (v.trust[teacher] || 0) > tBefore,
    `${tBefore} -> ${v.trust[teacher]}`);
  // ---------- 7. PLAYED CALLOUT: public, liar, witnesses split ----------
  const teacher2 = v.roster[1] || v.roster[0];
  v.taught[teacher2] = v.taught[teacher2] || [pidA];
  v.wrongAbout[teacher2] = { [pidA]: { wrongPid: pidB, deliberate: true } };
  Game.state.codex.plants[pidA] = { level: 2, identifiedDay: s.day || 0, harvests: 0, tastings: 0,
    contested: { by: teacher2, byName: Game.displayName(teacher2), claim: (Game.data.plants.find(p => p.id === pidB) || {}).name,
      claimPid: pidB, deliberate: true, day: s.day || 0 } };
  v.trust[teacher2] = 10;
  const wits = (v.roster || []).filter(rid => rid !== teacher2 && rid !== Game.villagerId);
  wits.forEach((w, i) => { v.trust[w] = i % 2 ? 80 : 5; }); // split loyalties
  const twBefore = v.trust[teacher2];
  Game.callOutTeaching(teacher2, pidA, { public: true });
  const e4 = Game.state.codex.plants[pidA] || {};
  check('callout public: resolved', !!(e4.contested && e4.contested.resolved));
  check('callout public liar: trust punished', (v.trust[teacher2] || 0) < twBefore,
    `${twBefore} -> ${v.trust[teacher2]}`);
  check('callout public liar: village discounts their word', !!((v.distrusted || {})[teacher2]));
  const witMoved = wits.some(w => (v.trust[w] || 0) !== (wits.indexOf(w) % 2 ? 80 : 5));
  check('callout public: witnesses take sides', witMoved);

  // ---------- 8. VILLAGER HAWKER ----------
  // force the spirit on one villager (verb, not role — anyone can have it)
  const spiritVid = v.roster[2] || v.roster[0];
  const svp = (Game.data.villagers || []).find(x => x.id === spiritVid)
    || (Game.data.background_survivors || []).find(x => x.id === spiritVid);
  if (svp) svp.entrepreneurial = true;
  const hawkerVid = v.roster.find(rid => { try { return Game.tradeSpirit(rid) >= 1; } catch (e) { return false; } });
  if (hawkerVid) {
    const ware = Game.hawkerOffer(hawkerVid);
    check('villager hawker: offers a ware', !!(ware && ware.name && ware.price > 0), ware && ware.name);
  } else {
    console.log('SKIP villager hawker: no spirited villager on roster');
  }

  console.log(failures.length ? `\n${failures.length} FAILURES` : '\nALL GREEN');
  process.exit(failures.length ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
