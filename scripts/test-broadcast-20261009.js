#!/usr/bin/env node
// PROOF: BROADCAST MODE — the television mechanism (Steve 2026-10-09).
// "What's the television mechanism? Ideally we actually show them it
// happening via cool visuals. Make sure this is fun and clear that this
// is another scene you are watching play out."
//
// Before: watching a show/contest = text phases in the contest modal +
// one-shot drama effects. No unified frame, no LIVE state, no commentators.
// After: broadcastStart/Beat/End state machine; entry title card + exit card
// (always explicit); LIVE bug + scanline/vignette grid treatment + ticker
// bar; two alien commentators with per-beat-type line pools; lower thirds;
// CUT TO transitions; crowd reactions; Death Reel replay treatment.
// Usage: node scripts/test-broadcast-20261009.js [SEED]   (run x3 seeds)
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const SEED = parseInt(process.env.SEED || process.argv[2] || '424242', 10);

// ---------- data preload ----------
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
  ['events.json', 'events'], ['statusEffects.json', 'statusEffects'], ['cooking.json', 'cooking'],
];
global.SCATTER_DATA = {};
for (const [f, key] of PAIRS) {
  try { global.SCATTER_DATA[key] = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data', f), 'utf8')); }
  catch (e) { /* some files may not exist; data key stays undefined */ }
}

// ---------- seeded RNG BEFORE eval (modules capture Math.random at load) ----------
function mulberry32(a) {
  return function() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
let _rng = mulberry32(SEED);
function rng() { return _rng(); }
rng.reset = (s) => { _rng = mulberry32(s); };
Math.random = rng;

// ---------- eval FULL script list in index.html order, minus DOM-only ----------
// DOM-only: app.js, sprites.js, tile-scenes.js, move-anim.js, drama.js
global.window = global; // equipment.js needs window at load; deleted after eval
const LIST = ['engine/state.js', 'engine/modifiers.js', 'engine/calories.js', 'engine/day.js',
  'engine/forage.js', 'engine/combat.js', 'game.js', 'encounters.js', 'conversation.js',
  'convo-mood.js', 'convoTopics.js', 'convo-wants.js', 'convo-dialogue.js', 'convo-beats.js',
  'convo-scene.js', 'examine.js', 'equipment.js', 'journal.js', 'party.js', 'party-formal.js',
  'truth.js', 'contests.js', 'broadcast.js', 'contestEngine.js', 'alienPlayers.js', 'storage.js', 'perceive.js',
  'carexplore.js', 'justice.js', 'food.js', 'betrayal.js', 'corpses.js', 'lifeseed.js',
  'progression.js', 'ledger.js', 'abilityActions.js', 'monsterBehaviors.js', 'statusEffects.js',
  'villager-agency.js', 'fieldFights.js', 'villager-objectives.js', 'codex-people.js',
  'membership.js', 'hierarchy.js', 'debug-scenarios.js', 'build.js'];
for (const f of LIST) {
  try { eval(fs.readFileSync(path.join(ROOT, 'src/js', f), 'utf8')); }
  catch (e) { console.error('EVAL FAIL ' + f + ': ' + e.message); process.exit(2); }
}
delete global.window; // sync combat path for the harness
const Game = globalThis.Scattering.Game;
Game.data = global.SCATTER_DATA;

// ---------- plumbing ----------
let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; /* console.log('  PASS ' + name); */ }
  else { fail++; console.log('  FAIL ' + name + (detail ? ' — ' + detail : '')); }
}
function sec(t) { console.log('\n### ' + t); }
function freshGame(day) {
  rng.reset(SEED);
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  s.day = day || 16;
  Game.state.systemArrived = true;
  s.health = 100; s.kcal = 2000; s.trauma = 0; s.exiled = false;
  s.inventory = s.inventory || [];
  Game.state.over = false;
  Game.state.activeContest = null;
  Game.state.broadcast = null;
  Game.state.pendingContest = null;
  Game.state.showBudget = { week: Math.floor(s.day / 7), used: 0 };
  Game.state.village.viewership = 50;
  Game.state.village._lastWeekViewership = 50;
}
function poolTexts(type) {
  return Game.BROADCAST_LINES[type].map(l => l[1]);
}
// fill() mirrors broadcast.js: {show}/{name} tokens are replaced at pick time
function filledPoolTexts(type, ctx) {
  return poolTexts(type).map(t => String(t)
    .split('{show}').join((ctx && ctx.showName) || 'the show')
    .split('{name}').join((ctx && ctx.name) || 'our guest'));
}
function inPool(line, type, ctx) {
  return filledPoolTexts(type, ctx).includes(line);
}

// ================= STATE MACHINE =================
sec('B1 — broadcastStart/End state machine');
{
  freshGame(16);
  ok('no broadcast initially', !Game.state.broadcast);
  const r1 = Game.broadcastStart('show', { showId: 'why_eat', showName: 'WHY DO THEY EAT?', participant: 'player' });
  ok('start returns true', r1 === true);
  ok('state live', !!(Game.state.broadcast && Game.state.broadcast.live));
  ok('kind recorded', Game.state.broadcast.kind === 'show');
  ok('showName recorded', Game.state.broadcast.showName === 'WHY DO THEY EAT?');
  const r2 = Game.broadcastStart('show', { showName: 'WHY DO THEY EAT?', participant: 'player' });
  ok('start idempotent (no double entry)', r2 === true && Game.state.broadcast.lineIdx >= 0);
  const e1 = Game.broadcastEnd();
  ok('end returns true', e1 === true);
  ok('state cleared', Game.state.broadcast === null);
  const e2 = Game.broadcastEnd();
  ok('end idempotent (false when not live)', e2 === false);
}

// ================= COMMENTARY TIED TO BEATS =================
sec('B2 — commentary follows the beat type, never generic-random');
{
  freshGame(16);
  ok('beat with no live broadcast returns null', Game.broadcastBeat('showDeclare', {}) === null);
  Game.broadcastStart('show', { showName: 'WHY DO THEY EAT?', participant: 'player' });
  const d = Game.broadcastBeat('showDeclare', {});
  ok('declare beat -> declare pool', !!d && inPool(d[1], 'declare', { showName: 'WHY DO THEY EAT?' }));
  ok('declare beat gets CUT TO', Game.state.broadcast.ticker[0].text.indexOf('🎬 CUT TO:') === 0);
  const t = Game.broadcastBeat('contestHideEscalate', {});
  ok('escalate beat -> tension pool', !!t && inPool(t[1], 'tension', { showName: 'WHY DO THEY EAT?' }));
  const w = Game.broadcastBeat('SHOW_WON', {});
  ok('won -> triumph pool', !!w && inPool(w[1], 'triumph', { showName: 'WHY DO THEY EAT?' }));
  const l = Game.broadcastBeat('SHOW_LOST', {});
  ok('lost -> embarrassment pool', !!l && inPool(l[1], 'embarrassment', { showName: 'WHY DO THEY EAT?' }));
  const dr = Game.broadcastBeat('judging', {});
  ok('judging -> deathreel pool', !!dr && inPool(dr[1], 'deathreel', { showName: 'WHY DO THEY EAT?' }));
  ok('ticker capped at 6', Game.state.broadcast.ticker.length <= 6);
  // deterministic rotation: same seed, same sequence
  const seq1 = [];
  Game.state.broadcast.lineIdx = 0;
  seq1.push(Game.broadcastBeat('showDeclare', {})[1]);
  seq1.push(Game.broadcastBeat('showDeclare', {})[1]);
  Game.state.broadcast.lineIdx = 0;
  const seq2 = [Game.broadcastBeat('showDeclare', {})[1], Game.broadcastBeat('showDeclare', {})[1]];
  ok('line pick deterministic (rotation, not dice)', seq1[0] === seq2[0] && seq1[1] === seq2[1]);
  // two voices present across pools
  const voices = new Set();
  Object.values(Game.BROADCAST_LINES).forEach(p => p.forEach(l => voices.add(l[0])));
  ok('two commentator voices', voices.has('🎙️ PLAY-BY-PLAY') && voices.has('🎨 COLOR'));
  // commentator names are NOT coined (Steve's coinage) — role titles only
  const allText = JSON.stringify(Game.BROADCAST_LINES);
  ok('no coined alien names in pools', !/Zorp|Glib|Quax|alien name/i.test(allText));
  Game.broadcastEnd();
}

// ================= TICKER HTML =================
sec('B3 — ticker HTML: structure + escaping');
{
  freshGame(16);
  ok('no ticker when not live', Game.broadcastTickerHTML() === '');
  Game.broadcastStart('show', { showName: 'WHY DO THEY EAT?', participant: 'player' });
  Game.broadcastBeat('showDeclare', {});
  const html = Game.broadcastTickerHTML();
  ok('ticker bar markup', /broadcast-ticker/.test(html) && /ticker-inner/.test(html));
  ok('ticker carries voice + crowd', /PLAY-BY-PLAY|COLOR/.test(html) && /ticker-crowd/.test(html));
  // escaping: hostile show name must not break markup
  Game.state.broadcast.ticker.push({ voice: '🎙️ PLAY-BY-PLAY', text: '<script>alert(1)</script>', type: 'generic', crowd: '👀' });
  const html2 = Game.broadcastTickerHTML();
  ok('ticker text escaped', !/<script>alert/.test(html2) && /&lt;script&gt;/.test(html2));
  Game.broadcastEnd();
}

// ================= LOWER THIRD / REPLAY / CROWD / WATCHING =================
sec('B4 — lower thirds, replay, crowd, watching()');
{
  freshGame(16);
  ok('replay when not live -> false', Game.broadcastReplay() === false);
  Game.broadcastStart('contest-watch', { showName: 'The Pit', participant: 'villager_x' });
  ok('replay when live -> true', Game.broadcastReplay() === true);
  ok('replay adds a deathreel ticker line', Game.state.broadcast.ticker.some(t => t.type === 'deathreel'));
  ok('lowerThird returns true (drama guarded in node)', Game.broadcastLowerThird('Mara', 'Villager, Doomed') === true);
  const title = Game.broadcastGuestTitle();
  ok('guest title playful, non-empty', typeof title === 'string' && title.length > 3);
  ok('crowd moods differ', Game.broadcastCrowd('triumph') !== Game.broadcastCrowd('embarrassment'));
  ok('watching(): villager participant', Game.broadcastWatching({ participant: 'some_vid' }) === true);
  ok('watching(): player participant false', Game.broadcastWatching({ participant: 'player' }) === false);
  Game.broadcastEnd();
}

// ================= END-TO-END: fireShow =================
sec('B5 — fireShow drives the full frame: entry -> beats -> exit');
{
  freshGame(16);
  const show = Game.showPool().find(s => s.id === 'why_eat');
  Game.fireShow(show);
  const ac = Game.state.activeContest;
  ok('show fired', !!ac);
  ok('broadcast live during show', !!(Game.state.broadcast && Game.state.broadcast.live));
  ok('broadcast kind is show', Game.state.broadcast.kind === 'show');
  ok('declare commentary fired on phase 0', Game.state.broadcast.ticker.length >= 1);
  // drive to the end through real choices
  let guard = 0;
  while (Game.state.activeContest && guard++ < 8) { Game.contestChoose(0); }
  ok('show resolved', !Game.state.activeContest);
  ok('broadcast lifted after show (explicit exit)', !Game.state.broadcast);
}

// ================= WATCH VERBS LABELED =================
sec('B6 — watching is labeled; watch verbs only');
{
  freshGame(16);
  const show = Game.showPool().find(s => s.id === 'why_eat');
  const roster = (Game.state.village.roster || []).filter(id => id !== Game.villagerId && Game.isMember(id));
  const phases = Game.showWatchPhases(show, roster[0]);
  const labels = phases[0].choices.map(c => c.label.toLowerCase()).join('|');
  ok('watch choices are watch verbs', /cheer/.test(labels) && /heckle/.test(labels));
  ok('no play verbs in watch beat', !/cook|answer|stunt|fight/i.test(labels));
  ok('broadcastWatching true for villager pull', Game.broadcastWatching({ participant: roster[0] }) === true);
}

// ================= TV NEVER KILLS =================
sec('B7 — TV never kills: show damage clamps at 1 HP');
{
  freshGame(16);
  const show = Game.showPool().find(s => s.id === 'mouth_race'); // has dmg [0,4] choice
  // notability-first casting: make the scholar the star, suppress the whim
  Game.addNotability('player', 'contestWin');
  Game.addNotability('player', 'wave2Kill');
  Game.addNotability('player', 'survivedMoot');
  const _r = Math.random; Math.random = () => 0.5;
  try { Game.fireShow(show); } finally { Math.random = _r; }
  const ac = Game.state.activeContest;
  ok('star scholar pulled (notability-first, whim suppressed)', !!ac && ac.participant === 'player');
  if (ac && ac.participant === 'player') {
    Game.state.scholar.health = 2;
    Game.contestChoose(0); // 'Speed, no fear' — dmg [0,4]
    ok('show damage leaves >= 1 HP', (Game.state.scholar.health || 0) >= 1);
  }
  // clean up: end the show if still running
  let guard = 0;
  while (Game.state.activeContest && guard++ < 8) { Game.contestChoose(0); }
  ok('broadcast lifted', !Game.state.broadcast);
}

// ================= NO LEAK INTO NORMAL PLAY =================
sec('B8 — frame never leaks: normal (non-TV) flows stay clean');
{
  freshGame(16);
  ok('broadcastBeat inert when not live', Game.broadcastBeat('contestPitDeclare', {}) === null);
  ok('ticker empty when not live', Game.broadcastTickerHTML() === '');
  ok('end inert when not live', Game.broadcastEnd() === false);
}

console.log(`\n==== BROADCAST: ${pass} passed, ${fail} failed (seed ${SEED}) ====`);
process.exit(fail ? 1 : 0);
