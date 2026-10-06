// BRAWLER aftermath (2026-10-06): the morning after a beating + witnessed murder.
// Scenario A: after a yield — victim state, village mood, justice ladder ticks.
// Scenario B: witnessed murder — crime record, trauma, village response.
// Usage: node scripts/playtest-brawler-aftermath-20261006.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/party.js', 'src/js/justice.js',
 'src/js/conversation.js', 'src/js/truth.js', 'src/js/journal.js', 'src/js/betrayal.js',
 'src/js/corpses.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let lm = 0;
const beat = (t) => {
  console.log('\n' + '='.repeat(66));
  console.log('  ' + t);
  console.log('='.repeat(66));
  const l = Game.log.slice(lm); lm = Game.log.length;
  for (const x of l) console.log('  | ' + x);
};
const endTurn = () => { if (Game.tbfight && Game.tbIsPlayerTurn()) { try { Game.tbPlayerEndTurn(); } catch (e) {} } };
const STAGENAMES = ['peace', 'cold shoulder', 'confrontation', 'moot track', 'uprising'];
const status = (label) => console.log(`  [stage=${Game.justiceStage()} (${STAGENAMES[Game.justiceStage()] || '?'}) heat=${Game.justiceHeat()} confrontedBy=${Game.justiceState().confrontedBy ? Game.displayName(Game.justiceState().confrontedBy) : 'none'}] ${label}`);

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  Game.log.length = 0; lm = 0;
  const v = Game.state.village, me = Game.villagerId;
  const others = () => v.roster.filter(id => id !== me);
  const mark = others().find(id => ['cautious', 'withdrawn'].includes(Game.npcTemper(id))) || others()[0];
  const dname = Game.displayName(mark);
  // keep the player alive through the tick-days: a starving brawler confounds everything
  const feed = () => { const s = Game.state.scholar; s.kcal = 2400; s.hydration = 100; s.health = Math.max(s.health, 90); };

  // --- beat them into yielding (fast: strikes only) ---
  Game.playerAttacks(mark);
  let guard = 0;
  while (Game.tbfight && guard++ < 30) {
    const foe = Game.tbfight.fighters.find(f => f.key !== 'p' && f.alive && !f.fled);
    if (!foe) break;
    Game.tbPlayerStrike(foe.key);
    endTurn();
  }
  beat('THE BEATING');
  console.log('>>> fight active?', !!Game.tbfight, '| victim in roster?', v.roster.includes(mark));
  console.log('>>> victim trust:', (v.trust || {})[mark], '| fear:', Game.npcNeeds(mark).fear, '| my trauma:', Game.state.scholar.trauma);

  // --- the morning after: tick the ladder ---
  for (let d = 1; d <= 6; d++) {
    try { Game.justiceTick(); } catch (e) { console.log('tick err', e.message); }
    try { feed(); Game.dayPart = 3; Game.endDay && Game.endDay(); feed(); } catch (e) {}
    status(`day ${d} after`);
    if (Game.justiceState().confrontedBy) { beat('CONFRONTATION'); break; }
  }

  // --- Scenario B: the murder ---
  const mark2 = others().find(id => id !== mark && ['bold', 'prickly', 'intense'].includes(Game.npcTemper(id))) || others().find(id => id !== mark);
  const dname2 = Game.displayName(mark2);
  console.log(`\n>>> Scenario B: I turn on ${dname2} in front of everyone.`);
  Game.playerAttacks(mark2);
  guard = 0;
  while (Game.tbfight && guard++ < 40) {
    const foe = Game.tbfight.fighters.find(f => f.key !== 'p' && f.alive && !f.fled);
    if (!foe) break;
    Game.tbPlayerStrike(foe.key);
    endTurn();
  }
  beat('THE MURDER');
  console.log('>>> crimes:', JSON.stringify(Game.justiceState().crimes.map(c => ({ t: c.type, w: c.witnessed }))));
  console.log('>>> my trauma:', Game.state.scholar.trauma, '| health:', Math.round(Game.state.scholar.health));
  status('after murder');
  // does the village react the next day?
  for (let d = 1; d <= 4; d++) {
    try { Game.justiceTick(); } catch (e) {}
    try { feed(); Game.dayPart = 3; Game.endDay && Game.endDay(); feed(); } catch (e) {}
    status(`day ${d} after murder`);
  }
  beat('VILLAGE RESPONSE');
  // corpse + deliberate loot?
  const corpses = (Game.corpses ? Game.corpses() : []).filter(c => c.villagerId === mark2);
  console.log('>>> corpse entities for victim:', corpses.length, corpses.length ? `items=[${corpses[0].items.map(i => i.name).join(', ')}]` : '');
})().catch(e => { console.error('PLAYTEST CRASH:', e.message); process.exit(1); });
