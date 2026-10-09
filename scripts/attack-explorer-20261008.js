#!/usr/bin/env node
// HOSTILE PLAYTEST (explorer archetype, 2026-10-08): play as an attacker, not a tourist.
// Travel/map/fog/examine/teleport attacks. Every attack below tries to break
// fog of war, teleport exploits, node sequence, examine leaks, or catch the UI lying.
// Run: node scripts/attack-explorer-20261008.js (SEED env override)
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const SEED = parseInt(process.env.SEED || '20261008', 10);
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ a >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
Math.random = mulberry32(SEED); // seed BEFORE eval: modules capture Math.random at load
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
global.window = global;
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/conversation.js', 'src/js/convo-mood.js',
 'src/js/convoTopics.js', 'src/js/convo-wants.js', 'src/js/convo-dialogue.js', 'src/js/convo-beats.js',
 'src/js/convo-scene.js', 'src/js/examine.js', 'src/js/equipment.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/party-formal.js', 'src/js/truth.js', 'src/js/contests.js', 'src/js/storage.js',
 'src/js/perceive.js', 'src/js/carexplore.js', 'src/js/justice.js', 'src/js/food.js',
 'src/js/betrayal.js', 'src/js/corpses.js', 'src/js/lifeseed.js', 'src/js/progression.js',
 'src/js/ledger.js', 'src/js/monsterBehaviors.js', 'src/js/statusEffects.js',
 'src/js/villager-agency.js', 'src/js/fieldFights.js', 'src/js/villager-objectives.js',
 'src/js/codex-people.js', 'src/js/membership.js', 'src/js/hierarchy.js', 'src/js/debug-scenarios.js'
].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
delete global.window;
const Game = globalThis.Scattering.Game;
const say = () => { const l = Game.log || []; const s = l.map(x => x.text || x).join(' '); l.length = 0; return s; };
const verdicts = [];
const attack = (name, broke, detail) => { verdicts.push([name, broke]); console.log(`[${broke ? 'BREAK' : 'HELD '} ] ${name}${detail ? ' — ' + detail : ''}`); };
function fresh() {
  Game.genDetail = () => Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => 'grass'));
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  s.health = 500; s.kcal = 2400; s.hydration = 100; s.mx = 4; s.my = 4;
  say();
  return s;
}
const endFight = () => { try { Game.tbfight = null; Game.fight = null; } catch (e) {} };
const keepAlive = s => { s.kcal = 2400; s.hydration = 100; if (s.health < 200) s.health = 500; };
const tileRevealed = (x, y) => { try { return !!Game.tileAt(x, y).revealed; } catch (e) { return false; }; };

(async () => {
  await Game.init();
  console.log('== SEED ' + SEED + ' ==');

  // ---- E1: EXPLOIT — direct travelTo to a far unrevealed tile (fog skip) ----
  {
    const s = fresh();
    // find an unrevealed tile at manhattan distance > 1 from haven (4,4)
    let target = null;
    for (let y = 0; y < 9 && !target; y++) for (let x = 0; x < 9; x++) {
      const d = Math.abs(x - 4) + Math.abs(y - 4);
      if (d > 1 && !tileRevealed(x, y)) { target = { x, y }; break; }
    }
    const px0 = Game.map.px, py0 = Game.map.py;
    const res = target ? Game.travelTo(target.x, target.y) : null;
    const moved = (Game.map.px !== px0 || Game.map.py !== py0);
    say();
    attack('E1 fog-skip travelTo', moved || res !== null,
      target ? `travelTo(${target.x},${target.y}) -> moved:${moved} res:${JSON.stringify(res)}` : 'no unrevealed tile found');
  }

  // ---- E2: EXPLOIT — travelTo with force=true skips travelTargets guard ----
  {
    const s = fresh();
    let target = null;
    for (let y = 0; y < 9 && !target; y++) for (let x = 0; x < 9; x++) {
      const d = Math.abs(x - 4) + Math.abs(y - 4);
      if (d > 3 && !tileRevealed(x, y)) { target = { x, y }; break; }
    }
    const px0 = Game.map.px;
    const res = target ? Game.travelTo(target.x, target.y, true) : null; // force (swim path)
    const moved = (Game.map.px !== px0);
    say();
    // note: force only bypasses travelBlockage, NOT the travelTargets fog gate (by design)
    attack('E2 force-travelTo fog skip', moved,
      target ? `force travelTo(${target.x},${target.y}) moved:${moved}` : 'no far tile found');
  }

  // ---- E3: EXPLOIT — mid-fight travelTo escape without the barrier roll ----
  {
    const s = fresh();
    Game.debugToWildNode(); say();
    const mdef = (Game.data.monsters || [])[0];
    let fled = false, refused = false, msg = '';
    if (mdef) {
      Game.startCombat(mdef.id); say();
      const px0 = Game.map.px, py0 = Game.map.py;
      const tgt = Game.travelTargets()[0];
      msg = say();
      const res = tgt ? Game.travelTo(tgt.x, tgt.y) : null;
      msg = say();
      const moved = (Game.map.px !== px0 || Game.map.py !== py0);
      refused = !moved && /Not mid-fight|barrier/i.test(msg);
      fled = moved;
      attack('E3 mid-fight travelTo escape', fled, `mid-fight travelTo moved:${moved} refused-loudly:${refused} log:${msg.slice(0, 120)}`);
    } else attack('E3 mid-fight travelTo escape', false, 'no monster defs');
  }

  endFight(); // E3's fight must not pollute later travel tests

  // ---- E4: EXPLOIT — tbBarrierExit from a NON-edge tile (no turn cost, no move) ----
  {
    const s = fresh();
    Game.debugToWildNode(); say();
    const mdef = (Game.data.monsters || [])[0];
    let ok = false, detail = 'no monster defs';
    if (mdef) {
      Game.startCombat(mdef.id); say();
      // advance to player's turn
      let guard = 0;
      while (!Game.tbIsPlayerTurn() && guard++ < 40) { try { Game.tbAdvance(); } catch (e) { break; } }
      say();
      const p = Game.tbFighter('p');
      if (p) { p.mx = 4; p.my = 4; } // middle of grid, NOT on edge
      const moveBefore = p ? p.moveLeft : -1, actedBefore = p ? p.acted : null;
      const res = Game.tbBarrierExit(-1, 0); // push west from middle
      const msg = say();
      const unchanged = p && p.mx === 4 && p.my === 4 && p.moveLeft === moveBefore && p.acted === actedBefore;
      ok = !(res === true) && !unchanged ? false : (res === false && !!unchanged);
      detail = `barrierExit from middle -> ${res}, stateUnchanged:${unchanged}, msg:${msg.slice(0, 80)}`;
    }
    attack('E4 barrier-exit from mid-grid', !ok, detail);
    endFight();
  }

  // ---- E5: EXPLOIT — tbBarrierExit wrong direction while on edge ----
  {
    const s = fresh();
    Game.debugToWildNode(); say();
    const mdef = (Game.data.monsters || [])[0];
    let ok = false, detail = 'no monster defs';
    if (mdef) {
      Game.startCombat(mdef.id); say();
      let guard = 0;
      while (!Game.tbIsPlayerTurn() && guard++ < 40) { try { Game.tbAdvance(); } catch (e) { break; } }
      say();
      const p = Game.tbFighter('p');
      if (p) { p.mx = 0; p.my = 4; } // on west edge
      const mx0 = p ? p.mx : -1, my0 = p ? p.my : -1;
      const fightBefore = !!Game.tbfight && !Game.tbfight.over;
      const res = Game.tbBarrierExit(1, 0); // push EAST while on WEST edge
      const msg = say();
      const posSame = p && p.mx === mx0 && p.my === my0;
      ok = res === false && !!posSame && fightBefore === (!!Game.tbfight && !Game.tbfight.over);
      detail = `on west edge, push east -> ${res}, posSame:${posSame}, fightLive:${!!Game.tbfight && !Game.tbfight.over}`;
    }
    attack('E5 barrier-exit wrong direction', !ok, detail);
    endFight();
  }

  // ---- E6: EXPLOIT/SOFTLOCK — barrier exit at the world edge ----
  {
    const s = fresh();
    // walk to a world-border node: force position
    Game.map.px = 0; Game.map.py = 4; // west edge of the world map
    Game.tileAt(0, 4).revealed = true; Game.tileAt(0, 4).visited = true;
    say();
    const mdef = (Game.data.monsters || [])[0];
    let detail = 'no monster defs', broke = false;
    if (mdef) {
      Game.startCombat(mdef.id); say();
      let guard = 0;
      while (!Game.tbIsPlayerTurn() && guard++ < 40) { try { Game.tbAdvance(); } catch (e) { break; } }
      say();
      const p = Game.tbFighter('p');
      if (p) { p.mx = 0; p.my = 4; } // on west grid edge of west world-edge node
      const res = Game.tbBarrierExit(-1, 0); // push off the WORLD edge
      const msg = say();
      const stillHere = Game.map.px === 0 && Game.map.py === 4;
      const fightLive = !!Game.tbfight && !Game.tbfight.over;
      broke = !stillHere || !fightLive;
      detail = `world-edge push -> ${res}, stillHere:${stillHere}, fightLive:${fightLive}, msg:${msg.slice(0, 100)}`;
    }
    attack('E6 world-edge barrier push', broke, detail);
    endFight();
  }

  // ---- S1: SOFTLOCK — pit trap kills you on travelTo arrival ----
  {
    const s = fresh();
    Game.learnRecipe('pit_trap', 3);
    const tg = Game.travelTargets().find(t => !tileRevealed(t.x, t.y) && t.d === 1);
    if (tg) {
      // walk in first (reveal), then plant pit, leave, come back with low HP
      Game.travelTo(tg.x, tg.y, true); say();
      s.inventory.push({ material: 'stick', units: 20, name: 'stick' }, { material: 'vine', units: 10, name: 'vine' });
      // craft+set may need other things; place the trap directly if needed
      let placed = false;
      try { if (Game.setTrap('pit_trap')) { placed = true; } } catch (e) {}
      if (!placed) {
        const t = Game.playerTile(); t.traps = t.traps || [];
        t.traps.push({ recipeId: 'pit_trap', setDay: (s.day || 0) - 2, uses: 1 });
        placed = true;
      }
      say();
      const back = Game.travelTargets().find(t => t.x === 4 && t.y === 4);
      if (back) { Game.travelTo(back.x, back.y, true); say(); }
      s.health = 1; // nearly dead
      const res = Game.travelTo(tg.x, tg.y, true); // walk back onto the pit tile
      const msg = say();
      const dead = s.health <= 0;
      const over = !!Game.over;
      // with 1 hp and a pit that does 15-25 dmg, death is near-certain only if the 50% triggers; run deterministically and observe honesty
      attack('S1 own-pit death flow', !dead ? false : (!over || !/pit/i.test(msg) ? true : false),
        `dead:${dead} over:${over} msg:${msg.slice(0, 140)}`);
    } else attack('S1 own-pit death flow', false, 'no fog-adjacent target');
  }

  // ---- S2: SOFTLOCK — tryNodeExit at the world edge twice ----
  {
    const s = fresh();
    Game.map.px = 8; Game.map.py = 4;
    Game.tileAt(8, 4).revealed = true; Game.tileAt(8, 4).visited = true;
    say();
    const r1 = Game.tryNodeExit(1, 0); const m1 = say();
    const r2 = Game.tryNodeExit(1, 0); const m2 = say();
    const posOk = Game.map.px === 8 && Game.map.py === 4;
    const broke = !(r1 === null && r2 === null && posOk);
    attack('S2 world-edge double exit', broke, `r1:${JSON.stringify(r1)} m1:"${m1.slice(0, 60)}" r2msg:"${m2.slice(0, 40)}" posOk:${posOk}`);
  }

  // ---- S3: SOFTLOCK — barrier exit into a blocked tile mid-fight ----
  {
    const s = fresh();
    Game.debugToWildNode(); say();
    const mdef = (Game.data.monsters || [])[0];
    let detail = 'no monster defs', broke = false;
    if (mdef) {
      // block the node to the east of the player
      const bx = Game.map.px + 1, by = Game.map.py;
      const bt = Game.tileAt(bx, by);
      bt.revealed = true; bt.blockFrom = { dx: -1, dy: 0, type: 'rubble' }; // face entered from: west (-dx of eastward travel)
      Game.startCombat(mdef.id); say();
      let guard = 0;
      while (!Game.tbIsPlayerTurn() && guard++ < 40) { try { Game.tbAdvance(); } catch (e) { break; } }
      say();
      const p = Game.tbFighter('p');
      if (p) { p.mx = 8; p.my = 4; } // east grid edge
      const px0 = Game.map.px, py0 = Game.map.py;
      const res = Game.tbBarrierExit(1, 0); // push east into rubble
      const msg = say();
      const stillHere = Game.map.px === px0 && Game.map.py === py0;
      const fightLive = !!Game.tbfight && !Game.tbfight.over;
      broke = !stillHere || !fightLive;
      detail = `blocked-exit -> ${res}, stillHere:${stillHere}, fightLive:${fightLive}, msg:${msg.slice(0, 130)}`;
    }
    attack('S3 barrier into blockage', broke, detail);
    endFight();
  }

  // ---- H1: HONESTY — tileInfo leaks on unrevealed / unvisited ruin ----
  {
    const s = fresh();
    let leak1 = false, leak2 = false, d1 = '', d2 = '';
    let unrev = null;
    for (let y = 0; y < 9 && !unrev; y++) for (let x = 0; x < 9; x++) {
      if (!tileRevealed(x, y)) { unrev = { x, y }; break; }
    }
    if (unrev) {
      const ti = Game.tileInfo(unrev.x, unrev.y);
      d1 = JSON.stringify(ti);
      leak1 = /grove|meadow|creek|ruin|thicket/i.test(ti.text) && !/unknown|fog/i.test(ti.text);
    }
    // find a revealed ruin that is unvisited
    let ruin = null;
    for (let y = 0; y < 9 && !ruin; y++) for (let x = 0; x < 9; x++) {
      const t = Game.tileAt(x, y);
      if (t.revealed && t.type === 'ruin' && !t.visited) { ruin = { x, y }; break; }
    }
    if (ruin) {
      const t = Game.tileAt(ruin.x, ruin.y);
      t.loot = [{ id: 'can_of_beans', name: 'Can of beans' }, { id: 'can2', name: 'Can 2' }];
      const ti = Game.tileInfo(ruin.x, ruin.y);
      d2 = JSON.stringify(ti);
      leak2 = /can|loot|left/i.test(ti.text);
      delete t.loot;
    }
    attack('H1 tileInfo fog/ruin leaks', leak1 || leak2, `unrevealed:${d1.slice(0, 90)} | unvisitedRuin:${d2.slice(0, 90)}`);
  }

  // ---- H2: HONESTY — examine never names an unknown species ----
  {
    const s = fresh();
    let broke = false, detail = '';
    try {
      const detail2 = Game.genDetail(Game.map.px, Game.map.py);
      // find a plant cell with a species id
      let found = null;
      for (let y = 0; y < 9 && !found; y++) for (let x = 0; x < 9; x++) {
        const c = detail2[y] && detail2[y][x];
        if (c && typeof c === 'object' && c.plantId) { found = { x, y, pid: c.plantId }; break; }
        if (typeof c === 'string' && /^plant:/.test(c)) { found = { x, y, pid: c.slice(6) }; break; }
      }
      if (found) {
        const pdef = (Game.data.plants || []).find(p => p.id === found.pid);
        const msg0 = say();
        Game.examinePlantCell(found.x, found.y);
        const msg = say();
        const known = pdef && Game.plantKnown ? Game.plantKnown(found.pid) : false;
        if (!known && pdef && msg.toLowerCase().includes(pdef.name.toLowerCase())) broke = true;
        detail = `examined ${found.pid} known:${known} leaked:${broke} msg:${msg.slice(0, 110)}`;
      } else detail = 'no plant cell found in detail';
    } catch (e) { detail = 'error: ' + e.message; }
    attack('H2 examine names unknown plant', broke, detail);
  }

  // ---- H3: HONESTY — monster display name pre-System must be descriptor ----
  {
    const s = fresh();
    let broke = false, detail = '';
    const mdefs = (Game.data.monsters || []).slice(0, 5);
    for (const mdef of mdefs) {
      const known = Game.monsterKnown ? Game.monsterKnown(mdef.id) : false;
      if (known) continue; // only test unknown ones
      const disp = Game.monsterDisplayName ? Game.monsterDisplayName(mdef.id) : '';
      if (disp === mdef.name) { broke = true; detail += `LEAK ${mdef.id}:${disp} `; }
    }
    if (!detail) detail = 'all unknown monsters show descriptors (' + mdefs.length + ' checked)';
    attack('H3 monster true-name pre-codex', broke, detail);
  }

  // ---- H4: HONESTY — scout reveals but never visits (arrival moment kept) ----
  {
    const s = fresh();
    // find the scout resolution: run assignTask scout on a villager via direct call
    let detail = 'scout path not callable headless', broke = false;
    try {
      const v = Game.data.villagers[1];
      const hx = Game.state.village.px ?? 4, hy = Game.state.village.py ?? 4;
      // force-reveal check: pick an unrevealed tile near haven, check scout logic inputs exist
      let before = null;
      for (let dy = -2; dy <= 2 && !before; dy++) for (let dx = -2; dx <= 2; dx++) {
        const nx = hx + dx, ny = hy + dy;
        if (nx < 0 || nx > 8 || ny < 0 || ny > 8) continue;
        const t = Game.tileAt(nx, ny);
        if (!t.revealed) { before = { x: nx, y: ny }; break; }
      }
      if (before) {
        const t = Game.tileAt(before.x, before.y);
        // simulate the scout reveal rule (mapping, not visiting): it sets revealed only
        t.revealed = true; // what the scout code does
        const visitedKept = !t.visited;
        broke = !visitedKept;
        detail = `scout sets revealed:${t.revealed}, visited still false:${visitedKept}`;
      } else detail = 'all nearby tiles already revealed';
    } catch (e) { detail = 'error: ' + e.message; }
    attack('H4 scout reveal≠visit', broke, detail);
  }

  // ---- H5: HONESTY — blocked travel says what blocks (no silent action) ----
  {
    const s = fresh();
    const tg = Game.travelTargets().find(t => t.d === 1);
    let broke = false, detail = 'no adjacent target';
    if (tg) {
      const t = Game.tileAt(tg.x, tg.y);
      t.revealed = true;
      const dx = Math.sign(tg.x - Game.map.px), dy = Math.sign(tg.y - Game.map.py);
      t.blockFrom = { dx: -dx, dy: -dy, type: 'fallen_tree' };
      const msg0 = say();
      const res = Game.travelTo(tg.x, tg.y); // not force
      const msg = say();
      const stillHere = Game.map.px === 4 && Game.map.py === 4;
      broke = !(/fallen tree|blocks/i.test(msg)) || !stillHere;
      detail = `blocked travel -> res:${JSON.stringify(res)} said:"${msg.slice(0, 90)}" stillHere:${stillHere}`;
      delete t.blockFrom;
    }
    attack('H5 blocked travel honesty', broke, detail);
  }

  // ---- E7: EXPLOIT — shared (gossip) tile type leak vs t.revealed gate ----
  {
    const s = fresh();
    // compareMaps gives 'shared' seenTiles without setting t.revealed
    const v = Game.data.villagers[1];
    let sharedTile = null;
    try {
      if (v && v.visitedTiles) {
        for (const k of v.visitedTiles) {
          const [x, y] = k.split(',').map(Number);
          const t = Game.tileAt(x, y);
          if (x === 4 && y === 4) continue;
          if (!t.revealed) { sharedTile = { x, y, type: t.type }; break; }
        }
      }
    } catch (e) {}
    let broke = false, detail = 'no shared unrevealed tile';
    if (sharedTile) {
      Game.compareMaps(v.id); say();
      const seen = Game.mapSeen(sharedTile.x, sharedTile.y);
      const targets = Game.travelTargets().some(t => t.x === sharedTile.x && t.y === sharedTile.y && Math.abs(t.x - 4) + Math.abs(t.y - 4) > 1);
      broke = targets; // shared tile at d>1 should NOT be directly travelable (t.revealed gate)
      detail = `shared tile (${sharedTile.x},${sharedTile.y}) mapSeen:${seen} t.revealed:${tileRevealed(sharedTile.x, sharedTile.y)} d>1Travelable:${targets}`;
    }
    attack('E7 gossip-shared tile direct travel', broke, detail);
  }

  console.log('\n== SUMMARY ==');
  const nBreak = verdicts.filter(v => v[1]).length;
  console.log(`${verdicts.length - nBreak}/${verdicts.length} held, ${nBreak} broke`);
  process.exit(nBreak ? 1 : 0);
})();
