// Proof test (2026-10-07): party betrayalState name-shadow fix.
// In the FULL production module list, betrayal.js's village-level
// betrayalState() shadowed party.js's per-villager betrayalState(vid)
// (Object.assign load order). Effects: one global intent for all members,
// betrayalCueCheck TypeError on undefined cuesSeen (silently swallowed by
// wrapper try/catch, so cues never fired). party.js now uses
// partyBetrayalState(vid). This test reproduces the crash scenario and
// proves the whole arc works end to end.
// Usage: node scripts/test-party-betrayal-shadow-20261007.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
global.window = global; // eval-phase stub only (equipment.js needs it at load)
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/conversation.js', 'src/js/convo-mood.js',
 'src/js/convoTopics.js', 'src/js/convo-wants.js', 'src/js/convo-dialogue.js', 'src/js/convo-beats.js',
 'src/js/examine.js', 'src/js/equipment.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/party-formal.js', 'src/js/truth.js', 'src/js/contests.js', 'src/js/storage.js',
 'src/js/perceive.js', 'src/js/carexplore.js', 'src/js/justice.js', 'src/js/food.js',
 'src/js/betrayal.js', 'src/js/corpses.js', 'src/js/lifeseed.js', 'src/js/progression.js',
 'src/js/ledger.js', 'src/js/villager-agency.js', 'src/js/codex-people.js', 'src/js/membership.js',
 'src/js/hierarchy.js', 'src/js/debug-scenarios.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
delete global.window; // sync combat path
const Game = globalThis.Scattering.Game;

let rngState = 99 >>> 0;
Math.random = () => { rngState = (rngState * 1664525 + 1013904223) >>> 0; return rngState / 4294967296; };

let pass = 0, fail = 0;
function ok(name, cond) { if (cond) { pass++; } else { fail++; console.log(`FAIL ${name}`); } }
function eq(name, got, want) { if (got === want) { pass++; } else { fail++; console.log(`FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); } }

(async () => {
  await Game.init();
  Game.debugScenario('day1');
  const v = Game.state.village;
  v.trust = v.trust || {};
  const roster = (v.roster || []).filter(id => id !== Game.villagerId);
  const snake = roster.find(id => Game.npcTemper(id) === 'prickly') || roster[0];
  const loyal = roster.find(id => id !== snake && (Game.npcTemper(id) === 'warm' || Game.npcTemper(id) === 'gentle')) || roster[1];
  v.trust[snake] = 85; v.trust[loyal] = 85;

  // 1. the winner in the full module list is the VILLAGE one (unchanged) ...
  const wbs = Game.betrayalState();
  ok('village betrayalState() still wins as Game.betrayalState', !!(wbs && Array.isArray(wbs.plots) && wbs.invites));
  // ... while the party one lives under its own name
  ok('party version available as partyBetrayalState', typeof Game.partyBetrayalState === 'function');

  // 2. per-vid isolation: force intent on snake only
  Game.partyBetrayalState(snake).intent = true;
  Game.partyBetrayalState(snake).evaluated = true;
  Game.partyBetrayalState(loyal).intent = false;
  Game.partyBetrayalState(loyal).evaluated = true;
  ok('snake intent true', Game.partyBetrayalState(snake).intent === true);
  ok('loyal intent false (no cross-talk)', Game.partyBetrayalState(loyal).intent === false);
  ok('village betrayal object untouched by party betrayal calls',
    !('intent' in wbs) && !('cuesSeen' in wbs));

  // 3. cues fire without crashing (the original TypeError site)
  Game.partyState().party = [snake, loyal];
  const says = [];
  const osay = Game.say.bind(Game);
  Game.say = (t) => { says.push(String(t)); return osay(t); };
  let crashed = false;
  try {
    for (let i = 0; i < 60; i++) Game.betrayalCueCheck();
  } catch (e) { crashed = true; console.log('CRASH in betrayalCueCheck:', e.message); }
  ok('betrayalCueCheck does not throw', !crashed);
  const sbs = Game.partyBetrayalState(snake);
  ok('cues recorded for intent member', sbs.cuesSeen.length > 0);
  ok('cues say something (not silent)', says.some(t => t.indexOf('👁') === 0));
  ok('no cues for loyal member', Game.partyBetrayalState(loyal).cuesSeen.length === 0);

  // 4. legacy-entry repair: malformed entry gets normalized, no crash
  Game.partyState().betray[loyal] = { intent: true, evaluated: true }; // no cuesSeen
  crashed = false;
  try { Game.betrayalCueCheck(); } catch (e) { crashed = true; }
  ok('malformed entry repaired, no crash', !crashed && Array.isArray(Game.partyBetrayalState(loyal).cuesSeen));

  // 5. the strike: off-haven, weak player, valuable pack -> npcBetrays via sweep
  Game.partyState().betray[loyal] = { intent: false, evaluated: true, suspicion: 0, cuesSeen: [] };
  Game.map.px = 5; Game.map.py = 4;
  const s = Game.state.scholar;
  s.health = 40; s.kcal = 2400;
  s.inventory = [{ itemId: 'dried_meat', name: 'Dried meat', units: 8, kcalEach: 400, kcal: 3200 }];
  const opp = Game.betrayalOpportunity(snake);
  ok('opportunity high when isolated+weak+rich', opp >= 70);
  let struck = false;
  for (let i = 0; i < 60 && !struck; i++) { Game.betrayalSweep(); struck = !!(Game.tbfight && Game.tbfight.betrayal); }
  ok('betrayal sweep triggers npc betrayal combat', struck);
  if (struck) {
    ok('betrayer removed from party', !Game.partyMembers().includes(snake));
    // resolve the fight: player strikes until it's over
    let br = 0;
    while (Game.tbfight && !Game.tbfight.over && br++ < 30) {
      if (Game.tbIsPlayerTurn()) {
        const foe = Game.tbfight.fighters.find(x => x.alive && x.kind !== 'player');
        if (foe) Game.tbPlayerStrike(foe.key);
      }
      if (Game.tbfight && !Game.tbfight.over) {
        if (Game.tbIsPlayerTurn()) { const p = Game.tbFighter('p'); if (p) { p.moveLeft = 0; p.acted = true; } Game.tbAfterPlayerAction(); }
        else Game.tbAdvance();
      }
      const p2 = Game.tbFighter('p'); if (p2) p2.hp = p2.maxHp;
    }
    ok('betrayal fight resolves', !Game.tbfight || Game.tbfight.over || Game.tbfight === null);
    let acrash = false;
    try { Game.betrayalAftermath(); } catch (e) { acrash = true; console.log('aftermath crash:', e.message); }
    ok('betrayalAftermath runs clean', !acrash);
  }

  // 6. village justice system still works (no regression on the shadowed name)
  ok('village cases array intact', Array.isArray(Game.betrayalState().cases));

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
