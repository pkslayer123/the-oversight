// Leadership vector test. Usage: node scripts/test-ledger.js
// No single ending: the frame is the sum of play. Tests frame computation,
// vector writers, epithet visibility, the table scene + final choice, and
// roguelite legend continuity.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
// memory localStorage for legend tests
const _store = {};
global.localStorage = {
  getItem: (k) => (_store[k] !== undefined ? _store[k] : null),
  setItem: (k, v) => { _store[k] = String(v); },
};
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/food.js',
 'src/js/corpses.js', 'src/js/betrayal.js', 'src/js/lifeseed.js', 'src/js/progression.js',
 'src/js/ledger.js'
].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}${extra ? ' — ' + extra : ''}`); }
}
const said = [];
function freshGame() {
  said.length = 0;
  for (const k of Object.keys(_store)) delete _store[k];
  Game.say = function (t) { said.push(String(t)); };
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  s.mx = 4; s.my = 4; s.kcal = 6000; s.health = 100; s.trauma = 0;
  Game.state.systemArrived = true;
  Game.progState();
  return s;
}
function stack(L) { const l = Game.ledger(); for (const k of Object.keys(L)) l[k] = L[k]; }

(async () => {
  await Game.init();

  // 1. Quiet game: unwritten.
  {
    freshGame();
    ok('fresh ledger zeros', Object.values(Game.ledger()).every(v => v === 0));
    ok('unwritten frame', Game.endingFrame() === 'unwritten');
    ok('epithet unknown', Game.leadershipEpithet() === 'the Unknown');
  }

  // 2. Frame computation from the sum of play.
  {
    freshGame(); stack({ might: 20, killed: 6 });
    ok('feared', Game.endingFrame() === 'feared', Game.endingFrame());
    freshGame(); stack({ exposed: 10, defiance: 4 });
    ok('witness', Game.endingFrame() === 'witness', Game.endingFrame());
    freshGame(); stack({ showmanship: 12, protected: 8, brokerage: 6 });
    ok('beloved', Game.endingFrame() === 'beloved', Game.endingFrame());
    freshGame(); stack({ might: 10, brokerage: 10, foodShared: 8 });
    ok('indispensable', Game.endingFrame() === 'indispensable', Game.endingFrame());
    freshGame(); stack({ defiance: 12, might: 4 });
    ok('defiant', Game.endingFrame() === 'defiant', Game.endingFrame());
    freshGame(); stack({ embrace: 12 });
    ok('assimilated', Game.endingFrame() === 'assimilated', Game.endingFrame());
    freshGame(); stack({ embrace: 12, defiance: 10 });
    ok('defiance resists assimilation', Game.endingFrame() !== 'assimilated', Game.endingFrame());
  }

  // 3. Writers: deaths, feastburn, intimidation.
  {
    freshGame();
    Game.registerDeath({ vid: 'm1', name: 'Beast', kind: 'monster', killerId: Game.villagerId, cause: 'test', mx: 1, my: 1 });
    ok('monster kill -> might', Game.ledger().might >= 3, String(Game.ledger().might));
    const m0 = Game.ledger().might;
    try { Game.feastBurn(); } catch (e) {}
    ok('feastburn -> might', Game.ledger().might >= m0 + 2, `${m0} -> ${Game.ledger().might}`);
    try { Game.intimidate('nobody'); } catch (e) {}
    ok('intimidate -> might', Game.ledger().might >= m0 + 3);
    freshGame();
    Game.registerDeath({ vid: 'v1', name: 'Person', kind: 'villager', killerId: Game.villagerId, cause: 'test', mx: 1, my: 1 });
    ok('killing a person stains the ledger', Game.ledger().killed >= 3);
  }

  // 4. Arc transitions + milestones write into the vector.
  {
    freshGame();
    Game.arcBeat(2);
    ok('arc 2 -> showmanship', Game.ledger().showmanship >= 2);
    Game.arcBeat(3);
    ok('arc 3 -> might', Game.ledger().might >= 1);
    Game.arcBeat(4);
    ok('arc 4 -> foodShared + table waiting', Game.ledger().foodShared >= 1 && Game.progState().tableWaiting === true);
  }

  // 5. Visibility: the world reacts, not numbers.
  {
    freshGame();
    const s = Game.state.scholar;
    stack({ showmanship: 12, protected: 8, brokerage: 6 });
    s.day = 24;
    Game.ledgerBeat();
    ok('ledger beat names the epithet', said.some(t => t.includes('the Beloved')), said.slice(-2).join(' | ').slice(0, 160));
    ok('no raw numbers in beat', !said.some(t => /showmanship|ledger/i.test(t)));
  }

  // 6. The table: frame narration + final live choice.
  {
    freshGame();
    stack({ exposed: 10, defiance: 4 }); // witness
    Game.tableScene();
    ok('table scene fires once', Game.progState().tableDone === true);
    ok('table choices offered', !!(Game.state.scholar.tableChoices && Game.state.scholar.tableChoices.options.length === 2));
    ok('frame narration spoken', said.some(t => t.includes('THE TABLE')));
    const optId = Game.state.scholar.tableChoices.options[0].id;
    Game.chooseTableOption(optId);
    ok('choice resolves', Game.state.scholar.tableChoices === null);
    ok('run ends at the table', Game.over === true && Game.won === true);
    const legends = Game.readLegends();
    ok('legend recorded', legends.length === 1 && legends[0].frame === 'witness', JSON.stringify(legends[0]));
    ok('legend has the choice', !!legends[0].choice);
    ok('legend line for next run', Game.legendLine().includes('witness') || Game.legendLine().includes('Witness') || Game.legendLine().length > 20, Game.legendLine().slice(0, 80));
  }

  // 7. The feared leader can choose mercy (Steve's drama beat).
  {
    freshGame();
    stack({ might: 20, killed: 6 });
    Game.tableScene();
    const opts = Game.state.scholar.tableChoices.options.map(o => o.label);
    ok('mercy is on the table', opts.some(l => /mercy/i.test(l)), opts.join(' / '));
  }

  // 8. Death records a legend too (warning for the next run).
  {
    freshGame();
    stack({ might: 8 });
    Game.over = true; Game.won = false;
    try { Game.wipe(); } catch (e) {}
    const legends = Game.readLegends();
    ok('death legend recorded', legends.length === 1 && legends[0].outcome === 'died', JSON.stringify(legends[0]));
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('THREW', e); process.exit(1); });
