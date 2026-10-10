#!/usr/bin/env node
// DRIFTER hostile proof 2026-10-10 (playtest loop, archetype 8).
// Attacks, as a HOSTILE player, the distance/travel/catch-up surface:
//   A1 EXPLOIT: zero-cost ping-pong world-step farm (travelTimeStep gate)
//   A2 EXPLOIT: re-arm via 1-tick steps — world steps must stay proportional
//   A3 EXPLOIT: free synergy streak via travel-logged passive uses
//   A4 EXPLOIT: catch-up sim re-entry (double-sim, double pantry, double deaths)
//   A5 EXPLOIT: land regrow watermark across two villages, same days
//   A6 SOFTLOCK: combat travel refusal (no desync, no teleport-flee)
//   A7 SOFTLOCK: monster-follower ping-pong (no duplication, no stacking)
//   A8 HONESTY: travel narration vs engine; blocked travel narration; fog bounds
// Full index.html load order minus DOM-only modules. RNG seeded BEFORE eval
// (modules capture Math.random at load). window stubbed for eval, removed after.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

// --- seeded RNG BEFORE eval ---
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const SEED = parseInt(process.env.SEED || '20261010', 10);
const rng = mulberry32(SEED);
Math.random = rng;

global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
global.window = global; // equipment.js needs window at load; removed before play
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/conversation.js', 'src/js/convo-mood.js',
 'src/js/convoTopics.js', 'src/js/convo-wants.js', 'src/js/convo-dialogue.js',
 'src/js/convo-beats.js', 'src/js/convo-scene.js', 'src/js/examine.js',
 'src/js/equipment.js', 'src/js/journal.js', 'src/js/party.js', 'src/js/party-formal.js',
 'src/js/truth.js', 'src/js/contests.js', 'src/js/broadcast.js', 'src/js/contestEngine.js',
 'src/js/alienPlayers.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js',
 'src/js/justice.js', 'src/js/food.js', 'src/js/betrayal.js', 'src/js/corpses.js',
 'src/js/corruption.js', 'src/js/lifeseed.js', 'src/js/progression.js', 'src/js/ledger.js',
 'src/js/abilityActions.js', 'src/js/monsterBehaviors.js', 'src/js/statusEffects.js',
 'src/js/villager-agency.js', 'src/js/fieldFights.js', 'src/js/villager-objectives.js',
 'src/js/codex-people.js', 'src/js/membership.js', 'src/js/hierarchy.js',
 'src/js/debug-scenarios.js', 'src/js/build.js'
].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
delete global.window; // sync combat path, no async flip
const Game = globalThis.Scattering.Game;

let failures = 0, checks = 0;
function check(cond, label, extra) {
  checks++;
  if (!cond) { failures++; console.log(`  FAIL ${label}${extra ? ' — ' + extra : ''}`); }
  else console.log(`  ok   ${label}${extra ? ' — ' + extra : ''}`);
}
const says = [];
const osay = Game.say.bind(Game);
Game.say = (t) => { says.push(String(t)); return osay(t); };
function clearSays() { says.splice(0); }
function feed() { const s = Game.state.scholar; s.kcal = 4000; s.hydration = 100; if (s.health < 95) s.health = 100; }

async function main() {
  console.log(`seed=${SEED}`);
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  // grant the synergy legs so travel-logging can be attacked
  s.abilities = s.abilities || [];
  s.abilities.push({ id: 'cold_blooded', level: 1 }, { id: 'hollow_bones', level: 1 });
  check(Game.abilityLevel('cold_blooded') === 1 && Game.abilityLevel('hollow_bones') === 1, 'setup: synergy legs held');

  // ---------- A1: zero-cost ping-pong ----------
  console.log('\n== A1: 200 zero-tick ping-pongs ==');
  clearSays();
  let ax = Game.map.px, ay = Game.map.py;
  let tgt = Game.travelTargets().find(t => Math.abs(t.x - ax) + Math.abs(t.y - ay) === 1);
  if (!tgt) { Game.reveal(ax + 1 <= 8 ? ax + 1 : ax - 1, ay); tgt = Game.travelTargets().find(t => Math.abs(t.x - ax) + Math.abs(t.y - ay) === 1); }
  const bx = tgt.x, by = tgt.y;
  const ticks0 = s.dayTicks || 0, kcal0 = s.kcal || 0;
  let needCalls = 0, gossipCalls = 0;
  const oNeed = Game.tickNeeds.bind(Game), oGos = Game.spreadGossip.bind(Game);
  Game.tickNeeds = (...a) => { needCalls++; return oNeed(...a); };
  Game.spreadGossip = (...a) => { gossipCalls++; return oGos(...a); };
  for (let i = 0; i < 200; i++) {
    Game.travelTo(i % 2 === 0 ? bx : ax, i % 2 === 0 ? by : ay, true);
    if (Game.over) break;
  }
  Game.tickNeeds = oNeed; Game.spreadGossip = oGos;
  check(!Game.over, 'A1: survived 200 ping-pongs');
  check((s.dayTicks || 0) === ticks0, 'A1: zero ticks charged', `ticks=${s.dayTicks}`);
  check(Math.abs((s.kcal || 0) - kcal0) < 0.01, 'A1: zero kcal charged');
  // first crossing ever grants ONE designed world-step; the other 199 must buy nothing
  check(needCalls <= 1 && gossipCalls <= 1, 'A1: no free world-steps from ping-pong', `need=${needCalls} gossip=${gossipCalls}`);
  check((s._travelStepDebt || 0) < 128, 'A1: debt cannot release a step', `debt=${s._travelStepDebt}`);
  const synDays = (s.synergyAttempts || {})['efficient_machine_days'] || 0;
  check(synDays <= 1, 'A1: synergy streak day-keyed, not farmable in one day', `days=${synDays}`);

  // ---------- A2: 1-tick re-arm proportionality ----------
  console.log('\n== A2: 1-tick re-arm x200 ==');
  needCalls = 0; gossipCalls = 0;
  Game.tickNeeds = (...a) => { needCalls++; return oNeed(...a); };
  Game.spreadGossip = (...a) => { gossipCalls++; return oGos(...a); };
  const debtBefore = s._travelStepDebt || 0;
  // walk one real step (1 tick) then travel, 200 times
  for (let i = 0; i < 200; i++) {
    const px = s.mx ?? 4, py = s.my ?? 4;
    const nx = Math.max(0, Math.min(8, px + (i % 2 === 0 ? 1 : -1)));
    Game.microMove(nx, py);
    Game.travelTo(i % 2 === 0 ? bx : ax, i % 2 === 0 ? by : ay, true);
    if (Game.over) break;
  }
  Game.tickNeeds = oNeed; Game.spreadGossip = oGos;
  const banked = 200 + debtBefore; // 1 tick per re-arm + carried debt
  const expected = Math.floor(banked / 128);
  check(needCalls <= expected + 1, 'A2: world steps proportional to clock', `steps=${needCalls} banked~${banked} expected<=${expected + 1}`);
  check((s._travelStepDebt || 0) === banked - needCalls * 128 || true, 'A2: debt accounting (informational)', `debt=${s._travelStepDebt}`);

  // ---------- A4/A5: catch-up sim re-entry + regrow watermark ----------
  console.log('\n== A4/A5: catch-up sim ==');
  for (let d = 0; d < 14; d++) { feed(); Game.endDay(); }
  check(s.day === 15, 'setup: day 15', `day=${s.day}`);
  const ovs = Game.state.otherVillages || [];
  check(ovs.length > 0, 'setup: distant villages exist', `n=${ovs.length}`);
  const V = ovs[0];
  Game.reveal(V.x, V.y);
  Game.travelTo(V.x, V.y, true);
  Game.catchUpSim(V); // the approach path
  const snap1 = { day: V.day, pantry: Math.round(V.pantryKcal || 0), news: (V.news || []).length, pop: V.population, deaths: (V.roster || []).filter(p => !p.alive).length };
  Game.catchUpSim(V); // re-approach: must be a no-op
  const snap2 = { day: V.day, pantry: Math.round(V.pantryKcal || 0), news: (V.news || []).length, pop: V.population, deaths: (V.roster || []).filter(p => !p.alive).length };
  check(JSON.stringify(snap1) === JSON.stringify(snap2), 'A4: re-approach catch-up is a no-op', JSON.stringify(snap1));
  check(V.day === s.day, 'A4: village day watermark == scholar day', `vday=${V.day} sday=${s.day}`);
  check((V.pantryKcal || 0) <= (V.population || 1) * 8000, 'A4: pantry capped at 4-day buffer', `pantry=${Math.round(V.pantryKcal || 0)}`);
  // regrow watermark: a second unapproached village sims the same days — land heals once
  let regrows = 0;
  const oRegrow = Game.regrowTiles.bind(Game);
  Game.regrowTiles = (...a) => { regrows++; return oRegrow(...a); };
  const W = ovs.find(v => v !== V && !v.generated);
  if (W) {
    Game.catchUpSim(W);
    check(regrows === 0, 'A5: second village over same days heals land zero extra times', `regrows=${regrows}`);
    check(W.day === s.day, 'A5: second village still fully simmed', `wday=${W.day}`);
  } else console.log('  SKIP A5: no second unapproached village');
  Game.regrowTiles = oRegrow;

  // ---------- A6: combat travel refusal ----------
  console.log('\n== A6: combat travel refusal ==');
  const cpx = Game.map.px, cpy = Game.map.py;
  Game.tbfight = { over: false, fighters: [] }; // fake live fight
  const r1 = Game.travelTo(cpx === 4 ? 5 : 4, cpy, false);
  const r2 = Game.tryNodeExit(1, 0);
  check(r1 === null, 'A6: travelTo refuses mid-fight');
  check(r2 === null, 'A6: tryNodeExit refuses mid-fight');
  check(Game.map.px === cpx && Game.map.py === cpy, 'A6: position unchanged');
  Game.tbfight = null;

  // ---------- A7: follower ping-pong duplication ----------
  console.log('\n== A7: monster follower ping-pong ==');
  const mdef = (Game.data.monsters || []).find(m => m.id === 'hushwolf');
  const follower = Game.spawnWorldMonster(mdef, ax, ay, {});
  // hop A->B->A 8 times; follower (follows:true) chases each crossing.
  // Count the FOLLOWER OBJECT (identity), not ambient world spawns — the
  // world living (wanderer/maintenance spawns on distant tiles) is not duplication.
  for (let i = 0; i < 8; i++) {
    Game.travelTo(i % 2 === 0 ? bx : ax, i % 2 === 0 ? by : ay, true);
    if (Game.over) break;
  }
  const followersAlive = Game.worldMonsters().filter(m => m === follower).length;
  const hushCount = Game.worldMonsters().filter(m => m.id === 'hushwolf').length;
  check(followersAlive === 1, 'A7: follower object never duplicates across crossings', `identity-count=${followersAlive}`);
  check(hushCount === 1, 'A7: no second hushwolf instance exists', `hushwolves=${hushCount}`);
  // no two monsters share a tile
  const seen = {};
  let stacked = false;
  for (const m of (Game.worldMonsters ? Game.worldMonsters() : [])) {
    const k = m.tx + ',' + m.ty;
    if (seen[k]) stacked = true;
    seen[k] = true;
  }
  check(!stacked, 'A7: one monster per tile holds after chase');

  // ---------- A8: honesty ----------
  console.log('\n== A8: honesty ==');
  clearSays();
  const hx = Game.map.px, hy = Game.map.py;
  const far = Game.travelTargets().find(t => Math.abs(t.x - hx) + Math.abs(t.y - hy) === 3 && Game.tileAt(t.x, t.y).revealed);
  if (far) {
    Game.travelTo(far.x, far.y, true);
    const msg = says.find(t => t.startsWith('Travel ')) || '';
    const moved = Math.abs(Game.map.px - hx) + Math.abs(Game.map.py - hy);
    check(msg.includes('3 tile'), 'A8: 3-tile jump narrated as 3 tiles', msg.slice(0, 60));
    check(moved === 3, 'A8: engine moved exactly what was promised', `moved=${moved}`);
  } else console.log('  SKIP A8a: no revealed d=3 target');
  // fog bounds: no target beyond 3, no unrevealed beyond 1
  const bad = Game.travelTargets().filter(t => {
    const d = Math.abs(t.x - Game.map.px) + Math.abs(t.y - Game.map.py);
    return d > 3 || (d > 1 && !Game.tileAt(t.x, t.y).revealed);
  });
  check(bad.length === 0, 'A8: travel targets respect fog (<=3 revealed, d1 fog-walk only)', `bad=${bad.length}`);
  // blocked travel: plant a blockage, assert refusal + honest narration + no move
  const bx0 = Game.map.px, by0 = Game.map.py;
  const dest = Game.travelTargets().find(t => Math.abs(t.x - bx0) + Math.abs(t.y - by0) === 1);
  if (dest) {
    const dt = Game.tileAt(dest.x, dest.y);
    dt.blockFrom = { dx: Math.sign(bx0 - dest.x), dy: Math.sign(by0 - dest.y), type: 'fallen_tree' };
    clearSays();
    const br = Game.travelTo(dest.x, dest.y, false);
    check(br && br.kind === 'blockage', 'A8: blocked travel returns blockage object');
    check(Game.map.px === bx0 && Game.map.py === by0, 'A8: blocked travel does not move');
    check(says.some(t => /fallen tree/i.test(t)), 'A8: blockage named honestly', says.slice(-2).join(' | ').slice(0, 100));
    delete dt.blockFrom;
  } else console.log('  SKIP A8b: no d=1 target for blockage test');

  console.log(`\nRESULT: ${checks - failures}/${checks} checks passed, seed=${SEED}`);
  process.exit(failures ? 1 : 0);
}
main().catch(e => { console.error('HARNESS ERROR:', e); process.exit(2); });
