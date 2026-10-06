#!/usr/bin/env node
// REPRO (combat-log spacing): run a real bulldozer charge resolve in node,
// dump every log entry verbatim to find where clauses concatenate.
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

function flatGrid() { return Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => 'grass')); }
function P() { return Game.tbFighter('p'); }
function endTurn() {
  if (!Game.tbfight || Game.tbfight.over) return;
  if (!Game.tbIsPlayerTurn()) return;
  const p = P(); p.moveLeft = 0; p.acted = true;
  Game.tbAfterPlayerAction();
}

(async () => {
  await Game.init();
  Game.genDetail = () => flatGrid();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  Game.state.scholar.health = 500;
  Game.debugScenario('bulldozer');
  const s = Game.state.scholar; s.mx = s.monster.mx + 1; s.my = s.monster.my;
  Game.canSee = () => true;
  for (let i = 0; i < 6 && !Game.tbfight; i++) Game.monsterTurn();
  const pf = P(); pf.hp = pf.maxHp = 9000;

  // add a villager witness nearby so combatWitnessReact has someone
  try {
    const v = (Game.data.villagers || [])[0];
    if (v) {
      const f = Game.tbfight;
      f.fighters.push({ kind: 'villager', vid: v.id, key: 'v1', mx: 4, my: 4, alive: true, fled: false, name: Game.displayName(v.id) });
    }
  } catch (e) { console.log('witness setup failed:', e.message); }

  // Drive turns until we've seen a charge resolve (💥 It slams through!)
  let rounds = 0, sawCharge = false;
  const os = Game.say.bind(Game);
  const seen = [];
  Game.say = (t) => { seen.push(String(t)); return os(t); };
  while (rounds < 40 && Game.tbfight && !Game.tbfight.over && !sawCharge) {
    // stand still in place (probably in the lane)
    endTurn();
    if (seen.some(t => /It slams through/.test(t))) sawCharge = true;
    rounds++;
  }
  Game.say = os;
  console.log('--- ALL LOG ENTRIES (last 20) ---');
  const log = Game.log.slice(-20);
  log.forEach((l, i) => console.log(`[${i}] ${JSON.stringify(l)}`));
  console.log('--- CONCATENATION SCAN ---');
  const bad = log.filter(l => /[!.:?][A-Z"“]/.test(l.replace(/^💥\s*/, '')) && !/["'] [A-Z]/.test(l));
  log.forEach(l => {
    // flag any entry containing a lowercase-run "word boundary" missing after punctuation
    const m = l.match(/[!.:;?]["')\]]?[A-Z]/g);
    if (m) console.log('SUSPECT:', JSON.stringify(l.slice(0, 160)));
  });
})();
