// Care & Explore DEEPENING proof tests (Steve 2026-10-07).
// Asserts the new mechanics: 6 new comfort approaches with real tradeoffs,
// food amounts + source carrying social meaning (incl. commons theft),
// knowledge-gated feature depth, and the 3 explore beats (linger / follow / mark).
// Deterministic: Math.random is seeded (mulberry32).
// Usage: node scripts/test-carexplore-20261007.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js'
].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}

let said = [];
const _say = Game.say;
Game.say = function (t) { said.push(String(t)); return _say.call(this, t); };

function freshGame(seed) {
  Math.random = mulberry32(seed || 1234);
  said = [];
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  Game.state.scholar.mx = 4; Game.state.scholar.my = 4;
  Game.state.scholar.inventory = [];
  Game.state.scholar.monster = null;
  Game.state.scholar.animal = null;
  Game.state.scholar.energy = 100;
  Game.state.village.grief = 0;
  Game.state.village.commons = undefined;
  Game.generatedRoster[0].intelligence = { primary: 'steady', secondary: 'practical' };
}

function giveFoodItem(units, kcalEach, name) {
  Game.state.scholar.inventory.push({ itemId: 'testfood' + kcalEach, name: name || 'Test Berries', units, kcalEach: kcalEach || 50, kg: 0.1 });
}

function getVillager() {
  const v = Game.state.village;
  const rid = (v.roster || []).find(id => id !== Game.villagerId);
  v.positions = v.positions || {};
  v.positions[rid] = { mx: 5, my: 4 }; // adjacent
  return rid;
}

function getSecondVillager(except) {
  const v = Game.state.village;
  const rid = (v.roster || []).find(id => id !== Game.villagerId && id !== except);
  v.positions = v.positions || {};
  v.positions[rid] = { mx: 4, my: 5 }; // adjacent
  return rid;
}

function privatePositions(vid) {
  Game.state.village.positions = {};
  Game.state.village.positions[vid] = { mx: 5, my: 4 };
}

function setCell(kind, cx, cy, mod) {
  const d = Game.genDetail(Game.map.px, Game.map.py);
  d[cy][cx] = kind;
  if (mod) {
    const t = Game.playerTile();
    t.modifiers = t.modifiers || {};
    t.modifiers[cx + ',' + cy] = Object.assign(t.modifiers[cx + ',' + cy] || {}, mod);
  }
  return d;
}

function memHas(vid, type) {
  return ((Game.state.village.memory || {})[vid] || []).some(m => m.t === type);
}

function scare(vid, fear) {
  Game.state.village.grief = 0;
  Game.npcNeeds(vid).fear = fear === undefined ? 80 : fear;
  Game.npcNeeds(vid).hunger = 0;
  return Game.npcMood(vid);
}

(async () => {
await Game.init();

// ================= COMFORT: new approaches =================
freshGame(11);
let vid = getVillager();
ok('setup: scared mood', scare(vid) === 'scared');

// silent still works, 1 tick
let r = Game.comfort(vid, 'silent');
ok('silent returns ok', r && r.ok);
ok('silent costs 1 tick', r.ticks === 1);
ok('silent fearDelta -20', r.fearDelta === -20 && r.trustDelta === 4);
ok('silent reduces fear to 60', Game.npcNeeds(vid).fear === 60);

// guard: 2 ticks, 12 energy, big fear drop for the scared
freshGame(12);
vid = getVillager();
scare(vid);
Game.state.village.trust[vid] = 10;
r = Game.comfort(vid, 'guard');
ok('guard returns ok', r && r.ok);
ok('guard costs 2 ticks', r.ticks === 2);
ok('guard costs 12 energy', Game.state.scholar.energy === 88);
ok('guard fearDelta -40 for scared', r.fearDelta === -40 && Game.npcNeeds(vid).fear === 40);
ok('guard trustDelta 10', r.trustDelta === 10);
ok('guard remembers stood_watch', memHas(vid, 'stood_watch'));

// guard while exhausted: honest refusal, no time spent
freshGame(13);
vid = getVillager();
scare(vid);
Game.state.scholar.energy = 5;
const ticksBefore = Game.state.scholar.dayTicks || 0;
r = Game.comfort(vid, 'guard');
ok('exhausted guard returns null', r === null);
ok('exhausted guard spends no ticks', (Game.state.scholar.dayTicks || 0) === ticksBefore);
ok('exhausted guard says so honestly', said.join(' ').includes('running on fumes'));

// tough without trust: honest backfire
freshGame(14);
vid = getVillager();
scare(vid);
Game.state.village.trust[vid] = 10;
r = Game.comfort(vid, 'tough');
ok('tough (low trust) returns ok', r && r.ok);
ok('tough (low trust) backfires: fear up', r.fearDelta === 12);
ok('tough (low trust) backfires: trust down', r.trustDelta === -8);
ok('tough (low trust) remembers harsh_words', memHas(vid, 'harsh_words'));

// tough with trust: snaps them out of it
freshGame(15);
vid = getVillager();
scare(vid);
Game.state.village.trust[vid] = 60;
r = Game.comfort(vid, 'tough');
ok('tough (high trust) fearDelta -45', r.fearDelta === -45);
ok('tough (high trust) fear drops', Game.npcNeeds(vid).fear === 35);

// distract on grief: callous, remembered
freshGame(16);
vid = getVillager();
Game.state.village.grief = 1;
ok('setup: grieving mood', Game.npcMood(vid) === 'grieving');
r = Game.comfort(vid, 'distract');
ok('distract on grief backfires', r.trustDelta === -3 && r.fearDelta === 5);
ok('distract on grief remembers tone_deaf', memHas(vid, 'tone_deaf'));

// distract: personality match lands, mismatch falls flat
function setTemper(vid, t) {
  const rec = (Game.data.villagers || []).find(x => x.id === vid);
  rec.personality = rec.personality || {};
  rec.personality.temperament = t;
}
freshGame(17);
vid = getVillager();
scare(vid);
setTemper(vid, 'warm');
r = Game.comfort(vid, 'distract');
ok('distract (matched temper) lands well', r && r.fearDelta === -25 && r.trustDelta === 5);

freshGame(171);
vid = getVillager();
scare(vid);
setTemper(vid, 'withdrawn');
r = Game.comfort(vid, 'distract');
ok('distract (mismatched temper) falls flat', r && r.fearDelta === -10 && r.trustDelta === 1);

// ritual on grief: the real medicine, 2 ticks
freshGame(18);
vid = getVillager();
Game.state.village.grief = 1;
r = Game.comfort(vid, 'ritual');
ok('ritual on grief: trustDelta 12', r.trustDelta === 12);
ok('ritual costs 2 ticks', r.ticks === 2);
ok('ritual remembers shared_ritual', memHas(vid, 'shared_ritual'));

// listen without trust: prying teaches them to lock the door
freshGame(19);
vid = getVillager();
scare(vid);
Game.state.village.trust[vid] = 10;
r = Game.comfort(vid, 'listen');
ok('listen (low trust) shuts down', r.trustDelta === -2 && r.fearDelta === 6);
ok('listen costs 2 ticks', r.ticks === 2);

// listen with trust: opens up
freshGame(20);
vid = getVillager();
scare(vid);
Game.state.village.trust[vid] = 30;
r = Game.comfort(vid, 'listen');
ok('listen (trust) opens up', r.trustDelta === 10 && r.fearDelta === -30);
ok('listen remembers told_you', memHas(vid, 'told_you'));

// warmth: costs real food
freshGame(21);
vid = getVillager();
scare(vid);
giveFoodItem(3, 50);
Game.npcNeeds(vid).hunger = 50;
r = Game.comfort(vid, 'warmth');
ok('warmth returns ok', r && r.ok);
ok('warmth consumes 1 food unit', Game.state.scholar.inventory.reduce((s, i) => s + i.units, 0) === 2);
ok('warmth reduces hunger too', Game.npcNeeds(vid).hunger === 30);
ok('warmth fearDelta -15', r.fearDelta === -15);
ok('warmth remembers warm_food', memHas(vid, 'warm_food'));

// warmth with empty pack: honest, null
freshGame(22);
vid = getVillager();
scare(vid);
r = Game.comfort(vid, 'warmth');
ok('warmth with no food returns null', r === null);
ok('warmth with no food is honest', said.join(' ').includes('pack is empty'));

// unknown approach: honest, not silent
freshGame(23);
vid = getVillager();
scare(vid);
r = Game.comfort(vid, 'hug-aggressively');
ok('unknown approach returns null honestly', r === null);

// comfort options: 11, all name their cost
freshGame(24);
vid = getVillager();
scare(vid);
const copts = Game.comfortOptions(vid);
ok('comfortOptions has 11 approaches', copts.length === 11, 'got ' + copts.length);
ok('comfortOptions guard names cost', copts.find(o => o.id === 'guard').label.includes('2 ticks'));
ok('comfortOptions all name a cost', copts.every(o => /tick|food/i.test(o.label + ' ' + o.desc)));
ok('tough warns when trust is low', copts.find(o => o.id === 'tough').desc.includes('backfire'));

// harshness witnessed: onlookers remember
freshGame(25);
vid = getVillager();
const wit = getSecondVillager(vid);
scare(vid);
Game.state.village.trust[vid] = 10;
Game.comfort(vid, 'tough');
ok('witness remembers harsh comfort', memHas(wit, 'saw_harsh_comfort'));

// ================= GIVE FOOD: social meaning =================
function runScraps(seed) {
  freshGame(seed);
  const v = getVillager();
  privatePositions(v);
  giveFoodItem(5, 20, 'Mushy Bits');
  giveFoodItem(5, 90, 'Fine Venison');
  Game.npcNeeds(v).hunger = 40;
  Game.state.village.trust[v] = 10;
  const before = Game.state.village.trust[v];
  const rr = Game.giveFood(v, 'scraps');
  const mem = memHas(v, 'given_scraps');
  return { v, r: rr, mem, gain: (Game.state.village.trust[v] || 10) - before, said: said.slice() };
}
// deterministic seed search: first seed where scraps insults
let insultRun = null, insultSeed = null;
for (let s = 1; s <= 300 && !insultRun; s++) {
  const run = runScraps(s);
  if (run.mem) { insultRun = run; insultSeed = s; }
}
ok('scraps CAN insult (deterministic seed found)', !!insultRun, 'seed=' + insultSeed);
if (insultRun) {
  ok('scraps insult: trust barely moves', insultRun.gain <= 3, 'gain=' + insultRun.gain);
  ok('scraps takes the dregs', insultRun.said.join(' ').includes('Mushy Bits'));
  ok('scraps insult says the dregs line', insultRun.said.join(' ').includes('the dregs'));
}

// best: your finest, deepest gratitude — beats meal
freshGame(31);
vid = getVillager();
privatePositions(vid);
giveFoodItem(5, 20, 'Mushy Bits');
giveFoodItem(5, 90, 'Fine Venison');
Game.npcNeeds(vid).hunger = 40;
Game.state.village.trust[vid] = 10;
r = Game.giveFood(vid, 'best');
const bestGain = (Game.state.village.trust[vid] || 10) - 10;
ok('best returns ok', r && r.ok);
ok('best remembers gave_the_best', memHas(vid, 'gave_the_best'));
ok('best gives the finest stack', r.units === 1);

freshGame(32);
vid = getVillager();
privatePositions(vid);
giveFoodItem(5, 20, 'Mushy Bits');
giveFoodItem(5, 90, 'Fine Venison');
Game.npcNeeds(vid).hunger = 40;
Game.state.village.trust[vid] = 10;
r = Game.giveFood(vid, 'meal');
const mealGain = (Game.state.village.trust[vid] || 10) - 10;
ok('best gratitude beats meal', bestGain > mealGain, `best=${bestGain} meal=${mealGain}`);

// public gift: the unfed hungry resent being passed over
freshGame(33);
vid = getVillager();
const other = getSecondVillager(vid);
giveFoodItem(10, 50);
Game.npcNeeds(vid).hunger = 40;
Game.npcNeeds(other).hunger = 75;
Game.state.village.trust[vid] = 10;
Game.state.village.trust[other] = 10;
r = Game.giveFood(vid, 'meal');
ok('public gift returns ok', r && r.ok && r.public === true);
ok('passed-over hungry villager remembers', memHas(other, 'passed_over'));
ok('passed-over villager loses a little trust', (Game.state.village.trust[other] || 10) < 10);
ok('resentment is spoken, not silent', said.join(' ').includes('Hunger is quiet'));

// THEFT: skim the commons — public = punished
freshGame(34);
vid = getVillager();
const wit2 = getSecondVillager(vid);
Game.npcNeeds(vid).hunger = 40;
Game.state.village.trust[vid] = 10;
Game.state.village.trust[wit2] = 10;
r = Game.giveFood(vid, 'meal', { source: 'store' });
ok('store theft returns ok', r && r.ok);
ok('store theft flagged stolen', r.stolen === true);
ok('store theft drains the commons', (Game.state.village.commons.units || 0) === 9);
ok('public theft punishes witness trust', (Game.state.village.trust[wit2] === undefined ? 10 : Game.state.village.trust[wit2]) < 10);
ok('witness remembers saw_you_steal', memHas(wit2, 'saw_you_steal'));
ok('recipient is complicit', memHas(vid, 'complicit_in_theft'));
ok('public theft is spoken plainly', said.join(' ').includes('Food STOLEN is a statement'));

// THEFT: private = the recipient knows what you are
freshGame(35);
vid = getVillager();
privatePositions(vid);
Game.npcNeeds(vid).hunger = 40;
Game.state.village.trust[vid] = 10;
r = Game.giveFood(vid, 'meal', { source: 'store' });
ok('private theft returns ok', r && r.ok && r.stolen === true);
ok('private theft: recipient knows you steal', memHas(vid, 'knows_you_steal'));
ok('private theft drains the commons', (Game.state.village.commons.units || 0) === 9);

// theft from an empty pot: honest refusal
freshGame(36);
vid = getVillager();
privatePositions(vid);
Game.state.village.commons = { units: 0 };
r = Game.giveFood(vid, 'meal', { source: 'store' });
ok('empty commons: theft refused honestly', r === null);
ok('empty commons says so', said.join(' ').includes('scraped clean'));

// options surface
freshGame(37);
giveFoodItem(2, 50);
const gopts = Game.giveFoodOptions();
ok('giveFoodOptions has scraps', gopts.some(o => o.id === 'scraps'));
ok('giveFoodOptions has best', gopts.some(o => o.id === 'best'));
ok('giveFoodOptions has 5 amounts', gopts.length === 5);
const sopts = Game.giveFoodSourceOptions();
ok('giveFoodSourceOptions has pack+store', sopts.some(o => o.id === 'pack') && sopts.some(o => o.id === 'store'));
ok('store option is honest about punishment', sopts.find(o => o.id === 'store').desc.includes('-15 trust'));

// ================= EXAMINE: knowledge-gated depth =================
function findTracksCell() {
  for (let cy = 3; cy <= 5; cy++) for (let cx = 3; cx <= 5; cx++) {
    if (cx === 4 && cy === 4) continue;
    setCell('dirt', cx, cy);
    if (Game.tileFeature(Game.map.px, Game.map.py, cx, cy, 'dirt') === 'tracks') return [cx, cy];
  }
  return null;
}

// L0: ignorant scholar gets honest hints, not the read
freshGame(41);
let tc = findTracksCell();
ok('found a tracks cell for testing', !!tc);
Game.state.codex.skills = {};
Game.examineCell(tc[0], tc[1]);
let txt = said.join(' ');
ok('L0 tracks: honest about limits', txt.includes("honestly say"));
ok('L0 tracks: no leaked read', !txt.includes('heading north') && !txt.includes("Rabbits don't leave those") && !txt.includes('drag mark'));

// L1: the knowledgeable scholar sees what it IS
freshGame(42);
tc = findTracksCell();
Game.state.codex.skills = { track_read: { level: 1 } };
Game.examineCell(tc[0], tc[1]);
txt = said.join(' ');
ok('L1 tracks: the read is shown', txt.includes('The ground here has a story'));
ok('L1 tracks: no inference yet', !txt.includes('commuting'));

// L2: inference — what it MEANS
freshGame(43);
tc = findTracksCell();
Game.state.codex.skills = { track_read: { level: 2 } };
Game.examineCell(tc[0], tc[1]);
txt = said.join(' ');
ok('L2 tracks: inference shown', txt.includes('commuting'));

// studying teaches: examining feeds encounters toward the skill
freshGame(44);
tc = findTracksCell();
Game.state.codex.skills = {};
Game.state.codex.encounters = {};
Game.examineCell(tc[0], tc[1]);
Game.examineCell(tc[0], tc[1]);
const enc = (Game.state.codex.encounters || {}).track_read || 0;
ok('examining feeds track_read encounters', enc >= 2, 'enc=' + enc);

// ================= EXPLORE BEATS =================
// linger: surfaces a missed feature, 2 ticks
freshGame(51);
let featCell = null;
for (let cy = 3; cy <= 5 && !featCell; cy++) for (let cx = 3; cx <= 5 && !featCell; cx++) {
  if (cx === 4 && cy === 4) continue;
  setCell('dirt', cx, cy);
  const f = Game.tileFeature(Game.map.px, Game.map.py, cx, cy, 'dirt');
  if (f) featCell = [cx, cy, f];
}
ok('found a feature cell', !!featCell);
const tb0 = Game.state.scholar.dayTicks || 0;
r = Game.lingerCell(featCell[0], featCell[1]);
ok('linger returns ok', r && r.ok);
ok('linger finds the missed feature', r.found === true && r.feature === featCell[2]);
ok('linger marks feature known', (Game.state.codex.examined[`${Game.map.px},${Game.map.py},${featCell[0]},${featCell[1]}:feat`] || 0) >= 1);
ok('linger costs 2 ticks', (Game.state.scholar.dayTicks || 0) === tb0 + 2);
// linger again: honest "nothing beyond what you found"
said = [];
r = Game.lingerCell(featCell[0], featCell[1]);
ok('linger twice: nothing new, honestly', r.found === false && said.join(' ').includes('Nothing here beyond'));

// linger on a featureless cell: honest
freshGame(52);
let bareCell = null;
for (let cy = 3; cy <= 5 && !bareCell; cy++) for (let cx = 3; cx <= 5 && !bareCell; cx++) {
  if (cx === 4 && cy === 4) continue;
  setCell('dirt', cx, cy);
  if (!Game.tileFeature(Game.map.px, Game.map.py, cx, cy, 'dirt')) bareCell = [cx, cy];
}
if (bareCell) {
  said = [];
  r = Game.lingerCell(bareCell[0], bareCell[1]);
  ok('linger on bare cell: honest', r.found === false && said.join(' ').toLowerCase().includes('nothing here but what you already saw'));
} else {
  ok('linger on bare cell: skipped (no bare cell found)', true);
}

// followTracks: needs found, readable tracks
freshGame(53);
tc = findTracksCell();
r = Game.followTracks(tc[0], tc[1]);
ok('followTracks without known tracks: honest null', r === null);
ok('followTracks refusal is honest', said.join(' ').includes('No trail here'));

// examine first (reveals the feature), then follow
Game.state.codex.skills = { track_read: { level: 1 } };
Game.examineCell(tc[0], tc[1]);
const e0 = Game.state.scholar.energy;
const t0 = Game.state.scholar.dayTicks || 0;
r = Game.followTracks(tc[0], tc[1]);
ok('followTracks returns ok', r && r.ok);
ok('followTracks names a direction', ['north', 'east', 'south', 'west'].includes(r.direction));
ok('followTracks outcome is honest', ['cold', 'find', 'sign'].includes(r.outcome));
ok('followTracks costs 5 energy', Game.state.scholar.energy === e0 - 5);
ok('followTracks costs 2 ticks', (Game.state.scholar.dayTicks || 0) === t0 + 2);
ok('followTracks moves the scholar', Game.state.scholar.mx !== 4 || Game.state.scholar.my !== 4);

// followTracks exhausted: honest refusal
freshGame(54);
tc = findTracksCell();
Game.state.codex.skills = { track_read: { level: 1 } };
Game.examineCell(tc[0], tc[1]);
Game.state.scholar.energy = 3;
r = Game.followTracks(tc[0], tc[1]);
ok('exhausted followTracks: honest null', r === null);

// markForLater: 1 tick, readable back
freshGame(55);
setCell('tree', 5, 4, { species: 'oak', health: 'healthy' });
const mt0 = Game.state.scholar.dayTicks || 0;
r = Game.markForLater(5, 4, 'big oak?');
ok('markForLater returns ok', r && r.ok);
ok('markForLater key format', r.key === `${Game.map.px},${Game.map.py},5,4`);
ok('markForLater costs 1 tick', (Game.state.scholar.dayTicks || 0) === mt0 + 1);
const marks = Game.fieldMarksList();
ok('fieldMarksList reads it back', marks[r.key] && marks[r.key].note === 'big oak?' && marks[r.key].cell === 'tree');
// long notes are trimmed, honestly kept
r = Game.markForLater(5, 4, 'x'.repeat(200));
ok('long notes trimmed to 60', Game.fieldMarksList()[r.key].note.length === 60);
// too far: honest null
r = Game.markForLater(0, 0);
ok('markForLater too far: null', r === null);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
})();
