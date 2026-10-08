// Drama E1 proof: audio-visual sync (Steve 2026-10-07).
// Verifies Drama.audioFor maps every major drama kind to its CombatAudio mate,
// and that Game.drama fires the audio in sync with the visual — with no
// doubles for kinds whose call sites already fire audio, and with the day-7
// systemArrived gate covering audio too.
// Usage: node scripts/test-drama-audio-20261007.js [SEED]
//   DRAMA_PATH / GAME_PATH env overrides let the test run against
//   private-index content before commit.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const DRAMA_PATH = process.env.DRAMA_PATH || path.join(ROOT, 'src/js/drama.js');
const GAME_PATH = process.env.GAME_PATH || path.join(ROOT, 'src/js/game.js');

// --- seeded PRNG (PROOF-TEST RNG STABILITY lesson) ---
const SEED = parseInt(process.env.SEED || process.argv[2] || '20261007', 10);
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
Math.random = mulberry32(SEED);

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; }
  else { fail++; console.log('FAIL ' + name + (detail ? ' -- ' + detail : '')); }
}

// --- minimal DOM stub for Drama methods ---
function fakeEl() {
  return {
    style: { setProperty() {} }, innerHTML: '',
    classList: { add() {}, remove() {} },
    appendChild() {}, remove() {},
    querySelector: () => null,
    querySelectorAll: () => [],
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 40, height: 40 }),
    offsetWidth: 100,
  };
}
global.document = {
  createElement: () => fakeEl(),
  querySelector: () => null,
  querySelectorAll: () => [],
  getElementById: () => null,
  // ensureOverlay() checks document.contains — without it every visual throws
  // and drama()'s outer catch swallows it before the audio sync runs.
  contains: () => false,
  head: { appendChild() {} },
  body: fakeEl(),
};
global.getComputedStyle = () => ({ position: 'static' });
global.requestAnimationFrame = (fn) => setTimeout(fn, 0);
global.fetch = (f) => Promise.resolve({
  json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))),
});

// --- load production scripts in index.html order (subset) ---
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
eval(fs.readFileSync(GAME_PATH, 'utf8'));
eval(fs.readFileSync(DRAMA_PATH, 'utf8'));
const Game = globalThis.Scattering.Game;
const Drama = globalThis.Scattering.Drama;

console.log('== drama-audio E1 proof, seed ' + SEED + ' ==');

// ================= 1. Drama.audioFor unit tests =================
ok('audioFor defined', typeof Drama.audioFor === 'function');

// Direct mappings — the gaps this round closes
ok('hero -> victory', Drama.audioFor('hero') === 'victory');
ok('critHit -> impact', Drama.audioFor('critHit') === 'impact');
ok('playerDeath -> defeat', Drama.audioFor('playerDeath') === 'defeat');
ok('newLife -> victory', Drama.audioFor('newLife') === 'victory');
ok('levelUp -> levelup', Drama.audioFor('levelUp') === 'levelup');

// Social spec mappings
ok('social exile -> exileWalk', Drama.audioFor('social', { type: 'exile', name: 'Bob' }) === 'exileWalk');
ok('social vote -> justiceVerdict', Drama.audioFor('social', { type: 'vote', guilty: 3, total: 5 }) === 'justiceVerdict');
ok('social liar -> confront', Drama.audioFor('social', { type: 'liar', name: 'Ann' }) === 'confront');
ok('social betray -> horrorSting', Drama.audioFor('social', { type: 'betray', name: 'Ann' }) === 'horrorSting');
ok('social moot -> null (no fitting synth)', Drama.audioFor('social', { type: 'moot', caller: 'You' }) === null);
ok('social reconcile -> null', Drama.audioFor('social', { type: 'reconcile', name: 'Ann' }) === null);
ok('social empty spec -> null', Drama.audioFor('social', {}) === null);
ok('social no spec -> null', Drama.audioFor('social') === null);
ok('social null spec -> null', Drama.audioFor('social', null) === null);

// Contest spec mappings
ok('contest winner -> victory', Drama.audioFor('contest', { type: 'winner', name: 'Ann' }) === 'victory');
ok('contest loser -> defeat', Drama.audioFor('contest', { type: 'loser', name: 'Ann' }) === 'defeat');
ok('contest announce -> null (site fires contestCall)', Drama.audioFor('contest', { type: 'announce', name: 'X' }) === null);
ok('contest cheer -> null', Drama.audioFor('contest', { type: 'cheer' }) === null);
ok('contest judging -> null', Drama.audioFor('contest', { type: 'judging' }) === null);

// Already-synced at call site — must stay null (no doubles)
const alreadySynced = ['hit', 'wisp', 'enrage', 'npcAlert', 'exclaim',
  'abilityBurst', 'signature', 'secret', 'ambush', 'wild', 'weather', 'trail',
  'phaseShift', 'dodgeMiss', 'lootSparkle', 'playerHurt', 'plantIdentified',
  'techniqueLearned', 'codexLinked', 'skillGained', 'teaseFaint', 'ahaMoment',
  'synergyShimmer', 'villageBirth', 'villageDeath', 'integration', 'commentary',
  'flash', 'shake', 'text', 'heroCard', 'soulWisp', 'floatText', 'bogusKind'];
for (const k of alreadySynced) {
  ok('no double: ' + k + ' -> null', Drama.audioFor(k) === null);
}

// Never throws, even with garbage
let threw = false;
try {
  Drama.audioFor(undefined); Drama.audioFor(null); Drama.audioFor(42);
  Drama.audioFor('social', 'not-an-object'); Drama.audioFor('contest', 42);
} catch (e) { threw = true; }
ok('audioFor never throws on garbage', !threw);

// ================= 2. Game.drama integration =================
// Fake game context — no full init needed; drama() only needs state,
// systemIntegrationLevel, audioEvent, and the Drama visual layer.
const audioCalls = [];
const visualCalls = [];
const fakeGame = {
  state: { systemArrived: true, scholar: {} },
  systemIntegrationLevel() { return 2; },
  audioEvent(name, data) { audioCalls.push({ name, data }); },
};
const clearAudio = () => { audioCalls.length = 0; };
// Spy on the visual layer to prove visual+audio fire together
const origCrit = Drama.critHit, origLevel = Drama.abilityLevelUp, origHero = Drama.heroCard,
      origDeath = Drama.playerDeath, origLife = Drama.newLife;
Drama.critHit = function (...a) { visualCalls.push('critHit'); return origCrit.apply(this, a); };
Drama.abilityLevelUp = function (...a) { visualCalls.push('abilityLevelUp'); return origLevel.apply(this, a); };
Drama.heroCard = function (...a) { visualCalls.push('heroCard'); return origHero.apply(this, a); };
Drama.playerDeath = function (...a) { visualCalls.push('playerDeath'); return origDeath.apply(this, a); };
Drama.newLife = function (...a) { visualCalls.push('newLife'); return origLife.apply(this, a); };
const clearVisual = () => { visualCalls.length = 0; };

// critHit: visual + impact audio together
clearAudio(); clearVisual();
Game.drama.call(fakeGame, 'critHit', 4, 4, 25);
ok('critHit fires visual', visualCalls.includes('critHit'));
ok('critHit fires impact audio', audioCalls.some(c => c.name === 'impact'));
ok('critHit audio carries drama kind', audioCalls.some(c => c.name === 'impact' && c.data && c.data.drama === 'critHit'));

// levelUp: visual + levelup chime together
clearAudio(); clearVisual();
Game.drama.call(fakeGame, 'levelUp', 4, 4, 'Forager', 2);
ok('levelUp fires visual', visualCalls.includes('abilityLevelUp'));
ok('levelUp fires levelup audio', audioCalls.some(c => c.name === 'levelup'));

// playerDeath: visual + defeat sting together
clearAudio(); clearVisual();
Game.drama.call(fakeGame, 'playerDeath', 4, 4, 'Ned', 'the wild');
ok('playerDeath fires visual', visualCalls.includes('playerDeath'));
ok('playerDeath fires defeat audio', audioCalls.some(c => c.name === 'defeat'));

// newLife: visual + victory together
clearAudio(); clearVisual();
Game.drama.call(fakeGame, 'newLife', 'Mei');
ok('newLife fires visual', visualCalls.includes('newLife'));
ok('newLife fires victory audio', audioCalls.some(c => c.name === 'victory'));

// hero (synergy): visual + victory fanfare together
clearAudio(); clearVisual();
Game.drama.call(fakeGame, 'hero', 'Tidecaller', 'discovery text', '✨');
ok('hero fires visual', visualCalls.includes('heroCard'));
ok('hero fires victory fanfare', audioCalls.some(c => c.name === 'victory'));

// social exile: visual + exileWalk together
clearAudio();
Game.drama.call(fakeGame, 'social', { type: 'exile', name: 'Bob' });
ok('social exile fires exileWalk', audioCalls.some(c => c.name === 'exileWalk'));

// social vote: visual + justiceVerdict together
clearAudio();
Game.drama.call(fakeGame, 'social', { type: 'vote', guilty: 3, total: 5 });
ok('social vote fires justiceVerdict', audioCalls.some(c => c.name === 'justiceVerdict'));

// contest winner/loser
clearAudio();
Game.drama.call(fakeGame, 'contest', { type: 'winner', name: 'Ann' });
ok('contest winner fires victory', audioCalls.some(c => c.name === 'victory'));
clearAudio();
Game.drama.call(fakeGame, 'contest', { type: 'loser', name: 'Ann' });
ok('contest loser fires defeat', audioCalls.some(c => c.name === 'defeat'));

// No-double kinds: visual fires, audio stays silent
clearAudio();
Game.drama.call(fakeGame, 'hit', 4, 4, { color: '#ffd54a' });
ok('hit fires NO audio (tbDamage owns monsterHurt)', audioCalls.length === 0);
clearAudio();
Game.drama.call(fakeGame, 'wisp', 4, 4);
ok('wisp fires NO audio (death site owns monsterDown)', audioCalls.length === 0);
clearAudio();
Game.drama.call(fakeGame, 'enrage', 4, 4, 'enraged');
ok('enrage fires NO audio (encWoundCheck owns wound*)', audioCalls.length === 0);
clearAudio();
Game.drama.call(fakeGame, 'contest', { type: 'announce', name: 'X' });
ok('contest announce fires NO audio (site owns contestCall)', audioCalls.length === 0);

// Day-7 gate: pre-System, NEITHER visual NOR audio fires
fakeGame.state.systemArrived = false;
clearAudio(); clearVisual();
Game.drama.call(fakeGame, 'critHit', 4, 4, 25);
ok('pre-System: no visual', visualCalls.length === 0);
ok('pre-System: no audio', audioCalls.length === 0);
clearAudio();
Game.drama.call(fakeGame, 'hero', 'Tidecaller', 'x', '✨');
ok('pre-System: hero silent too', audioCalls.length === 0 && visualCalls.length === 0);
fakeGame.state.systemArrived = true;

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
