// BREAK-IT: persistence (save/load) — SECOND PASS, deeper (2026-10-08).
// First pass (test-break-persistence-20261008.js): 8 kills, all still green.
// This pass attacks what the first pass left: win-path stale saves, death-path
// throw races, decay/spoilage clocks, social-state fidelity, double-load
// duplication, day-part/position honesty, silent-save-failure scan.
//
// KILLS:
//   W1. WIN-PATH STALE SAVE -> ending-shopping exploit: chooseTableOption set
//       over=true/won=true then called save(), which NO-OPS when over — the
//       pre-choice save (with tableChoices intact) survived, and Continue
//       resurrected the final live choice for re-picking. FIX: wipe() on win.
//   W2. DEATH-PATH THROW RACE (same bug class as first-pass kill #1): four
//       callers wrapped playerDeath in try/catch that set over=true with NO
//       wipe — a throwing playerDeath left a live save behind and Continue
//       resurrected the dead run. FIX: wipe() in each catch (expedition,
//       night, combat, arena).
//
// HELD (attacked, resisted):
//   - Decay/spoilage clocks: corpse dayDied, inventory spoilDay, prepStash
//     spoilDay are all absolute-day-keyed; save/load preserves them.
//   - Social state: trust, gossip, talkRequests, justice timers all live on
//     village (persisted); save/load diff is empty.
//   - Double load: no duplication (villager re-injection is idempotent,
//     recomputeActiveSynergies replaces, log/map replaced).
//   - Day part + position (map px/py, scholar mx/my): restored faithfully.
//   - Silent save failure: deep scan of a maximally-populated live state
//     finds zero unserializable values (no functions/BigInt/circular refs);
//     all runtime assignments into state are plain literals. The silent
//     no-op hazard is real IF junk ever lands there (demonstrated with a
//     poisoned state) but no natural vector exists — held, not fixed (a
//     blanket replacer would mask future bugs; fail loudly beats silent drop).
//
// Usage: node scripts/test-break-persistence2-20261008.js
//        BEFORE=1 node scripts/test-break-persistence2-20261008.js
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const BEFORE = !!process.env.BEFORE;

const PRE = ['src/js/game.js', 'src/js/ledger.js', 'src/js/contests.js'];
if (BEFORE) {
  for (const f of PRE) {
    execSync(`git show HEAD:${f} > /tmp/bp2-before-${path.basename(f)}`, { cwd: ROOT });
  }
  console.log('MODE: BEFORE (pre-fix files from git HEAD)');
} else {
  console.log('MODE: AFTER (fixed worktree code)');
}
const srcOf = (f) => BEFORE && PRE.includes(f)
  ? fs.readFileSync(`/tmp/bp2-before-${path.basename(f)}`, 'utf8')
  : fs.readFileSync(path.join(ROOT, f), 'utf8');

// ---- localStorage stub ----
const _store = {};
globalThis.localStorage = {
  getItem: (k) => (k in _store ? _store[k] : null),
  setItem: (k, v) => { _store[k] = String(v); },
  removeItem: (k) => { delete _store[k]; },
  _clear: () => { for (const k of Object.keys(_store)) delete _store[k]; },
  _keys: () => Object.keys(_store),
};

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
for (const [f, key] of PAIRS) {
  global.SCATTER_DATA[key] = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data', f), 'utf8'));
}

// ---- seeded RNG BEFORE eval ----
let _seed = 1;
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

async function settle() { await new Promise(r => setTimeout(r, 10)); }

// ---- minimal world stubs ----
const realSay = () => {};
Game.say = realSay;
Game.drama = () => {};
Game.recordLegend = () => {};
Game.recordMoment = () => {};
Game.ledgerAdd = () => {};
Game.writeEpitaph = () => {};
Game.welcomeBearer = () => {};
Game.removeVillager = () => {};
Game.lineage = () => [];
Game.leadershipEpithet = () => 'the steady';
Game.maxHealth = () => 100;
Game.integrationStage = () => 0;
Game.playerTile = () => ({ type: 'haven' });
Game.endingFrame = () => 'indispensable';
Game.registerDeath = () => {};
Game.log = [];

function freshState(rosterIds) {
  const st = S.state.newState();
  const chars = {};
  for (const id of rosterIds) chars[id] = { id, name: id === 'v1' ? 'Mara Voss' : 'Tove Lind' };
  st.village = Object.assign(S.state.newVillage(), {
    name: 'Haven', roster: rosterIds.slice(), rosterChars: chars, trust: {},
  });
  st.scholar = S.state.newScholar(rosterIds[0]);
  st.scholar.day = 5;
  st.startedAt = 1700000000000;
  return st;
}
function wireGame(st, npcIds) {
  Game.state = st;
  Game.villagerId = st.scholar.villagerId;
  Game.map = { tiles: [], px: 4, py: 4, worldSeed: 1, worldSize: 9 };
  Game.dayPart = 1; Game.location = 'village'; Game.departed = false;
  Game.over = false; Game.won = false; Game.villageLost = false;
  Game.log = []; Game.tbfight = null; Game.encounterDone = false; Game.wanderer = null;
  Game.pendingEncounter = false; Game.pendingMonsterId = null; Game.pendingInTent = false;
  Game.data.villagers = Object.values(st.village.rosterChars || {});
  Game.npcIds = () => npcIds.slice();
}

let fails = 0;
function check(name, cond, detail) {
  console.log((cond ? 'PASS' : 'FAIL') + ' | ' + name + (detail ? ' — ' + detail : ''));
  if (!cond) fails++;
}

// deep scan for values JSON.stringify would choke on or silently drop
function scanUnserializable(root) {
  const hits = [];
  const seen = new Set();
  (function walk(v, p) {
    if (v === null || v === undefined) return;
    const t = typeof v;
    if (t === 'function') { hits.push(p + ':function'); return; }
    if (t === 'bigint') { hits.push(p + ':bigint'); return; }
    if (t !== 'object') return;
    if (seen.has(v)) { hits.push(p + ':circular'); return; }
    seen.add(v);
    for (const k of Object.keys(v)) {
      if (k === 'mdef') continue; // stripped by the fighter snapshotter, never serialized
      walk(v[k], p + '.' + k);
    }
  })(root, '$');
  return hits;
}

async function main() {
  await settle();
  reseed(42);

  // ============ W1. WIN-PATH STALE SAVE -> ending-shopping exploit ============
  {
    globalThis.localStorage._clear();
    const st = freshState(['v1']);
    wireGame(st, ['v1']);
    Game.tableScene(); // saves with tableChoices pending
    const key = S.state.listSaves()[0].key;
    const stored = JSON.parse(globalThis.localStorage.getItem(key));
    check('W1a. pre-choice save holds tableChoices',
      !!(stored.scholar && stored.scholar.tableChoices && stored.scholar.tableChoices.options.length === 2),
      `options=${stored.scholar && stored.scholar.tableChoices && stored.scholar.tableChoices.options.length}`);
    Game.chooseTableOption('price'); // the finale: over=true, won=true
    check('W1b. finale flags set', Game.over === true && Game.won === true);
    const keysAfter = globalThis.localStorage._keys().filter(k => k.startsWith('scattering-save-v1-'));
    if (BEFORE) {
      check('W1c. BEFORE: won run\'s save SURVIVES (save() no-ops when over)',
        keysAfter.length === 1, `keys=${keysAfter.length}`);
      const ok = Game.load(key);
      const tc = Game.state.scholar.tableChoices;
      check('W1d. BEFORE: Continue resurrects the final choice (ending-shopping)',
        ok === true && Game.over === false && Game.won === false && !!(tc && tc.options),
        `load=${ok}, over=${Game.over}, tableChoices=${!!(tc && tc.options)}`);
    } else {
      check('W1c. AFTER: won run is wiped (finished runs don\'t continue)',
        keysAfter.length === 0 && S.state.listSaves().length === 0,
        `keys=${keysAfter.length}, list=${S.state.listSaves().length}`);
      check('W1d. AFTER: nothing left to load', Game.load(key) === false);
    }
  }

  // ============ W2. DEATH-PATH THROW RACE (kill #1's bug class) ============
  {
    // static: the five playerDeath catch clauses must pair over=true with wipe()
    const gsrc = srcOf('src/js/game.js'), lsrc = srcOf('src/js/ledger.js'), csrc = srcOf('src/js/contests.js');
    const catches = [
      ["game.js expedition", gsrc, /playerDeath\('the expedition'\); \} catch \(e\) \{ this\.over = true;([^}]*) \}/],
      ["game.js night", gsrc, /playerDeath\('the night'\); \} catch \(e\) \{ this\.over = true;([^}]*) \}/],
      ["game.js combat", gsrc, /playerDeath\('combat'\); \} catch \(e5\) \{ this\.over = true;([^}]*) \}/],
      ["ledger.js arena", lsrc, /playerDeath\('the arena'\); \} catch \(e\) \{ this\.over = true;([^}]*) \}/],
      ["contests.js contest", csrc, /playerDeath\('contest'\); \} catch \(e\) \{ this\.over = true;([^}]*) \}/],
    ];
    for (const [label, src, re] of catches) {
      const m = src.match(re);
      const hasWipe = !!(m && /this\.wipe\(\)/.test(m[1]));
      const noStateOver = !(m && /state\.over/.test(m[0]));
      if (BEFORE) {
        if (label.startsWith('contests')) {
          // BEFORE contest text has no "this.over = true" at all — it wrote the
          // split-brain state.over flag with no wipe instead.
          const oldM = src.match(/playerDeath\('contest'\); \} catch \(e\) \{([^}]*) \}/);
          check(`W2a. BEFORE: ${label} catch wrote split-brain state.over, no wipe`,
            !!(oldM && /state\.over/.test(oldM[1]) && !/this\.wipe\(\)/.test(oldM[1])));
        } else {
          check(`W2a. BEFORE: ${label} catch sets over WITHOUT wipe (resurrection hazard)`, !!m && !hasWipe);
        }
      } else {
        check(`W2a. AFTER: ${label} catch wipes with over`, hasWipe && noStateOver, label);
      }
    }
    // behavioral: a throwing playerDeath + over-without-wipe resurrects;
    // over-with-wipe (the fixed caller pattern) does not.
    globalThis.localStorage._clear();
    const st = freshState(['v1']);
    wireGame(st, ['v1']);
    Game.save();
    const key = S.state.listSaves()[0].key;
    Game.say = () => { throw new Error('sabotaged say'); }; // force playerDeath to throw
    let threw = false;
    try { Game.playerDeath('the night'); } catch (e) { threw = true; }
    Game.say = realSay;
    check('W2b. sabotaged playerDeath throws', threw);
    if (BEFORE) {
      Game.over = true; // the BEFORE caller pattern: over, no wipe
      const ok = Game.load(key);
      check('W2c. BEFORE: throw + over-without-wipe resurrects the dead run',
        ok === true && Game.over === false, `load=${ok}, over=${Game.over}`);
    } else {
      Game.over = true; try { Game.wipe(); } catch (e) {} // the AFTER caller pattern
      const keysAfter = globalThis.localStorage._keys().filter(k => k.startsWith('scattering-save-v1-'));
      check('W2c. AFTER: throw + over-with-wipe leaves nothing to resurrect',
        keysAfter.length === 0 && Game.load(key) === false, `keys=${keysAfter.length}`);
    }
  }

  // ============ B. DECAY / SPOILAGE CLOCKS (held) ============
  {
    globalThis.localStorage._clear();
    const st = freshState(['v1']);
    wireGame(st, ['v1']);
    st.scholar.day = 5;
    st.corpses = [{ kind: 'monster', name: 'Hushwolf', dayDied: 3, node: { x: 4, y: 4 }, mx: 4, my: 4 }];
    st.scholar.inventory = [{ plantId: 'dandelion', units: 2, spoilDay: 7, name: 'dandelion' }];
    st.scholar.prepStash = [{ plantId: 'acorn', units: 5, spoilDay: 6, name: 'acorn' }];
    const stageBefore = Game.corpseStage(st.corpses[0]);
    Game.save();
    const key = S.state.listSaves()[0].key;
    Game.load(key);
    const c = Game.state.corpses[0];
    check('B1. corpse dayDied survives load (no clock rewind)', c.dayDied === 3, `dayDied=${c.dayDied}`);
    check('B2. corpse stage identical across load', Game.corpseStage(c) === stageBefore, `stage=${Game.corpseStage(c)}`);
    check('B3. inventory spoilDay survives load', Game.state.scholar.inventory[0].spoilDay === 7);
    check('B4. prepStash spoilDay survives load', Game.state.scholar.prepStash[0].spoilDay === 6);
  }

  // ============ F. SOCIAL STATE FIDELITY (held) ============
  {
    globalThis.localStorage._clear();
    const st = freshState(['v1', 'v2']);
    wireGame(st, ['v2']);
    st.village.trust = { v2: 77, v1: 12 };
    st.village.gossip = [{ day: 5, action: 'theft', heard: ['v2'] }];
    st.village.talkRequests = { v2: { line: 'Can we talk?', day: 5 } };
    st.village.justice = { stage: 2, crimes: ['theft'], exiled: false, exileDay: null };
    Game.save();
    const key = S.state.listSaves()[0].key;
    // be rude, then reload: trust must NOT reset to default
    st.village.trust.v2 = 3;
    Game.load(key);
    const v = Game.state.village;
    check('F1. trust survives load (no forgive-by-reload)', v.trust.v2 === 77 && v.trust.v1 === 12,
      `trust=${JSON.stringify(v.trust)}`);
    check('F2. gossip queue survives load', v.gossip.length === 1 && v.gossip[0].action === 'theft');
    check('F3. talk requests survive load', !!(v.talkRequests && v.talkRequests.v2));
    check('F4. justice timers survive load', v.justice.stage === 2 && v.justice.exiled === false);
  }

  // ============ E. DOUBLE-LOAD DUPLICATION (held) ============
  {
    globalThis.localStorage._clear();
    const st = freshState(['v1', 'v2']);
    wireGame(st, ['v2']);
    Game.log = ['a', 'b', 'c'];
    Game.save();
    const key = S.state.listSaves()[0].key;
    Game.load(key);
    const nVill1 = Game.data.villagers.length, logLen1 = Game.log.length;
    Game.load(key); // load the SAME save twice
    const ids = Game.data.villagers.map(x => x.id);
    check('E1. double load: no villager duplication', new Set(ids).size === ids.length,
      `villagers=${ids.length}`);
    check('E2. double load: villager count stable', Game.data.villagers.length === nVill1);
    check('E3. double load: log not appended', Game.log.length === logLen1, `log=${Game.log.length}`);
    Game.save(); Game.save();
    check('E4. save/load/save keeps a single index entry', S.state.listSaves().length === 1);
  }

  // ============ C+G. DAY-PART + POSITION HONESTY (held) ============
  {
    globalThis.localStorage._clear();
    const st = freshState(['v1']);
    wireGame(st, ['v1']);
    Game.dayPart = 2; // mid-afternoon
    Game.map.px = 6; Game.map.py = 2;
    st.scholar.mx = 3; st.scholar.my = 5;
    Game.save();
    const key = S.state.listSaves()[0].key;
    Game.dayPart = 0; Game.map.px = 4; Game.map.py = 4;
    Game.load(key);
    check('C1. day part restored (no free dawn / lost afternoon)', Game.dayPart === 2, `dayPart=${Game.dayPart}`);
    check('G1. macro position restored', Game.map.px === 6 && Game.map.py === 2, `px=${Game.map.px},py=${Game.map.py}`);
    check('G2. micro position restored', Game.state.scholar.mx === 3 && Game.state.scholar.my === 5);
  }

  // ============ A. SILENT-SAVE-FAILURE SCAN (held — no natural vector) ============
  {
    globalThis.localStorage._clear();
    const st = freshState(['v1', 'v2']);
    wireGame(st, ['v2']);
    // maximally populate: every persisted section with realistic content
    st.scholar.day = 9;
    st.scholar.inventory = [{ plantId: 'dandelion', units: 2, spoilDay: 11, name: 'dandelion' }];
    st.scholar.prepStash = [{ plantId: 'acorn', units: 5, spoilDay: 10, name: 'acorn' }];
    st.scholar.activeQuest = { id: 'q1', type: 'bring', giver: 'v2' };
    st.scholar.tableChoices = null;
    st.corpses = [{ kind: 'person', name: 'Mara Voss', dayDied: 8, node: { x: 4, y: 4 }, mx: 4, my: 4 }];
    st.village.trust = { v2: 60 };
    st.village.gossip = [{ day: 9, action: 'feast', heard: [] }];
    st.village.talkRequests = { v2: { line: 'hi', day: 9 } };
    st.pendingContest = { firesDay: 12, id: 'c1' };
    st.camp = { px: 6, py: 2 };
    Game.wanderer = { x: 5, y: 5, dir: 1, monsterId: 'hushwolf', veteran: false };
    Game.pendingEncounter = true; Game.pendingMonsterId = 'hushwolf'; Game.pendingInTent = false;
    Game.log = ['line one', 'line two'];
    Game.tbfight = {
      id: 'f_scan', fighters: [{ key: 'p', kind: 'player', hp: 90, mx: 4, my: 4, alive: true }],
      order: ['p'], turnIdx: 0, round: 1, over: false, terraform: {},
    };
    Game.syncRun();
    const hits = scanUnserializable(Game.state).concat(
      scanUnserializable(Game.map), scanUnserializable(Game.log),
      scanUnserializable(Game.wanderer));
    check('A1. deep scan: zero unserializable values in live persisted state',
      hits.length === 0, hits.slice(0, 5).join('; '));
    Game.save();
    const key = S.state.listSaves()[0] && S.state.listSaves()[0].key;
    check('A2. save() actually writes (player belief is honest)', !!key && globalThis.localStorage.getItem(key) !== null);
    // hazard demonstration (both modes): IF junk lands in state, save() fails SILENTLY
    const st2 = freshState(['v1']);
    wireGame(st2, ['v1']);
    Game.save();
    const key2 = S.state.listSaves()[0].key;
    st2.scholar.selfRef = st2.scholar; // poison: circular ref
    Game.state = st2;
    let saveThrew = false;
    try { Game.save(); } catch (e) { saveThrew = true; }
    const rawAfter = globalThis.localStorage.getItem(key2);
    const silentlyStale = !saveThrew && rawAfter !== null &&
      !JSON.parse(rawAfter).scholar.day; // unchanged write would lack nothing; check it didn't update
    // the poisoned save no-ops: stored data is the PRE-poison write (day still 5, no selfRef key)
    const storedDay = rawAfter && JSON.parse(rawAfter).scholar.day;
    check('A3. hazard documented: poisoned state -> save() swallows, stored save goes stale (no natural vector found)',
      !saveThrew && storedDay === 5, `threw=${saveThrew}, storedDay=${storedDay}`);
    void silentlyStale;
  }

  console.log(fails === 0 ? '\nALL CHECKS PASSED' : `\n${fails} CHECK(S) FAILED`);
  process.exit(fails === 0 ? 0 : 1);
}

main().catch(e => { console.error('HARNESS FAIL: ' + (e && e.stack || e)); process.exit(2); });
