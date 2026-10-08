#!/usr/bin/env node
// PROOF TEST (survivalist loop 2026-10-08): camps break in storms.
// Before: setUpCamp promised "wind, beasts, or bad luck can take it" but
// NOTHING broke camps — breakCamp had exactly one caller (packTent).
// After: resolveStormFront breaks the camp in both branches (caught out at
// the camp; sheltered at Haven with the camp out there). The pitched tent
// is wrecked: its grid cell is cleared and it does not return to the pack.
// The packTent path is unchanged (tent returns, cell cleared by packTent,
// breakCamp's sweep is idempotent).
// Seeded RNG before eval. Exit non-zero on failure.
const path = require('path');
const ROOT = path.join(__dirname, '..');
const SEED = parseInt(process.env.SEED || '20261008', 10);
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
Math.random = mulberry32(SEED);
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(require(path.join(ROOT, f))) });
global.window = global;
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/conversation.js', 'src/js/convo-mood.js',
 'src/js/convoTopics.js', 'src/js/convo-wants.js', 'src/js/convo-dialogue.js', 'src/js/convo-beats.js',
 'src/js/examine.js', 'src/js/equipment.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/party-formal.js', 'src/js/truth.js', 'src/js/contests.js', 'src/js/storage.js',
 'src/js/perceive.js', 'src/js/carexplore.js', 'src/js/justice.js', 'src/js/food.js',
 'src/js/betrayal.js', 'src/js/corpses.js', 'src/js/lifeseed.js', 'src/js/progression.js',
 'src/js/ledger.js', 'src/js/villager-agency.js', 'src/js/codex-people.js',
 'src/js/membership.js', 'src/js/hierarchy.js', 'src/js/debug-scenarios.js',
 'src/js/build.js'].forEach(f => eval(require('fs').readFileSync(path.join(ROOT, f), 'utf8')));
delete global.window;
const Game = globalThis.Scattering.Game;

const fails = [];
const ok = (n, c, x) => { console.log(`  [${c ? 'OK  ' : 'FAIL'}] ${n}${x ? ' — ' + x : ''}`); if (!c) fails.push(n); };
const drain = () => { const l = (Game.log || []).map(x => x.text || x).join(' | '); Game.log.length = 0; return l; };
const S = () => Game.state.scholar;
const tentCells = (px, py) => { const out = []; const dt = Game.genDetail(px, py); for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) if (dt[y] && dt[y][x] === 'tent') out.push(x + ',' + y); return out; };

async function main() {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart(); drain();
  // wild node
  const tiles = Game.map.tiles; let bx = 0, by = 0, bd = -1;
  for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) { const t = tiles[y][x]; if (!t || t.type === 'haven') continue; const d = Math.abs(x - 3) + Math.abs(y - 3); if (d >= 3 && d > bd) { bd = d; bx = x; by = y; } }
  Game.map.px = bx; Game.map.py = by; S().insideHaven = false; S().mx = 4; S().my = 4;
  const giveKit = () => {
    S().inventory.push({ kind: 'tent', name: 'Packed tent', units: 1, kg: 2.5, kcalEach: 0, spoilDay: 9999, unit: 'tent', prep: 'Pitch it on clear ground for shelter.' });
    S().inventory.push({ material: 'branch', name: 'Fallen branches', units: 6, kg: 0.3 });
    S().inventory.push({ itemId: 'lighter', id: 'lighter', name: 'Lighter', units: 1, kg: 0.05 });
    S().kcal = 2400; S().hydration = 80; S().health = 60; S().energy = 90;
  };
  const pitchAndCamp = () => {
    Game.map.px = bx; Game.map.py = by; S().mx = 4; S().my = 4;
    const dt = Game.genDetail(bx, by);
    for (let y = 3; y <= 5; y++) for (let x = 3; x <= 5; x++) dt[y][x] = 'grass';
    Game.pitchTent(4, 5); drain(); Game.makeFire(4, 3); drain(); Game.setUpCamp(); drain();
  };
  const storm = () => { try { Game.evStormFront({}); } catch (e) {} drain(); try { Game.resolveStormFront(); } catch (e) {} return drain(); };

  // 1. caught out AT the camp
  giveKit(); pitchAndCamp();
  ok('camp established', !!Game.state.camp);
  ok('tent cell on grid', tentCells(bx, by).length === 1);
  const d1 = storm();
  ok('storm breaks camp (caught out)', !Game.state.camp);
  ok('tent cell cleared', tentCells(bx, by).length === 0);
  ok('tent wrecked, not in pack', !S().inventory.some(i => i.kind === 'tent' && (i.units || 0) > 0));
  ok('camp loss said out loud', /camp is gone|storm tore/i.test(d1));
  ok('no camp resurrection via tent', Game.canSetUpCamp() === false);

  // 2. sheltered at Haven, camp out there
  giveKit(); pitchAndCamp();
  ok('second camp established', !!Game.state.camp);
  const v = Game.state.village; Game.map.px = v.px ?? 4; Game.map.py = v.py ?? 4;
  const d2 = storm();
  ok('storm breaks distant camp (sheltered)', !Game.state.camp);
  ok('distant tent cell cleared', tentCells(bx, by).length === 0);
  ok('distant camp loss said out loud', /camp is gone|storm tore/i.test(d2));

  // 3. REGRESSION: packTent path unchanged — tent returns to pack
  giveKit(); pitchAndCamp();
  ok('third camp established', !!Game.state.camp);
  Game.packTent(4, 5); drain();
  ok('packTent breaks camp', !Game.state.camp);
  ok('packTent returns tent to pack', (S().inventory.find(i => i.kind === 'tent') || {}).units >= 1);
  ok('packTent clears tent cell', tentCells(bx, by).length === 0);

  // 4. REGRESSION: no camp, no storm interference
  const d4 = storm();
  ok('storm with no camp: no crash, no camp mention', !/camp is gone/i.test(d4));

  console.log(fails.length ? `\n${fails.length} FAILURES: ${fails.join(' | ')}` : '\nALL GREEN');
  process.exit(fails.length ? 1 : 0);
}
main().catch(e => { console.error('HARNESS ERROR:', e); process.exit(2); });
