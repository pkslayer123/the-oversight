// MISER BREAK-IT 2026-10-10 — section chronic net-taker hole.
// Hostile player vs the village stash sections (tools / armory / pharmacy).
//
// BREAK UNDER TEST:
//   The chronic net-taker rule (net < -20 -> -2 trust per take, "observed
//   hoarding") lives in takeMaterial and is computed by _stashTotalNet —
//   which sums ONLY the material ledgers (stashGives/stashTakes). The three
//   item sections (tools, armory, pharmacy) keep their own ledgers
//   (stashToolGives/Takes, stashWeaponGives/Takes, stashMedicineGives/Takes)
//   that the chronic rule never reads. A hostile player can drain the ENTIRE
//   armory, tool pile and pharmacy of OTHER people's deposits with zero trust
//   consequence — theft that is never socially punished (canon: "Theft
//   allowed, socially punished"). Materials theft is punished; section theft
//   was free. Measured pre-fix: 24 section takes (8 tools + 8 weapons + 8
//   medicine, all other people's deposits) -> trust 15 -> 15, totalNet 0.
//
// FIX: _stashTotalNet sums all four ledgers; takeTool and _takeStashedItem
// apply the same chronic block as takeMaterial (-2 trust, observe('hoard'),
// "the ledger says everything" at net < -20).
//
// SOFTLOCK regression: donate-everything then take-back restores capability
// (entries survive the round trip; no phantom loss, no dead end).
// HONESTY checks: "Take 5" at near-full pack takes only what fits and says
// the true number; the take-back -5 sting applies what the copy promises.
// Usage: node scripts/test-miser-section-chronic-20261010.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

// SEED BEFORE EVAL (AGENTS.md 2026-10-08): modules capture Math.random at load.
let _s = Number(process.env.SEED || 0xC10C);
function mulberry32(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
Math.random = mulberry32(_s);

global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
// equipment.js needs window at load; delete before playing (sync combat path).
global.window = global;
const ORDER = ['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
  'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
  'src/js/game.js', 'src/js/encounters.js', 'src/js/conversation.js', 'src/js/convo-mood.js',
  'src/js/convoTopics.js', 'src/js/convo-wants.js', 'src/js/convo-dialogue.js', 'src/js/convo-beats.js',
  'src/js/convo-scene.js', 'src/js/examine.js', 'src/js/equipment.js', 'src/js/journal.js',
  'src/js/party.js', 'src/js/party-formal.js', 'src/js/truth.js', 'src/js/contests.js',
  'src/js/contestEngine.js', 'src/js/alienPlayers.js', 'src/js/storage.js', 'src/js/perceive.js',
  'src/js/carexplore.js', 'src/js/justice.js', 'src/js/food.js', 'src/js/betrayal.js',
  'src/js/corpses.js', 'src/js/lifeseed.js', 'src/js/progression.js', 'src/js/ledger.js',
  'src/js/abilityActions.js', 'src/js/monsterBehaviors.js', 'src/js/statusEffects.js',
  'src/js/villager-agency.js', 'src/js/fieldFights.js', 'src/js/villager-objectives.js',
  'src/js/codex-people.js', 'src/js/membership.js', 'src/js/hierarchy.js',
  'src/js/debug-scenarios.js', 'src/js/build.js'];
ORDER.forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
delete global.window;
const Game = globalThis.Scattering.Game;

async function main() {
await Game.init();

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}${extra ? ': ' + extra : ''}`); }
}
function trustOf() {
  const v = Game.state.village, vid = Game.state.scholar.villagerId;
  return (v.trust || {})[vid] === undefined ? 15 : v.trust[vid];
}
function freshGame() {
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  Game.state.scholar.mx = 4; Game.state.scholar.my = 4;
  Game.state.scholar.inventory = [];
  Game.state.scholar.villagerId = Game.generatedRoster[0].id;
  Game.state.scholar.insideHaven = true;
  try { Game.map.px = Game.state.village.px ?? 4; Game.map.py = Game.state.village.py ?? 4; } catch (e) {}
  const access = Game.havenStoresAccess ? Game.havenStoresAccess() : 'inside';
  if (access === 'none') throw new Error('physical-stores gate closed in harness; cannot test stash paths');
}
// Seed the sections with OTHER people's deposits (the depositor's ledger is
// irrelevant — the hostile player never gave anything).
function seedSections() {
  const st = Game.stashState();
  st.tools = []; st.weapons = []; st.medicine = [];
  for (let i = 0; i < 8; i++) {
    st.tools.push({ itemId: 'multitool', name: 'Multitool', units: 1 });
    st.weapons.push({ itemId: 'stone_knife', name: 'Stone knife', units: 1 });
    st.medicine.push({ itemId: 'bandana', name: 'Bandana', units: 1, medType: 'bandage', doses: 2 });
  }
}

// ---------- EXPLOIT: drain all three sections of other people's deposits ----------
freshGame();
seedSections();
const t0 = trustOf();
for (let i = 0; i < 8; i++) Game.takeTool('multitool');
Game.state.scholar.inventory = []; // make room; the takes already landed
for (let i = 0; i < 8; i++) Game.takeWeapon('stone_knife');
Game.state.scholar.inventory = [];
for (let i = 0; i < 8; i++) Game.takeMedicine('bandana');
Game.state.scholar.inventory = [];
const t1 = trustOf();
const net = Game._stashTotalNet(Game.state.scholar.villagerId);
ok('E1 section takes count toward total net', net === -24, `totalNet=${net}`);
ok('E2 chronic section theft is socially punished', t1 < t0, `trust ${t0}->${t1}`);
ok('E3 armory drained', (Game.stashState().weapons || []).length === 0);
ok('E4 pharmacy drained', (Game.stashState().medicine || []).length === 0);
ok('E5 tool pile drained', (Game.stashState().tools || []).length === 0);

// ---------- CONTROL: material chronic rule still fires ----------
freshGame();
Game.stashState().materials.branch = 25;
const c0 = trustOf();
for (let i = 0; i < 5; i++) Game.takeMaterial('branch', 5);
const c1 = trustOf();
ok('C1 material chronic control still fires', c1 < c0, `trust ${c0}->${c1}`);

// ---------- SOFTLOCK: donate-everything then take-back restores ----------
freshGame();
Game.state.scholar.inventory = [
  { itemId: 'multitool', name: 'Multitool', units: 1, kg: 0.24 },
  { itemId: 'stone_knife', name: 'Stone knife', units: 1, kg: 0.15 },
  { itemId: 'bandana', name: 'Bandana', units: 1, kg: 0.03, medType: 'bandage', doses: 2 },
];
Game.donateTool(0);
Game.donateWeapon(0);
Game.donateMedicine(0);
ok('S1 everything donated', Game.state.scholar.inventory.length === 0);
const sTrust = trustOf();
Game.takeTool('multitool');
Game.takeWeapon('stone_knife');
Game.takeMedicine('bandana');
const got = Game.state.scholar.inventory.map(i => i.itemId).sort().join(',');
ok('S2 take-back restores all three', got === 'bandana,multitool,stone_knife', got);
const med = Game.state.scholar.inventory.find(i => i.itemId === 'bandana');
ok('S3 medicine identity survives round trip', med && med.doses === 2 && med.medType === 'bandage', JSON.stringify(med));
ok('S4 take-back sting applied as promised', trustOf() <= sTrust - 5, `trust ${sTrust}->${trustOf()}`);

// ---------- HONESTY: "Take 5" at near-full pack ----------
freshGame();
Game.stashState().materials.branch = 10;
// fill pack to 19.9/20 kg with a heavy stone
Game.state.scholar.inventory = [{ material: 'stone', name: 'Stone', units: 66, kg: 0.3 }]; // 19.8kg
const before = Game.stashState().materials.branch;
Game.takeMaterial('branch', 5);
const after = Game.stashState().materials.branch;
const taken = before - after;
const said = (Game.log || []).slice(-3).join(' | ');
ok('H1 partial take weighs honestly', taken === 0 && /Too heavy/.test(said), `took=${taken} said=${said.slice(-80)}`);
// lighten a little: waterWeight()=2, so 56 stones (16.8kg) leaves room for exactly 2 branches
Game.state.scholar.inventory = [{ material: 'stone', name: 'Stone', units: 56, kg: 0.3 }]; // 16.8+2=18.8kg
Game.takeMaterial('branch', 5);
const taken2 = after - Game.stashState().materials.branch;
const said2 = (Game.log || []).slice(-3).join(' | ');
ok('H2 take says the true number, not "5"', taken2 === 2 && new RegExp(`Took ${taken2} `).test(said2), `took=${taken2} said=${said2.slice(-80)}`);

console.log(`\n${pass} passed, ${fail} failed (seed ${process.env.SEED || 'default'})`);
process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
