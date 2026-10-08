// MISER playtest — THE STASH-KEEPER'S RECKONING (this run's archetype: miser).
// The inverse of every previous miser run: instead of playing the thief, play
// the PROVIDER. Donate heavily into the village stash, become the ledger's
// biggest giver, then watch the village turn CLOSED and the pile get skimmed
// by "someone". Questions:
//  1. Does the closed-village skim loop fire end-to-end (say line, ledger)?
//  2. Does the donate/take-back trust economy have a farmable exploit?
//  3. What recourse does the keeper have when the pile bleeds? Anything?
// Seeded RNG (mulberry32, SEED env), installed BEFORE module eval per AGENTS.md.
// Usage: node scripts/play-miser-20261008-stashkeeper.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

// ---- shared resettable RNG, installed before eval ----
const SEED = parseInt(process.env.SEED || '20261008', 10);
let _rs = SEED >>> 0;
function _next() {
  _rs |= 0; _rs = (_rs + 0x6D2B79F5) | 0;
  let t = Math.imul(_rs ^ (_rs >>> 15), 1 | _rs);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const realRandom = Math.random;
Math.random = _next;
const reseed = (s) => { _rs = (s === undefined ? SEED : s) >>> 0; };
const stubRand = (fn) => { Math.random = fn; };
const unStub = () => { Math.random = _next; };

global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
global.window = global; // equipment.js needs it at load; deleted before play
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

let said = [];
const s = () => Game.state.scholar;
const V = () => Game.state.village;
const ME = () => Game.state.scholar.villagerId;
const others = () => (V().roster || []).filter(id => id !== ME());
const trustOfMe = () => (V().trust || {})[ME()];
const stashCount = (m) => (Game.stashState().materials || {})[m] || 0;

function freshGame() {
  said = [];
  reseed();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  // NOTE: never chain wrappers — re-wrapping Game.say per freshGame double-
  // pushes every line (each wrapper closes over the same `said` binding).
  if (!Game._playOrigSay) Game._playOrigSay = Game.say.bind(Game);
  Game.say = (t) => { said.push(String(t)); try { return Game._playOrigSay(t); } catch (e) {} };
  Game.depart();
  s().inventory = [];
  s().ap = 50;
  s().insideHaven = true;
  try { s().tile = { type: 'haven' }; } catch (e) {}
}
const skimLines = () => said.filter(t => /stash count is off/i.test(t));
const ledgerTakes = () => (Game.stashState().ledger || []).filter(e => e.kind === 'take');

(async () => {
  await Game.init();

  console.log('=== SCENE 1: the provider ===');
  freshGame();
  console.log('stores access:', Game.havenStoresAccess());
  Game.addMaterial('branch', 40);
  const t0 = trustOfMe();
  Game.donateMaterial('branch', 30);
  console.log(`donated 30 branches: stash=${stashCount('branch')}, trust ${t0} -> ${trustOfMe()}`);
  console.log('ledger head:', JSON.stringify(Game.stashState().ledger.slice(0, 1)));
  // donate a tool
  s().inventory.push({ itemId: 'multitool', id: 'multitool', name: 'Multitool', units: 1, kcalEach: 0, kg: 0.5 });
  const tidx = s().inventory.findIndex(i => i.itemId === 'multitool');
  const t1 = trustOfMe();
  Game.donateTool(tidx);
  console.log(`donated multitool: stash tools=${Game.stashState().tools.length}, trust ${t1} -> ${trustOfMe()}`);
  console.log('ledger head:', JSON.stringify(Game.stashState().ledger.slice(0, 1)));

  console.log('\n=== SCENE 2: the farm (exploit check) ===');
  const tf = trustOfMe();
  for (let i = 0; i < 5; i++) Game.donateMaterial('branch', 1);
  const ta = trustOfMe();
  Game.takeMaterial('branch', 5);
  const tb = trustOfMe();
  console.log(`trust: donate-phase ${tf} -> ${ta} (+${ta - tf} for 5 one-branch donations), after taking 5 back: ${tb} (penalty: ${tb - ta})`);
  console.log(`EXPLOIT READING: net trust change for a full donate/take-back cycle = ${tb - tf} (positive = farmable)`);
  // tools: donate -> take -> donate
  s().inventory.push({ itemId: 'multitool', id: 'multitool', name: 'Multitool', units: 1, kcalEach: 0, kg: 0.5 });
  const tc = trustOfMe();
  Game.donateTool(s().inventory.findIndex(i => i.itemId === 'multitool'));
  Game.takeTool('multitool');
  const td = trustOfMe();
  console.log(`tool cycle: trust ${tc} -> ${td} (donate +2, take-back penalty: ${td - tc - 2})`);

  console.log('\n=== SCENE 3: the turn (village goes closed) ===');
  freshGame();
  Game.addMaterial('wood', 30);
  Game.donateMaterial('wood', 20);
  for (const id of others()) V().trust[id] = 5;
  console.log('village trust level:', Game.villageTrustLevel());
  const woodBefore = stashCount('wood');
  let skims = 0;
  stubRand(() => 0.01); // force the 5% closed-skim branch
  try {
    for (let i = 0; i < 10; i++) { Game.npcBatchTurn(); }
  } finally { unStub(); }
  skims = skimLines().length;
  const anonTakes = ledgerTakes().filter(e => e.vid === null || e.vid === undefined);
  console.log(`10 forced npcBatchTurns: skim say-lines=${skims}, wood ${woodBefore} -> ${stashCount('wood')}, anonymous 'someone' ledger takes=${anonTakes.length}`);
  console.log('ledger tail:', JSON.stringify(Game.stashState().ledger.slice(0, 3)));

  console.log('\n=== SCENE 4: the reckoning (keeper pulls the pile back) ===');
  said = [];
  const tr0 = trustOfMe();
  const woodNow = stashCount('wood');
  Game.takeMaterial('wood', woodNow);
  console.log(`pulled ${woodNow} wood back: stash=${stashCount('wood')}, trust ${tr0} -> ${trustOfMe()}`);
  console.log('say lines:', said.slice(-4).map(x => x.slice(0, 90)).join(' | '));

  console.log('\n=== SCENE 5: recourse audit ===');
  // Can any doubt/confront path target the anonymous skim? Ledger entries have vid null.
  const hasVid = anonTakes.some(e => e.vid);
  console.log(`anonymous skim entries carry a vid: ${hasVid} (false = no one can be accused; the bleed has no culprit)`);
  // Does the keeper's stash view show the bleed?
  const html = Game.stashHtml();
  console.log(`stashHtml shows ledger: ${/someone took/.test(html)}, shows counts: ${/Wood/.test(html) || /wood/.test(html)}`);

  console.log('\n--- FEEL NOTES ---');
  console.log('1. Donating is one flat +1 trust per call regardless of qty (5x1 branch = +5; 1x30 = +1).');
  console.log('2. Take-back after donate: currently no social cost on the stash side (pantry has one).');
  console.log('3. Closed-village skim fires on the ledger as "someone" — atmospheric, but the keeper has no verb to catch them.');
})().catch(e => { console.error('HARNESS ERROR:', e); process.exit(2); });
