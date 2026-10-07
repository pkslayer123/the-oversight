// RED TEST (playtest-54, 2026-10-07): refusing a multi-take contest, the
// co-taken villagers' fates are introduced with "While you fought your
// fight, they fought theirs." — but the player REFUSED; they fought nothing.
// _contestResolveOthers (contests.js:2810) is shared by _contestEnd,
// _contestDie and _contestRefuse with no outcome context. Expected: the
// refusal path uses a refusal-honest lead-in.
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

const said = [];
Game.say = t => said.push('[say] ' + String(t));
Game.sysSay = t => said.push('[sys] ' + String(t));

async function main() {
  await Game.init();
  // contestForage (Calorie Run) takes 3: player + 2 villagers.
  // Script random: whim=false, splice picks, then givesChoice=true.
  const real = Math.random;
  const q = [0.5, 0.1, 0.9, 0.9, 0.1];
  Math.random = () => (q.length ? q.shift() : real());
  Game.debugScenario('contestForage');
  Game.resolveContest(); // -> choice branch (Participate / Refuse)
  Math.random = real;
  const ac = Game.state.activeContest;
  if (!ac || !(ac.others && ac.others.length)) { console.log('SKIP: no multi-take choice contest'); process.exit(2); }
  said.length = 0;
  Game.contestChoose(1); // Refuse
  const text = said.join('\n');
  if (/you fought your fight/i.test(text)) {
    console.log('RED: refusal path says "While you fought your fight" — the player refused.');
    console.log(text.split('\n').filter(l => /fought your fight|refuse/i.test(l)).join('\n'));
    process.exit(1);
  }
  console.log('GREEN: refusal path lead-in is refusal-honest.');
  process.exit(0);
}
main().catch(e => { console.error('FATAL', e && e.stack || e); process.exit(3); });
