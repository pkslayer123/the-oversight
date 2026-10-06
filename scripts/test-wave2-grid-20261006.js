// WAVE-2 GRID PIPELINE PROBE: for each wave-2 monster, fight with pattern
// KNOWN, drive to declare, then run the REAL app.js tbAllTelegraphCells +
// game.js tbBeamLaneCells and count rendered cells per bucket.
// Run: node scripts/test-wave2-grid-20261006.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/progression.js', 'src/js/encounters.js', 'src/js/food.js',
 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js',
 'src/js/justice.js', 'src/js/debug-scenarios.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;
const MDEFS = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/monsters.json'), 'utf8'));
const W2 = [
  ['voice_mimic_radio', 'static'], ['mirror_stag', 'griefcounselor'],
  ['review_drone', 'reviewdrone'], ['camera_swarm', 'influencer'],
  ['hype_horn', 'motivationalspeaker'], ['service_mimic', 'customerservice'],
  ['contract_golem', 'termsconditions'], ['delegate_beast', 'middlemanager'],
  ['bright_idea', 'inspiration'], ['memory_projector', 'nostalgia'],
];
function flatGrid() { return Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => 'grass')); }
function P() { return Game.tbFighter('p'); }
function endTurn() {
  if (!Game.tbfight || Game.tbfight.over) return;
  if (!Game.tbIsPlayerTurn()) return;
  const p = P(); if (p) { p.moveLeft = 0; p.acted = true; }
  Game.tbAfterPlayerAction();
}
// Extract REAL tbAllTelegraphCells from app.js (test-wave2c-visuals.js pattern)
const _tbSrc = fs.readFileSync(path.join(ROOT, 'src/js/app.js'), 'utf8')
  .match(/function tbAllTelegraphCells\(\) \{[\s\S]*?\n  \}\n/)[0]
  .replace(/^function tbAllTelegraphCells/, 'function');
function runBuckets() {
  const G = Game;
  const _fn = eval('(' + _tbSrc.replace(/Game\./g, 'G.') + ')');
  return _fn();
}
(async () => {
  await Game.init();
  Game.say = () => {};
  for (const [id, scenario] of W2) {
    Game.genDetail = () => flatGrid();
    Game.genRoster('Columbus, Ohio');
    Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
    Game.depart(); Game.dayPart = 3; Game.state.scholar.health = 500;
    Game.debugScenario(scenario);
    const s = Game.state.scholar; s.mx = s.monster.mx + 1; s.my = s.monster.my;
    Game.canSee = () => true;
    for (let i = 0; i < 6 && !Game.tbfight; i++) Game.monsterTurn();
    if (!Game.tbfight) { console.log(id, ': fight failed to start'); continue; }
    const m = Game.tbfight.fighters.find(f => f.kind === 'monster');
    P().hp = P().maxHp = 9000; m.hp = m.maxHp = 90000;
    const pl = P(); pl.mx = Math.max(0, m.mx - 3); pl.my = m.my;
    Game.state.scholar.mx = pl.mx; Game.state.scholar.my = pl.my;
    // learn the pattern -> knowledge-known
    const d = MDEFS.find(x => x.id === id);
    Game.state.codex = Game.state.codex || {}; Game.state.codex.monsters = {};
    const c = (Game.state.codex.monsters[id] = {});
    c.patterns = {}; c.patterns[d.attack.name] = 'probe';
    // drive to first declare
    let declared = false;
    for (let i = 0; i < 30 && !declared; i++) { endTurn(); if (m.telegraph) declared = true; if (!Game.tbfight || Game.tbfight.over) break; }
    const tg = m.telegraph;
    const buckets = runBuckets();
    const lane = Game.tbBeamLaneCells ? Game.tbBeamLaneCells() : new Set();
    const counts = {};
    for (const k of Object.keys(buckets)) {
      if (k === 'mon') continue;
      const v = buckets[k];
      if (v && typeof v.size === 'number' && v.size) counts[k] = v.size;
    }
    const monKeys = Object.keys(buckets.mon || {}).length;
    console.log(`${id}: declared=${declared} tgKind=${tg && tg.kind} tgCells=${tg && (tg.cells || []).length} lane=${lane.size} buckets=${JSON.stringify(counts)} monKeys=${monKeys} phase=${m.beamPhase}`);
  }
})();
