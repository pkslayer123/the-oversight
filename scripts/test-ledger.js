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
    const legends = Game.lineage();
    ok('legend recorded in the village lineage', legends.length === 1 && legends[0].frame === 'witness', JSON.stringify(legends[0]));
    ok('legend has the choice', !!legends[0].choice);
  }

  // 7. The feared leader can choose mercy (Steve's drama beat).
  {
    freshGame();
    stack({ might: 20, killed: 6 });
    Game.tableScene();
    const opts = Game.state.scholar.tableChoices.options.map(o => o.label);
    ok('mercy is on the table', opts.some(l => /mercy/i.test(l)), opts.join(' / '));
  }

  // 8. THE MANTLE PASSES: death is not game over. The village is the protagonist.
  {
    freshGame();
    const s = Game.state.scholar;
    const oldId = Game.villagerId;
    const oldName = (Game.data.villagers.find(v => v.id === oldId) || {}).name;
    // give the bearer a keepsake and a System ability
    s.inventory = s.inventory || [];
    s.inventory.push({ itemId: 'test_locket', name: 'Test Locket', bonded: true, bond: 12, kg: 0.1 });
    s.abilities = [{ id: 'test_ab', name: 'Test Ability', level: 2, xp: 10 }];
    s.kcal = 50; s.health = 0;
    Game.state.village.trust = Game.state.village.trust || {};
    const heir = Game.npcIds()[0];
    Game.state.village.trust[heir] = 80;
    Game.state.village.trust[oldId] = 70;
    const saidBefore = said.length;
    Game.playerDeath('the test');
    ok('mantle passes: not game over', Game.over !== true);
    ok('mantle passes: new bearer', Game.villagerId !== oldId && Game.villagerId === heir);
    ok('mantle passes: lineage remembers', Game.lineage().length === 1 && Game.lineage()[0].name === oldName, JSON.stringify(Game.lineage()[0]));
    ok('mantle passes: mourning beat', said.slice(saidBefore).some(t => t.includes('is dead')));
    ok('mantle passes: you-are-not-her beat', said.slice(saidBefore).some(t => t.includes("You're not ")));
    ok('mantle passes: codex turns a page', said.slice(saidBefore).some(t => t.includes('The Codex turns a page')));
    ok('mantle passes: System notices the office', said.slice(saidBefore).some(t => t.includes('MANTLE TRANSFER')));
    ok('mantle passes: keepsake left with the corpse', !(s.inventory || []).some(i => i.bonded) && (function () {
      const c = (Game.state.corpses || []).find(c => c.villagerId === oldId);
      return !!(c && (c.items || []).some(i => i.bonded));
    })());
    ok('mantle passes: System abilities pass with the office', (s.abilities || []).some(a => a.id === 'test_ab'));
    ok('mantle passes: fresh body', s.kcal === 1500 && s.health > 0);
    ok('mantle passes: trust discounted, not copied', Game.state.village.trust[heir] === Math.round(70 * 0.6));
    ok('mantle passes: vector persists (village, not face)', Game.ledger().might >= 0);
  }

  // 9. The village dying out IS game over.
  {
    freshGame();
    const s = Game.state.scholar;
    // remove every other villager
    for (const id of Game.npcIds()) { try { Game.removeVillager(id, 'killed'); } catch (e) {} }
    ok('setup: no heirs', Game.npcIds().length === 0);
    s.health = 0;
    Game.playerDeath('the test');
    ok('village death is game over', Game.over === true && Game.villageLost === true && Game.won === false);
    ok('village death says so', said.some(t => t.includes('dies out')));
  }

  // 10. One contest: standings rank Haven among rival villages.
  {
    freshGame();
    Game.state.otherVillages = [
      { id: 'ov1', name: 'Red Creek', favor: 30, generated: true },
      { id: 'ov2', name: 'Stonefield', favor: 5 },
    ];
    const rows = Game.contestStandings();
    ok('standings rank all villages', rows.length === 3 && rows.some(r => r.us));
    ok('standings sorted', rows[0].score >= rows[1].score && rows[1].score >= rows[2].score);
  }

  // 11. Viewership board: the future challenge-gating API.
  {
    freshGame();
    Game.state.otherVillages = [
      { id: 'ov1', name: 'Red Creek', viewership: 30, generated: true },
      { id: 'ov2', name: 'Stonefield', viewership: 5 },
    ];
    const board = Game.viewershipBoard();
    ok('board has every village + Haven', board.length === 3 && board.some(r => r.us));
    ok('board sorted high to low', board[0].viewership >= board[1].viewership && board[1].viewership >= board[2].viewership);
    ok('board rows carry trend', board.every(r => typeof r.trend === 'number'));
    ok('contestStandings delegates', Game.contestStandings().length === 3);
    // moments move viewership and are logged
    const v0 = Game.havenViewership();
    Game.recordMoment('Did something spectacular.');
    ok('moment logged', (Game.progState().moments || []).length === 1);
    ok('moment moves viewership', Game.state.village.viewership > v0);
    Game.arcBeat(2);
    ok('arc transition records a moment', (Game.progState().moments || []).some(m => /Arc II/.test(m.text)));
  }

  // 12. CHALLENGE ABDUCTION hooks (future scheduler drives these).
  {
    // warning + countdown dread
    freshGame();
    const s = Game.state.scholar;
    s.day = 10;
    const heir = Game.npcIds()[0];
    Game.warnChallenge({ id: 'ch1', name: 'The Harvest Games', arena: 'the glass field', firesDay: 13, canDecline: false, picked: [Game.villagerId], canBring: 1, vs: 'monsters' });
    ok('warning set', !!s.challengeWarning && s.challengeWarning.name === 'The Harvest Games');
    ok('countdown text', Game.challengeCountdownText().includes('3d'), Game.challengeCountdownText());
    ok('dread is the point', said.some(t => t.includes('Dread is the point')));
    ok('invitation list opened', !!s.challengeInvites && s.challengeInvites.canBring === 1);
    // no decline offered
    Game.declineChallenge();
    ok('no decline when not offered', !!s.challengeWarning);

    // decline when offered: viewership hit, show debt
    Game.warnChallenge({ id: 'ch2', name: 'Quiet Game', firesDay: 12, canDecline: true });
    const v0 = Game.state.village.viewership || 0;
    Game.declineChallenge();
    ok('decline clears warning', !s.challengeWarning && !s.challengeInvites);
    ok('decline costs viewership', (Game.state.village.viewership || 0) < v0 || v0 === 0);
    ok('decline indebts you to the show', Game.progState().showDebt === 1);

    // the invitation list: who you bring
    freshGame();
    const h2 = Game.npcIds()[0], h3 = Game.npcIds()[1];
    Game.state.village.trust = Game.state.village.trust || {};
    Game.state.village.trust[h2] = 80; Game.state.village.trust[h3] = 75;
    Game.warnChallenge({ id: 'ch3', name: 'Blood Tally', firesDay: 15, canBring: 1 });
    Game.bringCompanion(h2);
    ok('companion brought', Game.state.scholar.challengeInvites.brought.includes(h2));
    ok('bringing builds trust', Game.state.village.trust[h2] === 88);
    Game.bringCompanion(h3);
    ok('headcount enforced', !Game.state.scholar.challengeInvites.brought.includes(h3));
    const left = Game.expectedButLeft();
    ok('the left-behind are known', left.includes(h3), JSON.stringify(left));

    // abduction interrupts ANYTHING
    Game.tbfight = { fake: true };
    let c = null;
    try { c = Game.convoGet(h2); c.active = true; } catch (e) {}
    const ab = Game.abduct([Game.villagerId, h2], 'ch3');
    ok('abduction rips you out', !!Game.state.scholar.abducted && ab.contestants.length === 2);
    ok('abduction ends fights', !Game.tbfight);
    ok('abduction ends conversations', !c || c.active !== true);
    ok('ripped-from recorded', !!Game.state.scholar.rippedFrom);
    ok('warning consumed', !Game.state.scholar.challengeWarning);
    ok('show does not care', said.some(t => t.includes("doesn\u2019t care")));

    // spectatorship
    Game.broadcastLine('The glass field lights up.');
    ok('broadcast stored', (Game.progState().broadcast || []).length === 1);
    ok('broadcast shown', said.some(t => t.includes('📺')));

    // death in the arena: mantle passes, footage kept
    const oldId = Game.villagerId;
    const reelBefore = (Game.progState().deathReel || []).length;
    Game.arenaDeath('the arena');
    ok('arena death keeps the footage', (Game.progState().deathReel || []).length === reelBefore + 1);
    ok('arena death passes the mantle', Game.over !== true && Game.villagerId !== oldId);
    ok('footage line', said.some(t => t.includes('keeps the footage')));
    Game.replayFootage();
    ok('death reel replays', said.some(t => t.includes('replays')));
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('THREW', e); process.exit(1); });
