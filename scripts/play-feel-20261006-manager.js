// PLAY-FEEL (Steve 2026-10-06): Middle Manager post-audio-dedup, as a player.
// Judges: one circle beat per cycle (not two), one announce sound, the
// encirclement still reads, debrief window still lands.
// Run: node scripts/play-feel-20261006-manager.js
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
function note(t) { console.log(t); }
const P = () => Game.tbFighter('p');
const M = () => Game.tbfight && Game.tbfight.fighters.find(x => x.kind === 'monster');
const audioCounts = {};
function endTurn() {
  if (!Game.tbfight || Game.tbfight.over) return;
  if (!Game.tbIsPlayerTurn()) return;
  const p = P(); p.moveLeft = 0; p.acted = true;
  Game.tbAfterPlayerAction();
}
(async () => {
  await Game.init();
  Game.say = (t) => { console.log('  ' + String(t).slice(0, 120)); };
  const origAE = Game.audioEvent.bind(Game);
  Game.audioEvent = (n, o) => { audioCounts[n] = (audioCounts[n] || 0) + 1; return origAE(n, o); };
  Game.genDetail = () => flatGrid();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart(); Game.dayPart = 1;
  Game.state.scholar.health = 500;
  Game.state.scholar.equipped = { weapon: { itemId: 'fire_hardened_spear', name: 'Fire-hardened spear' } };
  Game.canSee = () => true;
  Game.startCombat('delegate_beast');
  const m = M(); m.hp = m.maxHp = 200;
  const pl = P(); pl.hp = pl.maxHp = 300;
  pl.mx = Math.max(0, m.mx - 3); pl.my = m.my;
  Game.state.scholar.mx = pl.mx; Game.state.scholar.my = pl.my;
  let lastPhase = '';
  for (let i = 0; i < 16 && Game.tbfight && !Game.tbfight.over; i++) {
    const ph = M().beamPhase;
    if (ph !== lastPhase) { note(`-- phase → ${ph} (m@${M().mx},${M().my} you@${P().mx},${P().my})`); lastPhase = ph; }
    endTurn();
  }
  note('\naudio counts: ' + JSON.stringify(audioCounts));
  const dupes = ['delegateAnnounce', 'delegateCharge', 'delegateCircle'].filter(k => audioCounts[k]);
  note(dupes.length ? 'DUPES STILL FIRING: ' + dupes.join(',') : 'no duplicate audio — clean');
  note('DONE');
})();
