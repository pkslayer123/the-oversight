// Proof test: stash donate/take-back trust economy (miser loop 2026-10-08).
// Bugs fixed:
//  1. donateMaterial/takeMaterial: donate-then-take-back farmed infinite trust
//     (flat +1/call donate, zero take-back cost). Now: take-back costs -5
//     (mirrors the pantry rule), and donate trust scales with the haul.
//  2. donateTool/takeTool: same cycle farmed +2/call. Now tracked + guarded.
//  3. donateMaterial 1-by-1 farm: token donations no longer move trust.
// Feature: closed-village skim now sometimes has a WITNESS (player at the
// hall) — a real robber, a real doubt, instead of always-"someone".
// Usage: node scripts/test-stash-takeback-20261008.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

const SEED = parseInt(process.env.SEED || '20261008', 10);
let _rs = SEED >>> 0;
function _next() {
  _rs |= 0; _rs = (_rs + 0x6D2B79F5) | 0;
  let t = Math.imul(_rs ^ (_rs >>> 15), 1 | _rs);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
Math.random = _next;
const reseed = () => { _rs = SEED >>> 0; };
const stubRand = (fn) => { Math.random = fn; };
const unStub = () => { Math.random = _next; };

global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
global.window = global;
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/conversation.js',
 'src/js/convo-mood.js', 'src/js/convoTopics.js', 'src/js/convo-wants.js',
 'src/js/convo-dialogue.js', 'src/js/convo-beats.js', 'src/js/examine.js',
 'src/js/equipment.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/party-formal.js', 'src/js/truth.js', 'src/js/contests.js',
 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js',
 'src/js/justice.js', 'src/js/food.js', 'src/js/betrayal.js',
 'src/js/corpses.js', 'src/js/lifeseed.js', 'src/js/progression.js',
 'src/js/ledger.js', 'src/js/abilityActions.js', 'src/js/monsterBehaviors.js',
 'src/js/statusEffects.js', 'src/js/villager-agency.js', 'src/js/codex-people.js',
 'src/js/membership.js', 'src/js/hierarchy.js', 'src/js/debug-scenarios.js',
 'src/js/build.js'
].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
delete global.window;
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log('FAIL:', name, extra === undefined ? '' : String(extra).slice(0, 250)); }
}
let said = [];
const s = () => Game.state.scholar;
const V = () => Game.state.village;
const ME = () => Game.state.scholar.villagerId;
const others = () => (V().roster || []).filter(id => id !== ME());
const trustMe = () => (V().trust || {})[ME()];
function freshGame() {
  said = [];
  reseed();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  if (!Game._playOrigSay) Game._playOrigSay = Game.say.bind(Game);
  Game.say = (t) => { said.push(String(t)); try { return Game._playOrigSay(t); } catch (e) {} };
  Game.depart();
  s().inventory = [];
  s().ap = 50;
  s().insideHaven = true;
  try { s().tile = { type: 'haven' }; } catch (e) {}
}
function giveTool() {
  s().inventory.push({ itemId: 'multitool', id: 'multitool', name: 'Multitool', units: 1, kcalEach: 0, kg: 0.5 });
  return s().inventory.findIndex(i => i.itemId === 'multitool');
}

(async () => {
  await Game.init();

  // ---- 1. material take-back guard ----
  freshGame();
  Game.addMaterial('branch', 40);
  const t0 = trustMe(); // 15
  Game.donateMaterial('branch', 30);
  const tDon = trustMe();
  ok('bulk donate scales trust with haul (+3 for 30)', tDon === t0 + 3, `${t0}->${tDon}`);
  said = [];
  Game.spendMaterial('branch', 99); // empty hands so the full take-back fits
  s().water = [];
  Game.takeMaterial('branch', 30);
  ok('take-back costs trust (-5)', trustMe() === tDon - 5, trustMe());
  ok('take-back says so', said.some(t => /took back what you gave/i.test(t)), said.join(' | ').slice(0, 120));

  // ---- 2. legitimate partial take: no penalty ----
  freshGame();
  Game.addMaterial('branch', 40);
  Game.donateMaterial('branch', 30);
  const t2 = trustMe();
  Game.takeMaterial('branch', 5);
  ok('partial take (net still positive) costs nothing', trustMe() === t2, `${t2}->${trustMe()}`);

  // ---- 3. token donations don't move trust (1-by-1 farm dead) ----
  freshGame();
  Game.addMaterial('branch', 20);
  const t3 = trustMe();
  for (let i = 0; i < 10; i++) Game.donateMaterial('branch', 1);
  ok('ten 1-branch donations buy zero trust', trustMe() === t3, `${t3}->${trustMe()}`);
  said = [];
  Game.takeMaterial('branch', 10);
  ok('taking the tokens back still stings (-5, gave>0 net<=0)', trustMe() === t3 - 5, trustMe());

  // ---- 4. tool take-back guard ----
  freshGame();
  const t4 = trustMe();
  Game.donateTool(giveTool());
  ok('tool donate +2', trustMe() === t4 + 2, trustMe());
  said = [];
  Game.takeTool('multitool');
  ok('tool take-back costs trust (-5)', trustMe() === t4 + 2 - 5, trustMe());
  ok('tool take-back says so', said.some(t => /took back the tool/i.test(t)), '');
  // full cycle nets negative: farm dead
  ok('donate/take tool cycle is not a farm', trustMe() < t4, `${t4}->${trustMe()}`);

  // ---- 5. borrowing a tool you never donated: no take-back penalty ----
  freshGame();
  const t5 = trustMe();
  Game.stashState().tools.push({ itemId: 'multitool', name: 'Multitool' });
  said = [];
  Game.takeTool('multitool');
  ok('borrowing an undonated tool costs no take-back penalty', trustMe() === t5, `${t5}->${trustMe()}`);
  ok('no take-back line for a clean borrow', !said.some(t => /took back the tool/i.test(t)), '');

  // ---- 6. witnessed skim: real robber, real doubt ----
  freshGame();
  Game.addMaterial('wood', 30);
  Game.donateMaterial('wood', 20);
  for (const id of others()) V().trust[id] = 5; // closed
  ok('village is closed', Game.villageTrustLevel() === 'closed');
  said = [];
  stubRand(() => 0.01); // skim branch fires, witness roll passes
  try { Game.npcBatchTurn(); } finally { unStub(); }
  const takes = (Game.stashState().ledger || []).filter(e => e.kind === 'take');
  const named = takes.filter(e => e.vid);
  ok('witnessed skim names the robber in the ledger', named.length >= 1, JSON.stringify(takes.slice(0, 2)));
  ok('witness say line fires', said.some(t => /👁️/.test(t)), said.join(' | ').slice(0, 160));
  const doubts = (Game.state.codex.doubts || []).filter(d => d.theft && d.theft.kind === 'stash');
  ok('witnessed skim plants a stash-theft doubt', doubts.length >= 1, '');
  ok('doubt targets a real roster villager', doubts.length >= 1 && others().includes(doubts[0].vid), doubts[0] && doubts[0].vid);

  // ---- 7. unwitnessed skim (away from hall): still "someone" ----
  freshGame();
  Game.addMaterial('wood', 30);
  Game.donateMaterial('wood', 20);
  for (const id of others()) V().trust[id] = 5;
  s().insideHaven = false; // out in the wild: can't see the hall pile
  said = [];
  stubRand(() => 0.01);
  try { Game.npcBatchTurn(); } finally { unStub(); }
  const takes2 = (Game.stashState().ledger || []).filter(e => e.kind === 'take');
  ok('skim still fires when away', takes2.length >= 1, '');
  ok('unseen skim stays anonymous', takes2.every(e => !e.vid), JSON.stringify(takes2.slice(0, 2)));
  ok('unseen skim says nobody saw anything', said.some(t => /Nobody saw anything/i.test(t)), '');

  console.log(`\n${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR:', e); process.exit(2); });
