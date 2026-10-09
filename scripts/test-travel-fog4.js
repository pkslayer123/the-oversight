// BREAK-IT: TRAVEL & MAP round 4 (2026-10-09) — fog-of-war, teleport callers,
// mid-walk/mid-crossing softlocks, cost-label honesty, dead code.
// ATTACKS:
//   T1 FOG: codex MAPS section rendered every villager's seeded visitedTiles
//       NAMED, bypassing the compareMaps conversation gate (maps_are_social).
//   T2 FOG: renderMap rendered 'shared' tiles with full TileScenes/emoji
//       detail — the Steve 2026-10-07 "biome color only" rule was re-broken
//       by the _seenSimple first block.
//   T3 FOG: depletionClass gated on t.revealed (travel flag), not seenTiles
//       (fog flag) — fogged tiles rendered visibly picked-clean/barren.
//   T4 SOFTLOCK/HONESTY: dying to your own pit mid-barrier-crossing — the
//       old tbBarrierExit kept going: 'flee' narration for a corpse, or the
//       fight continuing with a dead body (tbEnd later overwriting the new
//       bearer's health with the old fighter's HP).
//   T5 HONESTY: "Walk here (N kcal)" quoted path.length*10 but beginPathWalk
//       charged the travel.cost_mult-discounted price — label lied to
//       Wanderer/Second Skin holders. walkCost() is now the single formula.
//   T6 DEAD CODE: Game.movePath — zero callers, superseded by
//       beginPathWalk/pathStep. Removed.
//   T7 EXPLOIT: blockage card sat open when a fight started —
//       clearBlockage/buildBridge spent kcal and removed the blockage with
//       NO time cost mid-fight (tickAction no-ops in combat); swim charged
//       20 kcal then refused the crossing.
// Usage: node scripts/test-travel-fog4.js            (AFTER fix)
//        BEFORE=1 node scripts/test-travel-fog4.js    (pre-fix HEAD code)
//        SEED=999 node scripts/test-travel-fog4.js   (seed override)
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const BEFORE = !!process.env.BEFORE;
let gameSrc, appSrc;
if (BEFORE) {
  execSync('git show HEAD:src/js/game.js > /tmp/bt4-game-before.js', { cwd: ROOT });
  execSync('git show HEAD:src/js/app.js > /tmp/bt4-app-before.js', { cwd: ROOT });
  gameSrc = fs.readFileSync('/tmp/bt4-game-before.js', 'utf8');
  appSrc = fs.readFileSync('/tmp/bt4-app-before.js', 'utf8');
  console.log('MODE: BEFORE (pre-fix game.js + app.js from git HEAD)');
} else {
  gameSrc = fs.readFileSync(path.join(ROOT, 'src/js/game.js'), 'utf8');
  appSrc = fs.readFileSync(path.join(ROOT, 'src/js/app.js'), 'utf8');
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
// FULL module list in index.html order, minus DOM-only
// (app.js/sprites.js/tile-scenes.js/move-anim.js/drama.js).
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
Game.checkEncounter = () => {};
Game.checkAnimals = () => {};

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail ? ' — ' + detail : '')); }
}
function setup() {
  rng.reset();
  if (Game.tbfight) Game.tbfight = null;
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar; s.kcal = 9000; s.hydration = 100; s.health = 100;
}
function captureSay(fn) {
  const says = [];
  const origSay = Game.say; Game.say = (m) => says.push(String(m));
  let r; try { r = fn(); } finally { Game.say = origSay; }
  return { r, says };
}
// extract a top-level `function NAME(...)` from app source by brace matching
function extractFn(src, name) {
  const re = new RegExp('function ' + name + '\\s*\\(');
  const m = re.exec(src);
  if (!m) return null;
  let i = src.indexOf('{', m.index), depth = 0, start = i;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (!depth) break; }
  }
  return src.slice(m.index, i + 1);
}

// ---- T1. codex MAPS fog leak: unshared villager tiles named without earning ----
{
  setup();
  Game.seedVillagerMaps();
  const s = Game.state.scholar;
  const seen = new Set(Object.keys(s.seenTiles || {}));
  // the OLD union logic (app.js villageMapSection, pre-fix): every villager's
  // seeded visitedTiles rendered named, no sharing gate.
  const oldUnion = new Set(seen);
  const all = (Game.data.villagers || []).concat(Game.data.background_survivors || []);
  for (const vp of all) for (const k of (vp.visitedTiles || [])) oldUnion.add(k);
  const leaked = [...oldUnion].filter(k => !seen.has(k));
  console.log(`  [info T1] seen=${seen.size} oldUnion=${oldUnion.size} leaked=${leaked.length}`);
  if (BEFORE) {
    ok('BEFORE: codex MAPS union names tiles nobody shared (fog leak real)', leaked.length > 0, 'leaked=' + leaked.length);
  } else {
    ok('AFTER: Game.villageMapKnown exists', typeof Game.villageMapKnown === 'function');
    const known = new Set(Object.keys(Game.villageMapKnown()));
    const stillLeaked = leaked.filter(k => known.has(k));
    ok('AFTER: unshared villager tiles are NOT in the village map', stillLeaked.length === 0, 'stillLeaked=' + stillLeaked.length);
    ok('AFTER: own seen tiles still shown', [...seen].every(k => known.has(k)));
    // the gate opens through the designed channel: compare maps in conversation
    const sharer = all.find(vp => vp && vp.id && (vp.visitedTiles || []).some(k => !seen.has(k) && !known.has(k)));
    if (sharer) {
      const before = Object.keys(Game.villageMapKnown()).length;
      Game.compareMaps(sharer.id);
      const after = Object.keys(Game.villageMapKnown()).length;
      ok('AFTER: compareMaps shares the villager\'s ground (gate works)', after > before, `${before} -> ${after}`);
      ok('AFTER: sharing recorded', !!(Game.state.scholar.mapsSharedBy || {})[sharer.id]);
    } else {
      ok('AFTER: (no unshared villager tiles this seed — gate vacuous)', true);
    }
  }
}

// ---- T2. renderMap: 'shared' tiles must render biome-color-only, not full detail ----
{
  setup();
  // real render of renderMap() extracted from app source, with DOM-free stubs
  const fnSrc = extractFn(appSrc, 'renderMap');
  ok('renderMap extractable from app source', !!fnSrc);
  if (fnSrc) {
    const realS = global.S;
    global.villagerSpriteHtml = () => '';
    global.esc = (x) => String(x).replace(/</g, '&lt;');
    global.S = {
      TILE_GLYPH: { grove: 'X-GROVE', meadow: 'X-MEADOW', thicket: 'X-THICKET', forest: 'X-FOREST', creek: 'X-CREEK' },
      TILE_NAME: { grove: 'Grove', meadow: 'Meadow', thicket: 'Thicket', forest: 'Forest', creek: 'Creek' },
    };
    global.Scattering = globalThis.Scattering; // TileScenes undefined -> fallback path
    const renderMap = eval('(' + fnSrc + ')');
    const px = Game.map.px, py = Game.map.py;
    const s = Game.state.scholar;
    // shared tile at (px+1,py): scout-reported, never visited
    const shX = Math.min(8, px + 1), shY = py;
    const vX = Math.max(0, px - 1), vY = py;
    s.seenTiles = s.seenTiles || {};
    s.seenTiles[shX + ',' + shY] = { k: 's', by: 'some-villager' };
    s.seenTiles[vX + ',' + vY] = { k: 'v' };
    const shT = Game.tileAt(shX, shY); shT.type = 'creek'; shT.revealed = true; shT.maxStock = 100; shT.stock = 100;
    const vT = Game.tileAt(vX, vY); vT.type = 'grove'; vT.revealed = true; vT.maxStock = 100; vT.stock = 100;
    const html = renderMap(Game.state, new Set());
    // renderMap's detail fallback hardcodes emoji per type (creek -> 💧,
    // grove -> 🌳); the shared branch renders a biome-color div
    // (opacity:0.7) with no emoji. A shared tile showing 💧 = full detail.
    const sharedMarkers = (html.match(/opacity:0\.7/g) || []).length;
    const creekDetail = (html.match(/💧/g) || []).length;
    const groveDetail = (html.match(/🌳/g) || []).length;
    console.log(`  [info T2] biomeOnlyDivs=${sharedMarkers} creekDetail=${creekDetail} groveDetail=${groveDetail}`);
    if (BEFORE) {
      ok('BEFORE: shared tile renders FULL detail (fog-depth leak real)', creekDetail > 0, 'creek detail markers=' + creekDetail);
    } else {
      ok('AFTER: shared tile renders biome-color-only (no full detail)', creekDetail === 0 && sharedMarkers > 0,
        `creekDetail=${creekDetail} biomeOnly=${sharedMarkers}`);
      ok('AFTER: visited tile still renders full detail', groveDetail > 0, 'groveDetail=' + groveDetail);
    }
    delete global.villagerSpriteHtml; delete global.esc; global.S = realS;
  }
}

// ---- T3. depletionClass: fogged tiles must not show picked-clean/barren ----
{
  setup();
  const px = Game.map.px, py = Game.map.py;
  // fogged for the PLAYER: not in seenTiles, but revealed for travel
  const fx = Math.min(8, px + 2), fy = py;
  delete (Game.state.scholar.seenTiles || {})[fx + ',' + fy];
  const t = Game.tileAt(fx, fy);
  t.revealed = true; t.maxStock = 100; t.stock = 10; // barren
  const fogged = !Game.mapSeen(fx, fy);
  if (BEFORE) {
    const cls = Game.depletionClass(t);
    ok('BEFORE: fogged-but-revealed tile reports depletion (fog leak real)', fogged && cls === 'depleted-barren', 'cls=' + cls);
  } else {
    const clsFogged = Game.depletionClass(t, fx, fy);
    ok('AFTER: fogged tile reports no depletion class', fogged && clsFogged === '', 'cls=' + clsFogged);
    // earned knowledge still shows: mark visited, depletion renders
    Game.markSeen(fx, fy, 'visited');
    const clsSeen = Game.depletionClass(t, fx, fy);
    ok('AFTER: visited tile still reports depletion', clsSeen === 'depleted-barren', 'cls=' + clsSeen);
    // old signature (no coords) keeps working for non-render callers
    ok('AFTER: depletionClass(t) without coords still gates on revealed', Game.depletionClass(t) === 'depleted-barren');
  }
}

// ---- T4. pit-death mid-barrier-crossing: the fight must not continue for a corpse ----
function setupBarrierDeath() {
  setup();
  const px = Game.map.px, py = Game.map.py;
  // destination (px-1, py): clear, pre-visited (skip arrival text), with YOUR pit
  const dx = px - 1;
  const t = Game.tileAt(dx, py);
  t.type = 'grove'; t.visited = true; delete t.needsBridge; delete t.bridged; delete t.blockFrom;
  t.traps = [{ recipeId: 'pit_trap', setDay: Game.state.scholar.day - 1, uses: 3 }];
  Game.startCombat('hushwolf');
  // drop HP AFTER the fight starts: tbEndCheck auto-resolves fights opened
  // at near-death HP, but the pit reads scholar.health at arrival time.
  // Strip cheat-death so the pit is deterministically lethal (seed 999's
  // generated bearer has second_wind — the save is correct behavior, but
  // this test needs the death).
  const s0 = Game.state.scholar;
  const noCheat = (a) => { const id = (a && a.id) || a; return id !== 'molt' && id !== 'second_wind' && id !== 'phoenix_clause'; };
  s0.abilities = (s0.abilities || []).filter(noCheat);
  s0.backgroundAbilities = (s0.backgroundAbilities || []).filter(noCheat);
  Game.state.scholar.health = 10; // any pit hit (15-25) kills
  const p = Game.tbFighter('p');
  p.mx = 0; p.my = 4; // west edge: pushing west exits to (px-1, py)
  return { px, py, dx };
}
{
  const realRandom = Math.random;
  // T4a: barrier roll SUCCEEDS (would flee) — but you died in your pit first
  {
    const { dx } = setupBarrierDeath();
    const bearerBefore = Game.villagerId;
    let n = 0;
    Math.random = () => (++n <= 2 ? 0.1 : 0.1); // pit triggers, lethal, roll succeeds
    const { r, says } = captureSay(() => Game.tbBarrierExit(-1, 0));
    Math.random = realRandom;
    const died = Game.villagerId !== bearerBefore || Game.over === true;
    const fleeLie = says.some(m => /BARRIER CROSSED|You escape|lose your trail/i.test(m));
    console.log(`  [info T4a] died=${died} fleeLieSaid=${fleeLie} tbfight=${Game.tbfight ? 'live' : 'null'}`);
    if (BEFORE) {
      ok('BEFORE: dead body "flees" the fight — dishonest continuation real', died && fleeLie);
    } else {
      ok('AFTER: player died in the pit (mantle passed)', died);
      ok('AFTER: fight dissolved, not fled', Game.tbfight === null);
      ok('AFTER: no flee/barrier narration for a corpse', !fleeLie, says.filter(m => /BARRIER|escape|trail/i.test(m)).join(' | ').slice(0, 160));
      ok('AFTER: new bearer keeps full health (no corpse-HP overwrite)', Game.state.scholar.health === Game.maxHealth());
    }
  }
  // T4b: barrier roll FAILS — the fight must not continue with a dead body
  {
    const { dx } = setupBarrierDeath();
    const bearerBefore = Game.villagerId;
    let n = 0;
    Math.random = () => (++n <= 2 ? 0.1 : 0.9); // pit triggers, lethal, roll fails
    const { r, says } = captureSay(() => Game.tbBarrierExit(-1, 0));
    Math.random = realRandom;
    const died = Game.villagerId !== bearerBefore || Game.over === true;
    const fightContinues = Game.inCombat();
    const continueLie = says.some(m => /right behind you|fight continues/i.test(m));
    console.log(`  [info T4b] died=${died} fightContinues=${fightContinues} continueLie=${continueLie}`);
    if (BEFORE) {
      ok('BEFORE: fight continues with a DEAD body (desync real)', died && fightContinues);
    } else {
      ok('AFTER: player died in the pit (mantle passed)', died);
      ok('AFTER: fight dissolved (not continued for a corpse)', !fightContinues && Game.tbfight === null);
      ok('AFTER: no "fight continues" narration for a corpse', !continueLie);
    }
  }
}

// ---- T5. "Walk here" label vs charged: walkCost is the one honest price ----
{
  setup();
  const s = Game.state.scholar;
  const sx = s.mx ?? 4, sy = s.my ?? 4;
  let target = null;
  outer: for (let ty = 0; ty < 9; ty++) for (let tx = 0; tx < 9; tx++) {
    const path = Game.findPath(sx, sy, tx, ty);
    if (path && path.length >= 3) { target = { tx, ty, n: path.length }; break outer; }
  }
  ok('walk target found', !!target);
  if (target) {
    // no modifiers: price is 10/square
    const k0 = s.kcal;
    const path = Game.beginPathWalk(target.tx, target.ty);
    const charged = Math.round(k0 - s.kcal);
    if (BEFORE) {
      ok('BEFORE: plain walk charges 10/square', charged === target.n * 10, `charged=${charged} n=${target.n}`);
    } else {
      // HONESTY r6 (break-it travel r6 2026-10-09): beginPathWalk no longer
      // charges up front — pathStep levies walkStepKcal() per landed square,
      // so an interrupted walk never bills squares never walked. The quote
      // (walkCost) must equal the sum of the step charges exactly.
      ok('AFTER: walkCost(n) exists', typeof Game.walkCost === 'function');
      ok('AFTER: walkCost(n) === 10*n unmodified', Game.walkCost(target.n) === target.n * 10);
      ok('AFTER: beginPathWalk charges nothing up front', charged === 0, `charged=${charged}`);
      let landed = 0;
      for (const [qx, qy] of path) if (Game.pathStep(qx, qy)) landed++;
      const walked = Math.round(k0 - s.kcal);
      ok('AFTER: full walk bills exactly walkCost(n)', walked === Game.walkCost(target.n) && landed === target.n,
        `walked=${walked} walkCost=${Game.walkCost(target.n)} landed=${landed}/${target.n}`);
    }
    // WITH Wanderer (-10%): the old label (n*10) lied; walkCost is the truth
    s.kcal = 9000;
    s.abilities = (s.abilities || []).concat([{ id: 'wanderer' }]);
    let t2 = null;
    const sx2 = s.mx ?? 4, sy2 = s.my ?? 4;
    outer2: for (let ty = 0; ty < 9; ty++) for (let tx = 0; tx < 9; tx++) {
      const p2 = Game.findPath(sx2, sy2, tx, ty);
      if (p2 && p2.length >= 3) { t2 = { tx, ty, n: p2.length }; break outer2; }
    }
    if (t2) {
      s.kcal = 9000;
      const p2path = Game.beginPathWalk(t2.tx, t2.ty);
      const chargedUpfront = Math.round(9000 - s.kcal);
      const expect = BEFORE ? Math.max(t2.n, Math.round(t2.n * 10 * 0.9)) : t2.n * Game.walkStepKcal(); // per-step sum == walkCost(n)
      console.log(`  [info T5] n=${t2.n} oldLabel=${t2.n * 10} upfront=${chargedUpfront} walkCost=${Game.walkCost(t2.n)}`);
      if (BEFORE) {
        ok('BEFORE: Wanderer pays LESS than the quoted label (label dishonest)', chargedUpfront === expect && chargedUpfront !== t2.n * 10,
          `label=${t2.n * 10} charged=${chargedUpfront}`);
      } else {
        ok('AFTER: walkCost(n) applies the Wanderer discount', Game.walkCost(t2.n) < t2.n * 10, `walkCost=${Game.walkCost(t2.n)} raw=${t2.n * 10}`);
        ok('AFTER: beginPathWalk charges nothing up front (Wanderer)', chargedUpfront === 0, `charged=${chargedUpfront}`);
        let landed2 = 0;
        for (const [qx, qy] of p2path) if (Game.pathStep(qx, qy)) landed2++;
        const walked2 = Math.round(9000 - s.kcal);
        ok('AFTER: full walk bills exactly walkCost(n) with Wanderer', walked2 === Game.walkCost(t2.n) && walked2 === expect && landed2 === t2.n,
          `walked=${walked2} walkCost=${Game.walkCost(t2.n)}`);
      }
    } else {
      ok('T5 second leg: walk target found', false);
    }
  }
}

// ---- T6. dead code: Game.movePath ----
{
  if (BEFORE) {
    ok('BEFORE: Game.movePath exists (dead code present)', typeof Game.movePath === 'function');
    const refs = (gameSrc.match(/movePath/g) || []).length;
    // definition + its own comment mention only (the beginPathWalk comment
    // was already rewritten) — no real callers
    const callerLines = gameSrc.split('\n').filter(l => /movePath/.test(l) && !/^\s*\/\//.test(l) && !/movePath\(tx, ty\) \{/.test(l));
    ok('BEFORE: movePath has no callers (dead)', callerLines.length === 0, callerLines.join(' | ').slice(0, 200));
  } else {
    ok('AFTER: Game.movePath removed', typeof Game.movePath === 'undefined');
    ok('AFTER: no movePath references left in game.js', !/movePath/.test(gameSrc));
  }
}

// ---- T7. blockage actions mid-combat: no free work, no charge-then-refuse ----
{
  setup();
  const px = Game.map.px, py = Game.map.py;
  const bx = px + 1;
  const t = Game.tileAt(bx, py);
  t.type = 'grove'; delete t.needsBridge; delete t.bridged;
  t.blockFrom = { dx: -1, dy: 0, type: 'fallen_tree' };
  const s = Game.state.scholar; s.kcal = 9000;
  const block0 = Game.travelBlockage(bx, py);
  ok('blockage present', !!(block0 && block0.blockType === 'fallen_tree'));
  Game.startCombat('hushwolf');
  const inFight = Game.inCombat();
  const k0 = s.kcal;
  const { r, says } = captureSay(() => Game.clearBlockage(bx, py));
  const blockGone = !Game.tileAt(bx, py).blockFrom;
  const kcalSpent = Math.round(k0 - s.kcal);
  console.log(`  [info T7] inFight=${inFight} ret=${r === false ? 'false' : typeof r} blockGone=${blockGone} kcalSpent=${kcalSpent}`);
  if (BEFORE) {
    ok('BEFORE: clearBlockage works mid-fight — free work, no time cost (exploit real)', inFight && blockGone && kcalSpent === 60);
  } else {
    ok('AFTER: clearBlockage refuses mid-fight', r === false);
    ok('AFTER: blockage intact', !blockGone);
    ok('AFTER: no kcal spent', kcalSpent === 0);
    ok('AFTER: says the honest line', says.some(m => /not mid-fight/i.test(m)));
    // sibling: buildBridge direct call, same class
    const b2 = captureSay(() => Game.buildBridge(bx, py));
    ok('AFTER: buildBridge refuses mid-fight too', b2.r === false);
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
