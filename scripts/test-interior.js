// Interior/exterior sub-state: Haven hall and Haven grounds are ONE node.
// Usage: node scripts/test-interior.js
// Covers: npcInside defaults, door transitions move only player (+party/followers),
// ensureVillagerPositions filters by side-of-door, NPC door drift on agency,
// node identity unchanged by door transitions, travelTo syncs party sub-state.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/conversation.js', 'src/js/journal.js',
 'src/js/party.js', 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js',
 'src/js/food.js', 'src/js/corpses.js', 'src/js/lifeseed.js', 'src/js/progression.js',
 'src/js/betrayal.js'
].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
globalThis.Scattering.Game.progState = function () {
  const s = this.state.scholar; s.prog = s.prog || {};
  s.prog.moments = s.prog || []; return s.prog;
};
globalThis.Scattering.Game.recordMoment = function () {};
globalThis.Scattering.Game.broadcastLine = function () {};
eval(fs.readFileSync(path.join(ROOT, 'src/js/membership.js'), 'utf8'));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}`); }
}
const said = [];
function freshGame() {
  said.length = 0;
  Game.say = function (t) { said.push(String(t)); };
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  s.kcal = 3000; s.health = 100; s.exiled = false;
  return s;
}
function rosterNPCs() {
  return (Game.state.village.roster || []).filter(id => id !== Game.villagerId);
}
function havenXY() {
  const v = Game.state.village;
  return { hx: v.px ?? 4, hy: v.py ?? 4 };
}

(async () => {
  await Game.init();

  // ---------- A. defaults: everyone starts inside ----------
  {
    freshGame();
    const npcs = rosterNPCs();
    ok('roster non-empty', npcs.length >= 5);
    ok('all NPCs default inside', npcs.every(id => Game.npcInside(id) === true));
    ok('player starts inside', Game.state.scholar.insideHaven === true);
  }

  // ---------- B. exitBuilding moves only the player ----------
  {
    freshGame();
    const npcs = rosterNPCs();
    const before = npcs.map(id => ({ id, node: { ...Game.npcNode(id) }, inside: Game.npcInside(id) }));
    Game.map.px = havenXY().hx; Game.map.py = havenXY().hy;
    Game.exitBuilding();
    ok('player outside after exit', Game.state.scholar.insideHaven === false);
    ok('no NPC changed node on door transition',
      before.every(b => { const n = Game.npcNode(b.id); return n.nx === b.node.nx && n.ny === b.node.ny; }));
    ok('no NPC changed sub-state on door transition',
      before.every(b => Game.npcInside(b.id) === b.inside));
    // positions: nobody outside with the player (all inside)
    Game.ensureVillagerPositions();
    const pos = Game.state.village.positions || {};
    ok('no NPC renders outside with player', Object.keys(pos).length === 0);
  }

  // ---------- C. side-of-door filtering ----------
  {
    freshGame();
    Game.map.px = havenXY().hx; Game.map.py = havenXY().hy;
    const npcs = rosterNPCs();
    // send half the NPCs outside via their own agency
    const outsiders = npcs.slice(0, Math.ceil(npcs.length / 2));
    outsiders.forEach(id => Game.npcSetInside(id, false));
    // player inside: only inside NPCs get positions
    Game.state.scholar.insideHaven = true;
    Game.ensureVillagerPositions();
    let pos = Game.state.village.positions || {};
    const insideIds = npcs.filter(id => Game.npcInside(id));
    ok('inside: all positioned NPCs are inside',
      Object.keys(pos).every(id => Game.npcInside(id) === true));
    ok('inside: outsiders not positioned', outsiders.every(id => !pos[id]));
    // player exits: only outside NPCs get positions
    Game.exitBuilding();
    Game.ensureVillagerPositions();
    pos = Game.state.village.positions || {};
    ok('outside: all positioned NPCs are outside',
      Object.keys(pos).every(id => Game.npcInside(id) === false));
    ok('outside: insiders not positioned', insideIds.every(id => !pos[id]));
    ok('outsiders visible outside', outsiders.some(id => pos[id]));
  }

  // ---------- D. party/followers come through the door ----------
  {
    freshGame();
    Game.map.px = havenXY().hx; Game.map.py = havenXY().hy;
    const npcs = rosterNPCs();
    const fid = npcs[0];
    Game.state.village.followers = [fid];
    Game.exitBuilding();
    ok('follower sub-state follows player out', Game.npcInside(fid) === false);
    Game.ensureVillagerPositions();
    const pos = Game.state.village.positions || {};
    ok('follower positioned near player outside', !!pos[fid]);
    Game.enterBuilding();
    ok('follower sub-state follows player in', Game.npcInside(fid) === true);
    Game.ensureVillagerPositions();
    const pos2 = Game.state.village.positions || {};
    ok('follower positioned near player inside', !!pos2[fid]);
    // a non-follower keeps its own state through both transitions
    const other = npcs[1];
    ok('non-follower still inside', Game.npcInside(other) === true);
  }

  // ---------- E. door drift happens on NPC agency ----------
  {
    freshGame();
    Game.map.px = havenXY().hx; Game.map.py = havenXY().hy;
    const npcs = rosterNPCs();
    // force day, run many part transitions; drift should move some NPCs out
    Game.dayPart = 1;
    let moved = 0;
    for (let i = 0; i < 40; i++) {
      const before = npcs.map(id => Game.npcInside(id));
      try { Game.npcNodeTravel(); } catch (e) {}
      npcs.forEach((id, ix) => { if (Game.npcInside(id) !== before[ix]) moved++; });
    }
    ok('drift moves NPCs through the door over time', moved > 0);
    // night drift pulls them back in
    Game.dayPart = 3;
    for (let i = 0; i < 60; i++) { try { Game.npcNodeTravel(); } catch (e) {} }
    const insideCount = npcs.filter(id => Game.npcInside(id)).length;
    ok('night drift pulls most NPCs inside', insideCount >= npcs.length * 0.5);
  }

  // ---------- F. travelTo syncs party sub-state ----------
  {
    freshGame();
    const npcs = rosterNPCs();
    const fid = npcs[0];
    Game.state.village.followers = [fid];
    Game.npcSetInside(fid, true);
    Game.map.px = havenXY().hx; Game.map.py = havenXY().hy;
    Game.reveal(2, 3); Game.reveal(3, 3);
    Game.map.px = 2; Game.map.py = 3;
    Game.travelTo(3, 3, true);
    ok('arriving at haven: player outside', Game.state.scholar.insideHaven === false);
    ok('arriving at haven: follower outside too', Game.npcInside(fid) === false);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
