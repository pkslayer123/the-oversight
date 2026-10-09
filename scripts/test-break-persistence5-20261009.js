// BREAK-IT: persistence (save/load) — FIFTH PASS (2026-10-09).
// Passes 1-4 killed: save-leak wipe, fight-id minting, volatile fighter
// drops, mantle/key forks, index dishonesty, corrupt pruning, wipeAll dead
// code, dead payload, win-path stale saves, death-path throw races, mid-fight
// order re-deal, phantom fighters, phantom pending encounters, scholarless
// saves, stale belltoad _pendingPack, stale cross-load fights, corrupt
// fighter nukes, silent quota saves, vanishing old-version saves,
// destroy-on-sight corruption, dead proof test.
//
// This pass attacks what remained:
//   R1. villageLost bleeds across in-session Continue (softlock/honesty):
//       load() never reset it — after a village-lost game-over, Continuing
//       another save kept villageLost=true and silently disabled the dawn
//       home-return ("no home to return to") in a run that HAS a home.
//   R2. mapless save loads "fine" (softlock): the scholar guard rejected
//       scholarless saves but a save with run and no map half-loaded —
//       playerTile and the whole world dereference map.
//   R3. two-tab death resurrection (exploit): tab A dies (wipe), tab B's 30s
//       autosave re-created the keyed save + index entry — Continue
//       resurrected the dead run. The two-tab form of the class pass 2
//       killed single-tab. FIX: wipe() leaves a per-runKey tombstone;
//       save() refuses tombstoned keys with a distinct 'tombstoned' signal
//       (never the quota-false); the autosave names the real reason.
//   R4. quarantine stamp collision (hardening): Date.now()-only stamp could
//       collide within one ms — the second quarantine overwrote the first.
//       Random suffix added (deterministic in-test via stubbed Date.now).
//   Sibling sweep: every `this.over = true` terminal path wipes in the same
//       tick (static); S.state.save has exactly one caller (Game.save).
//
// Usage: node scripts/test-break-persistence5-20261009.js
//        BEFORE=1 node scripts/test-break-persistence5-20261009.js
const fs = require('fs');
const path = require('path');
const { execSync, execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const BEFORE = !!process.env.BEFORE;

const PRE = ['src/js/engine/state.js', 'src/js/game.js'];
if (BEFORE) {
  for (const f of PRE) {
    execSync(`git show HEAD:${f} > /tmp/bp5-before-${path.basename(f)}`, { cwd: ROOT });
  }
  console.log('MODE: BEFORE (pre-fix files from git HEAD)');
} else {
  console.log('MODE: AFTER (fixed worktree code)');
}
const srcOf = (f) => BEFORE && PRE.includes(f)
  ? fs.readFileSync(`/tmp/bp5-before-${path.basename(f)}`, 'utf8')
  : fs.readFileSync(path.join(ROOT, f), 'utf8');

// ---- localStorage stub (engine uses it directly; needs length/key(i) for
// ---- quarantine + tombstone-cap iteration) ----
function makeStore() {
  const _store = {};
  const api = {
    getItem: (k) => (k in _store ? _store[k] : null),
    setItem: (k, v) => { _store[k] = String(v); },
    removeItem: (k) => { delete _store[k]; },
    key: (i) => Object.keys(_store)[i] || null,
    _keys: () => Object.keys(_store),
    _reset: () => { for (const k of Object.keys(_store)) delete _store[k]; },
  };
  Object.defineProperty(api, 'length', { get: () => Object.keys(_store).length });
  return api;
}
const store = makeStore();
globalThis.localStorage = store;

// ---- data ----
const PAIRS = [
  ['plants.json', 'plants'], ['biomes.json', 'biomes'], ['monsters.json', 'monsters'],
  ['villagers.json', 'villagers'], ['abilities.json', 'abilities'], ['items.json', 'items'],
  ['background_survivors.json', 'background_survivors'], ['cell_defs.json', 'cellDefs'],
  ['animals.json', 'animals'], ['recipes.json', 'recipes'], ['books.json', 'books'],
  ['relicEnhancements.json', 'relicEnhancements'], ['locations.json', 'locations'],
  ['characterGen.json', 'characterGen'], ['synergies.json', 'synergies'],
  ['knowledge.json', 'knowledge'], ['nameCultures.json', 'nameCultures'],
  ['originPicker.json', 'originPicker'], ['foreignSpeech.json', 'foreignSpeech'],
  ['lifeseeds.json', 'lifeseeds'], ['arrivalText.json', 'arrivalText'],
  ['justiceVoice.json', 'justiceVoice'], ['alienPlayers.json', 'alienPlayers'],
  ['regions.json', 'regions'], ['dramaEffects.json', 'dramaEffects'],
  ['monsterBehaviors.json', 'monsterBehaviors'], ['contests.json', 'contests'],
  ['events.json', 'events'], ['statusEffects.json', 'statusEffects'],
];
global.SCATTER_DATA = {};
for (const [file, key] of PAIRS) {
  try { global.SCATTER_DATA[key] = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data', file), 'utf8')); }
  catch (e) { /* missing file: leave undefined */ }
}

// ---- seeded RNG BEFORE eval (modules capture Math.random at load) ----
function mulberry32(s) { let t = s >>> 0; return function () { t += 0x6D2B79F5; let r = Math.imul(t ^ (t >>> 15), 1 | t); r ^= r + Math.imul(r ^ (r >>> 7), 61 | r); return ((r ^ (r >>> 14)) >>> 0) / 4294967296; }; }
let rng = mulberry32(1);
Math.random = function () { return rng(); };
function reseed(s) { rng = mulberry32(s); }

global.window = global;
const FILES = ['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
  'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
  'src/js/game.js', 'src/js/encounters.js', 'src/js/conversation.js',
  'src/js/convo-mood.js', 'src/js/convoTopics.js', 'src/js/convo-wants.js', 'src/js/convo-dialogue.js',
  'src/js/convo-beats.js', 'src/js/convo-scene.js', 'src/js/examine.js', 'src/js/equipment.js',
  'src/js/journal.js', 'src/js/party.js', 'src/js/party-formal.js', 'src/js/truth.js',
  'src/js/contests.js', 'src/js/alienPlayers.js', 'src/js/storage.js', 'src/js/perceive.js',
  'src/js/carexplore.js', 'src/js/justice.js', 'src/js/food.js', 'src/js/betrayal.js',
  'src/js/corpses.js', 'src/js/lifeseed.js', 'src/js/progression.js',
  'src/js/ledger.js', 'src/js/abilityActions.js', 'src/js/monsterBehaviors.js', 'src/js/statusEffects.js',
  'src/js/villager-agency.js', 'src/js/codex-people.js', 'src/js/membership.js', 'src/js/hierarchy.js',
  'src/js/debug-scenarios.js', 'src/js/build.js'];
for (const f of FILES) {
  try { eval(srcOf(f)); }
  catch (e) { console.error('EVAL FAIL ' + f + ': ' + e.message); process.exit(2); }
}
delete global.window;
const Game = globalThis.Scattering.Game;
const S = globalThis.Scattering;
Game.data = global.SCATTER_DATA;

let fails = 0;
function check(name, cond, detail) {
  console.log((cond ? 'PASS' : 'FAIL') + ' | ' + name + (detail ? ' — ' + detail : ''));
  if (!cond) fails++;
}

const said = [];
Game.say = (m) => { said.push(String(m)); };
Game.drama = () => {}; Game.recordLegend = () => {}; Game.recordMoment = () => {};
Game.ledgerAdd = () => {}; Game.writeEpitaph = () => {}; Game.removeVillager = () => {};
Game.lineage = () => []; Game.leadershipEpithet = () => 'the steady';
Game.maxHealth = () => 100; Game.integrationStage = () => 0;
Game.playerTile = () => ({ type: 'wild' }); Game.endingFrame = () => 'indispensable';

// ---- minimal loadable-save builder ----
function buildLoadable(vid, extra) {
  reseed(42);
  const st = S.state.newState();
  st.village = Object.assign(S.state.newVillage(), {
    name: 'Haven', roster: [vid], rosterChars: { [vid]: { id: vid, name: 'Mara Voss' } },
  });
  st.scholar = S.state.newScholar(vid);
  st.run = {
    map: { px: 4, py: 4 }, dayPart: 1, location: 'village', departed: false, log: [],
    homeRegion: null, villagerId: vid, encounterDone: false, wanderer: null,
    pendingEncounter: false, pendingMonsterId: null, pendingInTent: false, tbfight: null,
  };
  if (extra) extra(st);
  return st;
}

// ================= R1: villageLost bleed =================
{
  store._reset();
  const st = buildLoadable('v1');
  S.state.save(st);
  Game.villagerId = 'v1';
  Game.villageLost = true; // simulate: previous session ended village-lost
  const ok = Game.load(st.runKey);
  if (BEFORE) {
    check('R1. BEFORE: villageLost bleeds across in-session Continue',
      ok === true && Game.villageLost === true,
      `load=${ok} villageLost=${Game.villageLost}`);
  } else {
    check('R1. load() resets villageLost (living run always has a home)',
      ok === true && Game.villageLost === false,
      `load=${ok} villageLost=${Game.villageLost}`);
  }
}

// ================= R2: mapless save =================
{
  store._reset();
  const st = buildLoadable('v2', (s) => { delete s.run.map; });
  S.state.save(st);
  Game.villagerId = 'v2';
  let ok, threw = null;
  try { ok = Game.load(st.runKey); } catch (e) { threw = e; }
  if (BEFORE) {
    check('R2. BEFORE: mapless save loads "fine" (half-load or throw)',
      ok === true || threw !== null,
      threw ? `threw: ${thrown.message}` : `load=${ok} map=${Game.map}`);
  } else {
    check('R2. mapless save honestly rejected',
      ok === false && threw === null,
      threw ? `threw: ${thrown.message}` : `load=${ok}`);
  }
}

// ================= R3: two-tab death resurrection (S.state level) =================
{
  store._reset();
  const stA = buildLoadable('v3');
  const rA = S.state.save(stA);
  const key = stA.runKey;
  const listedBefore = S.state.listSaves().some(i => i.key === key);
  S.state.wipe(key); // tab A dies
  const goneAfterWipe = store.getItem(key) === null && !S.state.listSaves().some(i => i.key === key);
  // tab B: stale session, same runKey, still "playing"
  const stB = buildLoadable('v3');
  stB.runKey = key;
  const rB = S.state.save(stB);
  const resurrected = store.getItem(key) !== null && S.state.listSaves().some(i => i.key === key);
  if (BEFORE) {
    check('R3. BEFORE: stale tab re-creates the wiped run (resurrection)',
      rA === true && listedBefore && goneAfterWipe && rB === true && resurrected,
      `saveA=${rA} wiped=${goneAfterWipe} saveB=${rB} resurrected=${resurrected}`);
  } else {
    check('R3. wiped run stays dead: stale-tab save refused with tombstoned signal',
      rA === true && listedBefore && goneAfterWipe && rB === 'tombstoned' && !resurrected,
      `saveA=${rA} wiped=${goneAfterWipe} saveB=${JSON.stringify(rB)} resurrected=${resurrected}`);
  }
}

// ================= R4: Game-level tombstone + new runs unblocked =================
{
  store._reset();
  const st = buildLoadable('v4');
  Game.state = st; Game.villagerId = 'v4'; Game.over = false;
  const r1 = Game.save();
  const key = st.runKey;
  Game.wipe(); // the other tab's death
  const r2 = Game.save(); // this tab still alive: over=false
  const listed = S.state.listSaves().some(i => i.key === key);
  // a brand-new run must not be blocked by the old run's tombstone
  const st2 = buildLoadable('v4b');
  Game.state = st2; Game.villagerId = 'v4b';
  const r3 = Game.save();
  if (BEFORE) {
    check('R4. BEFORE: Game.save() resurrects the wiped run',
      r1 === true && r2 === true && listed,
      `save1=${r1} save2=${r2} listed=${listed}`);
  } else {
    check('R4. Game.save() refuses the tombstoned key; new run saves fine',
      r1 === true && r2 === 'tombstoned' && !listed && r3 === true && st2.runKey !== key,
      `save1=${r1} save2=${JSON.stringify(r2)} listed=${listed} newSave=${r3}`);
  }
}

// ================= R5: deleteSave tombstones too =================
{
  store._reset();
  const st = buildLoadable('v5');
  Game.state = st; Game.villagerId = 'v5'; Game.over = false;
  Game.save();
  const key = st.runKey;
  Game.deleteSave(key);
  const stB = buildLoadable('v5');
  stB.runKey = key;
  const r = S.state.save(stB);
  if (BEFORE) {
    check('R5. BEFORE: title-deleted save resurrectable by stale tab',
      r === true && store.getItem(key) !== null,
      `save=${r}`);
  } else {
    check('R5. title-deleted save stays deleted (tombstoned)',
      r === 'tombstoned' && store.getItem(key) === null,
      `save=${JSON.stringify(r)}`);
  }
}

// ================= R6: wipe of never-written key: no tombstone, first save fine =================
{
  store._reset();
  const st = buildLoadable('v6');
  const key = S.state.saveKey(st); // never saved
  S.state.wipe(key);
  const tombstoned = store._keys().some(k => k.indexOf('scattering-save-tombstone-') === 0);
  const r = S.state.save(st);
  check('R6. wiping a never-written key leaves no tombstone; first save works',
    !tombstoned && r === true,
    `tombstone=${tombstoned} save=${r}`);
}

// ================= R7: quarantine stamp collision =================
{
  store._reset();
  if (BEFORE) {
    // pre-fix code has no exported quarantineKey; demonstrate the break at
    // the source level: the stamp was Date.now()-only.
    const headSrc = srcOf('src/js/engine/state.js');
    check('R7. BEFORE: stamp is Date.now()-only (same-ms collision overwrites)',
      /const stamp = Date\.now\(\)\.toString\(36\);/.test(headSrc) &&
      typeof S.state.quarantineKey !== 'function');
  } else {
    const realNow = Date.now;
    Date.now = () => 1780000000000; // freeze: both quarantines land in the same ms
    try {
      store.setItem('scattering-save-v1-qa', 'corrupt-A{{{');
      S.state.quarantineKey('scattering-save-v1-qa');
      store.setItem('scattering-save-v1-qa', 'corrupt-B{{{');
      S.state.quarantineKey('scattering-save-v1-qa');
    } finally { Date.now = realNow; }
    const qk = store._keys().filter(k => k.indexOf('scattering-save-quarantine-') === 0);
    check('R7. same-ms quarantines both survive (random stamp suffix)',
      qk.length === 2, `quarantine keys=${qk.length}`);
  }
}

// ================= SIBLING SWEEP: terminal paths wipe in the same tick =================
{
  const files = ['src/js/game.js', 'src/js/contests.js', 'src/js/ledger.js'];
  let bad = [];
  for (const f of files) {
    const lines = srcOf(f).split('\n');
    lines.forEach((ln, i) => {
      if (/this\.over\s*=\s*true/.test(ln)) {
        const win = lines.slice(i, i + 9).join('\n');
        if (!/\.wipe\(\)/.test(win)) bad.push(`${f}:${i + 1}`);
      }
    });
  }
  check('S1. every `this.over = true` terminal path wipes within the same tick',
    bad.length === 0, bad.length ? `missing wipe: ${bad.join(', ')}` : 'all terminal paths wipe');
}

// S2: save() has exactly one caller — the tombstone contract lives in one place
{
  let callers = [];
  for (const f of FILES) {
    const src = srcOf(f);
    const lines = src.split('\n');
    lines.forEach((ln, i) => {
      if (/S\.state\.save\(|Scattering\.state\.save\(/.test(ln) && !/function save\(/.test(ln)) {
        callers.push(`${f}:${i + 1}`);
      }
    });
  }
  check('S2. S.state.save has exactly one caller (Game.save)',
    callers.length === 1 && /game\.js/.test(callers[0]),
    `callers: ${callers.join(', ')}`);
}

// S3 (source-level): the 30s autosave names the tombstone reason honestly
{
  const app = fs.readFileSync(path.join(ROOT, 'src/js/app.js'), 'utf8');
  check('S3. autosave handles the tombstoned signal with an honest message (source-level)',
    /r === 'tombstoned'/.test(app) && /ended somewhere else/.test(app));
}

console.log(fails === 0 ? '\nALL CHECKS PASSED' : `\n${fails} CHECK(S) FAILED`);
process.exit(fails === 0 ? 0 : 1);
