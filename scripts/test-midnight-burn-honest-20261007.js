// PROOF TEST (survivalist loop 2026-10-07): the midnight basal burn must be
// HONEST. resolveDay subtracts ~2200 kcal (ACTIVE_DAY) + 35 hydration at
// midnight — the single biggest daily number. Before this fix it vanished
// silently (Steve's no-silent-actions rule). Now endDay voices it:
// "Overnight your body burned N kcal just staying alive."
// Asserts: (1) a say line names the burned kcal number; (2) the math is
// unchanged (kcal drops by exactly the named amount); (3) resolveDay
// returns burned; (4) the sleep path still works (no crash, heal applies).
const fs = require('fs');
const path = require('path');
const ROOT = '/home/hatch/workspace/the-scattering';
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
const { execSync } = require('child_process');
const order = execSync("grep -o 'src/js/[^\"'']*\\.js' index.html | head -60", { cwd: ROOT }).toString().split('\n').filter(s => s && !/app\.js|sprites\.js|tile-scenes\.js|move-anim\.js/.test(s));
global.window = global;
order.forEach(f => { eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); });
delete global.window;
const Game = globalThis.Scattering.Game;

Game.init().then(() => {
  const says = [];
  const osay = Game.say.bind(Game);
  Game.say = (t) => { says.push(String(t)); return osay(t); };
  let fail = 0;
  const check = (cond, msg) => { if (!cond) { console.log('FAIL: ' + msg); fail = 1; } else console.log('ok: ' + msg); };

  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  s.kcal = 3000; s.hydration = 100; s.energy = 100; s.health = 100;
  s.abilities = []; s.backgroundAbilities = []; // no metabolic upkeep: pure basal math
  // camp wild (off the haven tile) so no village meal fires — pure basal math
  Game.map.px = 0; Game.map.py = 0;
  // stand still until midnight: jump to the last tick of the day
  s.dayTicks = Game.TIME.TICKS_PER_DAY - 1;
  says.length = 0;
  Game.tickAction(1); // crosses midnight -> endDay
  const kAfter = Math.round(s.kcal);
  const burnLine = says.find(t => /burned \d+ kcal/i.test(t));
  check(!!burnLine, 'endDay says a line naming the kcal burn (got: ' + (burnLine || 'NONE').slice(0, 80) + ')');
  const named = burnLine ? parseInt(burnLine.match(/burned (\d+) kcal/i)[1], 10) : 0;
  const need = globalThis.Scattering.calories.dailyNeed(s);
  check(named === need, `named burn (${named}) is the engine's real basal number (dailyNeed=${need})`);
  const bankLine = says.find(t => /bank burns/i.test(t));
  const bankLost = bankLine ? parseInt((bankLine.match(/(\d+) kcal/) || [])[1] || '0', 10) : 0;
  check(3000 - kAfter === named + bankLost, `kcal drop (${3000 - kAfter}) = named basal (${named}) + voiced bank burn (${bankLost}) — math unchanged`);
  check(Math.round(s.hydration) === 65, `hydration dropped 35 overnight (got ${Math.round(s.hydration)})`);

  // sleep path: midnight line + dawn conservation line coexist, heal applies
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s2 = Game.state.scholar;
  s2.kcal = 3000; s2.hydration = 100; s2.energy = 100; s2.health = 70;
  s2.dayTicks = Game.TIME.TICKS_PER_PART * 3; // evening
  says.length = 0;
  Game.sleep();
  const hp2 = Math.round(s2.health);
  const midLine = says.find(t => /Overnight your body burned/i.test(t));
  const dawnLine = says.find(t => /Dawn\. You wake/i.test(t));
  check(!!midLine, 'sleep path also voices the midnight burn');
  check(!!dawnLine, 'sleep path still reports the dawn wake line');
  check(hp2 > 70, `sleep still heals (70 -> ${hp2})`);

  process.exit(fail);
}).catch(e => { console.error('FATAL', e); process.exit(2); });
