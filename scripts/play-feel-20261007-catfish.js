#!/usr/bin/env node
// NIGHTLIGHT CATFISH PLAYED PASS (Steve 2026-10-07) — played AS A PLAYER.
// The lure: lure → still → grasp → dark → lure. It never chases — it waits
// for curiosity. Two passes:
//   PASS 1 (BLIND): curious, unarmed. Walks right up to the pretty glow.
//     Learns by getting bitten. "If you don't know, it doesn't show."
//   PASS 2 (KNOWING): codex taught. Sling at range 3–4, kite the creep,
//     strike the light. The counter from the knownCue, executed.
// Read-only on engine: EVERYTHING (engine + data) loads from HEAD via
// `git show HEAD:<path>` — immune to worktree churn. Never touches the
// shared index; commits via the private-index route only.
// Deterministic: mulberry32 PRNG, fixed default seed, SEED env override.
// Run: node scripts/play-feel-20261007-catfish.js [SEED=...]
// Exit non-zero on any assertion failure.
const { execSync } = require('child_process');
const path = require('path');
const ROOT = path.join(__dirname, '..');

const SEED = parseInt(process.env.SEED || '20261007', 10);
let _s = SEED >>> 0;
Math.random = function () {
  _s |= 0; _s = (_s + 0x6D2B79F5) | 0;
  let t = Math.imul(_s ^ (_s >>> 15), 1 | _s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const show = (p) => execSync(`git -C ${ROOT} show HEAD:${p}`, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

// ---- data from HEAD ----
const DATA_FILES = ['plants.json', 'biomes.json', 'monsters.json', 'villagers.json',
  'abilities.json', 'items.json', 'background_survivors.json', 'cell_defs.json',
  'animals.json', 'recipes.json', 'books.json', 'relicEnhancements.json', 'locations.json',
  'characterGen.json', 'synergies.json', 'knowledge.json', 'nameCultures.json',
  'originPicker.json', 'foreignSpeech.json', 'lifeseeds.json'];
global.SCATTER_DATA = {};
for (const f of DATA_FILES) global.SCATTER_DATA[f.replace('.json', '')] = JSON.parse(show('src/data/' + f));

// ---- engine in index.html order, minus DOM-only (app.js, sprites.js, tile-scenes.js, move-anim.js) ----
const SCRIPTS = ['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
  'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
  'src/js/game.js', 'src/js/encounters.js', 'src/js/conversation.js', 'src/js/convo-mood.js',
  'src/js/convoTopics.js', 'src/js/convo-wants.js', 'src/js/convo-dialogue.js', 'src/js/convo-beats.js',
  'src/js/examine.js', 'src/js/equipment.js', 'src/js/journal.js', 'src/js/party.js',
  'src/js/party-formal.js', 'src/js/truth.js', 'src/js/contests.js', 'src/js/storage.js',
  'src/js/perceive.js', 'src/js/carexplore.js', 'src/js/justice.js', 'src/js/food.js',
  'src/js/betrayal.js', 'src/js/corpses.js', 'src/js/lifeseed.js', 'src/js/progression.js',
  'src/js/ledger.js', 'src/js/villager-agency.js', 'src/js/codex-people.js', 'src/js/membership.js',
  'src/js/hierarchy.js', 'src/js/debug-scenarios.js', 'src/js/build.js', 'src/js/drama.js'];
global.window = global; // equipment.js needs window at load (AGENTS.md)
// drama.js injects CSS at load — minimal document stub (drama no-ops in
// node anyway: Game.drama() returns before the System arrives)
const stubEl = () => ({ style: {}, className: '', appendChild() {}, remove() {}, addEventListener() {}, setAttribute() {}, textContent: '', innerHTML: '' });
global.document = {
  getElementById: () => null, createElement: stubEl,
  querySelector: () => null, querySelectorAll: () => [],
  contains: () => false, body: stubEl(), head: stubEl(),
};
for (const f of SCRIPTS) eval(show(f));
delete global.window; // else combat goes async and the harness stalls (AGENTS.md)

const Game = globalThis.Scattering.Game;
// init() with SCATTER_DATA set only assigns this.data — do it directly
// (init is async; this is its entire SCATTER_DATA branch).
Game.data = global.SCATTER_DATA;
const fails = [];
function check(name, cond, detail) {
  if (cond) { console.log(`  ✓ ${name}`); }
  else { fails.push(name); console.log(`  ✗ FAIL: ${name}${detail ? ' — ' + detail : ''}`); }
}

const audioLog = [];
const _ae = Game.audioEvent.bind(Game);
Game.audioEvent = (n, d) => { audioLog.push(n); try { return _ae(n, d); } catch (e) { return undefined; } };

const cheb = (a, b) => Math.max(Math.abs(a.mx - b.mx), Math.abs(a.my - b.my));
const P = () => Game.tbFighter('p');
const MON = () => (Game.tbfight ? Game.tbfight.fighters : []).find(x => x.kind === 'monster' && x.alive);
const KNOWN_CUE = 'The glow is a mouth';

function newRun(opts) {
  try { if (Game.tbfight) Game.tbEnd('fled'); } catch (e) {}
  // creek pool, interior tiles only: the catfish lives IN water
  Game.genDetail = () => {
    const g = Array.from({ length: 9 }, () => Array(9).fill('grass'));
    [[3, 2], [4, 2], [3, 3], [4, 3]].forEach(([x, y]) => { g[y][x] = 'water'; });
    return g;
  };
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  Game.dayPart = 3; // night — the catfish's time
  Game.canSee = () => true;
  Game.audio = {};
  Game.state.village.positions = {}; // no villager walk-ons; this pass is 1v1
  const s = Game.state.scholar;
  s.health = 500; s.kcal = 2000;
  s.abilities = []; s.backgroundAbilities = [];
  s.mx = 4; s.my = 6;
  s.monster = { mx: 3, my: 2, id: 'nightlight_catfish' }; // spawn ON the water
  if (opts && opts.weapon) s.equipped = { weapon: opts.weapon };
  if (opts && opts.stones) s.inventory.push({ material: 'stone', units: opts.stones, name: 'stone' });
  if (opts && opts.teach) {
    const e = Game.ensureMonsterEntry('nightlight_catfish');
    e.stage = 'observed';
    e.patterns = e.patterns || {};
    e.patterns['Lure and Grasp'] = 'direct attack, range 3';
  }
  Game.startCombat('nightlight_catfish');
  return s;
}

function endTurn() {
  if (!Game.tbfight || Game.tbfight.over) return;
  if (!Game.tbIsPlayerTurn()) return;
  const p = P(); p.moveLeft = 0; p.acted = true;
  Game.tbAfterPlayerAction();
}

// record one full round; returns the monster (or null)
function playRound(turnNo, brain, rec) {
  const m = MON();
  if (!m) return null;
  const p = P();
  const known = Game.encTelegraphKnown(m);
  const tell = Game.catfishTellCell();
  const badge = known ? (Game.encPhaseBadge(m) || '') : '(ungated-hidden)';
  const phaseAtStart = m.beamPhase || '?'; // badge and phase read together: the player's view at turn start
  const d = cheb(p, m);
  if (Game.tbIsPlayerTurn()) brain(m, p, d);
  else endTurn();
  // Game.log is capped at 40 (FIFO) — check the knownCue leak LIVE each
  // round while the window is fresh, keyed to learn-state at that moment.
  if (!Game.tbPatternKnown('nightlight_catfish', 'Lure and Grasp')
      && Game.log.some(l => String(l).includes(KNOWN_CUE))) rec.leakedBeforeLearn = true;
  const freshRaw = Game.log.slice(-3).map(l => String(l).slice(0, 130));
  const freshKey = freshRaw.join('‖');
  const fresh = (freshKey === rec.lastFreshKey) ? [] : freshRaw;
  rec.lastFreshKey = freshKey;
  console.log(`— r${turnNo}: phase=${m.beamPhase || '?'}${badge !== '(ungated-hidden)' ? ' ' + badge : ''} cat@(${m.mx},${m.my}) you@(${p.mx},${p.my}) d=${cheb(p, m)} tell=${tell ? `(${tell.x},${tell.y})` : 'null'} youHP=${Math.round(Game.state.scholar.health)} monHP=${m.hp}`);
  for (const l of fresh) if (/\S/.test(l)) console.log('    > ' + l);
  rec.phases.push(m.beamPhase || '?');
  rec.tells.push({ turn: turnNo, phase: m.beamPhase, phaseAtStart, known, tell, badge: badge === '(ungated-hidden)' ? null : badge });
  return m;
}

function runPass(title, setupOpts, brain, maxTurns) {
  console.log(`\n===== ${title} =====`);
  newRun(setupOpts);
  const m0 = MON();
  console.log(`catfish hp=${m0.hp} @(${m0.mx},${m0.my}) · you @(4,6) · night · seed=${SEED}`);
  const rec = { phases: [], tells: [], graspDmgToPlayer: 0, leakedBeforeLearn: false, lastFreshKey: '' };
  const hp0 = 500;
  let turn = 0;
  while (Game.tbfight && !Game.tbfight.over && turn < maxTurns) {
    turn++;
    const m = playRound(turn, brain, rec);
    if (!m) break;
    const dmg = hp0 - Math.round(Game.state.scholar.health) - rec.graspDmgToPlayer;
    if (dmg > 0) rec.graspDmgToPlayer += dmg;
    if (brain.done && brain.done(m)) break;
  }
  const dead = !MON();
  const over = Game.tbfight && Game.tbfight.over;
  console.log(`RESULT: ${dead ? 'CATFISH SLAIN' : over ? 'fight over: ' + Game.tbfight.result : 'ended after ' + turn + ' rounds'} · your hp ${Math.round(Game.state.scholar.health)} · grasp dmg taken ${rec.graspDmgToPlayer}`);
  return { rec, dead, turn, over };
}

// dedup consecutive phases, then check the full cycle appears in order
function hasCycle(phases) {
  const d = phases.filter((p, i) => i === 0 || p !== phases[i - 1]);
  const want = ['lure', 'still', 'grasp', 'dark', 'lure'];
  let wi = 0;
  for (const p of d) { if (p === want[wi]) wi++; if (wi === want.length) return true; }
  return false;
}

// ---------------- PASS 1: BLIND ----------------
const grasped = { v: false };
function blindBrain(m, p, d) {
  if (!grasped.v) {
    // curious: walk right up to the pretty glow (shore tile, cheb 1)
    if (d > 1 && p.moveLeft > 0) {
      Game.tbPlayerMove(2, 3);
      console.log(`  YOU (curious): step toward the glow → (${p.mx},${p.my})`);
    } else console.log('  YOU (curious): lean in. Pretty.');
  } else {
    // stung once: wary — hold at 3-4, never adjacent again
    if (d < 3 && p.moveLeft > 0) {
      const tx = Math.max(1, Math.min(7, p.mx + Math.sign(p.mx - m.mx)));
      const ty = Math.max(1, Math.min(7, p.my + Math.sign(p.my - m.my)));
      Game.tbPlayerMove(tx, ty);
      console.log(`  YOU (stung): back off → (${p.mx},${p.my})`);
    } else if (d > 4 && p.moveLeft > 0) {
      const tx = p.mx + Math.sign(m.mx - p.mx), ty = p.my + Math.sign(m.my - p.my);
      Game.tbPlayerMove(Math.max(1, Math.min(7, tx)), Math.max(1, Math.min(7, ty)));
      console.log(`  YOU (wary): drift a little closer → (${p.mx},${p.my})`);
    } else console.log('  YOU (wary): hold. Watch the water.');
  }
  endTurn();
}
const blindCtx = { rounds: 0 };
blindBrain.done = () => grasped.v && blindCtx.rounds >= 20;

console.log('### PASS 1 — BLIND (no codex, unarmed, curious)');
const r1 = runPass('PASS 1: BLIND', {}, function (m, p, d) {
  blindCtx.rounds++;
  if (Game.tbPatternKnown('nightlight_catfish', 'Lure and Grasp')) grasped.v = true;
  blindBrain(m, p, d);
}, 40);

// learn moment: did the codex write the pattern on the grasp?
// (the per-still tell gating is checked below via rec.tells)
check('blind: full phase cycle lure→still→grasp→dark→lure is legible', hasCycle(r1.rec.phases), r1.rec.phases.filter((p, i) => i === 0 || p !== r1.rec.phases[i - 1]).join(','));
check('blind: the grasp actually bit (damage landed)', r1.rec.graspDmgToPlayer > 0, 'dmg=' + r1.rec.graspDmgToPlayer);
check('blind: pattern learned via the bite (tbLearnPattern)', Game.tbPatternKnown('nightlight_catfish', 'Lure and Grasp'));
check('blind: no knownCue coaching leaked before learning', !r1.rec.leakedBeforeLearn);
// tell-cell gating: every still observed while pattern unknown → null
const blindStills = r1.rec.tells.filter(t => t.phase === 'still' && !t.known);
check('blind: catfishTellCell() null on all pre-learn stills (ungated text only)', blindStills.length > 0 && blindStills.every(t => t.tell === null), `stills=${blindStills.length}`);
const learnedStills = r1.rec.tells.filter(t => t.phase === 'still' && t.known && t.tell);
check('learned: tell cell shimmers once the pattern is known', learnedStills.length > 0, `stills-after-learn with tell=${learnedStills.length}`);
for (const a of ['catfishLure', 'catfishStill', 'catfishSnap']) check(`audio cue fired: ${a}`, audioLog.includes(a), audioLog.join(','));

// ---------------- PASS 2: KNOWING ----------------
// Act 1: walk the tell — step to d=3, watch the stillness, confirm the
// shimmer on the catfish's tile. Act 2: the kill — sling the light from
// range, kite the creep.
const knowCtx = { act: 1 };
function knowingBrain(m, p, d) {
  const stepToward = () => {
    const tx = Math.max(1, Math.min(7, p.mx + Math.sign(m.mx - p.mx)));
    const ty = Math.max(1, Math.min(7, p.my + Math.sign(m.my - p.my)));
    Game.tbPlayerMove(tx, ty);
  };
  const stepAway = () => {
    const tx = Math.max(1, Math.min(7, p.mx + Math.sign(p.mx - m.mx) * 2));
    const ty = Math.max(1, Math.min(7, p.my + Math.sign(p.my - m.my) * 2));
    Game.tbPlayerMove(tx, ty);
  };
  if (knowCtx.act === 1) {
    if (d > 3 && p.moveLeft > 0) { stepToward(); console.log(`  YOU (knowing): walk the tell → (${p.mx},${p.my}) d=${cheb(p, m)}`); }
    else if (d <= 2 && p.moveLeft > 0) { stepAway(); console.log(`  YOU (knowing): too close — out → (${p.mx},${p.my})`); }
    else {
      const tell = Game.catfishTellCell();
      console.log(`  YOU (knowing): read the water. shimmer=${tell ? `(${tell.x},${tell.y})` : 'none'} phase=${m.beamPhase}`);
    }
    if (m.beamPhase === 'still' && Game.catfishTellCell()) { knowCtx.act = 2; console.log('  YOU (knowing): there — the tile itself shimmers. Now the kill.'); }
  } else {
    if (d <= 2 && p.moveLeft > 0) { stepAway(); console.log(`  YOU (knowing): kite out of teeth range → (${p.mx},${p.my})`); }
    else if (d <= 4 && !p.acted) {
      const hp0 = m.hp;
      Game.tbPlayerStrike(m.key);
      console.log(`  YOU (knowing): sling the light from range ${d} → dealt ${hp0 - m.hp}, mon hp ${m.hp}`);
    } else if (d > 4 && p.moveLeft > 0) { stepToward(); console.log(`  YOU (knowing): close to slinging range → (${p.mx},${p.my})`); }
    else console.log('  YOU (knowing): hold.');
  }
  endTurn();
}

console.log('\n### PASS 2 — KNOWING (codex taught, sling, strike the light)');
const r2 = runPass('PASS 2: KNOWING', {
  teach: true,
  weapon: { itemId: 'sling', name: 'Sling' },
  stones: 20,
}, knowingBrain, 40);

check('knowing: catfish slain (the counter is real, not a stat check)', r2.dead, `turns=${r2.turn}`);
check('knowing: zero grasp damage — a knowing player never gets bitten', r2.rec.graspDmgToPlayer === 0, 'dmg=' + r2.rec.graspDmgToPlayer);
const knownStills2 = r2.rec.tells.filter(t => t.phase === 'still' && t.known && t.tell);
check('knowing: tell cell shimmers during still (knowledge-gated grid tell)', knownStills2.length > 0, `stills with tell=${knownStills2.length}`);
// badge/phase coherence: badge read at turn start must match the phase the
// player sees at turn start (they're read together — no one-turn skew).
const stillViews = r2.rec.tells.filter(t => t.phaseAtStart === 'still' && t.known && t.badge);
check('knowing: phase badge reads 🪷 TOO STILL during still', stillViews.length > 0 && stillViews.every(t => t.badge === ' 🪷 TOO STILL'), stillViews.map(t => t.badge).join(','));
const lureViews = r2.rec.tells.filter(t => t.phaseAtStart === 'lure' && t.known && t.badge);
check('knowing: phase badge reads 💡 LURING during lure', lureViews.length > 0 && lureViews.every(t => t.badge === ' 💡 LURING'), lureViews.map(t => t.badge).join(','));
const graspViews = r1.rec.tells.filter(t => t.phaseAtStart === 'grasp' && t.known && t.badge);
check('learned: phase badge reads 🐟 GRASP! during grasp', graspViews.length > 0 && graspViews.every(t => t.badge === ' 🐟 GRASP!'), graspViews.map(t => t.badge).join(','));
const darkViews = r1.rec.tells.filter(t => t.phaseAtStart === 'dark' && t.known && t.badge);
check('learned: phase badge reads 🌑 DARK during dark', darkViews.length > 0 && darkViews.every(t => t.badge === ' 🌑 DARK'), darkViews.map(t => t.badge).join(','));

// the dead-knownCue audit: catfish sets no telegraph, so tbTelegraphCue
// (the only knownCue carrier) never runs for it. Sibling check included.
const kc = ((Game.data.monsters.find(x => x.id === 'nightlight_catfish') || {}).encounter || {}).knownCue;
const kcSurfaced = Game.log.some(l => String(l).includes(kc.split('.')[0]));
console.log(`  (info) catfish knownCue: "${kc}"`);
console.log(`  (info) knownCue surfaced in log: ${kcSurfaced} (expected false — flagged as bug, not fixed)`);

console.log('\n===== ASSERTIONS =====');
if (fails.length) { console.log(`\n${fails.length} FAILURES:\n- ${fails.join('\n- ')}`); process.exit(1); }
console.log('\nALL GREEN — seed ' + SEED);
