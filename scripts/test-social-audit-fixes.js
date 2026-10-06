// Regression tests for the 2026-10-05 social-scenario audit (Steve).
// Bug classes: dev-text leaks in ambush dialogue, sentence-start grammar
// when the accused is the player, "A"-subject lines from displayName splits,
// and the juror vote the ceremony promised "everyone will remember" but the
// code never recorded. Usage: node scripts/test-social-audit-fixes.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js',
 'src/js/justice.js', 'src/js/betrayal.js', 'src/js/corpses.js', 'src/js/codex-people.js', 'src/js/progression.js',
 'src/js/ledger.js', 'src/js/debug-scenarios.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}` + (extra ? ' — ' + extra : '')); }
}
let sayLog = [];
const _say = Game.say.bind(Game);
Game.say = (t) => { sayLog.push(String(t)); return _say(t); };

(async () => {
  await Game.init();

  // --- 1. ambush fight: continuing exchanges always carry a spoken line ---
  Game.debugScenario('ambush');
  sayLog = [];
  let plot = (Game.betrayalState().plots || []).find(p => p.sprung && Game.isPlayer(p.target));
  ok('ambush plot sprung', !!plot);
  let sawUndefined = false, sawContinue = false;
  for (let i = 0; i < 6; i++) {
    const res = Game.ambushExchange(plot, 'fight');
    if (res && res.continue) {
      sawContinue = true;
      if (res.line === undefined || String(res.line).includes('undefined')) sawUndefined = true;
    } else break;
  }
  ok('ambush fight exchanges continue', sawContinue);
  ok('ambush fight never yields an undefined line', !sawUndefined);
  ok('no "undefined" in say log', !sayLog.some(l => l.includes('"undefined"') || /undefined and undefined/.test(l)));

  // --- 2. degenerate plot (no accomplices): no undefined text anywhere ---
  Game.debugScenario('ambush');
  sayLog = [];
  plot = (Game.betrayalState().plots || []).find(p => p.sprung && Game.isPlayer(p.target));
  plot.accomplices = [];
  Game.springAmbush(plot);
  let res = Game.ambushExchange(plot, 'talk');
  ok('lone-ambush talk has a line', !!(res && res.line));
  res = Game.ambushExchange(plot, 'fight');
  ok('lone-ambush fight has a line or resolves', !!(res && (res.line || !res.continue)));
  ok('lone ambush: no undefined text', !sayLog.some(l => /undefined/.test(l)));

  // --- 3. sentence grammar when the PLAYER is accused ---
  Game.debugScenario('mootAccused');
  sayLog = [];
  let c = (Game.betrayalState().cases || []).find(x => x.playerRole === 'accused' && (x.status === 'open' || x.status === 'dormant'));
  ok('accused case opened', !!c);
  if (c) {
    Game.demandMoot(c.id);
    const bad = sayLog.filter(l => /you pays|"you —|"you /.test(l));
    ok('no lowercase "you" starting a sentence', bad.length === 0, bad[0] && bad[0].slice(0, 90));
    ok('no "you pays"', !sayLog.some(l => /you pays/i.test(l)));
  }

  // --- 4. observation tells use a speakable subject, never "A" ---
  Game.debugScenario('liars');
  const rid = Game.state.village.roster.filter(id => id !== Game.villagerId)[0];
  const lie = Game.vpOf(rid).lies.occupation;
  if (lie && lie.told !== lie.truth) {
    const t1 = Game.observationTell(rid, lie), t2 = Game.observationTell(rid, lie);
    ok('tell subject is not bare "A"', !/(^|[^a-zA-Z])A (claims|says|doesn't|catches)/.test(t1), t1.slice(0, 80));
    ok('tells vary (no-repeat)', t1 !== t2);
    ok('nameFirst never returns bare "A"', Game.nameFirst(rid) !== 'A');
  } else ok('liar seeded for tell check', false);

  // --- 5. the juror's vote is remembered socially ---
  // (the player is a voter ~90% of moots — retry the scenario until the vote is awaited)
  let voted = false;
  for (let attempt = 0; attempt < 6 && !voted; attempt++) {
    Game.debugScenario('mootJuror');
    const c2 = (Game.betrayalState().cases || []).find(x => x.playerRole === 'juror' && x.status === 'open');
    if (!c2) continue;
    Game.callMoot(c2.id);
    if (c2.trial && c2.trial.awaitingPlayerVote) {
      Game.castPlayerVote(c2.id, true); // vote GUILTY
      const g = Game.betrayalState().grievances || [];
      const remembered = g.some(x => x.by === c2.accused[0] && x.against === Game.villagerId && /voted/.test(x.kind || ''));
      ok('guilty vote recorded as grievance by the accused', remembered);
      const mem = ((Game.state.village.memory || {})[c2.target] || []).concat((Game.state.village.memory || {})[c2.accused[0]] || []);
      ok('vote remembered in village memory', mem.some(m => /moot_vote/.test(m.t || '')));
      voted = true;
    }
  }
  ok('juror vote was awaited (within retries)', voted);

  console.log(`\nsocial-audit-fixes: ${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('CRASH:', e.message); console.error(e.stack.split('\n').slice(1, 5).join('\n')); process.exit(2); });
