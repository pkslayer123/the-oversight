// BREAK-IT social r6 (2026-10-09): ABSENTIA WEREGILD.
// An open player case + exile via a non-moot path: playerCaseTick fires the
// moot anyway, and a weregild sentence silently drained 3000 kcal from a pack
// walking the wilds — no line, no collector. Fix: weregild transfers only
// when the accused player is present (not exiled); NPC-accused path unchanged.
// Run: node scripts/test-social-r6-absentia.js (SEED=... optional)
const fs = require('fs'); const path = require('path');
const ROOT = path.join(__dirname, '..');
function mulberry32(seed){let s=seed>>>0;const f=function(){s=(s+0x6D2B79F5)>>>0;let t=s;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};f.reset=(ns)=>{s=ns>>>0;};return f;}
const SEED = parseInt(process.env.SEED||'20261009',10);
Math.random = mulberry32(SEED);
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
global.window = global;
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const SKIP = new Set(['src/js/app.js','src/js/sprites.js','src/js/tile-scenes.js','src/js/move-anim.js','src/js/drama.js']);
[...html.matchAll(/src\/js\/[^\/\"]+\.js|src\/js\/engine\/[^\/\"]+\.js/g)].map(m=>m[0]).filter(f=>!SKIP.has(f)).forEach(f=>eval(fs.readFileSync(path.join(ROOT,f),'utf8')));
delete global.window;
const Game = globalThis.Scattering.Game;
(async()=>{ await Game.init(); Game.debugScenario('day1');
  Game.say=()=>{}; Game.sysSay=()=>{};
  const S=Game.state, me=Game.villagerId;
  const acc=(S.village.roster||[]).filter(id=>id!==me)[0];
  // PRESENT-player weregild still works (sanity)
  const c1 = Game.openPlayerCase(acc, 'theft', [], false);
  S.scholar.kcal = 9000;
  Game.resolveCase(c1.id, 'weregild');
  const paidPresent = S.scholar.kcal;
  // EXILED-player absentia weregild must not drain
  const c2 = Game.openPlayerCase(acc, 'theft', [], false);
  Game.exilePlayer('moot');
  S.scholar.kcal = 9000;
  Game.resolveCase(c2.id, 'weregild');
  const paidExiled = S.scholar.kcal;
  console.log('present player kcal after weregild:', paidPresent, '(expect 6000)');
  console.log('exiled player kcal after absentia weregild:', paidExiled, '(expect 9000)');
  console.log(paidPresent===6000 && paidExiled===9000 ? 'PASS absentia-weregild' : 'FAIL absentia-weregild');
  process.exit(paidPresent===6000 && paidExiled===9000 ? 0 : 1);
})().catch(e=>{console.error('ERR',e);process.exit(1);});
