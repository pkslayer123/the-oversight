// Regression asserts for contest fear/fun run 2 (Steve 2026-10-06).
// Covers: eligibility visibility, unavoidable-grab signaling (announced a day
// early, countdown, modal interruption), watch-show watchability (names the
// taken villager, carries contest context), fear teeth (real damage, specific
// death lines, extreme verdicts can kill on camera).
// Usage: node scripts/test-contest-fear-2.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/contests.js', 'src/js/villager-agency.js', 'src/js/ledger.js',
 'src/js/betrayal.js'
].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; } else { fail++; console.log(`FAIL ${name}${extra ? ' — ' + extra : ''}`); }
}
function rig(seq) { const o = Math.random; let i = 0; Math.random = () => seq[i++ % seq.length]; return () => { Math.random = o; }; }
let said = [], saying = false;
function hookSay() {
  said = [];
  const orig = Game.say.bind(Game), origSys = Game.sysSay.bind(Game);
  Game.say = (t) => { if (saying) return orig(t); saying = true; said.push(String(t)); const r = orig(t); saying = false; return r; };
  Game.sysSay = (t) => { if (saying) return origSys(t); saying = true; said.push('[SYS] ' + String(t)); const r = origSys(t); saying = false; return r; };
}
function log() { return said.join('\n'); }
function fresh() {
  hookSay();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  s.day = 15; Game.state.systemArrived = true;
  s.health = 100; s.kcal = 3000; s.trauma = 0;
  Game.state.over = false; Game.log = [];
  Game.state.showBudget = null; Game.state.pendingContest = null;
  Game.state.activeContest = null; Game.state.contestsSeen = {};
  Game.state.notability = {}; Game.state.codex = Game.state.codex || {};
  Game.state.codex.contests = {};
  const v = Game.state.village; v.positions = v.positions || {};
  const ids = (v.roster || []).filter(rid => rid !== Game.villagerId);
  ids.slice(0, 3).forEach((rid, i) => { v.positions[rid] = { mx: 2 + i * 2, my: 2 }; });
  return ids.slice(0, 3);
}
function byId(id) { return Game.contestPool().find(c => c.id === id); }
function finish(choiceIdxs, rngSeq) {
  const unrig = rig(rngSeq || [0.99]);
  let steps = 0, result = null;
  while (Game.state.activeContest && steps < 14) {
    result = Game.contestChoose(choiceIdxs[Math.min(steps, choiceIdxs.length - 1)]);
    steps++;
  }
  unrig();
  return result;
}
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

(async () => {
  await Game.init();

  // --- eligibility visibility ---
  fresh();
  Game.state.scholar.day = 13;
  const e13 = Game.contestEligible();
  ok('locked before day 14', e13.eligible.length === 0 && /14/.test(e13.reason || ''));
  Game.state.scholar.day = 15;
  const e15 = Game.contestEligible();
  ok('day 15: eligible list non-empty', e15.eligible.length > 0);
  ok('entries carry id/name/notability/notes', e15.eligible.every(x => x.id && x.name && x.notability && x.notes));
  ok('oversight panel wired to contestEligible', /Game\.contestEligible\(\)/.test(fs.readFileSync(path.join(ROOT, 'src/js/app.js'), 'utf8')));
  ok('pending-contest HUD countdown row exists', /contest-pending/.test(fs.readFileSync(path.join(ROOT, 'src/js/app.js'), 'utf8')));

  // --- unavoidable grab: announced a day early, then interrupts ---
  fresh();
  const g = byId('gauntlet');
  const unrig = rig([0.99, 0.99, 0.99]);
  Game.fireContest(g);
  const pc = Game.state.pendingContest;
  ok('pendingContest set with 1-day countdown', !!pc && pc.contestId === 'gauntlet' && pc.firesDay === 16);
  ok('announcement names contest by name', new RegExp(esc(g.name)).test(log()));
  ok('announcement names the chosen', /been chosen/.test(log()));
  ok('arena visual announced', log().includes(g.arena.trim().split('\n')[0]));
  Game.state.scholar.day = 16;
  Game.resolveContest();
  unrig();
  ok('resolveContest opens the modal interruption', !!Game.state.activeContest && Game.state.activeContest.contestId === 'gauntlet');
  ok('grab text explicit', /grabbed\. No choice/.test(log()));

  // --- gauntlet fear teeth ---
  fresh();
  { const u0 = rig([0.99]); Game.contestInterruption(Object.assign({}, byId('gauntlet'), { givesChoice: false }), 'player'); u0(); }
  const hp0 = Game.state.scholar.health;
  const gres = finish([0, 0, 0], [0.99]);
  ok('gauntlet completes, modal clears', gres && gres.done && Game.state.activeContest === null);
  ok('extreme damage is real', Game.state.scholar.health < hp0 - 15, `${hp0}->${Game.state.scholar.health}`);
  ok('prize on win', (Game.state.scholar.inventory || []).length > 0);
  // closer odds readout rendered into the stored phase
  fresh();
  { const u0 = rig([0.99]); Game.contestInterruption(Object.assign({}, byId('gauntlet'), { givesChoice: false }), 'player'); u0(); }
  { const u = rig([0.99]); Game.contestChoose(0); Game.contestChoose(0); u(); }
  const ph2 = Game.state.activeContest && Game.state.activeContest.phases[2];
  ok('closer readout shows wound-scaled death odds', !!ph2 && /death odds ~\d+%/.test(JSON.stringify(ph2)));
  finish([0, 0, 0], [0.99]);
  // death path
  fresh();
  { const u0 = rig([0.99]); Game.contestInterruption(Object.assign({}, byId('gauntlet'), { givesChoice: false }), 'player'); u0(); }
  Game.contestChoose(0);
  { const u1 = rig([0.0]); var dres = Game.contestChoose(0); u1(); }
  ok('gauntlet can kill', dres && dres.done && dres.outcome === 'died');
  ok('death ends run', Game.state.over === true);

  // --- hide: watch show is watchable ---
  const vids = fresh();
  const vid = vids[0], vname = Game.displayName(vid);
  Game.contestInterruption(Object.assign({}, byId('hide'), { givesChoice: false }), vid);
  const hres = finish([0, 0, 0], [0.99, 0.99, 0.99]);
  ok('watch playthrough completes, modal clears', hres && hres.done && Game.state.activeContest === null);
  ok('watch show names the taken villager', new RegExp(esc(vname)).test(log()), vname);
  ok('mid/late watch phases carry contest context', /Hide and Seek — it/.test(log()));
  ok('watcher unharmed', Game.state.scholar.health === 100);
  // extreme verdict can kill on camera
  const vids2 = fresh();
  const vid2 = vids2[0];
  Game.contestInterruption(Object.assign({}, byId('hide'), { givesChoice: false }), vid2);
  const hres2 = finish([0, 0, 0], [0.0]);
  ok('extreme verdict can kill a villager on camera', hres2 && hres2.done && hres2.outcome === 'died');
  ok('dead villager leaves roster', !(Game.state.village.roster || []).includes(vid2));
  ok('specific death line', /FOUND YOU/.test(log()));

  // --- oath: choice -> participate resolves through real phases ---
  fresh();
  Game.contestInterruption(Object.assign({}, byId('oath'), { givesChoice: true }), 'player');
  ok('choice phase offered', Game.state.activeContest && Game.state.activeContest.phase === 'choice');
  const ores = finish([0, 0, 0, 0], [0.99]);
  ok('participate path resolves (no choice-loop)', ores && ores.done && Game.state.activeContest === null);
  ok('oath win costs trauma', Game.state.scholar.trauma > 0, `trauma=${Game.state.scholar.trauma}`);

  console.log(`\nRESULT: ${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('SCRIPT ERROR', e); process.exit(2); });
