// Forager pack loop (2026-10-05): the pack-full wall had a phantom option
// ("leave it for the woods" didn't exist), the guidance spammed 50x/day, and
// unknowns-only returns skipped counter staging + the fireside teaching moment.
// Usage: node scripts/test-forager-pack-loop.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/food.js'
].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond) { if (cond) pass++; else { fail++; console.log('FAIL ' + name); } }
const said = [];
function freshGame() {
  said.length = 0;
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  const origSay = Game.say.bind(Game);
  Game.say = (t) => { said.push(String(t)); try { return origSay(t); } catch (e) {} };
  Game.depart();
  Game.log.length = 0;
}
const lumpItem = () => ({ plantId: null, lumpForm: 'shoots', name: 'Unknown shoots', units: 10, unit: 'handful', foodKind: 'plant', foodState: 'unknown', edible: false, kcalEach: 0, kg: 1.0, spoilDay: 5, lump: { wild_onion: { units: 10, day: 1 } }, prep: 'lump' });

(async () => {
  await Game.init();

  // ---- 1. dropItem: the promised option exists and works ----
  freshGame();
  {
    const s = Game.state.scholar;
    s.inventory.push(lumpItem());
    const idx = s.inventory.length - 1;
    const n0 = s.inventory.length;
    said.length = 0;
    Game.dropItem(idx);
    ok('drop removes the item', s.inventory.length === n0 - 1);
    ok('drop says what happened', said.some(t => /leave .* for the woods/i.test(t)));
    ok('drop resets the pack-full streak', Game._packFullStreak === 0);
    // bonded / keepsake protected
    s.inventory.push({ name: 'Bonded knife', bonded: true, units: 1, kg: 0.3 });
    const bi = s.inventory.length - 1;
    said.length = 0;
    Game.dropItem(bi);
    ok('bonded item refused', s.inventory.length === bi + 1 && said.some(t => /carry for good/i.test(t)));
    // invalid index
    said.length = 0;
    Game.dropItem(999);
    ok('invalid index is honest', said.some(t => /Nothing there/i.test(t)));
  }

  // ---- 2. pack-full guidance: full first, short on repeats ----
  freshGame();
  {
    const s = Game.state.scholar;
    for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) { const t = Game.tileAt(x, y); if (t) t.revealed = true; }
    // deterministic setup: find a natural tile with stock and a forageable cell, stand on it
    let cell = null;
    outer: for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) {
      const t = Game.tileAt(x, y);
      if (!t || t.type === 'haven' || t.type === 'ruin' || (t.stock || 0) <= 0) continue;
      const detail = Game.genDetail(x, y);
      for (let cy = 0; cy < 9; cy++) for (let cx = 0; cx < 9; cx++) {
        const c = detail[cy] && detail[cy][cx];
        if (c === 'plant' || c === 'bush' || c === 'tree' || c === 'bigtree') { Game.map.px = x; Game.map.py = y; cell = { cx, cy }; break outer; }
      }
    }
    ok('test setup found a forageable cell', !!cell);
    s.mx = cell.cx; s.my = cell.cy; // standing on it: the step check passes
    s.inventory.push({ name: 'Anvil of regret', units: 1, kg: 50 }); // over capacity
    said.length = 0;
    Game.doAction('forage', cell);
    ok('first block names the real options', said.some(t => /test a lump/i.test(t) && /leave some for the woods/i.test(t)));
    Game.playerTile().detailRegrow = {}; // fresh patch so the 2nd press reaches the pack check too
    said.length = 0;
    Game.doAction('forage', cell);
    ok('repeat block stays short', said.some(t => /Still full/i.test(t)) && !said.some(t => /Your pack is full/i.test(t)));
    // resolving the pack resets the streak: drop the anvil, block again -> full guidance
    const ai = s.inventory.findIndex(i => i.name === 'Anvil of regret');
    Game.dropItem(ai);
    s.inventory.push({ name: 'Anvil of regret', units: 1, kg: 50 });
    Game.playerTile().detailRegrow = {};
    said.length = 0;
    Game.doAction('forage', cell);
    ok('streak resets after resolving', said.some(t => /Your pack is full/i.test(t)));
  }

  // ---- 3. unknowns-only return: staging + counter message fire ----
  freshGame();
  {
    const s = Game.state.scholar;
    Game.state.scholar.prepStash = Game.state.scholar.prepStash || [];
    const stash0 = Game.state.scholar.prepStash.length;
    s.inventory.length = 0; // unknowns ONLY: no starting food to muddy `brought`
    s.inventory.push(lumpItem());
    s.inventory.push(lumpItem());
    said.length = 0;
    Game.returnToVillage();
    const staged = Game.state.scholar.prepStash.length - stash0;
    ok('unknowns staged to the counter', staged === 2);
    ok('counter message fires', said.some(t => /onto the counter/i.test(t)));
    ok('no phantom pantry unload', !said.some(t => /unload .* into Haven's pantry/i.test(t)));
  }

  console.log(`\nforager-pack-loop: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('TEST ERROR:', e.message, e.stack ? e.stack.split('\n')[1] : ''); process.exit(1); });
