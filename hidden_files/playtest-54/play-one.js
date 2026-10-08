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

const ARTIFACT = /undefined|NaN|\[object Object\]|\{\{|\}\}|nullkcal|undefinedkcal/i;

async function main() {
  const name = process.argv[2];
  const says = [];
  Game.say = (t) => { says.push('[SAY] ' + String(t)); };
  Game.feedback = (t) => { says.push('[FB] ' + String(t)); };
  await Game.init();
  const log = [];
  try { Game.debugScenario(name); } catch (e) { log.push('SETUP EXCEPTION: ' + (e.stack || e.message)); }
  const setupLines = says.splice(0);
  const s = Game.state.scholar;
  const snap = () => {
    const a = s.animal;
    return 'scholar=(' + s.mx + ',' + s.my + ') kcal=' + Math.round(s.kcal) +
      ' animal=' + (a ? a.id + '@(' + a.mx + ',' + a.my + ') aware=' + a.aware + ' pstate=' + a.pstate + ' stamina=' + a.stamina : 'NONE') +
      ' inv=' + (s.inventory || []).length;
  };
  log.push('SETUP: ' + snap());
  // play up to 6 turns like a player: strike when in range, else stalk
  for (let turn = 1; turn <= 6; turn++) {
    const a = s.animal;
    if (!a) { log.push('T' + turn + ': no animal — encounter over'); break; }
    const px = s.mx ?? 4, py = s.my ?? 4;
    const dist = Math.max(Math.abs(a.mx - px), Math.abs(a.my - py));
    let act = 'stalk';
    let ret = null, ex = null;
    try {
      if (dist <= 1) { act = 'strike(huntAnimal)'; ret = Game.huntAnimal(); }
      else { act = 'stalkAnimal'; ret = Game.stalkAnimal(); }
    } catch (e) { ex = e.stack ? e.stack.split('\n').slice(0, 4).join(' | ') : e.message; }
    const out = says.splice(0);
    const arts = out.filter(l => ARTIFACT.test(l));
    log.push('T' + turn + ' ' + act + (ex ? ' EXCEPTION=' + ex : ' ret=' + JSON.stringify(ret)) + ' -> ' + snap());
    out.forEach(l => log.push('    ' + l.replace(/\n/g, ' \\ ')));
    if (arts.length) log.push('    !!! ARTIFACTS: ' + arts.join(' || '));
    // check for kill -> carcass in inventory
    const carc = (s.inventory || []).filter(i => /carcass|corpse/i.test(i.itemId || i.id || ''));
    if (carc.length && !log._carc) { log._carc = 1; log.push('    CARCASS in inv: ' + JSON.stringify(carc[0]).slice(0, 300)); }
  }
  const left = says.splice(0);
  left.forEach(l => log.push('    LEFTOVER: ' + l.replace(/\n/g, ' \\ ')));
  console.log('=== ' + name.toUpperCase() + ' ===');
  console.log('SETUPTEXT:: ' + setupLines.filter(l => /🐞|SCENARIO/.test(l)).join(' | '));
  log.forEach(l => console.log(l));
}
main().then(() => process.exit(0)).catch(e => { console.error('FATAL', e); process.exit(1); });
