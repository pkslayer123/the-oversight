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
  Game.say = (t) => { lines.push(String(t)); };
  const name = process.argv[2] || 'headlight';
  await Game.init();
  try { Game.debugScenario(name); } catch (e) { console.log('SCENARIO EXCEPTION:', e.message); }
  const setupText = lines.slice(); lines.length = 0;
  const s = Game.state.scholar;
  // walk toward monster tile by tile
  let n = 0;
  for (; n < 25; n++) {
    if (Game.tbfight) break;
    const m = (Game.worldMonsters() || []).find(mm => mm.id === s.monster.id) || s.monster;
    if (!m) break;
    const px = s.mx, py = s.my;
    const dx = Math.sign(m.mx - px), dy = Math.sign(m.my - py);
    let stepped = false;
    for (const [sx, sy] of [[dx, 0], [0, dy], [dx, dy], [dx, -dy], [-dx, dy]]) {
      if (!sx && !sy) continue;
      try { if (Game.pathStep(px + sx, py + sy)) { stepped = true; break; } } catch (e) { lines.push('WALK EX: ' + e.message); }
    }
    if (!stepped) { lines.push('WALK BLOCKED at ' + px + ',' + py); break; }
    if (Game.tbfight) break;
  }
  console.log('walked', n, 'steps; tbfight:', Game.tbfight ? 'ACTIVE' : 'null', 'player:', s.mx + ',' + s.my);
  console.log('--- TEXT ---');
  for (const l of lines) console.log(l);
  if (Game.tbfight) {
    console.log('--- FIGHTERS ---');
    for (const f of Game.tbfight.fighters) console.log(f.key, f.kind, f.name, f.mx + ',' + f.my, 'alive=' + f.alive, f.hp + '/' + f.maxHp);
  }
})();
