// ASSERTS (Steve 2026-10-06): justice ladder confrontation precedence + payment honesty.
// - heat 50+ holds the formal track: no player case opens before the confrontation beat
// - silence (2+ days, no answer) counts as refusal -> moot demanded
// - refuse -> moot demanded -> forced accusation
// - failed restitution keeps the food (refused offer = nothing taken)
// - successful restitution resolves, credits amends, relaxes the stage
// Run: node scripts/test-brawler-confront-20261006.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js', 'src/js/game.js',
 'src/js/encounters.js', 'src/js/food.js', 'src/js/party.js', 'src/js/justice.js',
 'src/js/conversation.js', 'src/js/truth.js', 'src/js/betrayal.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; console.log('  ok: ' + name); }
  else { fail++; console.log('  FAIL: ' + name); }
}
function fresh() {
  return Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id), Game.depart(), Game;
}
function crimeSpree(n) {
  // deterministic heat: record crimes directly across victims/day parts
  const v = Game.state.village, me = Game.villagerId;
  const others = v.roster.filter(id => id !== me);
  const types = ['theft', 'intimidation'];
  for (let i = 0; i < n; i++) {
    Game.dayPart = i % 4;
    Game.state.scholar.day = 1 + Math.floor(i / 4);
    Game.recordCrime(types[i % 2], { victim: others[i % others.length] });
  }
  Game.state.scholar.day = 1; Game.dayPart = 0;
}
function playerCases() {
  return (Game.betrayalState().cases || []).filter(c => c.accused.includes(Game.villagerId) && (c.status === 'open' || c.status === 'dormant'));
}

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');

  // ---- 1. confrontation precedes the moot ----
  fresh(); crimeSpree(4); // 60 heat
  ok(Game.justiceHeat() >= 50, 'spree heat >= 50 (got ' + Game.justiceHeat() + ')');
  Game.justiceTick(); // 0 -> 1
  ok(Game.justiceStage() === 1, 'stage 1 cold shoulder after first tick');
  for (let k = 0; k < 20; k++) { try { Game.considerPlayerAccusation(); } catch (e) {} }
  ok(playerCases().length === 0, 'no player case opens while ladder below formal (20 attempts)');
  Game.state.scholar.day = 2; Game.justiceTick(); // 1 -> 2 confrontation
  ok(Game.justiceStage() === 2, 'stage 2 confrontation reached');
  const j = Game.justiceState();
  ok(!!(j.pendingConfront && j.confrontedBy), 'confrontation pending with a named confronter');
  for (let k = 0; k < 20; k++) { try { Game.considerPlayerAccusation(); } catch (e) {} }
  ok(playerCases().length === 0, 'still no case mid-confrontation');

  // ---- 2. refuse -> moot demanded -> forced accusation ----
  Game.justiceRespond('refuse');
  ok(Game.justiceState().confrontRefused === true, 'refusal recorded');
  Game.justiceTick(); // 2 -> 3, demands the moot
  ok(Game.justiceState().mootDemanded === true, 'refusal demands a moot');
  ok(Game.justiceStage() === 3, 'stage 3 after refusal');
  try { Game.considerPlayerAccusation(); } catch (e) {}
  ok(playerCases().length >= 1, 'forced accusation opens a case after demand');

  // ---- 3. silence times out into the formal track ----
  fresh(); crimeSpree(4);
  Game.justiceTick();
  Game.state.scholar.day = 2; Game.justiceTick();
  ok(Game.justiceStage() === 2 && !!Game.justiceState().pendingConfront, 'confrontation pending again');
  Game.state.scholar.day = 4; // two days of silence
  Game.justiceTick();
  ok(Game.justiceState().mootDemanded === true, 'silence (2 days) demands a moot');
  ok(Game.justiceStage() === 3, 'stage 3 after silence timeout');
  ok(/silence is an answer/i.test(Game.log.join('\n')), 'timeout narrated, not silent');

  // ---- 4. failed pay keeps the food ----
  fresh(); crimeSpree(4);
  Game.justiceTick();
  Game.state.scholar.day = 2; Game.justiceTick();
  ok(Game.justiceStage() === 2, 'confrontation pending (pay test)');
  const owed = Game.justiceRestitutionOwed();
  ok(owed > 500, 'restitution owed is meaningful (got ' + owed + ')');
  Game.state.scholar.inventory = [{ name: 'Trail mix', kcalEach: 150, units: 2 }];
  const pk0 = Game.state.village.pantryKcal || 0;
  const r1 = Game.justiceRespond('pay');
  ok(r1.enough === false, 'poor offer refused');
  ok((Game.state.scholar.inventory[0] || {}).units === 2, 'refused food stays in the pack');
  ok((Game.state.village.pantryKcal || 0) === pk0, 'refused food does not reach the pantry');
  ok(Game.justiceState().pendingConfront === true, 'confrontation still pending after failed pay');

  // ---- 5. successful pay resolves ----
  Game.state.scholar.inventory.push({ name: 'Smoked meat', kcalEach: 400, units: 30 });
  const invBefore = Game.state.scholar.inventory.reduce((s, i) => s + i.kcalEach * i.units, 0);
  const r2 = Game.justiceRespond('pay');
  ok(r2.enough === true && r2.paid >= owed * 0.5, 'real payment accepted (paid ' + r2.paid + ' of ' + owed + ')');
  ok(Game.justiceState().amendsCredit > 0, 'amends credited');
  ok(Game.justiceState().pendingConfront === false, 'confrontation resolved');
  ok(Game.justiceStage() <= 1, 'stage relaxes after payment');
  const invAfter = (Game.state.scholar.inventory || []).reduce((s, i) => s + (i.kcalEach || 0) * (i.units || 0), 0);
  ok(invAfter < invBefore, 'payment actually left the pack');

  // ---- 6. no double-charge: answering twice is a no-op ----
  const r3 = Game.justiceRespond('pay');
  ok(r3 === null, 'second pay with no pending confrontation returns null');
  const r4 = Game.justiceRespond('refuse');
  ok(r4 === null, 'refuse with no pending confrontation returns null');

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('TEST CRASH:', e); process.exit(1); });
