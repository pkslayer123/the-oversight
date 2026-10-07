// BRAWLER AMENDS probe (2026-10-07): the morning-after angle.
// You threatened someone and they yielded. Can you make it right?
// makeAmends -> trust/fear/rep recovery; second intimidation -> breaking point;
// gossip 'bully' spread to bystanders. As a player: what actually changes?
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
const trustOf = (id) => { const t = (Game.state.village.trust || {})[id]; return t === undefined ? 10 : t; };
const repOf = (id) => { try { return Game.repOf(id); } catch (e) { return {}; } };
const victim = (vid, label) => {
  console.log(`  [trust=${trustOf(vid)} fear=${Game.npcNeeds(vid).fear || 0} heat=${Game.justiceHeat()} rep=${JSON.stringify(repOf(vid))}] ${label}`);
};

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
  const vid = others().find(id => ['cautious', 'withdrawn'].includes(Game.npcTemper(id))) || others()[0];
  const bystander = others().find(id => id !== vid);
  const dn = Game.displayName(vid);

  console.log('victim:', dn, '| temper:', Game.npcTemper(vid));
  console.log('BEFORE: trust', trustOf(vid), 'fear', Game.npcNeeds(vid).fear || 0);

  // --- 1. threaten: they yield ---
  console.log(`\n>>> "Your food. Now." -> result:`, Game.intimidate(vid));
  beat('yield');
  victim(vid, 'after yield');

  // --- 2. next day: try to make it right ---
  console.log('\n>>> A day passes. I go to them to make amends.');
  try { Game.justiceTick(); Game.endDay && Game.endDay(); } catch (e) { console.log('tick err', e.message); }
  feed();
  console.log('worstRepAxis says:', JSON.stringify(Game.worstRepAxis(vid)));
  const r1 = Game.makeAmends(vid);
  console.log('makeAmends returned:', JSON.stringify(r1));
  beat('amends attempt');
  victim(vid, 'after amends');
  console.log('fear now:', Game.npcNeeds(vid).fear || 0, '| victim memory:', JSON.stringify((Game.state.village.memory || {})[vid] || []).slice(0, 400));

  // --- 3. does the bystander know? (gossip 'bully' seeded only on 2nd+ threat) ---
  console.log('\nbystander:', Game.displayName(bystander), 'trust:', trustOf(bystander));

  // --- 4. second shakedown: the breaking-point warning ---
  console.log(`\n>>> Second shakedown. "Your food. Now."`);
  const r2 = Game.intimidate(vid);
  console.log('result:', r2);
  beat('second shakedown');

  // --- 5. third: push past the warning ---
  console.log('\n>>> Third time. They warned me. I do it anyway.');
  const savedRandom = Math.random; Math.random = () => 0.9; // force RUN branch
  const r3 = Game.intimidate(vid);
  Math.random = savedRandom;
  console.log('result:', r3, '| roster still has them?', v.roster.includes(vid));
  beat('breaking point');
  console.log('\nbystander trust after flight:', trustOf(bystander), '| heat:', Game.justiceHeat(), '| stage:', Game.justiceStage());
})();
