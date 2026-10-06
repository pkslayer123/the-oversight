// Play-feel check (Steve 2026-10-06): play watch sequences as a player for
// HIDE (extreme), TITHE (extreme, veteran knowledge), SECRETS (medium).
// Prints the full transcript — judge: watchable? feared? distinct per contest?
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/contests.js', 'src/js/villager-agency.js', 'src/js/ledger.js'
].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let saying = false;
function hookSay() {
  const orig = Game.say.bind(Game), origSys = Game.sysSay.bind(Game);
  Game.say = (t) => { if (saying) return orig(t); saying = true; console.log('  ' + String(t).split('\n').join('\n  ')); const r = orig(t); saying = false; return r; };
  Game.sysSay = (t) => { if (saying) return origSys(t); saying = true; console.log('  [SYS] ' + String(t).split('\n').join('\n    ')); const r = origSys(t); saying = false; return r; };
}

(async () => {
  await Game.init();
  hookSay();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  Game.state.scholar.day = 15;
  Game.state.village.roster = ['v1', 'v2', 'v3'];
  Game.data.villagers = [{ id: 'v1', name: 'Aaron' }, { id: 'v2', name: 'Moshe' }, { id: 'v3', name: 'Ruth' }];

  for (const [cid, vetLvl, rigSeq] of [['hide', 0, [0.99, 0.99, 0.99]], ['tithe', 2, [0.99, 0.99, 0.99]], ['secrets', 0, [0.99, 0.99, 0.5]]]) {
    const contest = Game.contestPool().find(c => c.id === cid);
    Game.state.codex = Game.state.codex || {};
    Game.state.codex.contests = Game.state.codex.contests || {};
    Game.state.codex.contests[cid] = { seen: 4, wins: 1, level: vetLvl };
    console.log(`\n########## WATCHING: ${contest.name} (taken: Aaron) ##########`);
    Game.state.activeContest = {
      contestId: cid, participant: 'v1', phase: 'watching', phaseIdx: 0,
      phases: Game._contestWatchPhases(contest, 'v1'), wounds: 0,
    };
    Game.sysSay('📺 ───');
    Game._contestRenderPhase(Game.state.activeContest, Game.state.activeContest.phases[0], 0);
    Game.sysSay(Game.state.activeContest.phases[0].text);
    const origRandom = Math.random; let i = 0;
    Math.random = () => rigSeq[i++ % rigSeq.length];
    const pick = [0, 1, 1]; // cheer, shout advice, go to them
    for (let k = 0; k < 3 && Game.state.activeContest; k++) Game.contestChoose(pick[k]);
    Math.random = origRandom;
    console.log(`########## END: ${contest.name} ##########`);
    Game.state.village.roster = ['v1', 'v2', 'v3']; // reset after possible death
  }
  process.exit(0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(1); });
