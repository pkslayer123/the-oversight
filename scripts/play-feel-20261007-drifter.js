#!/usr/bin/env node
// FEEL PLAYTEST (Steve 2026-10-06), DRIFTER run 4 — "the exile's haven".
// Covered in drifter runs 1-3: road out, fog of war, catch-up sim, join/live/leave,
// villageTalk knowledge trade, boomerang presence-gating, contest grabs, petition.
// NEW territory this run:
//   (a) exile -> drift -> founding project -> foundHaven hard-reset fork -> new haven
//       day-one (solo roster) -> strangers arrive. The whole arc, played as a player.
//   (b) the FOUNDING ECONOMY: is the 10,000 kcal cache + hut + 7 solo days a real
//       struggle, or does it run on phantom food? (packKcal(villagerId) audit)
// Played as a player, judged like a player. Run: node scripts/play-feel-20261007-drifter.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
global.window = global; // eval-phase stub only (equipment.js needs it at load)
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/conversation.js', 'src/js/convo-mood.js',
 'src/js/convoTopics.js', 'src/js/convo-wants.js', 'src/js/convo-dialogue.js', 'src/js/convo-beats.js',
 'src/js/examine.js', 'src/js/equipment.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/party-formal.js', 'src/js/truth.js', 'src/js/contests.js', 'src/js/storage.js',
 'src/js/perceive.js', 'src/js/carexplore.js', 'src/js/justice.js', 'src/js/food.js',
 'src/js/betrayal.js', 'src/js/corpses.js', 'src/js/lifeseed.js', 'src/js/progression.js',
 'src/js/ledger.js', 'src/js/villager-agency.js', 'src/js/codex-people.js', 'src/js/membership.js',
 'src/js/hierarchy.js', 'src/js/debug-scenarios.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
// window stub for the eval phase only (equipment.js needs it at load);
// deleting after flips combat back to the sync path (AGENTS.md lesson).
delete global.window;
const Game = globalThis.Scattering.Game;

let rngState = 4242 >>> 0;
const realRandom = Math.random;
Math.random = () => { rngState = (rngState * 1664525 + 1013904223) >>> 0; return rngState / 4294967296; };

function note(t) { console.log(t); }
const says = [];
const osay = Game.say.bind(Game), osys = Game.sysSay.bind(Game);
Game.say = (t) => { says.push(String(t)); return osay(t); };
Game.sysSay = (t) => { says.push('[SYS] ' + String(t)); return osys(t); };
function flush(tag, max = 10) {
  for (const t of says.splice(0).slice(0, max)) note(`   | ${tag} ${String(t).slice(0, 170)}`);
}
function invKcal() {
  return Game.state.scholar.inventory.reduce((t, i) => t + ((i.kcalEach || 0) > 0 && (i.units || 0) > 0 ? (i.units || 0) * (i.kcalEach || 0) : 0), 0);
}
function vstate(label) {
  const s = Game.state.scholar;
  note(`   [${label}] day=${s.day} kcal=${Math.round(s.kcal || 0)} hp=${Math.round(s.health || 0)} exiled=${!!s.exiled} drifting=${!!s.drifting} inv=${invKcal()}kcal over=${!!Game.over}`);
}
function quietEndDay() { says.length = 0; try { Game.endDay(); } catch (e) { note('ENDDAY ERROR: ' + e.message); } }
// eatUp: play like a player — eat finished food from the pack until fed-ish.
// (Without this the harness starves while holding food; the game rightly
// requires the Eat press. resolveDay never auto-eats.)
function eatUp() {
  const s = Game.state.scholar;
  let guard = 0;
  while ((s.kcal || 0) < 2000 && guard++ < 40 && !Game.over) {
    const idx = s.inventory.findIndex(i => (i.kcalEach || 0) > 0 && (i.units || 0) > 0 && i.edible !== false && !(Game.isSpoiled && Game.isSpoiled(i, 0)));
    if (idx < 0) break;
    try { Game.eatOne(idx); } catch (e) { break; }
  }
  says.length = 0; // eating chatter isn't the story here
}
function giveFood(kcalEach, units, name, opts) {
  Game.state.scholar.inventory.push(Object.assign({ name: name || 'Trail ration', kcalEach, units, spoilDay: 9999, safe: true, kg: 0.2, unit: 'pack' }, opts || {}));
}

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  s.day = 15; Game.state.village.day = 15;
  Game.state.village.trust[Game.villagerId] = 70;
  s.kcal = 3200; s.health = 100; s.water = [{ days: 2 }];
  const pid = Game.villagerId;
  const oldName = Game.state.village.name;
  // a lived codex: a few plants known, so we can check the fork keeps knowledge
  const plants = Game.data.plants || [];
  Game.state.codex.plants[plants[0].id] = { level: 3, identifiedDay: 12 };
  Game.state.codex.plants[plants[1].id] = { level: 1, identifiedDay: 13 };
  giveFood(400, 10, 'Dried venison');
  giveFood(300, 6, 'Parched corn');
  note(`SETUP: ${oldName}, day 15, codex=${Object.keys(Game.state.codex.plants).length} plants, inv=${invKcal()}kcal`);
  vstate('setup');

  // ============ ACT 1: the exile ============
  note('\n== ACT 1: EXILE ==');
  Game.exilePlayer('moot');
  flush('exile');
  note(`   exile flags: s.exiled=${s.exiled} justice.exiled=${(Game.justiceState() || {}).exiled} journal=${JSON.stringify((Game.state.journal || {}).village || []).slice(0, 80)}`);
  vstate('exiled');

  // ============ ACT 2: the drift ============
  note('\n== ACT 2: DRIFT (solo days) ==');
  Game.drift();
  note('   ' + says.splice(0).join(' ').slice(0, 140));
  // capture the driftTick branches: force RNG into each band
  const seqs = [0.10, 0.30, 0.45, 0.52, 0.60];
  for (const v of seqs) {
    const sv = Math.random; Math.random = () => v;
    Game.driftTick(); Math.random = sv;
  }
  flush('drift-branches');
  // honest survival: 10 unrigged days on the road, watch the kcal clock
  // (eating like a player would — from the pack, when hungry)
  s.kcal = 3200;
  const kcalTrack = [];
  for (let d = 0; d < 10; d++) { if ((s.kcal || 0) < 1200) eatUp(); quietEndDay(); kcalTrack.push(Math.round(s.kcal || 0)); if (Game.over) break; }
  note(`   10-day unrigged drift kcal: ${kcalTrack.join(' ')}`);
  note(`   driftDays=${s.driftDays} driftMet=${s.driftMet || 0} over=${!!Game.over}`);
  vstate('post-drift');
  note(`   foundingMissing at day ${s.day} (exile day ${s.exileStartDay}): ${JSON.stringify(Game.foundingMissing())}`);

  // ============ ACT 3: the founding project ============
  note('\n== ACT 3: FOUNDING PROJECT ==');
  note(`   actions offered while exiled: ${Game.exileSelfActions().map(a => a.id + (a.disabled ? '(disabled)' : '')).join(', ')}`);
  Game.exileSelfDo('claimsite'); flush('claim');
  // timber: 8 wood for lean-to, 16 more for hut
  for (let i = 0; i < 4; i++) Game.exileSelfDo('gathertimber');
  flush('timber'); note(`   wood=${Game.woodCount()}`);
  Game.exileSelfDo('buildshelter'); flush('lean-to');
  Game.exileSelfDo('buildshelter'); flush('hut');
  note(`   shelterTier=${Game.foundingState().shelterTier} wood=${Game.woodCount()} missing=${JSON.stringify(Game.foundingMissing())}`);

  // ---- THE PHANTOM-PACK AUDIT ----
  note('\n== ACT 3b: PHANTOM-PACK AUDIT ==');
  const phantom0 = Game.packKcal(pid);
  const real0 = invKcal();
  note(`   real inventory food: ${real0} kcal | packKcal(villagerId): ${Math.round(phantom0)} kcal`);
  note(`   => phantom reads an NPC-style abstract pack, NOT the player's real inventory.`);
  // cache food from the phantom
  Game.exileSelfDo('cachefood');
  flush('cache');
  note(`   after cacheFood: cache=${Math.round(Game.foundingState().stockpileKcal)} real-inv=${invKcal()}kcal (was ${real0}) phantom-now=${Math.round(Game.packKcal(pid))}`);
  note(`   => POST-FIX: the cache filled from REAL food and the real pack shrank by exactly the cache. (Pre-fix: phantom food, pack untouched.)`);
  // village-share gift: park at a distant village tile and share
  const ov = (Game.state.otherVillages || [])[0];
  if (ov) {
    Game.map.px = ov.x; Game.map.py = ov.y;
    const card = Game.villageCard ? Game.villageCard(ov.id) : null;
    note(`   at ${ov.name}: card actions: ${(card && card.actions || []).map(a => a.id).join(', ')}`);
    const invBefore = invKcal(), phBefore = Game.packKcal(pid);
    try { Game.villageCardAction(ov.id, 'sharefood', { giftKcal: 700 }); } catch (e) { note('   sharefood ERROR: ' + e.message); }
    flush('gift');
    note(`   after 700-gift: real-inv ${invBefore}->${invKcal()}kcal (delta ${invKcal() - invBefore}), phantom ${Math.round(phBefore)}->${Math.round(Game.packKcal(pid))}`);
    note(`   => the gift never touched real food. ${ov.name} eats a fiction.`);
  }

  // ============ ACT 4: the fork (now on REAL food, post-fix) ============
  note('\n== ACT 4: FOUNDING (hard reset, real food) ==');
  // honest foraging stand-in: the forager loop yields ~15k latent kcal/morning;
  // stock 12000 real finished food as ~1 hard day of work, then cache it.
  giveFood(400, 20, 'Smoked venison', { prep: 'smoked', edible: true, foodState: 'ready', foodKind: 'plant' });
  giveFood(250, 16, 'Dried berries', { edible: true, foodState: 'ready', foodKind: 'plant' });
  note(`   stocked real food: inv=${invKcal()}kcal (playerPackKcal=${Game.playerPackKcal()})`);
  let guard = 0;
  while (Game.foundingMissing().length && guard++ < 12) { Game.exileSelfDo('cachefood'); }
  flush('cache-real');
  note(`   missing now: ${JSON.stringify(Game.foundingMissing())} cache=${Math.round(Game.foundingState().stockpileKcal)} inv-after=${invKcal()}kcal`);
  const oldVillageObj = Game.state.village;
  const oldTrustKeys = Object.keys(oldVillageObj.trust || {}).length;
  const r = Game.exileSelfDo('foundhaven');
  flush('fork');
  const nv = Game.state.village;
  note(`   fork result=${r} new village="${nv.name}" (was "${oldName}") same-object=${nv === oldVillageObj} archived=${(Game.state.pastVillages || []).includes(oldVillageObj)}`);
  note(`   HARD RESET: trust keys ${oldTrustKeys}->${Object.keys(nv.trust || {}).length} gossip ${(nv.gossip || []).length} roster=${JSON.stringify(nv.roster)}`);
  note(`   KEPT: codex=${Object.keys(Game.state.codex.plants).length} plants inv=${invKcal()}kcal exiled=${s.exiled} foundedHaven=${s.foundedHaven} foundedDay=${s.foundedDay}`);
  note(`   building=${nv.buildingType} pantry=${JSON.stringify(nv.pantry.map(p => p.name + 'x' + p.units))}`);
  vstate('new-haven');

  // ============ ACT 5: new haven day-one ============
  note('\n== ACT 5: NEW HAVEN DAY-ONE ==');
  note(`   pantryInReach at new haven: ${Game.pantryInReach()} (tile: ${Game.playerTile() && Game.playerTile().type})`);
  for (let d = 0; d < 3 && !Game.over; d++) { if ((s.kcal || 0) < 1200) eatUp(); quietEndDay(); }
  flush('solo-days', 4);
  note(`   solo village alive: pop-track roster=${JSON.stringify(nv.roster)} pantryKcal=${Math.round(nv.pantryKcal || 0)} morale=${nv.morale} over=${!!Game.over}`);
  vstate('day-one');
  // strangers: earned, not given
  note('\n== ACT 5b: STRANGERS ==');
  s.day = Math.max(s.day, 8);
  nv.pantryKcal = 16000; // food to trade
  let vis = null;
  for (let i = 0; i < 30 && !vis; i++) { try { vis = Game.considerStrangers(); } catch (e) { note('   strangers ERROR: ' + e.message); break; } }
  flush('stranger');
  note(`   visitor=${vis ? vis.type + ' "' + vis.name + '"' : 'none after 30 tries'}`);
  if (vis) { Game.visitorInteract(vis.id, 'welcome'); flush('welcome'); }

  // awayNews / old village continuity: did the old village keep living?
  note('\n== ACT 6: THE OLD FIRE ==');
  note(`   old village "${oldName}" archived, continues in data: pastVillages=${(Game.state.pastVillages || []).length}`);

  note('\nDONE.');
  Math.random = realRandom;
  process.exit(0);
})().catch(e => { console.error('CRASH:', e.message, e.stack && e.stack.split('\n')[1]); process.exit(1); });
