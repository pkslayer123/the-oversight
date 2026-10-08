// Proof test: intimidate breaking-point fiction (2026-10-07).
// BUG: the snap path (cornered villager swings in terror) and the rage path
// (provoked bold villager swings first) both call Game.npcBetrays(vid), whose
// fiction is cold calculated betrayal: "Not anger — arithmetic" / "Nothing
// personal. I need what's in your pack more than you do." A terrified cornered
// person does not do arithmetic. A provoked person is not after your pack.
// npcBetrays(vid, {reason:'snap'|'rage'}) must use matching fiction; the
// default (cold) path must be unchanged.
// Run: node scripts/test-brawler-snap-fiction-20261007.js
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

let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) { pass++; console.log('  PASS ' + name); } else { fail++; console.log('  FAIL ' + name); } };
const newLog = (mark) => Game.log.slice(mark).join('\n');
const savedRandom = Math.random;

async function freshGame() {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  Game.tbfight = null; // harness: previous test's fight must not leak into the next game
  const s = Game.state.scholar; s.kcal = 2400; s.hydration = 100; s.health = Math.max(s.health, 90);
  Game.log.length = 0;
  return Game.state.village.roster.filter(id => id !== Game.villagerId);
}

(async () => {
  // ---- TEST 1: snap path (fear>=95 forces breaking point; random<0.5 -> snap) ----
  {
    const others = await freshGame();
    const soft = others.find(id => ['cautious', 'withdrawn'].includes(Game.npcTemper(id)));
    if (!soft) { console.log('SKIP test1: no cautious/withdrawn villager this seed'); }
    else {
      Game.npcNeeds(soft).fear = 95;
      Math.random = () => 0.1;
      const m = Game.log.length;
      const r = Game.intimidate(soft);
      Math.random = savedRandom;
      const t = newLog(m);
      ok(r === 'fight', 'snap: intimidate at fear 95 starts a fight');
      ok(!/arithmetic/i.test(t), 'snap: no "arithmetic" fiction');
      ok(!/nothing personal/i.test(t), 'snap: no "nothing personal / your pack" fiction');
      ok(/desperate|terror|scream|corner/i.test(t), 'snap: desperate/terror fiction present');
    }
  }
  // ---- TEST 2: rage path (bold temper, low fear, random<0.4 -> swings first) ----
  {
    const others = await freshGame();
    const bold = others.find(id => ['bold', 'prickly', 'intense'].includes(Game.npcTemper(id)));
    if (!bold) { console.log('SKIP test2: no bold/prickly/intense villager this seed'); }
    else {
      Game.npcNeeds(bold).fear = 0;
      Math.random = () => 0.1;
      const m = Game.log.length;
      const r = Game.intimidate(bold);
      Math.random = savedRandom;
      const t = newLog(m);
      ok(r === 'fight', 'rage: provoked bold villager swings first');
      ok(!/arithmetic/i.test(t), 'rage: no "arithmetic" fiction');
      ok(!/nothing personal/i.test(t), 'rage: no "nothing personal / your pack" fiction');
      ok(/fury|enough|control snaps|here's your fight/i.test(t), 'rage: fury fiction present');
    }
  }
  // ---- TEST 3: cold path unchanged (direct npcBetrays, no reason) ----
  {
    const others = await freshGame();
    const vid = others[0];
    const m = Game.log.length;
    try { Game.npcBetrays(vid); } catch (e) { console.log('  (npcBetrays threw: ' + e.message + ')'); }
    const t = newLog(m);
    ok(/arithmetic/i.test(t), 'cold: default npcBetrays keeps "arithmetic" fiction');
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
