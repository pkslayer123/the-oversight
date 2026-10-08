// CHILDREN proof (Steve 2026-10-07). Usage: node scripts/test-npc-children-20261007.js
// Proves the Everyone Acts child extension:
//   1. Children route to npcChildAction (age < 15), adults keep adult logic.
//   2. Hungry child eats from the pantry (kids fed first, threshold ~0);
//      hungry child does NOT forage like an adult (no cell depletion).
//   3. Scared child hides TOWARD the nearest adult (never into the wilds).
//   4. Child movement stays interior (1..7) and 3+ tiles from monsters.
//   5. Tired child rests (energy rises).
//   6. Child adjacent to a working adult learns (trust bumps, learned++).
//   7. Two adjacent kids play (both social drops).
//   8. Lone child follows a distant adult (moves closer, stays >= ... near).
//   9. Chatter budget respected; movement costs energy.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

// seed RNG for a deterministic, reproducible proof
let _seed = (parseInt(process.env.SEED || '7', 10) >>> 0) || 7;
Math.random = function () {
  _seed |= 0; _seed = (_seed + 0x6D2B79F5) | 0;
  let t = Math.imul(_seed ^ (_seed >>> 15), 1 | _seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

// window stub for eval phase only (equipment.js needs it at load)
global.window = global;
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
// minimal document stub: drama.js injects CSS at load; ensureOverlay uses contains()
global.document = {
  getElementById: () => null,
  createElement: () => ({
    style: {}, dataset: {}, textContent: '',
    classList: { add() {}, remove() {}, contains() { return false; } },
    appendChild() {}, setAttribute() {}, addEventListener() {},
  }),
  head: { appendChild() {} },
  body: { appendChild() {} },
  contains: () => false,
};
const GAME_PATH = process.env.TEST_GAME_PATH || 'src/js/game.js';
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 GAME_PATH, 'src/js/encounters.js', 'src/js/conversation.js',
 'src/js/convo-mood.js', 'src/js/convoTopics.js', 'src/js/convo-wants.js',
 'src/js/convo-dialogue.js', 'src/js/convo-beats.js', 'src/js/examine.js',
 'src/js/equipment.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/party-formal.js', 'src/js/truth.js', 'src/js/contests.js',
 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js',
 'src/js/justice.js', 'src/js/food.js', 'src/js/betrayal.js',
 'src/js/corpses.js', 'src/js/lifeseed.js', 'src/js/progression.js',
 'src/js/ledger.js', 'src/js/villager-agency.js', 'src/js/codex-people.js',
 'src/js/membership.js', 'src/js/hierarchy.js', 'src/js/debug-scenarios.js',
 'src/js/build.js', 'src/js/drama.js'
].forEach(f => eval(fs.readFileSync(path.isAbsolute(f) ? f : path.join(ROOT, f), 'utf8')));
delete global.window; // sync path for combat/turns
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}${extra ? ' - ' + extra : ''}`); }
}
const silentCtx = () => ({ night: false, announced: 99 }); // chatter budget exhausted

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const v = Game.state.village;
  const s = Game.state.scholar;

  Game.map.px = 4; Game.map.py = 4;
  Game.ensureVillagerPositions();
  const npcIds = (v.roster || []).filter(id => id !== Game.villagerId && v.positions[id]);
  ok('have NPCs on grid', npcIds.length >= 3, `got ${npcIds.length}`);
  if (npcIds.length < 3) { console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0); }

  // make two children and keep one adult; everyone else parked far away
  const KID1 = npcIds[0], KID2 = npcIds[1], ADULT = npcIds[2];
  Game.vpOf(KID1).age = 7;
  Game.vpOf(KID2).age = 10;
  Game.vpOf(ADULT).age = 34;
  for (const id of npcIds) if (id !== KID1 && id !== KID2 && id !== ADULT) {
    Game.vpOf(id).age = 40;
    v.positions[id] = { mx: 0, my: 0 };
  }
  ok('npcAge reads child ages', Game.npcAge(KID1) === 7 && Game.npcAge(ADULT) === 34);

  // known grid: all grass, fire center
  const detail = Game.genDetail(4, 4);
  for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) detail[y][x] = 'grass';
  detail[4][4] = 'fire';
  s.mx = 0; s.my = 0; // player far
  const t = Game.playerTile();
  t.detailRegrow = {};

  // ---- 1. routing: child -> npcChildAction, adult keeps adult logic ----
  const childCalls = [];
  const origChild = Game.npcChildAction.bind(Game);
  Game.npcChildAction = (rid, d, ctx, H) => { childCalls.push(rid); return origChild(rid, d, ctx, H); };
  const nk1 = Game.npcNeeds(KID1);
  nk1.hunger = 0; nk1.fear = 0; nk1.energy = 80; nk1.social = 0;
  v.positions[KID1] = { mx: 4, my: 5 };
  v.positions[ADULT] = { mx: 4, my: 3 };
  Game.npcTakeAction(KID1, detail, silentCtx());
  ok('child routed to npcChildAction', childCalls.includes(KID1), JSON.stringify(childCalls));
  Game.npcTakeAction(ADULT, detail, silentCtx());
  ok('adult NOT routed to npcChildAction', !childCalls.includes(ADULT));
  Game.npcChildAction = origChild;

  // ---- 2. hungry child eats from pantry, does NOT forage ----
  v.pantry = [{ id: 'stew', kcalEach: 300, units: 2 }];
  nk1.hunger = 90; nk1.fear = 0; nk1.energy = 80; nk1.social = 0;
  v.positions[KID1] = { mx: 3, my: 4 };
  detail[4][2] = 'plant'; // forageable adjacent — an adult would deplete it
  t.detailRegrow = {};
  const unitsBefore = v.pantry[0].units;
  Game.npcTakeAction(KID1, detail, silentCtx());
  ok('hungry child ate (hunger dropped)', nk1.hunger < 90, `hunger=${nk1.hunger}`);
  ok('pantry unit consumed (kids fed first)', v.pantry[0].units < unitsBefore || v.pantry.length === 0);
  ok('child did NOT forage the plant (no depletion)', !t.detailRegrow['2,4'] && detail[4][2] === 'plant');
  detail[4][2] = 'grass';

  // ---- 3. scared child hides TOWARD nearest adult ----
  const nk2 = Game.npcNeeds(KID2);
  nk2.fear = 90; nk2.hunger = 0; nk2.energy = 80; nk2.social = 0;
  v.positions[KID2] = { mx: 6, my: 6 };
  v.positions[ADULT] = { mx: 2, my: 2 };
  const dBefore = Math.max(Math.abs(6 - 2), Math.abs(6 - 2));
  Game.npcTakeAction(KID2, detail, silentCtx());
  const kp = v.positions[KID2];
  const dAfter = Math.max(Math.abs(kp.mx - 2), Math.abs(kp.my - 2));
  ok('scared child moved TOWARD adult (hide, not flee)', dAfter < dBefore, `${dBefore}->${dAfter}`);
  ok('fear decreased after hiding', nk2.fear < 90, `fear=${nk2.fear}`);

  // ---- 4. interior-only movement + monster avoidance ----
  // isolate: only KID2 + ADULT on the grid — pure follow vs monster
  for (const id of npcIds) if (id !== KID2 && id !== ADULT) delete v.positions[id];
  nk2.fear = 0; nk2.hunger = 0; nk2.energy = 80; nk2.social = 0;
  v.positions[KID2] = { mx: 1, my: 4 }; // at interior edge
  v.positions[ADULT] = { mx: 7, my: 4 }; // adult far: follow pulls outward
  Game.spawnWorldMonster('hummice', 4, 4, { mx: 5, my: 4 }); // monster blocks the path
  let interiorOk = true, monsterOk = true;
  for (let i = 0; i < 30; i++) {
    nk2.hunger = 0; nk2.fear = 0; nk2.energy = 80; nk2.social = 95; // social: seeks/follows
    Game.npcTakeAction(KID2, detail, silentCtx());
    const p = v.positions[KID2];
    if (p.mx < 1 || p.mx > 7 || p.my < 1 || p.my > 7) interiorOk = false;
    if (Math.max(Math.abs(p.mx - 5), Math.abs(p.my - 4)) <= 2) monsterOk = false;
  }
  ok('child never left interior (1..7)', interiorOk, JSON.stringify(v.positions[KID2]));
  ok('child stayed 3+ tiles from monster', monsterOk, JSON.stringify(v.positions[KID2]));
  // clean up monster
  try { Game.removeWorldMonster(Game.playerMonster()); } catch (e) { s.monster = null; }
  // restore the kids for the remaining tests
  v.positions[KID1] = { mx: 4, my: 5 };

  // ---- 5. tired child rests ----
  nk1.hunger = 0; nk1.fear = 0; nk1.energy = 10; nk1.social = 0;
  v.positions[KID1] = { mx: 3, my: 4 }; // adjacent to fire
  const eBefore = nk1.energy;
  Game.npcTakeAction(KID1, detail, silentCtx());
  ok('tired child rested (energy rose)', nk1.energy > eBefore, `${eBefore}->${nk1.energy}`);

  // ---- 6. learn by watching: adjacent to a working adult ----
  nk1.hunger = 0; nk1.fear = 0; nk1.energy = 80; nk1.social = 50;
  v.positions[KID1] = { mx: 4, my: 5 };
  v.positions[ADULT] = { mx: 4, my: 4 }; // adjacent
  v.trust = v.trust || {};
  const trustBefore = v.trust[ADULT] === undefined ? 10 : v.trust[ADULT];
  const learnedBefore = nk1.learned || 0;
  // force the learn branch: run until it triggers (p=0.5 per call)
  let learned = false;
  for (let i = 0; i < 20 && !learned; i++) {
    nk1.hunger = 0; nk1.fear = 0; nk1.energy = 80; nk1.social = 50;
    Game.npcTakeAction(KID1, detail, Object.assign(silentCtx(), { worked: { [ADULT]: true } }));
    if ((nk1.learned || 0) > learnedBefore) learned = true;
  }
  ok('child learned by watching (learned++)', learned);
  ok('watching built trust with teacher', (v.trust[ADULT] === undefined ? 10 : v.trust[ADULT]) >= trustBefore);

  // ---- 7. two adjacent kids play ----
  nk1.hunger = 0; nk1.fear = 0; nk1.energy = 80; nk1.social = 90;
  nk2.hunger = 0; nk2.fear = 0; nk2.energy = 80; nk2.social = 50;
  v.positions[KID1] = { mx: 4, my: 5 };
  v.positions[KID2] = { mx: 4, my: 6 }; // adjacent
  v.positions[ADULT] = { mx: 0, my: 0 }; // no adult interference... (0,0) is edge; adult parked
  const s1Before = nk1.social, s2Before = nk2.social;
  Game.npcTakeAction(KID1, detail, silentCtx());
  ok('playing dropped kid1 social', nk1.social < s1Before, `${s1Before}->${nk1.social}`);
  ok('playing dropped kid2 social', nk2.social < s2Before, `${s2Before}->${nk2.social}`);

  // ---- 8. lone child follows a distant adult ----
  // isolate: only KID2 + ADULT on the grid
  for (const id of npcIds) if (id !== KID2 && id !== ADULT) delete v.positions[id];
  nk2.hunger = 0; nk2.fear = 0; nk2.energy = 80; nk2.social = 0; // not social-playing
  v.positions[KID2] = { mx: 1, my: 1 };
  v.positions[ADULT] = { mx: 6, my: 6 };
  const fBefore = Math.max(Math.abs(1 - 6), Math.abs(1 - 6));
  Game.npcTakeAction(KID2, detail, silentCtx());
  const fp = v.positions[KID2];
  const fAfter = Math.max(Math.abs(fp.mx - 6), Math.abs(fp.my - 6));
  ok('lone child followed adult (moved closer)', fAfter < fBefore, `${fBefore}->${fAfter}`);
  // restore KID1 for the chatter test
  v.positions[KID1] = { mx: 2, my: 2 };

  // ---- 9. chatter budget + energy cost ----
  for (const id of [KID1, KID2]) {
    const nn = Game.npcNeeds(id);
    nn.hunger = 95; nn.fear = 0; nn.energy = 80; nn.social = 0;
    v.positions[id] = { mx: 2, my: 2 };
  }
  v.pantry = [{ id: 'stew', kcalEach: 300, units: 10 }];
  v.positions[ADULT] = { mx: 0, my: 0 };
  s.mx = 2; s.my = 3; // player near
  const logN = Game.log.length;
  const origInit = Game.villagerInitiative.bind(Game);
  Game.villagerInitiative = () => {};
  Game.villagerTurn();
  Game.villagerInitiative = origInit;
  ok('chatter budget respected (<=1 per turn)', Game.log.length - logN <= 1, `said=${Game.log.length - logN}`);

  // energy cost of child movement (isolated: KID2 + ADULT only)
  for (const id of npcIds) if (id !== KID2 && id !== ADULT) delete v.positions[id];
  const nk = Game.npcNeeds(KID2);
  nk.hunger = 0; nk.fear = 0; nk.energy = 80; nk.social = 0;
  v.positions[KID2] = { mx: 1, my: 1 };
  v.positions[ADULT] = { mx: 6, my: 6 };
  let moved = false, costOk = false;
  for (let i = 0; i < 10 && !moved; i++) {
    const ex = v.positions[KID2].mx, ey = v.positions[KID2].my, ee = nk.energy;
    Game.npcTakeAction(KID2, detail, silentCtx());
    if (v.positions[KID2].mx !== ex || v.positions[KID2].my !== ey) { moved = true; costOk = nk.energy < ee; }
  }
  ok('child moved (follow)', moved);
  ok('child movement cost energy', costOk);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
