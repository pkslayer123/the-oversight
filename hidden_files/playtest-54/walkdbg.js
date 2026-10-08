// Walk-phase debugger for one scenario.
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
(async () => {
  const lines = [];
  Game.say = (t) => lines.push(String(t));
  await Game.init();
  try { Game.debugScenario(process.argv[2] || 'nightlight'); } catch (e) { console.log('SCENARIO EX:', e.message); }
  const s = Game.state.scholar;
  const mid = (s.monster || {}).id;
  console.log('player', s.mx, s.my, 'monster', JSON.stringify(s.monster));
  console.log('worldMonsters:', JSON.stringify((Game.worldMonsters() || []).map(m => ({ id: m.id, mx: m.mx, my: m.my }))));
  for (let n = 0; n < 14; n++) {
    const wm = (Game.worldMonsters() || []).find(m => m.id === mid);
    console.log('step', n, 'player', s.mx + ',' + s.my, 'wm', wm ? wm.mx + ',' + wm.my : 'gone', 'tbfight', Game.tbfight ? ('Y over=' + Game.tbfight.over) : 'n');
    if (Game.tbfight) break;
    const m = wm || s.monster;
    if (!m) { console.log('no monster'); break; }
    const dx = Math.sign(m.mx - s.mx), dy = Math.sign(m.my - s.my);
    let ok = false;
    for (const [sx, sy] of [[dx, 0], [0, dy], [dx, dy], [dx, -dy], [-dx, dy]]) {
      if (!sx && !sy) continue;
      try { if (Game.pathStep(s.mx + sx, s.my + sy)) { ok = true; break; } } catch (e) { console.log('step EX', e.message); }
    }
    if (!ok) { console.log('blocked'); break; }
  }
  console.log('--- lines after setup ---');
  lines.slice(9).forEach(l => console.log(' >', l));
})();
