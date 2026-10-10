// BREAK-IT: TRAVEL & MAP round 7 (2026-10-09) — explorer archetype, hostile player.
// Round 6 closed: post-death movement x6, prepaid-walk billing, haven regen,
// monster continuity, tryNodeExit, dead-code sweep. This round attacks NEW surface.
// ATTACKS:
//   T1 EXPLOIT: travel ping-pong needs machine, RE-ARMED. The 2026-10-08 fix
//       gated travelTimeStep's tickNeeds+spreadGossip on "dayTicks moved at
//       all" — but ONE microMove step (1 tick, 2 kcal) between travels re-arms
//       it, granting a full part-scale world-step per ~2 player ticks.
//       Measured harm: whole-village fear->0, energy->100, gossip fast-forward.
//   T2 EXPLOIT: wild-node detail regen — travelTo nulls haven detail every
//       crossing (round 6: regen byte-identical). Wild tiles: does the detail
//       object survive a round trip (no forage/depletion reset)?
//   T3 EXPLOIT: arrival spawn farming — 30 ping-pongs with live
//       checkAnimals: spawns bounded by tile wildlife populations?
//       Live checkEncounter with a FOLLOWER monster: does vacating tiles via
//       follow duplicate or farm spawns?
//   T4 HONESTY: map knowledge gates — unshared villager tiles stay out of
//       villageMapKnown; compareMaps admits exactly the shared set; the codex
//       MAPS render touches only tile TYPE (no detail/content leak).
//   T5 EXPLOIT: bridge economy — build/smash/rebuild wood conservation
//       (no dupe, no refund); clearBlockage fallen_tree one-shot +2 wood.
// Usage: node scripts/test-travel-r7.js            (AFTER fix)
//        BEFORE=1 node scripts/test-travel-r7.js    (pre-fix HEAD code)
//        SEED=999 node scripts/test-travel-r7.js   (seed override)
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const BEFORE = !!process.env.BEFORE;
let gameSrc;
if (BEFORE) {
  execSync('git show HEAD:src/js/game.js > /tmp/bt7-game-before.js', { cwd: ROOT });
  gameSrc = fs.readFileSync('/tmp/bt7-game-before.js', 'utf8');
  console.log('MODE: BEFORE (pre-fix game.js from git HEAD)');
} else {
  gameSrc = fs.readFileSync(path.join(ROOT, 'src/js/game.js'), 'utf8');
  console.log('MODE: AFTER (fixed worktree code)');
}
const PAIRS = [
  ['plants.json', 'plants'], ['biomes.json', 'biomes'], ['monsters.json', 'monsters'],
  ['villagers.json', 'villagers'], ['abilities.json', 'abilities'], ['items.json', 'items'],
  ['background_survivors.json', 'background_survivors'], ['cell_defs.json', 'cellDefs'],
  ['animals.json', 'animals'], ['recipes.json', 'recipes'], ['books.json', 'books'],
  ['relicEnhancements.json', 'relicEnhancements'], ['locations.json', 'locations'],
  ['characterGen.json', 'characterGen'], ['synergies.json', 'synergies'],
  ['knowledge.json', 'knowledge'], ['nameCultures.json', 'nameCultures'],
  ['originPicker.json', 'originPicker'], ['foreignSpeech.json', 'foreignSpeech'],
  ['lifeseeds.json', 'lifeseeds'], ['arrivalText.json', 'arrivalText'],
  ['justiceVoice.json', 'justiceVoice'], ['alienPlayers.json', 'alienPlayers'],
  ['regions.json', 'regions'], ['dramaEffects.json', 'dramaEffects'],
  ['monsterBehaviors.json', 'monsterBehaviors'], ['contests.json', 'contests'],
  ['events.json', 'events'], ['statusEffects.json', 'statusEffects'],
];
global.SCATTER_DATA = {};
for (const [f, key] of PAIRS) {
  global.SCATTER_DATA[key] = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data', f), 'utf8'));
}
// SEED BEFORE EVAL: modules capture Math.random at load (AGENTS.md).
let _seed = 7;
const SEED = parseInt(process.env.SEED || '7', 10);
function rng() { _seed = (_seed * 1103515245 + 12345) % 2147483648; return _seed / 2147483648; }
rng.reset = (s) => { _seed = (s === undefined ? SEED : s); };
rng.reset();
Math.random = rng;
global.window = global;
const LIST = ['engine/state.js', 'engine/modifiers.js', 'engine/calories.js', 'engine/day.js',
  'engine/forage.js', 'engine/combat.js', '__GAME__', 'encounters.js', 'conversation.js',
  'convo-mood.js', 'convoTopics.js', 'convo-wants.js', 'convo-dialogue.js', 'convo-beats.js',
  'convo-scene.js', 'examine.js', 'equipment.js', 'journal.js', 'party.js', 'party-formal.js',
  'truth.js', 'contests.js', 'contestEngine.js', 'alienPlayers.js', 'storage.js', 'perceive.js',
  'carexplore.js', 'justice.js', 'food.js', 'betrayal.js', 'corpses.js', 'lifeseed.js',
  'progression.js', 'ledger.js', 'abilityActions.js', 'monsterBehaviors.js', 'statusEffects.js',
  'villager-agency.js', 'fieldFights.js', 'villager-objectives.js', 'codex-people.js',
  'membership.js', 'hierarchy.js', 'debug-scenarios.js', 'build.js'];
for (const f of LIST) {
  const src = f === '__GAME__' ? gameSrc : fs.readFileSync(path.join(ROOT, 'src/js', f), 'utf8');
  try { eval(src); }
  catch (e) { console.error('EVAL FAIL ' + f + ': ' + e.message); process.exit(2); }
}
delete global.window;
const Game = globalThis.Scattering.Game;
Game.data = global.SCATTER_DATA;
const oCE = Game.checkEncounter, oCA = Game.checkAnimals;
Game.checkEncounter = () => {};
Game.checkAnimals = () => {};

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail ? ' — ' + detail : '')); }
}
function setup() {
  rng.reset();
  Game.tbfight = null;
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar; s.kcal = 9000; s.hydration = 100; s.health = 100;
  return s;
}
// adjacent unblocked wild-ish tile from current position (never haven)
function adjUnblocked() {
  const ax = Game.map.px, ay = Game.map.py;
  const cands = Game.travelTargets().filter(t =>
    Math.abs(t.x - ax) + Math.abs(t.y - ay) === 1 &&
    !Game.travelBlockage(t.x, t.y) && Game.tileAt(t.x, t.y).type !== 'haven');
  return cands[0] || null;
}
function stepOnce() {
  const s = Game.state.scholar;
  const px = s.mx ?? 4, py = s.my ?? 4;
  for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]) {
    const nx = px + dx, ny = py + dy;
    if (nx < 0 || nx > 8 || ny < 0 || ny > 8) continue;
    try { if (Game.microMove(nx, ny) === true) return true; } catch (e) {}
  }
  return false;
}
function npcAvg(field) {
  const v = Game.state.village;
  const ids = (v.roster || []).filter(id => id !== Game.villagerId);
  let sum = 0, n = 0;
  for (const id of ids) { const nd = Game.npcNeeds(id); if (nd) { sum += (nd[field] || 0); n++; } }
  return n ? sum / n : 0;
}

// ---- T1. EXPLOIT: re-armed travel ping-pong needs machine ----
{
  setup();
  const s = Game.state.scholar;
  const v = Game.state.village;
  const ids = (v.roster || []).filter(id => id !== Game.villagerId);
  for (const id of ids) { const nd = Game.npcNeeds(id); nd.fear = 60; nd.energy = 20; nd.hunger = 10; nd.social = 10; }
  v.grief = 0; v.cheer = 0;
  // seed gossip: one villager heard, nobody else (day stamped — stories fade after ~3d)
  const dayNow = Game.state.scholar.day || 1;
  v.gossip = [
    { heard: [ids[0]], dims: { action: 'helped', who: ids[1] }, distortion: 0, action: 'helped', playerRumor: false, day: dayNow },
    { heard: [ids[1]], dims: { action: 'shared_food', who: ids[2] }, distortion: 0, action: 'shared_food', playerRumor: false, day: dayNow },
  ];
  const heard0 = v.gossip.reduce((a, g) => a + g.heard.length, 0);
  const tgt = adjUnblocked();
  ok('T1 setup: unblocked adjacent tile', !!tgt);
  const home = { x: Game.map.px, y: Game.map.py };
  const kcal0 = s.kcal, ticks0 = s.dayTicks || 0;
  let travels = 0;
  for (let i = 0; i < 20; i++) {
    const dest = (Game.map.px === home.x && Game.map.py === home.y) ? tgt : home;
    Game.travelTo(dest.x, dest.y);
    if (Game.map.px === dest.x && Game.map.py === dest.y) travels++; // travelTo returns undefined on success
    if (!stepOnce()) break; // re-arm the gate: 1 tick of honest movement
  }
  const fear1 = npcAvg('fear'), energy1 = npcAvg('energy'), hunger1 = npcAvg('hunger');
  const heard1 = v.gossip.reduce((a, g) => a + g.heard.length, 0);
  const dticks = (s.dayTicks || 0) - ticks0, dkcal = kcal0 - s.kcal;
  console.log(`  [info] T1 after ${travels} re-armed ping-pongs: fear ${fear1.toFixed(1)}, energy ${energy1.toFixed(1)}, hunger ${hunger1.toFixed(1)}, gossip heard ${heard0}->${heard1}, player cost ${dticks} ticks + ${Math.round(dkcal)} kcal`);
  if (BEFORE) {
    ok('BEFORE: re-armed ping-pong zeroes NPC fear (break real)', fear1 < 5, `fear=${fear1.toFixed(1)}`);
    ok('BEFORE: re-armed ping-pong maxes NPC energy (break real)', energy1 > 95, `energy=${energy1.toFixed(1)}`);
    ok('BEFORE: re-armed ping-pong fast-forwards gossip (break real)', heard1 > heard0 + 4, `${heard0}->${heard1}`);
    ok('BEFORE: player price is trivial (~2 ticks + 4 kcal per world-step)', dticks <= 60 && dkcal < 200, `${dticks}t ${Math.round(dkcal)}kcal`);
  } else {
    ok('AFTER: NPC fear NOT zeroed by pacing (world-step priced)', fear1 > 45, `fear=${fear1.toFixed(1)}`);
    ok('AFTER: NPC energy NOT maxed by pacing', energy1 < 40, `energy=${energy1.toFixed(1)}`);
    ok('AFTER: gossip NOT fast-forwarded by pacing', heard1 <= heard0 + 2, `${heard0}->${heard1}`);
    ok('AFTER: honest movement costs still paid', dticks > 0 && dkcal > 0, `${dticks}t ${Math.round(dkcal)}kcal`);
  }
  Game.tbfight = null;
}

// ---- T2. EXPLOIT: wild-node detail regen on re-entry ----
{
  setup();
  const A = adjUnblocked();
  ok('T2 setup: adjacent wild tile', !!A);
  Game.travelTo(A.x, A.y);
  const tileA = Game.tileAt(A.x, A.y);
  const detailRef = tileA.detail;
  ok('T2 setup: wild tile has cached detail', !!detailRef);
  const hash0 = JSON.stringify(detailRef);
  // simulate a harvest: strip every forageable plant marker we can find
  let stripped = 0;
  for (const row of detailRef) for (const cell of row) {
    if (cell && typeof cell === 'object' && cell.forageable) { cell.forageable = false; stripped++; }
    else if (cell && typeof cell === 'object' && cell.plants) { cell.plants = []; stripped++; }
  }
  const B = adjUnblocked();
  ok('T2 setup: second tile for round trip', !!B);
  Game.travelTo(B.x, B.y);
  Game.travelTo(A.x, A.y);
  const tileA2 = Game.tileAt(A.x, A.y);
  ok('T2: wild detail object survives the round trip (no regen)', tileA2.detail === detailRef);
  ok('T2: harvest depletion survives the round trip', JSON.stringify(tileA2.detail) === JSON.stringify(detailRef),
    `stripped=${stripped}`);
  Game.tbfight = null;
}

// ---- T3a. EXPLOIT: arrival animal-spawn farming ----
{
  setup();
  Game.checkEncounter = () => {}; Game.checkAnimals = oCA; // live animals only
  const A = adjUnblocked();
  ok('T3a setup: tile A', !!A);
  Game.travelTo(A.x, A.y);
  const B = adjUnblocked();
  ok('T3a setup: tile B', !!B && !(B.x === A.x && B.y === A.y));
  const pop = (t) => { const w = (Game.tileAt(t.x, t.y).wildlife) || {}; return Object.values(w).reduce((a, b) => a + Math.max(0, b), 0); };
  const pop0 = pop(A) + pop(B);
  let spawns = 0, prevAnimal = null;
  for (let i = 0; i < 30; i++) {
    const dest = (Game.map.px === A.x && Game.map.py === A.y) ? B : A;
    Game.travelTo(dest.x, dest.y);
    const cur = Game.state.scholar.animal;
    if (cur && !prevAnimal) spawns++;
    prevAnimal = cur;
    // hostile: walk away, leave it parked (continuity), don't catch
    if (Game.state.scholar.animal) { /* parked automatically on next travel */ }
  }
  const pop1 = pop(A) + pop(B);
  console.log(`  [info] T3a: ${spawns} animal spawns over 30 arrivals, wildlife pop ${pop0}->${pop1}`);
  ok('T3a: animal spawns bounded by local populations (no thin-air farm)', spawns <= pop0 + 2, `spawns=${spawns} pop0=${pop0}`);
  ok('T3a: wildlife populations never go negative', pop1 >= 0, `pop1=${pop1}`);
  Game.checkAnimals = () => {};
  Game.tbfight = null;
}

// ---- T3b. EXPLOIT: monster stacking -> phantoms (deterministic) ----
// The engine is singular (monsterAt returns the first; the scholar.monster
// alias, perception, and combat all target one). Three travel-path sources
// could stack 2+ monsters on a tile: wanderWorldMonsters (no occupancy
// check), pickWorldTile/maintainWorldMonsters (no occupancy check), and the
// follower re-entry in travelTo. The stacked second monster is a phantom:
// unperceivable, unfightable, but still wandering and narrating.
{
  setup();
  Game.checkEncounter = () => {}; Game.checkAnimals = () => {};
  const s = Game.state.scholar;
  const A = adjUnblocked();
  ok('T3b setup: tile A', !!A);
  Game.travelTo(A.x, A.y);
  // B = east of A, else west; must be in-bounds, non-haven, unblocked
  let B = (A.x + 1 <= 8 && Game.tileAt(A.x + 1, A.y).type !== 'haven') ? { x: A.x + 1, y: A.y } : { x: A.x - 1, y: A.y };
  ok('T3b setup: tile B distinct and wild', B.x !== A.x && Game.tileAt(B.x, B.y).type !== 'haven');
  delete Game.tileAt(B.x, B.y).blockFrom;
  const eastward = B.x > A.x;
  const gdef = (Game.data.monsters || []).find(m => m.id === 'gallowdeer') || (Game.data.monsters || [])[0];
  const realRng = Math.random;

  // --- (i) wander stacking, forced toward B ---
  // spawn order: m2 (on A) wanders FIRST, onto m1's tile B, while m1 stays put
  const m2 = Game.spawnWorldMonster(gdef.id, A.x, A.y, { mx: 4, my: 4 });
  const m1 = Game.spawnWorldMonster(gdef.id, B.x, B.y, { mx: 4, my: 4 });
  // sequenced stub: m2 rolls move + toward-B + mx + my, then m1 rolls stay
  const seq = eastward ? [0.1, 0.1, 0.1, 0.1, 0.9] : [0.1, 0.3, 0.1, 0.1, 0.9];
  let qi = 0;
  Math.random = () => (qi < seq.length ? seq[qi++] : 0.9);
  try { Game.wanderWorldMonsters(); } finally { Math.random = realRng; }
  let maxStack = 0;
  for (const m of Game.worldMonsters()) {
    const c = Game.worldMonsters().filter(o => o.tx === m.tx && o.ty === m.ty).length;
    maxStack = Math.max(maxStack, c);
  }
  if (BEFORE) {
    ok('BEFORE: wanderer stacks onto the occupied tile (break real)', maxStack === 2, `maxStack=${maxStack}`);
    const onB = Game.worldMonsters().filter(m => m.tx === B.x && m.ty === B.y);
    const seen = Game.monsterAt(B.x, B.y);
    ok('BEFORE: the stacked monster is a phantom to monsterAt (break real)',
      onB.length === 2 && seen === onB[0] && onB[1] !== seen, `monsterAt sees 1 of ${onB.length}`);
  } else {
    ok('AFTER: wanderer refuses the occupied tile', maxStack === 1 && m2.tx === A.x && m2.ty === A.y,
      `maxStack=${maxStack} m2@${m2.tx},${m2.ty}`);
  }
  // cleanup for the follow test
  for (const m of [...Game.worldMonsters()]) { const i = Game.worldMonsters().indexOf(m); if (i >= 0) Game.worldMonsters().splice(i, 1); }

  // --- (ii) follower re-entry onto an occupied tile ---
  const fdef = (Game.data.monsters || []).find(m => m.follows);
  ok('T3b setup: follower def exists', !!fdef, fdef && fdef.id);
  // player must be ON A for the follow; occupant on B
  Game.map.px = A.x; Game.map.py = A.y;
  const occ = Game.spawnWorldMonster(gdef.id, B.x, B.y, { mx: 4, my: 4 });
  const fol = Game.spawnWorldMonster(fdef.id, A.x, A.y, { mx: 4, my: 4 });
  Game.travelTo(B.x, B.y);
  if (Game.tbfight) { /* a real fight started — stop, that's honest */ }
  const folNow = Game.worldMonsters().find(m => m === fol);
  const onB2 = Game.worldMonsters().filter(m => m.tx === B.x && m.ty === B.y);
  if (BEFORE) {
    ok('BEFORE: follower chases onto the occupied tile (break real)', folNow && folNow.tx === B.x && onB2.length === 2, `onB=${onB2.length}`);
  } else {
    ok('AFTER: follower holds at the boundary, no stack', folNow && folNow.tx === A.x && folNow.ty === A.y && onB2.length === 1,
      `follower@${folNow.tx},${folNow.ty} onB=${onB2.length}`);
    ok('AFTER: the trail is kept — follower still a follower on the old tile',
      (Game.data.monsters.find(m => m.id === folNow.id) || {}).follows === true);
  }
  for (const m of [...Game.worldMonsters()]) { const i = Game.worldMonsters().indexOf(m); if (i >= 0) Game.worldMonsters().splice(i, 1); }

  // --- (iii) pickWorldTile never returns an occupied tile ---
  for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) {
    if (x === 4 && y === 4) continue; // haven-ish: keep one tile free-ish (still guarded by isSafeTile anyway)
    Game.spawnWorldMonster(gdef.id, x, y, { mx: 4, my: 4 });
  }
  const spot = Game.pickWorldTile(gdef);
  if (BEFORE) {
    ok('BEFORE: maintenance spawn picks an occupied tile (break real)', !!spot && !!Game.monsterAt(spot.x, spot.y), `spot=${spot && spot.x + ',' + spot.y}`);
  } else {
    ok('AFTER: maintenance spawn has no occupied tile to pick', spot === null || !Game.monsterAt(spot.x, spot.y),
      `spot=${spot ? spot.x + ',' + spot.y : 'null'}`);
  }
  for (const m of [...Game.worldMonsters()]) { const i = Game.worldMonsters().indexOf(m); if (i >= 0) Game.worldMonsters().splice(i, 1); }
  Game.tbfight = null;
}

// ---- T4. HONESTY: map knowledge gates ----
{
  setup();
  const v = Game.state.village;
  const ids = (v.roster || []).filter(id => id !== Game.villagerId);
  const vp1 = (Game.data.villagers || []).find(p => p.id === ids[0]);
  const vp2 = (Game.data.villagers || []).find(p => p.id === ids[1]);
  vp1.visitedTiles = ['0,0', '1,1']; vp2.visitedTiles = ['2,2'];
  delete Game.state.scholar.mapsSharedBy;
  let known = Game.villageMapKnown();
  ok('T4: unshared villager tiles stay out of the codex map', !known['0,0'] && !known['2,2']);
  const cmp = Game.compareMaps(vp1.id);
  known = Game.villageMapKnown();
  ok('T4: compareMaps admits exactly the shared set', known['0,0'] && known['1,1'] && !known['2,2'], `newCount=${cmp.newCount}`);
  ok('T4: shared tiles read as shared, not visited', Game.mapSeen(0, 0) === 'shared');
  // static: the codex MAPS renderer must never touch tile DETAIL (no content leak)
  const appSrc = fs.readFileSync(path.join(ROOT, 'src/js/app.js'), 'utf8');
  const secStart = appSrc.indexOf('function villageMapSection()');
  const secEnd = appSrc.indexOf('function codexAliensSection');
  const sec = appSrc.slice(secStart, secEnd);
  ok('T4: codex MAPS render touches only tile type (glyph+name), never detail',
    !/genDetail|\.detail\b|forage|plants/.test(sec), 'render is type-only');
  // the main grid renderer honors the same gate (map_shared_detail / map_depletion_fog)
  const hasGate = /mapSeen|seenTiles|villageMapKnown/.test(appSrc);
  ok('T4: app.js has a seen-gate for map rendering', hasGate);
  Game.tbfight = null;
}

// ---- T5. EXPLOIT: bridge economy wood conservation ----
{
  setup();
  const s = Game.state.scholar;
  const P = { x: Game.map.px, y: Game.map.py };
  const T = adjUnblocked();
  ok('T5 setup: adjacent tile', !!T);
  // plant a washed-out blockage on the T approach
  const dx = Math.sign(T.x - P.x), dy = Math.sign(T.y - P.y);
  Game.tileAt(T.x, T.y).blockFrom = { dx: -dx, dy: -dy, type: 'washed_out' };
  Game.addWood(20);
  const wood = () => Game.woodCount();
  const w0 = wood();
  const r1 = Game.buildBridge(T.x, T.y);
  ok('T5: bridge builds on washed_out', r1 !== false && !!Game.tileAt(T.x, T.y).bridged);
  ok('T5: bridge costs exactly 4 wood', wood() === w0 - 4, `${w0}->${wood()}`);
  const r2 = Game.buildBridge(T.x, T.y);
  ok('T5: double-build refused, no second charge', r2 === false && wood() === w0 - 4);
  const w1 = wood();
  Game.smashBridge(T.x, T.y, 'storm');
  ok('T5: storm smash removes the bridge, no wood refund (no dupe)', !Game.tileAt(T.x, T.y).bridged && wood() === w1, `wood=${wood()}`);
  ok('T5: smash restores the honest pre-bridge blockage', !!(Game.tileAt(T.x, T.y).blockFrom && Game.tileAt(T.x, T.y).blockFrom.type === 'washed_out'));
  Game.buildBridge(T.x, T.y);
  ok('T5: rebuild costs 4 again (sink, not printer)', wood() === w1 - 4, `wood=${wood()}`);
  // fallen_tree one-shot wood
  const T2 = Game.travelTargets().find(t => t.x !== T.x || t.y !== T.y) ;
  const P2 = { x: Game.map.px, y: Game.map.py };
  const dx2 = Math.sign(T2.x - P2.x), dy2 = Math.sign(T2.y - P2.y);
  Game.tileAt(T2.x, T2.y).blockFrom = { dx: -dx2, dy: -dy2, type: 'fallen_tree' };
  const w2 = wood();
  Game.clearBlockage(T2.x, T2.y);
  ok('T5: fallen_tree clears for +2 wood worth of value', wood() === w2 + 2, `${w2}->${wood()}`);
  Game.clearBlockage(T2.x, T2.y);
  ok('T5: second clear is a no-op, no wood farm', wood() === w2 + 2, `wood=${wood()}`);
  Game.tbfight = null;
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
