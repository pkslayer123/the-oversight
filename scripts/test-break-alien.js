// break-it: ALIEN PLAYERS (2026-10-09)
// Hostile-player proof tests for src/js/alienPlayers.js.
// Node harness: seed Math.random BEFORE eval (modules capture it at load),
// eval the FULL src/js list in index.html order minus DOM-only modules.
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

// ---- seeded RNG (mulberry32), installed BEFORE module eval ----
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const SEED = parseInt(process.env.SEED || '7', 10);
const rng = mulberry32(SEED);
Math.random = rng;

// ---- minimal browser-ish globals ----
global.window = global;
global.document = {
  createElement: () => ({ style: {}, appendChild() {}, addEventListener() {} }),
  getElementById: () => null, querySelector: () => null,
  addEventListener() {},
};
global.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
try { global.navigator = { userAgent: 'node' }; } catch (e) {}

const SKIP = new Set(['app.js', 'sprites.js', 'tile-scenes.js', 'move-anim.js', 'drama.js']);
const ORDER = [
  'game.js','encounters.js','conversation.js','convo-mood.js','convoTopics.js','convo-wants.js',
  'convo-dialogue.js','convo-beats.js','convo-scene.js','examine.js','equipment.js','journal.js',
  'party.js','party-formal.js','truth.js','contests.js','contestEngine.js','alienPlayers.js',
  'storage.js','perceive.js','carexplore.js','justice.js','food.js','betrayal.js','corpses.js',
  'lifeseed.js','progression.js','ledger.js','abilityActions.js','monsterBehaviors.js',
  'statusEffects.js','villager-agency.js','fieldFights.js','villager-objectives.js',
  'codex-people.js','membership.js','hierarchy.js','debug-scenarios.js','build.js',
];
for (const f of ORDER) {
  if (SKIP.has(f)) continue;
  const src = fs.readFileSync(path.join(ROOT, 'src/js', f), 'utf8');
  try { eval.call(global, src + '\n//# sourceURL=' + f); }
  catch (e) { console.error('EVAL FAIL ' + f + ': ' + e.message); process.exit(2); }
}
delete global.window; // sync combat path (per AGENTS.md)

const G = global.Scattering.Game;

// ---- capture say/sysSay ----
let said = [];
const _say = G.say, _sysSay = G.sysSay;
G.say = function (t) { said.push(String(t)); try { return _say && _say.apply(this, arguments); } catch (e) {} };
G.sysSay = function (t) { said.push('[SYS] ' + String(t)); try { return _sysSay && _sysSay.apply(this, arguments); } catch (e) {} };

// ---- minimal game state ----
function freshState() {
  said = [];
  G.state = {
    scholar: { day: 45, mx: 4, my: 4, hp: 100, maxHp: 100, health: 100, kcal: 1000, inventory: [], equipped: {}, flags: {} },
    systemArrived: true,
    systemIntegration: 2,
    village: { roster: ['v1', 'v2', 'v3', 'v4'], trust: {} },
    codex: {},
    party: ['v1', 'v2'],
    combatWins: 6,
    waveKills: { 1: 10 }, // unlockedWave() -> 2 with day 45
  };
  G.map = { px: 5, py: 5 };
  // Unconditional overrides: game.js defines these, so conditional stubs lose.
  G.genDetail = function () { const g = []; for (let y = 0; y < 9; y++) { g.push(new Array(9).fill('grass')); } return g; };
  G.tileAt = function () { return { type: 'wild' }; };
  G.data = G.data || {};
  try {
    G.data.alienPlayers = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/alienPlayers.json'), 'utf8'));
    G.data.items = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/items.json'), 'utf8'));
  } catch (e) { console.error('data load fail: ' + e.message); process.exit(2); }
  G.villagerId = 'player';
  // stubs the module may touch
  if (!G.displayName) G.displayName = function (id) { return 'Villager-' + id; };
  if (!G.vpOf) G.vpOf = function () { return {}; };
  if (!G.kcalCap) G.kcalCap = function () { return 2400; };
  if (!G.threatRating) G.threatRating = function () { return 80; };
  if (!G.canShow) G.canShow = function (kind, id) {
    if (kind === 'alien') { const ap = G.apState(); return !!(ap.known && ap.known[id]); }
    return true;
  };
  G.isSafeTile = function () { return false; }; // unconditional: game.js may define it
  G.unlockedWave = function () { return 2; }; // unconditional: real one needs waveKills
  if (!G.audioEvent) G.audioEvent = function () {};
}

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? ' :: ' + extra : '')); }
}

// ================= BREAK 1: armor salvage grants a BRICK =================
console.log('BREAK 1: apOnCombatEnd armor salvage — usable item vs bare brick');
freshState();
{
  const ap = G.apState();
  ap.met['vex_marlowe'] = { encounters: 2, bond: 0 }; // 3rd encounter -> reveal path too
  // force the drop: run many wins, count usable grants
  let bricks = 0, usable = 0;
  for (let i = 0; i < 40; i++) {
    G.state.scholar.inventory = [];
    G.state.scholar.equipped = {};
    // stub Math.random for the 0.6 drop gate: temporarily force hit every 2nd run
    G.apOnCombatEnd('vex_marlowe', 'won');
    const inv = G.state.scholar.inventory;
    for (const it of inv) {
      if (String(it.itemId || '').indexOf('alien_') === 0) {
        if (it.name && it.units) usable++; else bricks++;
      }
    }
  }
  console.log('  drops: usable=' + usable + ' bricks=' + bricks);
  check('salvaged alien armor is a usable inventory entry (name+units)', usable > 0 && bricks === 0,
    'usable=' + usable + ' bricks=' + bricks);
}

// ================= BREAK 2: group banter leaks "alien" pre-reveal =================
console.log('BREAK 2: apGroupBanter — alien-truth leak before reveal');
freshState();
{
  const ap = G.apState();
  ap.met['vex_marlowe'] = { encounters: 2, bond: 0 };
  ap.met['sarge'] = { encounters: 2, bond: 0 };
  // NOT revealed: ap.known empty
  said = [];
  G.apGroupBanter(['vex_marlowe', 'sarge']);
  const blob = said.join('\n');
  const leaksAlien = /alien player/i.test(blob);
  check('no "alien player(s)" truth named pre-reveal', !leaksAlien, blob.split('\n').filter(l => /alien/i.test(l)).join(' | '));
  // post-reveal it SHOULD be able to say it
  G.apRevealAlien('vex_marlowe', 'test');
  G.apRevealAlien('sarge', 'test');
  said = [];
  G.apGroupBanter(['vex_marlowe', 'sarge']);
  const blob2 = said.join('\n');
  check('post-reveal banter still lands', blob2.length > 50);
}

// ================= BREAK 3: gossip cooldown burned on empty roster =================
console.log('BREAK 3: apVillageGossip — cooldown burned when roster empty');
freshState();
{
  G.state.village.roster = [];
  const ap = G.apState();
  delete ap.lastGossipDay;
  // force the 0.4 chance gate to pass by stubbing random once
  const realR = Math.random;
  Math.random = () => 0.1;
  const r = G.apVillageGossip();
  Math.random = realR;
  check('returns false with no villagers', r === false);
  check('cooldown NOT burned on empty roster', ap.lastGossipDay === undefined, 'lastGossipDay=' + ap.lastGossipDay);
}

// ================= BREAK 4: contacted villager — dead picks & dead contact =================
console.log('BREAK 4: apContactedVillager — dead-villager contact');
freshState();
{
  // roster where v1 is dead
  G.vpOf = function (rid) { return rid === 'v1' ? { dead: true, name: 'Dead-one' } : { name: 'Live-' + rid }; };
  const realR = Math.random;
  let pickedDead = 0, picked = 0;
  for (let i = 0; i < 60; i++) {
    delete G.apState().contactedVid;
    Math.random = () => 0.1; // pass chance gates; roster pick index 0 -> v1 (dead)
    const vid = G.apContactedVillager();
    if (vid) { picked++; if (vid === 'v1') pickedDead++; }
  }
  Math.random = realR;
  console.log('  contacts established=' + picked + ' dead-picks=' + pickedDead);
  check('never establishes a dead villager as the contact', picked > 0 && pickedDead === 0,
    'dead picks=' + pickedDead + '/' + picked);
  // dead contact cleared: contact dies after establishment
  G.apState().contactedVid = 'v2';
  G.vpOf = function (rid) { return rid === 'v2' ? { dead: true } : {}; };
  Math.random = () => 0.1;
  const w = G.apContactWarning();
  Math.random = realR;
  check('warning from a dead contact is suppressed + contact cleared',
    w === false && !G.apState().contactedVid, 'warned=' + w + ' contactedVid=' + G.apState().contactedVid);
}

// ================= BREAK 5: beam bond bump — bumpBond never existed =================
console.log('BREAK 5: apBeamHit — bonded sentimental armor bond deepens');
freshState();
{
  // equip a bonded sentimental armor piece in torso.
  // NOTE: no shipped items.json entry is both sentimental+armor yet (content
  // gap, documented) — synthesize the def the code path expects.
  const sentDef = { id: 'test_bonded_vest', name: 'Test bonded vest', class: 'sentimental', armor: { protection: 5 } };
  G.data.items.push(sentDef);
  {
    const piece = { itemId: sentDef.id, id: 'k1', name: sentDef.name, units: 1, bond: 30 };
    G.state.scholar.equipped = { torso: piece };
    const before = piece.bond;
    // beam the player
    G.tbfight = { fighters: [], over: false };
    G.tbFighter = function (k) { return k === 'p' ? { key: 'p', name: 'You', hp: 100, alive: true } : null; };
    G.apBeamHit('player', 0, 'test beam', {});
    check('bond increased on the piece that caught the beam', piece.bond > before,
      'bond ' + before + ' -> ' + piece.bond);
  }
}

// ================= BREAK 6: stale alienEncounter on refused/fallback start =================
console.log('BREAK 6: apStartEncounter fallback — no phantom alienEncounter left behind');
freshState();
{
  const had = !!G.startAlienCombat;
  let phantom = 'n/a';
  if (had) {
    G.startAlienCombat = undefined; // simulate missing combat starter
    const ok = G.apStartEncounter('vex_marlowe');
    phantom = !!G.state.alienEncounter;
    check('fallback start leaves no stale state.alienEncounter', !phantom, 'stale=' + phantom + ' ok=' + ok);
  } else { console.log('  SKIP: no startAlienCombat'); }
}

// ================= WIRING: entry points reachable =================
console.log('WIRING: module entry points');
freshState();
{
  check('checkEncounter wrap calls apRollEncounter path (function exists)', typeof G.apRollEncounter === 'function');
  check('endDay wrap calls apDailyTick', typeof G.apDailyTick === 'function');
  // apDailyTick actually runs without throwing on a fresh eligible state
  let threw = false;
  try { G.apDailyTick(); } catch (e) { threw = true; }
  check('apDailyTick runs clean', !threw);
  check('apContestInterference wired (function exists)', typeof G.apContestInterference === 'function');
  // beam route: tbDamage wrap routes alien_beam through apBeamHit
  check('tbDamage wrap installed (function exists)', typeof G.tbDamage === 'function');
  // readiness gate honesty: comment vs behavior
  const rc = G.apReadinessCheck();
  check('apReadinessCheck returns shape {ready,score,reasons}', rc && typeof rc.ready === 'boolean' && Array.isArray(rc.reasons));
}

console.log('\nRESULT: ' + pass + ' pass, ' + fail + ' fail');
process.exit(fail ? 1 : 0);
