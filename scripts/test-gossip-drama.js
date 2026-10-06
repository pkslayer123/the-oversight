// Gossip drama playtest v2 — with player-initiated rumors.
// Usage: node scripts/test-gossip-drama.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/party.js', 'src/js/justice.js',
 'src/js/truth.js', 'src/js/betrayal.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}${extra ? ' — ' + extra : ''}`); }
}
function log(msg) { console.log(msg); }

(async () => {
  await Game.init();
  const said = [];
  const gSay = Game.say.bind(Game);
  Game.say = (m) => { said.push(String(m)); return gSay(m); };

  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const v = Game.state.village;
  const roster = (v.roster || []).filter(id => id !== Game.villagerId);
  
  log(`\n=== GOSSIP DRAMA PLAYTEST v2 ===`);
  log(`Village: ${roster.length} NPCs`);

  // === RUMOR 1: Player starts a rumor about someone ===
  log(`\n--- RUMOR 1: Player starts 'stingy' rumor about NPC ---`);
  const target1 = roster[0];
  const tname1 = Game.displayName(target1);
  log(`Player starts rumor: ${tname1} is stingy...`);
  
  const g1 = Game.spreadRumor(target1, 'stingy');
  ok('spreadRumor creates gossip', !!g1, 'returned null');
  
  // The player tells it to someone (simulate telling roster[1])
  const listener1 = roster[1];
  if (g1) {
    g1.heard.push(listener1);
    log(`Told to ${Game.displayName(listener1)}. Rumor is out.`);
  }
  
  // Spread over 4 parts
  const repBefore = { ...(Game.repOf(target1)) };
  for (let i = 0; i < 4; i++) {
    Game.spreadGossip();
  }
  const repAfter = Game.repOf(target1);
  const hearers = g1 ? g1.heard.length : 0;
  log(`After 4 spreads: ${hearers} heard`);
  log(`Target rep: generous ${repBefore.generous} → ${repAfter.generous}`);
  ok('rumor spreads', hearers > 1, `only ${hearers} heard`);
  ok('rumor damages target rep', repAfter.generous < repBefore.generous, 'rep unchanged — BUG');

  // === RUMOR 2: Player starts 'untrustworthy' rumor ===
  log(`\n--- RUMOR 2: Player starts 'untrustworthy' rumor ---`);
  const target2 = roster[2];
  const tname2 = Game.displayName(target2);
  log(`Player starts rumor: ${tname2} can't be trusted...`);
  
  const g2 = Game.spreadRumor(target2, 'untrustworthy');
  // Use a warm teller for reliable spread in test
  const warmTeller = roster.find(id => Game.npcTemper(id) === 'warm') || roster[3];
  if (g2) g2.heard.push(warmTeller);
  
  const rep2Before = { ...(Game.repOf(target2)) };
  for (let i = 0; i < 8; i++) Game.spreadGossip();
  const rep2After = Game.repOf(target2);
  log(`Target rep: honest ${rep2Before.honest} → ${rep2After.honest}`);
  ok('untrustworthy rumor damages rep', rep2After.honest < rep2Before.honest, 'rep unchanged (may need more spreads)');

  // === RUMOR 3: Positive rumor (generous) to boost ally ===
  log(`\n--- RUMOR 3: Player boosts ally with 'generous' rumor ---`);
  const target3 = roster[4];
  const tname3 = Game.displayName(target3);
  log(`Player starts rumor: ${tname3} has been generous...`);
  
  const g3 = Game.spreadRumor(target3, 'generous');
  if (g3) g3.heard.push(warmTeller);
  
  const rep3Before = { ...(Game.repOf(target3)) };
  for (let i = 0; i < 8; i++) Game.spreadGossip();
  const rep3After = Game.repOf(target3);
  log(`Target rep: generous ${rep3Before.generous} → ${rep3After.generous}`);
  ok('generous rumor boosts rep', rep3After.generous > rep3Before.generous, 'rep unchanged (may need more spreads)');

  // === Check: does the rumor get traced? ===
  log(`\n--- Rumor tracing ---`);
  // The target might remember the rumor
  const mem = Game.getMemories ? Game.getMemories(target1) : [];
  log(`Target has ${mem.length} memories (checking for rumor trace)`);

  log(`\n=== RESULTS: ${pass} pass, ${fail} fail ===`);
})();
