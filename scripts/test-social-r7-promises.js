// BREAK-IT social r7 (2026-10-09): UNKEEPABLE PROMISES.
// checkPromises' keep table covers 5 of 18 villager goals (feed/protect/heal/
// prove/belong). A promise for any other goal can NEVER be kept — it sits open
// 7 days then auto-breaks (-15 trust, "Promises rot"), punishing a vow the
// engine never let the player keep. Softlock-adjacent + dishonest copy.
// Fix: the 8 goals with promise lines get real keep paths
//   family->travel ("I'll watch the roads"), understand->social, survive->food;
// the 10 goals with no promise content deflect honestly at promise time
// ("I won't promise what I can't keep") instead of writing a doomed vow.
//   P1 every goal: promise is keepable or honestly deflects (never doomed)
//   P2 family kept by travel / understand kept by talk / survive kept by food
//   P3 the 5 legacy keeps still work
//   P4 rot still breaks a genuinely ignored keepable promise after 7 days
// Run: node scripts/test-social-r7-promises.js (SEED=... optional)
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const SEED = parseInt(process.env.SEED || '20261009', 10);
function mulberry32(seed) {
  let s = seed >>> 0;
  const f = function () { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  f.reset = (ns) => { s = ns >>> 0; }; return f;
}
Math.random = mulberry32(SEED);
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
global.window = global;
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const SKIP = new Set(['src/js/app.js', 'src/js/sprites.js', 'src/js/tile-scenes.js', 'src/js/move-anim.js', 'src/js/drama.js']);
[...html.matchAll(/src\/js\/[^\/\"]+\.js|src\/js\/engine\/[^\/\"]+\.js/g)].map(m => m[0]).filter(f => !SKIP.has(f))
  .forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
delete global.window;
const Game = globalThis.Scattering.Game;
const fails = [];
const check = (name, cond, extra) => { console.log((cond ? 'PASS' : 'FAIL') + ' ' + name + (extra ? ' — ' + extra : '')); if (!cond) fails.push(name); };
const GOALS = ['lead', 'family', 'prove', 'alone', 'feed', 'understand', 'protect', 'escape', 'remember', 'belong', 'survive', 'heal', 'home', 'record', 'answers', 'legacy', 'joy', 'peace'];
const KEEP = { feed: 'food', protect: 'fight', heal: 'heal', prove: 'task', belong: 'social', family: 'travel', understand: 'social', survive: 'food' };

(async () => {
  // ---------- P1: no goal may produce a doomed promise ----------
  const doomed = [], deflected = [], keepable = [];
  for (const goal of GOALS) {
    await Game.init(); Game.debugScenario('day1');
    Game.say = () => {}; Game.sysSay = () => {};
    const v = Game.state.village, me = Game.villagerId;
    const V = (v.roster || []).filter(id => id !== me)[0];
    Game.vpOf(V).goal = goal;
    let pr = null;
    try { pr = Game.promiseHelp(V); } catch (e) { pr = { err: e.message }; }
    const p = (v.promises || {})[V];
    if (pr && pr.err) { doomed.push(goal + '(threw:' + pr.err + ')'); continue; }
    if (p && !p.kept) {
      // an open tracked promise: can it ever be kept?
      if (KEEP[goal]) keepable.push(goal);
      else doomed.push(goal);
    } else if (pr && pr.deflected) {
      deflected.push(goal);
    } else {
      doomed.push(goal + '(no promise, no deflection)');
    }
  }
  check('P1 no doomed promises (every goal: keepable or honestly deflected)', doomed.length === 0, `doomed=[${doomed.join(',')}] keepable=[${keepable.join(',')}] deflected=[${deflected.join(',')}]`);

  // ---------- P2: the three new keep paths ----------
  for (const [goal, kind] of [['family', 'travel'], ['understand', 'social'], ['survive', 'food']]) {
    await Game.init(); Game.debugScenario('day1');
    Game.say = () => {}; Game.sysSay = () => {};
    const v = Game.state.village, me = Game.villagerId;
    const V = (v.roster || []).filter(id => id !== me)[0];
    Game.vpOf(V).goal = goal;
    v.trust[V] = 30;
    Game.promiseHelp(V);
    const before = v.trust[V];
    try { Game.checkPromises(kind, V); } catch (e) { fails.push(`P2 ${goal} checkPromises threw: ` + e.message); }
    const p = (v.promises || {})[V];
    check(`P2 ${goal} promise kept by '${kind}' (+trust, settled)`, p && p.kept === true && v.trust[V] > before, `kept=${p && p.kept} trust ${before}->${v.trust[V]}`);
  }

  // ---------- P3: the 5 legacy keep paths still work ----------
  for (const [goal, kind] of [['feed', 'food'], ['protect', 'fight'], ['heal', 'heal'], ['prove', 'task'], ['belong', 'social']]) {
    await Game.init(); Game.debugScenario('day1');
    Game.say = () => {}; Game.sysSay = () => {};
    const v = Game.state.village, me = Game.villagerId;
    const V = (v.roster || []).filter(id => id !== me)[0];
    Game.vpOf(V).goal = goal;
    Game.promiseHelp(V);
    try { Game.checkPromises(kind, V); } catch (e) { fails.push(`P3 ${goal} checkPromises threw: ` + e.message); }
    const p = (v.promises || {})[V];
    check(`P3 legacy keep: ${goal} kept by '${kind}'`, p && p.kept === true, `kept=${p && p.kept}`);
  }

  // ---------- P4: rot still punishes a genuinely ignored keepable promise ----------
  await Game.init(); Game.debugScenario('day1');
  Game.say = () => {}; Game.sysSay = () => {};
  {
    const v = Game.state.village, me = Game.villagerId;
    const V = (v.roster || []).filter(id => id !== me)[0];
    Game.vpOf(V).goal = 'feed';
    v.trust[V] = 50;
    Game.promiseHelp(V);
    v.promises[V].day = Game.state.scholar.day - 8; // 8 days ignored
    try { Game.checkPromises(); } catch (e) { fails.push('P4 rot sweep threw: ' + e.message); }
    const p = v.promises[V];
    check('P4 ignored 8-day promise still rots (-15 trust, broken)', p && p.kept === 'broken' && v.trust[V] === 35, `kept=${p && p.kept} trust=${v.trust[V]}`);
  }

  // ---------- P5: a deflection writes no tracked promise and no journal vow ----------
  await Game.init(); Game.debugScenario('day1');
  Game.say = () => {}; Game.sysSay = () => {};
  {
    const v = Game.state.village, me = Game.villagerId;
    const V = (v.roster || []).filter(id => id !== me)[0];
    Game.vpOf(V).goal = 'lead'; // no keep path -> honest deflection
    let pr = null;
    try { pr = Game.promiseHelp(V); } catch (e) { fails.push('P5 promiseHelp threw: ' + e.message); }
    const tracked = (v.promises || {})[V];
    let journaled = false;
    try { const jp = Game.journalPerson(V); journaled = !!(jp && jp.promise); } catch (e) {}
    check('P5 deflection: no tracked promise, no journal vow', pr && pr.deflected && !tracked && !journaled, `deflected=${pr && pr.deflected} tracked=${!!tracked} journaled=${journaled}`);
  }

  console.log(fails.length ? `\n${fails.length} FAILURES` : '\nALL GREEN');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
