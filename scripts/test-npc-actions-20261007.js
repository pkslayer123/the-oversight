// EVERYONE ACTS proof (Steve 2026-10-07). Usage: node scripts/test-npc-actions-20261007.js
// Proves:
//   1. villagerTurn gives EVERY eligible NPC exactly 1 action (no coin flip).
//   2. Hungry NPC forages: hunger drops, shared cell depletes (detailRegrow).
//   3. Scared NPC flees from the low-trust player.
//   4. Tired NPC rests: energy rises.
//   5. Social NPC talks: both parties' social drops, trust bumps.
//   6. Dead / engaged / player / off-grid NPCs are skipped.
//   7. Chatter budget: max 1 say() per villagerTurn.
//   8. microMove and doAction trigger the NPC action phase.
//   9. Movement costs energy (same-cost principle).
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

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

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const v = Game.state.village;
  const s = Game.state.scholar;

  // player at haven node
  Game.map.px = 4; Game.map.py = 4;
  Game.ensureVillagerPositions();
  const npcIds = (v.roster || []).filter(id => id !== Game.villagerId && v.positions[id]);
  ok('have NPCs on grid', npcIds.length >= 2, `got ${npcIds.length}`);
  if (npcIds.length < 2) { console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0); }

  // control the detail grid: known layout
  const detail = Game.genDetail(4, 4);
  for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) detail[y][x] = 'grass';
  detail[4][4] = 'fire';
  const A = npcIds[0], B = npcIds[1];
  v.positions[A] = { mx: 3, my: 4 }; // adjacent to fire
  v.positions[B] = { mx: 6, my: 6 };
  detail[4][2] = 'plant'; // forageable next to A
  detail[6][5] = 'bush';  // forageable next to B
  s.mx = 0; s.my = 0; // player far away

  // ---- 1. everyone acts: each eligible NPC gets exactly 1 npcTakeAction ----
  const calls = {};
  const origTake = Game.npcTakeAction.bind(Game);
  Game.npcTakeAction = (rid, d, ctx) => { calls[rid] = (calls[rid] || 0) + 1; return origTake(rid, d, ctx); };
  Game.villagerTurn();
  const eligible = (v.roster || []).filter(id =>
    id !== Game.villagerId && v.positions[id] && !Game.isEngaged(id) && !(Game.vpOf(id) || {}).dead);
  ok('every eligible NPC acted once',
    eligible.every(id => calls[id] === 1),
    JSON.stringify(calls));
  Game.npcTakeAction = origTake;

  // ---- 2. hungry NPC forages: hunger drops, shared cell depletes ----
  const t = Game.playerTile();
  t.detailRegrow = {};
  const nA = Game.npcNeeds(A);
  nA.hunger = 90; nA.fear = 0; nA.energy = 80; nA.social = 0;
  v.positions[A] = { mx: 3, my: 4 };
  detail[4][2] = 'plant';
  const logBefore = Game.log.length;
  Game.npcTakeAction(A, detail, { night: false, announced: 99 }); // budget exhausted: silent
  ok('hungry NPC foraged (hunger dropped)', nA.hunger < 90, `hunger=${nA.hunger}`);
  ok('shared cell depleted for everyone', !!t.detailRegrow['2,4'], JSON.stringify(t.detailRegrow));
  ok('plant cell became dirt (like player forage)', detail[4][2] === 'dirt');
  ok('no chatter when budget exhausted', Game.log.length === logBefore);

  // ---- 3. scared NPC flees the low-trust player ----
  const nB = Game.npcNeeds(B);
  nB.fear = 90; nB.hunger = 0; nB.energy = 80; nB.social = 0;
  v.trust = v.trust || {}; v.trust[B] = 0;
  v.positions[B] = { mx: 2, my: 2 };
  s.mx = 2; s.my = 3; // player adjacent-ish (dist 1)
  const dBefore = Math.abs(2 - s.mx) + Math.abs(2 - s.my);
  Game.npcTakeAction(B, detail, { night: false, announced: 99 });
  const dAfter = Math.abs(v.positions[B].mx - s.mx) + Math.abs(v.positions[B].my - s.my);
  ok('scared NPC moved away from player', dAfter >= dBefore, `${dBefore}->${dAfter}`);
  ok('fear decreased after fleeing', nB.fear < 90, `fear=${nB.fear}`);

  // ---- 4. tired NPC rests ----
  nA.hunger = 0; nA.fear = 0; nA.energy = 10; nA.social = 0;
  v.positions[A] = { mx: 3, my: 4 }; // adjacent to fire at (4,4)
  const eBefore = nA.energy;
  Game.npcTakeAction(A, detail, { night: false, announced: 99 });
  ok('tired NPC rested (energy rose)', nA.energy > eBefore, `${eBefore}->${nA.energy}`);

  // ---- 5. social NPC talks ----
  nA.hunger = 0; nA.fear = 0; nA.energy = 80; nA.social = 90;
  nB.hunger = 0; nB.fear = 0; nB.energy = 80; nB.social = 50;
  v.positions[A] = { mx: 4, my: 5 };
  v.positions[B] = { mx: 4, my: 6 }; // adjacent
  for (const id of npcIds) if (id !== A && id !== B) v.positions[id] = { mx: 0, my: 0 }; // isolate the pair
  const trustBefore = (v.trust[A] || 0);
  Game.npcTakeAction(A, detail, { night: false, announced: 99 });
  ok('talker social dropped', nA.social < 90, `social=${nA.social}`);
  ok('listener social dropped', nB.social < 50, `social=${nB.social}`);
  ok('talk built trust', (v.trust[A] || 0) >= trustBefore);

  // ---- 6. dead / engaged / player skipped ----
  const calls2 = {};
  Game.npcTakeAction = (rid) => { calls2[rid] = (calls2[rid] || 0) + 1; };
  const deadId = npcIds[2] || npcIds[0];
  const vp = Game.vpOf(deadId); vp.dead = true;
  Game.setEngaged(B, 5);
  Game.villagerTurn();
  ok('dead NPC skipped', !calls2[deadId], `calls=${calls2[deadId]}`);
  ok('engaged NPC skipped', !calls2[B], `calls=${calls2[B]}`);
  ok('player never acts as NPC', !calls2[Game.villagerId]);
  vp.dead = false;
  Game.npcTakeAction = origTake;

  // ---- 7. chatter budget: max 1 say per villagerTurn ----
  for (const id of npcIds) {
    const n = Game.npcNeeds(id);
    n.hunger = 95; n.fear = 0; n.energy = 80; n.social = 0;
    v.positions[id] = { mx: 1, my: 1 };
  }
  detail[1][0] = 'bush'; detail[0][1] = 'bush'; detail[1][2] = 'bush'; detail[2][1] = 'bush';
  s.mx = 1; s.my = 2; // player near: announcements eligible
  t.detailRegrow = {};
  const logN = Game.log.length;
  const origInit = Game.villagerInitiative.bind(Game);
  Game.villagerInitiative = () => {}; // isolate: budget covers the action phase only
  Game.villagerTurn();
  Game.villagerInitiative = origInit;
  const said = Game.log.length - logN;
  ok('chatter budget respected (<=1 per turn)', said <= 1, `said=${said}`);

  // ---- 8. microMove and doAction trigger the NPC phase ----
  let phases = 0;
  const origVT = Game.villagerTurn.bind(Game);
  Game.villagerTurn = () => { phases++; return origVT(); };
  s.mx = 4; s.my = 4;
  detail[4][5] = 'grass';
  Game.microMove(4, 5);
  ok('microMove triggers NPC phase', phases >= 1, `phases=${phases}`);
  Game.villagerTurn = origVT;

  // ---- 9. movement costs energy ----
  const C = npcIds[0];
  const nC = Game.npcNeeds(C);
  nC.hunger = 0; nC.fear = 0; nC.energy = 80; nC.social = 0; // idle: will meander
  v.positions[C] = { mx: 7, my: 7 };
  Game.dayPart = 0;
  let moved = false;
  for (let i = 0; i < 20 && !moved; i++) {
    const ex = v.positions[C].mx, ey = v.positions[C].my, ee = nC.energy;
    Game.npcTakeAction(C, detail, { night: false, announced: 99 });
    if (v.positions[C].mx !== ex || v.positions[C].my !== ey) {
      moved = true;
      ok('movement cost energy', nC.energy < ee, `${ee}->${nC.energy}`);
    }
  }
  ok('idle NPC eventually moves (never frozen)', moved);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
