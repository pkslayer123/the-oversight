const fs = require('fs');
const path = require('path');
const ROOT = '/home/hatch/workspace/the-scattering';
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
const { execSync } = require('child_process');
const order = execSync("grep -o 'src/js/[^\"'']*\\.js' index.html | head -60", { cwd: ROOT }).toString().split('\n').filter(s => s && !/app\.js|sprites\.js|tile-scenes\.js|move-anim\.js/.test(s));
global.window = global;
order.forEach(f => { try { eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); } catch (e) { console.log('EVAL FAIL', f, e.message); process.exit(2); } });
delete global.window;
const Game = globalThis.Scattering.Game;

async function main() {
  const name = process.argv[2] || 'deer';
  const says = [];
  Game.say = (t) => { says.push(String(t)); };
  const origFeedback = Game.feedback.bind(Game);
  Game.feedback = (t) => { says.push('[FB] ' + String(t)); };
  await Game.init();
  let ok = true, err = null;
  try { Game.debugScenario(name); } catch (e) { ok = false; err = e.stack || e.message; }
  console.log('OK=' + ok + (err ? ' ERR=' + err : ''));
  console.log('SETUP SAYS:');
  console.log(says.splice(0).join('\n'));
  const s = Game.state.scholar;
  console.log('SCHOLAR pos=(' + s.mx + ',' + s.my + ') hp=' + s.hp + ' kcal=' + Math.round(s.kcal));
  console.log('ANIMAL=' + JSON.stringify(s.animal));
  console.log('WEAPON=' + JSON.stringify(typeof Game.equippedWeapon === 'function' ? Game.equippedWeapon() : null));
}
main().then(() => process.exit(0)).catch(e => { console.error('FATAL', e); process.exit(1); });
