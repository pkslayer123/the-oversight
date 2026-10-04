// Monster naming + progressive disclosure tests. Usage: node scripts/test-monster-naming.js
// Steve's rules: monsters are learned, never labeled upfront. The village
// names the beast through talk; the combat card shows descriptor + threat
// sense, never true names or numbers, until earned.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/food.js', 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js',
 'src/js/justice.js', 'src/js/debug-scenarios.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}`); }
}

function flatGrid() {
  return Array.from({ length: 9 }, () => Array(9).fill('grass'));
}
function freshGame() {
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  Game.state.scholar.health = 100;
}

(async () => {
  await Game.init();
  const realGen = Game.genDetail.bind(Game);
  Game.genDetail = () => flatGrid();

  // --- 1. first encounter: descriptor, never the true name ---
  freshGame();
  const disp0 = Game.monsterDisplayName('gallowdeer');
  ok('display name is the descriptor', disp0 === 'the thing with headlights for eyes, standing too still');
  ok('no true name leaked', !/Highbeam/i.test(disp0) && !/deer/i.test(disp0));
  ok('descriptor has no "deer"', !/deer/i.test(Game.data.monsters.find(m => m.id === 'gallowdeer').unknown));

  // --- 2. identifyMonster: no true name, naming kicks off ---
  Game.identifyMonster('gallowdeer');
  const e = Game.state.codex.monsters.gallowdeer;
  ok('entry created at encountered', e && e.stage === 'encountered');
  ok('naming kicked off', !!e.namingKicked);
  ok('villagers proposed names', Object.keys(e.proposals).length >= 3);
  const names = Object.values(e.proposals);
  ok('names from the curated silly list', names.every(n =>
    ['Headlight Harry', 'The Bright Bastard', 'Sir Blinds-A-Lot', 'Captain Bright-Eyes', 'Old Stare', 'The Glow Stag'].includes(n)));
  ok('true name not in the log', !Game.log.some(l => /Highbeam Deer/.test(l)));

  // --- 3. threat sense: vague, no numbers ---
  const mdef = Game.data.monsters.find(m => m.id === 'gallowdeer');
  const sense = Game.monsterThreatSense(mdef);
  ok('threat sense is vague', /feels/.test(sense) && !/\d/.test(sense));

  // --- 4. HP sense: locked before 3 rounds, tiers after ---
  ok('hp sense null before 3 rounds', Game.monsterHpSense({ mdef, hp: 10, maxHp: 100 }) === null);
  e.roundsSeen = 3;
  eq2('hp tiers', [
    Game.monsterHpSense({ mdef, hp: 90, maxHp: 100 }),
    Game.monsterHpSense({ mdef, hp: 60, maxHp: 100 }),
    Game.monsterHpSense({ mdef, hp: 30, maxHp: 100 }),
    Game.monsterHpSense({ mdef, hp: 10, maxHp: 100 }),
  ], ['looks unhurt', 'looks okay', 'looks hurt', 'looks ready to drop']);

  // --- 5. player backing converges the village ---
  freshGame();
  Game.identifyMonster('gallowdeer');
  const e2 = Game.state.codex.monsters.gallowdeer;
  // back the most-proposed name to force convergence
  const tally = {};
  for (const n of Object.values(e2.proposals)) tally[n] = (tally[n] || 0) + 1;
  const top = Object.entries(tally).sort((a, b) => b[1] - a[1])[0][0];
  Game.backMonsterName('gallowdeer', top);
  // simulate days of arguing until convergence (or 10 days)
  for (let d = 0; d < 10 && !e2.villageName; d++) {
    const roster = Game.state.village.roster.filter(id => id !== Game.state.scholar.villagerId);
    for (const vid of roster) if (!e2.proposals[vid]) e2.proposals[vid] = top; // villagers pile on
    Game.monsterNamingCheck('gallowdeer');
  }
  ok('village agreed on a name', !!e2.villageName);
  ok('display name is now the village name', Game.monsterDisplayName('gallowdeer') === e2.villageName);

  // --- 6. combat card: no numbers, no true names (source-level) ---
  const app = fs.readFileSync(path.join(ROOT, 'src/js/app.js'), 'utf8');
  const cardFn = app.split('function panelCombat')[1].split('function wireCombatPanel')[0];
  ok('card uses display name', cardFn.includes('monsterDisplayName'));
  ok('card shows no HP numbers', !/m\.hp.*m\.maxHp|HP.*\$\{/.test(cardFn) || !cardFn.includes('/${m.maxHp}'));
  ok('card has no true-name reference', !cardFn.includes('mdef.name'));
  ok('card is compact (single action row)', cardFn.includes('cc-actions'));
  const css = fs.readFileSync(path.join(ROOT, 'src/css/main.css'), 'utf8');
  ok('card animates in (no pop)', css.includes('combatArrive'));

  // --- 7. fighter gets the descriptor, not the true name ---
  freshGame();
  const s = Game.state.scholar;
  s.mx = 4; s.my = 4; s.monster = { id: 'gallowdeer', mx: 4, my: 6 };
  Game.dayPart = 3;
  Game.startCombat('gallowdeer');
  const deer = Game.tbfight.fighters.find(f => f.kind === 'monster');
  ok('fighter named by descriptor', deer && !/Highbeam/i.test(deer.name));
  ok('combat-start message has no true name', !Game.log.some(l => /HIGHBEAM DEER/.test(l)));
  if (Game.tbfight) Game.tbEnd('fled');

  Game.genDetail = realGen;
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);

  function eq2(name, got, want) {
    const g = JSON.stringify(got), w = JSON.stringify(want);
    if (g === w) { pass++; } else { fail++; console.log(`FAIL ${name}: got ${g}, want ${w}`); }
  }
})().catch(e => { console.error('CRASH', e); process.exit(2); });
