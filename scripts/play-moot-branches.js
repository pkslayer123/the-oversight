// PLAY: confrontation branches — pay restitution, silence timeout, re-moot loop check.
// Usage: node scripts/play-moot-branches.js [pay|silence|loop]
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/party.js', 'src/js/justice.js',
 'src/js/conversation.js', 'src/js/truth.js', 'src/js/betrayal.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;
const RUN = (process.argv[2] || 'pay').replace('run=', '');
const origSay = Game.say;
Game.say = function (m) { console.log('  ' + String(m)); return origSay.call(this, m); };
const note = (t) => console.log('  [note] ' + t);

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  Game.tickAction = () => {};
  const v = Game.state.village;
  const others = () => v.roster.filter(id => id !== Game.villagerId);
  const [A, B, C] = others();

  if (RUN === 'pay') {
    console.log('=== PAY: steal, get confronted, pay restitution ===');
    Game.recordCrime('theft', { victim: A, caught: true });
    Game.recordCrime('attack', { victim: B });
    Game.recordCrime('theft', { victim: C, caught: true });
    Game.justiceTick(); Game.justiceTick();
    note('stage=' + Game.justiceStage() + ' owed=' + Game.justiceRestitutionOwed());
    // give the player a big pile of food
    Game.state.scholar.inventory = [{ id: 'venison', name: 'venison', kcalEach: 1200, units: 20 }];
    const before = Game.state.scholar.inventory[0].units;
    const r = Game.justiceRespond('pay');
    note('pay result=' + JSON.stringify(r) + ' units before=' + before + ' after=' + ((Game.state.scholar.inventory[0] || {}).units));
    note('stage after pay=' + Game.justiceStage() + ' heat=' + Game.justiceHeat());
    Game.justiceTick(); Game.justiceTick();
    note('stage after two more ticks=' + Game.justiceStage());
  } else if (RUN === 'silence') {
    console.log('=== SILENCE: steal, get confronted, say nothing for 2 days ===');
    Game.recordCrime('theft', { victim: A, caught: true });
    Game.recordCrime('attack', { victim: B });
    Game.recordCrime('theft', { victim: C, caught: true });
    Game.justiceTick(); Game.justiceTick();
    const day0 = Game.state.scholar.day;
    note('confronted by ' + Game.displayName(Game.justiceState().confrontedBy) + ' on day ' + day0);
    Game.state.scholar.day = day0 + 1; Game.justiceTick();
    note('day+1: stage=' + Game.justiceStage() + ' pending=' + !!Game.justiceState().pendingConfront);
    Game.state.scholar.day = day0 + 2; Game.justiceTick();
    note('day+2: stage=' + Game.justiceStage() + ' mootDemanded=' + !!Game.justiceState().mootDemanded);
  } else if (RUN === 'loop') {
    console.log('=== LOOP: convicted of weregild, then check the ladder doesn\'t re-moot over judged crimes ===');
    Game.recordCrime('theft', { victim: A, caught: true });
    Game.recordCrime('attack', { victim: B });
    Game.recordCrime('theft', { victim: C, caught: true });
    Game.justiceTick(); Game.justiceTick();
    Game.justiceRespond('refuse');
    Game.justiceTick();
    const bs = Game.betrayalState();
    const c = (bs.cases || []).find(x => x.accused.includes(Game.villagerId) && x.status === 'open');
    if (!c) { note('NO CASE OPENED — abort'); return; }
    // force a weak conviction: slight guilty lean, weregild band
    for (const vid of others()) c.belief[vid] = -15;
    Game.WILD_DAY_RATE = 0;
    const res = Game.conductTrial(c);
    note('resolution path=' + (res && res.path));
    note('stage=' + Game.justiceStage() + ' heat=' + Game.justiceHeat());
    // now play 6 more ticks: does the ladder re-confront / re-moot?
    let reConfront = 0, reMoot = 0;
    for (let i = 0; i < 6; i++) {
      Game.justiceTick();
      if (Game.justiceState().stage === 2) reConfront++;
      if (Game.justiceState().mootDemanded) reMoot++;
    }
    note('after 6 ticks: stage=' + Game.justiceStage() + ' reConfronted=' + reConfront + ' reMooted=' + reMoot);
  }
})();
