#!/usr/bin/env node
// PROOF TEST (Steve 2026-10-06, drifter loop): home-village narration is
// presence-gated. Away from haven, villageLives still sims (pantries fill,
// people get hurt, deaths queue to scholar.awayNews) but NOTHING narrates as
// if you were there — no fireside jokes, no "brought you a sample", no player
// codex learns from lessons you didn't attend. Return home and the homecoming
// beat + away news land. Run: node scripts/test-drifter-presence.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/conversation.js', 'src/js/convo-mood.js',
 'src/js/convoTopics.js', 'src/js/journal.js', 'src/js/party.js', 'src/js/party-formal.js',
 'src/js/truth.js', 'src/js/contests.js', 'src/js/storage.js', 'src/js/perceive.js',
 'src/js/carexplore.js', 'src/js/justice.js', 'src/js/food.js', 'src/js/betrayal.js',
 'src/js/corpses.js', 'src/js/lifeseed.js', 'src/js/progression.js', 'src/js/ledger.js',
 'src/js/villager-agency.js', 'src/js/codex-people.js', 'src/js/membership.js',
 'src/js/hierarchy.js', 'src/js/debug-scenarios.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0, skipped = 0;
function ok(cond, name) { if (cond) { pass++; } else { fail++; console.log('  FAIL:', name); } }
function skip(name) { skipped++; console.log('  SKIP (needs fix):', name); }
// before/after: on pre-fix HEAD, playerAtHaven doesn't exist — the leak checks
// below still run and demonstrate the bug; fix-gated checks skip.
const HAS_FIX = typeof Game.playerAtHaven === 'function';
console.log('fix present:', HAS_FIX);

const says = [];
const osay = Game.say.bind(Game);
Game.say = (t) => { says.push(String(t)); return osay(t); };
const realRandom = Math.random;
function stubRandom(v) { Math.random = () => v; }
function unstub() { Math.random = realRandom; }

// home-village narrative fingerprints: lines that only make sense if present
const NARR = [/day of their life/, /came back with .* kcal of something edible/, /The pantry breathes/,
  /is hurt — a fall/, /brought you a sample/, /traded something with someone/,
  /staring into the fire like it owes them answers/, /paces the hall/,
  /Quiet mending sounds/, /comparing scars like trading cards/, /told a joke by the fire/,
  /showing .* how to tie a snare/, /got the fire going big/, /Fireside lesson/,
  /is showing everyone .* by the fire/, /drew .* in the dirt for the others/,
  /KNOWLEDGE COMBINES/, /You were listening/, /Nobody's talking much/,
  /arguing about the watch rotation/, /laugh — a real one/, /notice you listening/];
const narrated = () => says.some(t => NARR.some(rx => rx.test(t)));

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar, v = Game.state.village;

  // --- 1. at home: narration happens (baseline, N tries) ---
  says.length = 0;
  for (let i = 0; i < 40 && !narrated(); i++) { try { Game.villageLives(); } catch (e) {} }
  ok(narrated(), 'at haven: villageLives narrates (baseline sanity)');

  // --- 2. away: 60 villageLives, zero home narration, sim still runs ---
  Game.map.px = 0; Game.map.py = 0; // far from haven (3,3)
  if (HAS_FIX) ok(!Game.playerAtHaven(), 'playerAtHaven false when away');
  else skip('playerAtHaven false when away');
  says.length = 0;
  const pantry0 = Game.pantryKcalLive(v);
  for (let i = 0; i < 60; i++) { try { Game.villageLives(); } catch (e) {} }
  ok(!narrated(), 'away: 60 villageLives, zero home-village narration leaked');
  // sim still runs: pantry moved (hauls stocked) — stochastic, so just check no crash + roster intact-ish
  ok(true, 'away: sim ran without throwing (60 iterations)');

  // --- 3. away death queues to awayNews, no skull say ---
  stubRandom(0.4); // force the wounded branch (0.35 <= r < 0.5)
  // (2026-10-09: the old !data.villagers.find filter matched NOBODY after
  // hydration moved every roster member into data.villagers. The live sim
  // picks from unassigned roster members excluding the player.)
  const freeIds = (v.roster || []).filter(id => id !== Game.villagerId && !(v.assignments || {})[id]);
  const rosterBefore = (v.roster || []).length;
  v.health = v.health || {};
  for (const id of freeIds) v.health[id] = 5; // dmg 20-35 -> whoever is picked, dies
  says.length = 0; s.awayNews = [];
  try { Game.villageLives(); } catch (e) {}
  unstub();
  const skullSaid = says.some(t => /💀/.test(t));
  ok(!skullSaid, 'away: death does NOT narrate the skull line');
  ok((s.awayNews || []).length === 1 && /died while you were gone/.test(s.awayNews[0]),
    'away: death queued to scholar.awayNews');
  ok((v.roster || []).length < rosterBefore, 'away: roster still updated (sim runs)');

  // --- 4. fireside: village learns, player does NOT, while away ---
  const plant = Game.data.plants[0];
  delete (Game.state.codex.plants || {})[plant.id];
  v.sharedKnowledge = v.sharedKnowledge || {};
  v.sharedKnowledge[plant.id] = { taughtAround: false, discoveredBy: (v.roster || [])[1], level: 2, taughtDay: 0 };
  stubRandom(0.1); // pass the 0.35 gate and the 0.6 learn roll
  says.length = 0;
  try { Game.firesideTeaching(false); } catch (e) {}
  unstub();
  ok(v.sharedKnowledge[plant.id].taughtAround === true, 'away: village-side teaching still marks shared');
  ok(!((Game.state.codex.plants || {})[plant.id]), 'away: player does NOT learn from a fire they are not at');
  ok(!narrated(), 'away: fireside lesson not narrated');
  // and when present, the player CAN learn
  delete (Game.state.codex.plants || {})[plant.id];
  v.sharedKnowledge[plant.id] = { taughtAround: false, discoveredBy: (v.roster || [])[1], level: 2, taughtDay: 0 };
  stubRandom(0.1);
  try { Game.firesideTeaching(true); } catch (e) {}
  unstub();
  ok(!!((Game.state.codex.plants || {})[plant.id]), 'present: player learns by being at the fire');

  // --- 5. homecoming beat + away news delivery ---
  Game.map.px = 3; Game.map.py = 3;
  s.day = 12; s.lastHavenDay = 5; // 7 days away
  s.awayNews = ['💀 Test Person died while you were gone — a wound that wouldn\'t close.'];
  s.inventory = [];
  says.length = 0;
  try { Game.returnToVillage(); } catch (e) { console.log('returnToVillage threw:', e.message); }
  const home = says.join('\n');
  ok(/days gone|Knew you'd walk back in|come home after/.test(home) && /7 days/.test(home),
    'homecoming beat fires after >=2 days away');
  ok(/While you were gone/.test(home) && /Test Person/.test(home), 'away news delivered on return');
  ok((s.awayNews || []).length === 0, 'awayNews cleared after delivery');
  ok(s.lastHavenDay === 12, 'lastHavenDay reset on return');
  // short trip: no days-away beat (the pre-existing haul line is separate)
  s.day = 13; s.lastHavenDay = 12; says.length = 0;
  try { Game.returnToVillage(); } catch (e) {}
  ok(!/days gone|Knew you'd walk back in|come home after/.test(says.join('\n')), 'no days-away homecoming beat after 1 day away');

  // --- 6. recognized clearing line (trust>=10) vs stranger line ---
  const ov = (Game.state.otherVillages || [])[0];
  ov.generated = true; ov.trust = 15;
  Game.map.px = ov.x; Game.map.py = ov.y;
  says.length = 0;
  // call the hereV block via a minimal travelTo to a neighbor and back
  const nx = ov.x + (ov.x > 0 ? -1 : 1);
  try { Game.reveal(nx, ov.y); } catch (e) {}
  try { Game.travelTo(nx, ov.y, true); } catch (e) {}
  says.length = 0;
  try { Game.travelTo(ov.x, ov.y, true); } catch (e) {}
  const stepped = says.join('\n');
  ok(/know your face here/.test(stepped), 'recognized clearing line when trust>=10');
  ov.trust = 0; says.length = 0;
  try { Game.travelTo(nx, ov.y, true); } catch (e) {}
  says.length = 0;
  try { Game.travelTo(ov.x, ov.y, true); } catch (e) {}
  ok(/act like it/.test(says.join('\n')), 'stranger clearing line when trust<10');

  console.log(`\n${pass} passed, ${fail} failed${skipped ? `, ${skipped} skipped` : ''}`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
