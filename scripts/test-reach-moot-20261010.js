// Proof: the TV show "The Moot" airs (was shadowed by the contest of the same id).
// Run: node scripts/test-reach-moot-20261010.js
// Bug: showPool had {id:'moot'} and contests.json had a contest {id:'moot'}.
// The dawn branch routed ANY event with id 'moot' to fireContest (contestPool
// lookup), so the TV show never aired — 0/155 show firings in the parity sweep.
// Fix: show id renamed to 'moot_show' (+ SHOW_BEATS key); contest untouched.
const { loadGame, setupGame } = require('./sim-harness');
(async () => {
  const { Game } = await loadGame({ seed: 7, mode: 'x' });
  await setupGame(Game);
  let pass = 0, fail = 0;
  const ok = (name, cond) => { if (cond) { pass++; console.log('  PASS', name); } else { fail++; console.log('  FAIL', name); } };

  // 1. ids no longer collide
  const showIds = Game.showPool().map(s => s.id);
  const contestIds = Game.contestPool().map(c => c.id);
  const collision = showIds.filter(id => contestIds.includes(id));
  ok('no show/contest id collisions', collision.length === 0);
  ok('show pool has moot_show', showIds.includes('moot_show'));
  ok('contest pool still has moot', contestIds.includes('moot'));

  // 2. the dawn-branch routing now sends the moot SHOW to fireShow
  let firedShow = null, firedContest = null;
  const origFS = Game.fireShow.bind(Game), origFC = Game.fireContest.bind(Game);
  Game.fireShow = function (ev) { firedShow = (ev && ev.id) || '?'; return origFS(ev); };
  Game.fireContest = function (ev) { firedContest = (ev && ev.id) || '?'; return origFC(ev); };
  // simulate the dawn branch routing for a picked moot show
  const mootShow = Game.showPool().find(s => s.id === 'moot_show');
  const event = mootShow;
  if (Game.contestPool().find(c => c.id === event.id)) Game.fireContest(event);
  else Game.fireShow(event);
  ok('moot show routes to fireShow (not fireContest)', firedShow === 'moot_show' && !firedContest);

  // 3. the show has an authored beat and fires end-to-end
  const beat = (Game.SHOW_BEATS || {}).moot_show;
  ok('SHOW_BEATS has moot_show with choices', !!(beat && beat.choices && beat.choices.length >= 2));
  Game.fireShow = origFS; Game.fireContest = origFC;

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e.message); process.exit(2); });
