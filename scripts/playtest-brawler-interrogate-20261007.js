// BRAWLER interrogation probe (2026-10-07): fear as leverage for truth.
// Scenario: a villager has been spreading nasty gossip about you (honest:-15).
// The social route is confrontGossip (trust-gated). The brawler route should be:
// lean on them — "take it back." Does the game have that verb?
// Beats: 1) seed gossip + low trust, 2) confrontGossip (social, expect backfire),
// 3) intimidate the gossip-spreader — does the fiction acknowledge the grievance?
//    does the gossip retract (dims soften)? 4) second threat — breaking point:
//    recant-before-snap, or violence never buys the retraction? 5) village verdict.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/party.js',
 'src/js/justice.js', 'src/js/conversation.js', 'src/js/truth.js', 'src/js/journal.js',
 'src/js/betrayal.js', 'src/js/corpses.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let lm = 0;
const beat = (t) => {
  console.log('\n' + '='.repeat(66));
  console.log('  ' + t);
  console.log('='.repeat(66));
  const l = Game.log.slice(lm); lm = Game.log.length;
  for (const x of l) console.log('  | ' + x);
};
const gossipAboutMe = () => (Game.state.village.gossip || []).filter(g =>
  g.heard && g.heard.length && Object.values(g.dims || {}).some(x => typeof x === 'number' && x < -3));
const trustOf = (id) => (Game.state.village.trust || {})[id] === undefined ? 10 : Game.state.village.trust[id];

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  Game.log.length = 0; lm = 0;
  const feed = () => { const s = Game.state.scholar; s.kcal = 2400; s.hydration = 100; s.health = Math.max(s.health, 90); };
  feed();
  const v = Game.state.village, me = Game.villagerId;
  const others = () => v.roster.filter(id => id !== me);
  const gossiper = others().find(id => ['cautious', 'withdrawn'].includes(Game.npcTemper(id))) || others()[0];
  const bystander = others().find(id => id !== gossiper);
  const gname = Game.displayName(gossiper);
  console.log('gossiper:', gname, '| temper:', Game.npcTemper(gossiper));

  // --- seed: they've been spreading nasty gossip about YOU ---
  Game.seedGossip('theft', { honest: -15, generous: -10 }, [gossiper]);
  // low trust so the social route is uphill
  (Game.state.village.trust = Game.state.village.trust || {})[gossiper] = 5;
  console.log('gossip entries about me:', gossipAboutMe().length,
    '| dims:', JSON.stringify(gossipAboutMe()[0].dims),
    '| heard:', gossipAboutMe()[0].heard.map(id => Game.displayName(id)).join(','));

  // --- BEAT 1: the social route first (baseline) ---
  console.log('\n>>> confrontGossip (the social route, trust=5):');
  Game.confrontGossip(gossiper);
  beat('CONFRONT (social)');
  console.log('dims after confront:', JSON.stringify(gossipAboutMe()[0].dims));

  // --- BEAT 2: the brawler route. "Take it back." ---
  feed();
  console.log('\n>>> intimidate (the brawler route — I want a RETRACTION, not food):');
  const r1 = Game.intimidate(gossiper);
  console.log('>>> result:', r1);
  beat('INTIMIDATE 1');
  console.log('dims after intimidate:', JSON.stringify(gossipAboutMe()[0].dims),
    '| fear:', Game.npcNeeds(gossiper).fear || 0, '| trust:', trustOf(gossiper));
  console.log('bystander trust:', trustOf(bystander));

  // --- BEAT 3: lean harder — second threat, breaking-point warning ---
  feed();
  console.log('\n>>> intimidate again ("Take. It. Back."):');
  const r2 = Game.intimidate(gossiper);
  console.log('>>> result:', r2);
  beat('INTIMIDATE 2');
  console.log('dims after 2nd:', JSON.stringify(gossipAboutMe()[0].dims),
    '| gossip entries now:', gossipAboutMe().length);

  // --- BEAT 4: push past the warning ---
  feed();
  if (r2 !== 'fled' && r2 !== 'fight') {
    console.log('\n>>> third time. They warned me.');
    const r3 = Game.intimidate(gossiper);
    console.log('>>> result:', r3, '| still on roster:', v.roster.includes(gossiper));
    beat('INTIMIDATE 3 (breaking point)');
  } else {
    console.log('\n>>> broke at intimidate 2 (' + r2 + '); no third.');
  }

  console.log('\nFINAL: gossip entries about me:', gossipAboutMe().length);
  for (const g of gossipAboutMe()) console.log('  action=' + g.action, 'dims=' + JSON.stringify(g.dims), 'heard=' + g.heard.length);
  console.log('heat:', Game.justiceHeat(), '| stage:', Game.justiceStage(), '| bystander trust:', trustOf(bystander));
  console.log('memory of gossiper:', JSON.stringify((Game.state.village.memory || {})[gossiper] || []).slice(0, 500));
})();
