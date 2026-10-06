// BRAWLER confrontation probe (2026-10-06): reach stage 2, play the
// confrontation pay/refuse paths, and check failed-payment food handling.
// Usage: node scripts/playtest-brawler-confront-20261006.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js', 'src/js/game.js',
 'src/js/encounters.js', 'src/js/food.js', 'src/js/party.js', 'src/js/justice.js',
 'src/js/conversation.js', 'src/js/truth.js', 'src/js/betrayal.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let lm = 0;
const beat = (t) => { console.log('\n--- ' + t + ' ---'); const l = Game.log.slice(lm); lm = Game.log.length; l.forEach(x => console.log('  | ' + x)); };
const status = (label) => console.log(`  [stage=${Game.justiceStage()} heat=${Game.justiceHeat()} confrontedBy=${Game.justiceState().confrontedBy ? Game.displayName(Game.justiceState().confrontedBy) : 'none'}] ${label}`);
const invKcal = () => (Game.state.scholar.inventory || []).reduce((s, i) => s + (i.kcalEach || 0) * (i.units || 0), 0);

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  Game.log.length = 0; lm = 0;
  const v = Game.state.village, me = Game.villagerId;
  const others = () => v.roster.filter(id => id !== me);
  const softs = others().filter(id => ['cautious', 'withdrawn', 'gentle', 'steady'].includes(Game.npcTemper(id)));

  // crime spree: theft + 3 shakedowns of the fearful (no fights)
  const mark = others().find(id => Game.packKcal(id) >= 200);
  Game.stealFrom(mark); Game.dayPart = (Game.dayPart + 1) % 4; Game.theftNoticeSweep();
  for (let k = 0; k < 3 && k < softs.length; k++) { const r = Game.intimidate(softs[k]); console.log(`intimidate ${k} => ${r}`); }
  status('after crime spree'); beat('crime spree');

  // tick to confrontation
  for (let d = 1; d <= 6; d++) {
    try { Game.justiceTick(); } catch (e) {}
    status('day ' + d);
    if (Game.justiceState().confrontedBy) break;
    try { Game.dayPart = 3; Game.endDay && Game.endDay(); } catch (e) {}
  }
  beat('confrontation');

  const j = Game.justiceState();
  if (j.confrontedBy) {
    console.log('>>> restitution owed:', Game.justiceRestitutionOwed());
    // poor pay: only 300 kcal on hand
    Game.state.scholar.inventory.push({ name: 'Trail mix', kcalEach: 150, units: 2, desc: 'test' });
    const pk0 = v.pantryKcal || 0;
    console.log(`>>> inventory ${invKcal()} kcal, pantry ${pk0} kcal. Attempting poor pay...`);
    const r1 = Game.justiceRespond('pay');
    console.log(`>>> pay result: enough=${r1.enough} paid=${r1.paid} | inventory now ${invKcal()} kcal | pantry now ${v.pantryKcal} kcal | still confronting: ${Game.justiceState().confrontedBy ? 'yes' : 'no'}`);
    beat('poor pay');
    // rich pay: stock up and pay in full
    Game.state.scholar.inventory.push({ name: 'Smoked meat', kcalEach: 400, units: 20, desc: 'test' });
    const r2 = Game.justiceRespond('pay');
    console.log(`>>> pay result: enough=${r2.enough} paid=${r2.paid} | inventory now ${invKcal()} kcal | stage=${Game.justiceStage()} heat=${Game.justiceHeat()} amends=${Game.justiceState().amendsCredit}`);
    beat('full pay');
  } else {
    console.log('>>> never reached confrontation');
  }
})().catch(e => { console.error('PLAYTEST CRASH:', e); process.exit(1); });
