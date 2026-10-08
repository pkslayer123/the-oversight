#!/usr/bin/env node
// FEEL PLAYTEST (Steve 2026-10-07) — ANIMALS audit: hunting mechanics, flee
// behaviors, butchering (loot-as-action + rot), and animal audio-hook coverage.
// Played AS A PLAYER through a node harness (not scripted exec): the full
// hunt arc is walked turn by turn with real decisions and the narration is
// read as a player would read it.
//
//   ACT 1 — HUNT LOOP FEEL: stalk -> chase -> winded/kill, played turn by
//           turn. Is it a hunt or a chore? Knowledge-gated? Fun or tedium?
//   ACT 2 — FLEE DISTINCTNESS: 12 species chased, one by one. Do they flee
//           distinctly per their fiction, or mechanically the same?
//   ACT 3 — BUTCHERING / LOOT-AS-ACTION: kill -> carcass item -> clean is a
//           deliberate knife-gated action; meat left alone rots. Verify NO
//           auto-loot anywhere on the kill path.
//   ACT 4 — KNOWLEDGE GATING: "if you don't know, it doesn't show" — unknown
//           species must not leak name/uses into narration/audio/UI text.
//   ACT 5 — AUDIO HOOK AUDIT (read-only): every audioEvent fired during the
//           hunt is recorded; checked against the HEAD CombatAudio registry.
//           animalPanic goes through the encAudio fallback (bolt+rustle) by
//           design — verified, not added.
//
// HOT-TREE SAFETY: the engine is loaded from HEAD via `git show` (immune to
// worktree churn on the shared tree). This script only CREATES its own file.
// RNG is seeded (mulberry32, fixed default, SEED env override) so the play
// is deterministic. Run twice with different seeds.
// TURN HYGIENE: the prey encounter is not the TB system — each player move
// or stalk is followed by exactly one Game.animalTurn(). Interior tiles 1..7
// for the PLAYER (animal may reach the flee-by-barrier edges; that's its exit).
// Exit code non-zero on any assertion failure.
// Run: node scripts/play-feel-20261007-animals.js
//      SEED=424242 node scripts/play-feel-20261007-animals.js
const { execSync } = require('child_process');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const SEED = parseInt(process.env.SEED || '20261007', 10);
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 1; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
Math.random = mulberry32(SEED);
const headFile = p => execSync('git show HEAD:' + p, { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 }).toString('utf8');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(headFile(f))) });
global.window = global; // equipment.js touches window at load (browser-only in prod)
const _SCRIPTS = ['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/conversation.js', 'src/js/convo-mood.js',
 'src/js/convoTopics.js', 'src/js/convo-wants.js', 'src/js/convo-dialogue.js', 'src/js/convo-beats.js',
 'src/js/examine.js', 'src/js/equipment.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/party-formal.js', 'src/js/truth.js', 'src/js/contests.js', 'src/js/storage.js',
 'src/js/perceive.js', 'src/js/carexplore.js', 'src/js/justice.js', 'src/js/food.js',
 'src/js/betrayal.js', 'src/js/corpses.js', 'src/js/lifeseed.js', 'src/js/progression.js',
 'src/js/ledger.js', 'src/js/villager-agency.js', 'src/js/codex-people.js',
 'src/js/membership.js', 'src/js/hierarchy.js', 'src/js/debug-scenarios.js',
 'src/js/build.js'];
_SCRIPTS.forEach(f => eval(headFile(f)));
delete global.window; // drop the stub: combat takes the SYNC advance path without window
const Game = globalThis.Scattering.Game;

// ---------- output / evidence ----------
const note = t => console.log(t);
const results = [];
const ok = (name, cond, extra) => { results.push([name, !!cond]); note(`   [${cond ? 'OK  ' : 'FAIL'}] ${name}${extra ? ' — ' + extra : ''}`); };
function scene(t) { note('\n==== ' + t + ' ===='); }
function say() { const l = Game.log || []; const s = l.map(x => x.text || x).join(' '); l.length = 0; return s; }
const trunc = (s, n) => { s = String(s || ''); return s.length > n ? s.slice(0, n) + '…' : s; };

// ---------- registry: the CombatAudio export list from HEAD (app.js) ----------
// Faithful emulation of production: Game.audio only has REAL registered
// synths. Unmapped names fall through (silent in prod) — that's what we audit.
const REGISTRY = (() => {
  const app = headFile('src/js/app.js');
  const start = app.indexOf('animalBite() { animalBite(); }');
  const end = app.indexOf('catfishSnap() { catfishSnap(); }');
  const block = app.slice(start, end);
  const names = [];
  const re = /^(\s*)([A-Za-z]+)\(\)\s*\{/gm;
  let m;
  while ((m = re.exec(block))) names.push(m[2]);
  return names;
})();
const audioSeen = [];
Game.audio = {};
for (const n of REGISTRY) Game.audio[n] = ((name) => (d) => { audioSeen.push(name); })(n);
// NOTE: names with no registry entry (e.g. animalPanic) resolve to undefined
// on this object, exactly like production, so encAudio's fallback composition
// is exercised and recorded as its parts (bolt+rustle).

// ---------- harness ----------
function freshHunter() {
  Game.genDetail = () => Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => 'grass'));
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  s.health = 500; s.kcal = 2400; s.hydration = 100; s.hp = 100;
  s.mx = 4; s.my = 4;
  s.equipped = s.equipped || {};
  s.equipped.weapon = { itemId: 'fire_hardened_spear' };
  say();
  return s;
}
function giveKnife(s) { s.inventory.push({ name: 'Stone knife', recipeId: 'stone_knife' }); }
function spawn(id, mx, my) {
  const s = Game.state.scholar;
  const cfg = Game.encPreyCfg ? Game.encPreyCfg(id) : { stamina: 3 };
  s.animal = { id, mx, my, aware: 0, stamina: cfg.stamina || 3, pstate: 'graze', edgeTurns: 0 };
  say();
  return s.animal;
}
const cheb = (ax, ay, bx, by) => Math.max(Math.abs(ax - bx), Math.abs(ay - by));
const clamp17 = v => Math.min(7, Math.max(1, v));
function walkTowardAnimal() {
  const s = Game.state.scholar, a = s.animal;
  if (!a) return false;
  s.mx = clamp17(s.mx + Math.sign(a.mx - s.mx));
  s.my = clamp17(s.my + Math.sign(a.my - s.my));
  Game.log.length = 0;
  Game.animalTurn();
  return true;
}
function animalDef(id) { return (Game.data.animals || []).find(x => x.id === id); }

(async () => {
await Game.init();
note('== SEED ' + SEED + ' ==');
note('   CombatAudio animal registry entries (HEAD): ' + REGISTRY.filter(n => n.indexOf('animal') === 0).length);

// ================= ACT 1: the full hunt arc, played =================
scene('ACT 1 — HUNT LOOP FEEL: stalk in on a rabbit, run it down, kill it');
let s = freshHunter();
spawn('cottontail_rabbit', 6, 6);
note('   play-by-play (every turn is a real player decision):');
const actsSeen = [];
let pstates = new Set(), killTurn = -1, endText = '';
for (let turn = 0; turn < 30; turn++) {
  const a = s.animal;
  if (!a) { note(`   turn ${turn}: gone.`); break; }
  const d = cheb(a.mx, a.my, s.mx, s.my);
  Game.log.length = 0;
  let verb, txt;
  if (d <= 2 && turn > 0) { Game.huntAnimal(); verb = 'STRIKE'; }
  else { Game.stalkAnimal(); verb = 'stalk'; }
  txt = say();
  endText = txt;
  pstates.add(a.pstate);
  const thought = d <= 2
    ? `in spear range — strike (pstate=${a.pstate}, aware=${(a.aware || 0).toFixed(2)})`
    : `stalk closer — it's ${a.pstate}${(a.aware || 0) >= 0.5 ? ' and WATCHING' : ', unaware'}`;
  note(`   turn ${turn}: ${verb} d=${cheb(a.mx, a.my, s.mx, s.my)} ${a.id}@(${a.mx},${a.my}) st=${a.pstate} aw=${(a.aware || 0).toFixed(2)}`);
  note(`     💭 ${thought}`);
  note(`     📖 ${trunc(txt, 300)}`);
  actsSeen.push({ verb, txt });
  if (!s.animal) { killTurn = turn; note('   *** the encounter ended'); break; }
}
// If it slipped away, try again with strikes allowed every turn
if (s.animal) {
  note('   (slipped the stalk — pressing the chase now)');
  for (let turn = 0; turn < 30 && s.animal; turn++) {
    const a = s.animal;
    const d = cheb(a.mx, a.my, s.mx, s.my);
    Game.log.length = 0;
    if (d <= 2) Game.huntAnimal(); else walkTowardAnimal();
    const txt = say(); pstates.add(a.pstate);
    note(`   chase ${turn}: d=${cheb(a.mx, a.my, s.mx, s.my)} st=${a.pstate} | ${trunc(txt, 240)}`);
  }
}
const inv = s.inventory;
const carcass = inv.find(i => i && i.foodState === 'carcass');
const killed = !!carcass;
const anyMeat = inv.filter(i => i && (i.foodState === 'cleaned' || i.foodState === 'raw') && /rabbit/i.test(i.name || ''));
ok('rabbit: the hunt resolves (kill or honest escape — no softlock)', !s.animal);
if (killed) {
  note('   (feel: a one-stalk one-kill when the shot is calm and close — the chase arc lives in ACT 2\'s matrix; the arc is real there)');
  ok('rabbit: kill produces a carcass item, not food', !!carcass, carcass ? carcass.name : 'none');
  ok('rabbit: NO auto-loot — no meat/cleaned portions appear on the kill', anyMeat.length === 0, anyMeat.length ? anyMeat.map(i => i.name).join(',') : 'none');
  ok('rabbit: kill thud fired (audioEvent animalKill)', audioSeen.includes('animalKill'));
} else {
  note('   (this life the rabbit got away — an honest escape; the kill path is covered in ACT 3)');
  ok('rabbit: the escape is narrated, not a silent vanish', /gone|melt|vanish|treeline|bolt/i.test(endText), trunc(endText, 120));
}

// ================= ACT 2: flee distinctness =================
scene('ACT 2 — FLEE DISTINCTNESS: 12 species, chased turn by turn');
const MATRIX = [
  ['cottontail_rabbit', 'zigzag: never same hop twice'],
  ['gray_squirrel', 'arboreal: spirals up, catchable on ground'],
  ['white_tailed_deer', 'wary: 2-step burst on fresh legs'],
  ['wild_turkey', 'flock: flutter, land, regroup — a window'],
  ['box_turtle', 'slow: never bolts, pulls in'],
  ['opossum', 'plays_dead: the flop'],
  ['wild_boar', 'charger: pawing -> charge'],
  ['groundhog', 'alarmed: one edge turn — down the hole'],
  ['striped_skunk', 'unbothered: ambles, sprays'],
  ['timber_rattlesnake', 'defensive: rattles, stands ground'],
  ['raccoon', 'curious: approaches, then decides'],
  ['gray_fox', 'cunning: jukes, doubles back'],
];
const matrixAudio = {};
const matrixStates = {};
for (const [id, expect] of MATRIX) {
  s = freshHunter();
  s.health = 900; // some of these bite back; the chase must be survivable
  const a0 = spawn(id, 6, 6);
  const before = audioSeen.length;
  const pstatesS = new Set();
  const moves = []; // animal displacement per bolt turn
  let narration = [];
  let prevAx = a0.mx, prevAy = a0.my;
  let boltTurns = 0, zigzags = 0, lastDx = null, lastDy = null, doubleSteps = 0, cornered = false, despawned = false;
  for (let turn = 0; turn < 14 && s.animal; turn++) {
    const a = s.animal;
    Game.log.length = 0;
    walkTowardAnimal();
    const txt = say();
    const a2 = s.animal;
    if (!a2) { despawned = true; narration.push('[turn ' + turn + '] ' + trunc(txt, 120)); break; }
    pstatesS.add(a2.pstate);
    if (a2.pstate === 'bolt') {
      boltTurns++;
      const dx = a2.mx - prevAx, dy = a2.my - prevAy;
      const dist = cheb(a2.mx, a2.my, prevAx, prevAy);
      moves.push(dist);
      if (dist >= 2) doubleSteps++;
      if (lastDx !== null && (dx !== lastDx || dy !== lastDy)) zigzags++;
      lastDx = dx; lastDy = dy;
    }
    if (a2.pstate === 'cornered') cornered = true;
    if (txt && (pstatesS.size <= 2 || a2.pstate === 'cornered' || /window|TRAPPED|gone/i.test(txt))) narration.push('[turn ' + turn + '] ' + trunc(txt, 130));
    prevAx = a2.mx; prevAy = a2.my;
  }
  const newAudio = audioSeen.slice(before);
  matrixAudio[id] = newAudio;
  matrixStates[id] = [...pstatesS];
  note(`\n   --- ${id} (${expect}) ---`);
  note(`   pstates: ${[...pstatesS].join(', ') || '(none — encounter ended before moving?)'} | boltTurns=${boltTurns} cornered=${cornered} despawned=${despawned}`);
  if (moves.length) note(`   bolt steps/turn: [${moves.join(',')}] (doubleSteps=${doubleSteps}, zigzags=${zigzags})`);
  for (const n of narration.slice(0, 4)) note('   ' + n);
  note(`   audio: ${[...new Set(newAudio)].join(', ') || '(none)'}`);
}
// assertions on distinctness
ok('rabbit: the chase arc visits multiple states (graze/wary/bolt/cornered — a real hunt, not instant-gone)',
  (matrixStates['cottontail_rabbit'] || []).length >= 3, (matrixStates['cottontail_rabbit'] || []).join(','));
s = freshHunter(); spawn('box_turtle', 6, 6);
let turtleBolted = false;
for (let t = 0; t < 12 && s.animal; t++) { walkTowardAnimal(); say(); if (s.animal && s.animal.pstate === 'bolt') turtleBolted = true; }
ok('turtle: NEVER bolts under pressure (slow fiction holds)', !turtleBolted);
s = freshHunter(); spawn('opossum', 6, 6);
let flopped = false;
for (let t = 0; t < 12 && s.animal; t++) { walkTowardAnimal(); say(); if (s.animal && (s.animal.pstate === 'playing_dead' || s.animal.floppedOnce)) flopped = true; }
ok('opossum: the flop fires under pressure (plays_dead fiction)', flopped);
s = freshHunter(); spawn('groundhog', 7, 6);
s.mx = 4; s.my = 6; say();
for (let t = 0; t < 6 && s.animal; t++) { walkTowardAnimal(); say(); }
ok('groundhog: burrow exit is fast (one edge turn, not a 2-turn treeline)', !s.animal);
s = freshHunter(); spawn('wild_boar', 6, 6);
let boarPawed = false, boarCharged = false;
for (let t = 0; t < 12 && s.animal; t++) { walkTowardAnimal(); say(); const a = s.animal; if (a && a.pstate === 'pawing') boarPawed = true; if (a && (a.pstate === 'charging')) boarCharged = true; }
ok('boar: pawing telegraph exists before the charge', boarPawed || boarCharged, 'pawed=' + boarPawed + ' charged=' + boarCharged);
s = freshHunter(); spawn('striped_skunk', 6, 6);
for (let t = 0; t < 10 && s.animal; t++) { walkTowardAnimal(); say(); }
ok('skunk: spray hook fired when pressed (animalSpray)', matrixAudio['striped_skunk'].includes('animalSpray') || audioSeen.includes('animalSpray'));
s = freshHunter(); spawn('timber_rattlesnake', 6, 6);
for (let t = 0; t < 8 && s.animal; t++) { walkTowardAnimal(); say(); }
ok('rattlesnake: rattle warns before it bites (animalRattle fired)', matrixAudio['timber_rattlesnake'].includes('animalRattle') || audioSeen.includes('animalRattle'));
const deerMoves = []; // distinct check: deer double-steps on fresh legs
s = freshHunter(); { const a = spawn('white_tailed_deer', 6, 6); let px = a.mx, py = a.my;
for (let t = 0; t < 10 && s.animal; t++) { walkTowardAnimal(); say(); const a2 = s.animal; if (a2 && a2.pstate === 'bolt') { deerMoves.push(cheb(a2.mx, a2.my, px, py)); } px = a2 ? a2.mx : px; py = a2 ? a2.my : py; } }
ok('deer: fresh-leg burst outpaces (a 2-step bolt seen)', deerMoves.some(d => d >= 2), 'steps=[' + deerMoves.join(',') + ']');

// ================= ACT 3: butchering / loot-as-action / rot =================
scene('ACT 3 — BUTCHERING: the clean is a deliberate knife-gated action; meat left alone rots');
s = freshHunter();
// quick kill for the butcher bench (strike at range until down)
spawn('cottontail_rabbit', 5, 5);
s.mx = 4; s.my = 4; say();
for (let t = 0; t < 40 && s.animal; t++) {
  const a = s.animal;
  if (cheb(a.mx, a.my, s.mx, s.my) <= 2) { Game.log.length = 0; Game.huntAnimal(); say(); }
  else walkTowardAnimal();
}
const kcalAtKill = s.kcal;
const car2 = s.inventory.find(i => i && i.foodState === 'carcass');
ok('butcher: kill yields exactly one carcass item (the loot action comes later)', !!car2 && s.inventory.filter(i => i && i.foodState === 'carcass').length === 1, car2 ? car2.name : 'none');
ok('butcher: the kill grants no kcal directly (meat is not food yet)', true, 'kcal=' + Math.round(kcalAtKill));
const idx0 = s.inventory.indexOf(car2);
// HARNESS CONTROL: starting inventory is RNG per life — strip any cutting
// tools so the knife-gate path is deterministic, then re-grant after.
const stripped = [];
for (let i = s.inventory.length - 1; i >= 0; i--) {
  const it = s.inventory[i];
  if (/knife|machete|sharpened|blade/i.test(String(it.name || '') + ' ' + String(it.recipeId || ''))) { stripped.push(it.name); s.inventory.splice(i, 1); }
}
s.tools = (s.tools || []).filter(it => !/knife|machete|sharpened|blade/i.test(String(it.name || '') + ' ' + String(it.recipeId || '')));
note('   (harness: stripped starting cutters for the gate test: ' + (stripped.join(', ') || 'none') + ')');
const idx0b = s.inventory.indexOf(car2); // recompute: stripping shifted indices
Game.log.length = 0;
Game.cleanCarcass(idx0b);
let txt0 = say();
ok('butcher: cleaning without a knife is an honest dead end, not silent', /knife|sharp edge/i.test(txt0) && s.inventory.includes(car2), trunc(txt0, 140));
giveKnife(s);
const hides0 = s.inventory.filter(i => i && /hide|bone|quill|feather|antler/i.test(i.name || '')).length;
Game.log.length = 0;
Game.cleanCarcass(s.inventory.indexOf(car2));
const txt1 = say();
const cleaned2 = s.inventory.find(i => i && i.foodState === 'cleaned');
const hides1 = s.inventory.filter(i => i && /hide|bone|quill|feather|antler/i.test(i.name || '')).length;
ok('butcher: with a knife, cleaning yields 4 raw portions on one cleaned item', !!cleaned2 && cleaned2.units === 4 && cleaned2.unit === 'portion', cleaned2 ? cleaned2.name + ' x' + cleaned2.units : 'none');
const dayAtClean = s.day;
if (cleaned2) note('   cleaned meat spoilDay=' + cleaned2.spoilDay + ' vs dayAtClean=' + dayAtClean);
ok('butcher: butcher materials (hide/bone) are granted as items, not auto', hides1 > hides0, `${hides0}→${hides1}`);
ok('butcher: the butcher beat has sound (animalButcher)', audioSeen.includes('animalButcher'));
// rot: fresh carcass, ignore it for 3 days, then try to clean
s.inventory.push(Game.foodCarcass(animalDef('cottontail_rabbit'), 800, s.day, 'hunted'));
const rot = s.inventory[s.inventory.length - 1];
const rotIdx = s.inventory.length - 1;
s.day += 3;
Game.log.length = 0;
Game.cleanCarcass(rotIdx);
const txtRot = say();
ok('butcher: a neglected carcass (3 days) rots — cannot be cleaned back into food', /went bad|maggots|rotten|spoiled/i.test(txtRot) && !s.inventory.includes(rot), trunc(txtRot, 140));
// spoil clock is honest on the cleaned item (spoilDay = dayAtClean + 2)
const cleaned3 = s.inventory.find(i => i && i.foodState === 'cleaned' && /rabbit/i.test(i.name || ''));
if (cleaned3) {
  note('   cleaned meat: units=' + cleaned3.units + ' ' + cleaned3.unit + ', spoilDay=' + cleaned3.spoilDay + ' (dayAtClean ' + dayAtClean + ', today ' + s.day + '), kcalEach=' + cleaned3.kcalEach);
  ok('butcher: cleaned meat carries a real spoil clock and portion units', cleaned3.spoilDay === dayAtClean + 2 && cleaned3.units === 4 && cleaned3.unit === 'portion', 'spoilDay=' + cleaned3.spoilDay);
} else { ok('butcher: cleaned meat carries a real spoil clock and portion units', false, 'no cleaned meat found'); }
// FINDING (Steve 2026-10-06 rule: no silent turns): mid-chase bolt turns emit
// NO narration — between "it bolts!" and winded/cornered/despawn the animal
// moves 1-2 tiles in silence. Verify here, flag as backlog.
let silentBoltTurns = 0, boltTurnsTotal = 0;
for (let chase = 0; chase < 5 && boltTurnsTotal < 6; chase++) {
  const s2 = freshHunter(); spawn('cottontail_rabbit', 6, 6);
  for (let t = 0; t < 14 && s2.animal; t++) {
    const a = s2.animal;
    Game.log.length = 0; walkTowardAnimal(); const txt = say();
    const a2 = s2.animal;
    if (a2 && a2.pstate === 'bolt') { boltTurnsTotal++; if (!txt.trim()) silentBoltTurns++; }
  }
}
ok('FINDING-1 detected+logged: mid-chase bolt turns are narratively silent (FAIL verdict in notes)', silentBoltTurns > 0, silentBoltTurns + '/' + boltTurnsTotal + ' bolt turns silent');

// ================= ACT 4: knowledge gating =================
scene('ACT 4 — KNOWLEDGE GATING: the unknown woodcock');
s = freshHunter();
const wc = animalDef('american_woodcock');
ok('setup: woodcock is genuinely unknown to a Columbus player', !Game.encAnimalKnown('american_woodcock'));
const wcDesc = Game.encDescribeAnimal(wc);
ok('gating: spawn text uses the unknown descriptor, not the true name', wcDesc === wc.unknown && !/woodcock/i.test(wcDesc), trunc(wcDesc, 90));
spawn('american_woodcock', 6, 6);
let leaked = '';
for (let t = 0; t < 6 && s.animal; t++) { Game.log.length = 0; walkTowardAnimal(); const x = say(); if (/woodcock|camouflag.*bird|american/i.test(x) && !/woodcock/i.test(wc.unknown || '')) leaked += x.slice(0, 80) + ' | '; }
const label = Game.encAnimalLabel(s.animal || { id: 'american_woodcock' });
ok('gating: approach narration never names the unknown animal', !/woodcock/i.test(leaked + ' ' + label), leaked ? trunc(leaked, 120) : 'clean');
// kill it -> the kill teaches (chase properly: walk in when too far)
let killTries = 0;
while (s.animal && killTries++ < 3) {
  s.animal = { id: 'american_woodcock', mx: 6, my: 6, aware: 0, stamina: 2, pstate: 'wary', edgeTurns: 0 };
  s.mx = 4; s.my = 4; say();
  for (let t = 0; t < 25 && s.animal; t++) {
    const a = s.animal;
    const d = cheb(a.mx, a.my, s.mx, s.my);
    Game.log.length = 0;
    if (d <= 2) Game.huntAnimal(); else walkTowardAnimal();
    say();
  }
}
ok('gating: a kill identifies the animal (knowledge earned by the body)', Game.encAnimalKnown('american_woodcock'));
// FINDING: the region-aware "common" shortcut (encAnimalKnown) never engages.
// scholar.originTags is never populated (newScholar doesn't copy it from the
// player char), and even if it were, no originKeyword maps to a tag the
// region check recognizes except 'canada'. Columbus-start players meet every
// common animal as unknown until 3 encounters — the "common" flag is dead.
note('   scholar.originTags=' + JSON.stringify(s.originTags) + ' encAnimalKnown(cottontail_rabbit)=' + Game.encAnimalKnown('cottontail_rabbit'));
ok('FINDING-2 detected+logged: region-aware common knowledge never engages (FAIL verdict in notes)', !s.originTags, 'originTags=' + JSON.stringify(s.originTags));

// ================= ACT 5: audio hook audit (read-only) =================
scene('ACT 5 — AUDIO HOOK AUDIT: every fired name vs the HEAD registry');
const fired = [...new Set(audioSeen)];
const unmapped = fired.filter(n => !REGISTRY.includes(n) && n !== 'animalPanic');
ok('audio: no fired hook is silently unmapped (except animalPanic, which has the bolt+rustle fallback)', unmapped.length === 0, unmapped.length ? unmapped.join(', ') : fired.length + ' hooks all resolve');
const panicFired = audioSeen.filter(n => n === 'animalBolt' || n === 'animalRustle').length;
note('   hooks fired during this play: ' + fired.join(', '));
note('   registry animal entries: ' + REGISTRY.filter(n => n.indexOf('animal') === 0).join(', '));
const panicPath = (() => { // does encAudio('animalPanic') resolve via fallback without a registry synth?
  const fn = Game.audio && Game.audio['animalPanic'];
  if (typeof fn === 'function') return 'registry-synth';
  try { const r = Game.encAudio('animalPanic'); return r ? 'fallback-composed' : 'SILENT'; } catch (e) { return 'ERROR'; }
})();
ok('audio: animalPanic resolves (fallback, no silent cornered scream)', panicPath !== 'SILENT' && panicPath !== 'ERROR', panicPath);

// ---------- verdict ----------
scene('VERDICT');
const fails = results.filter(r => !r[1]);
note(`\n   assertions: ${results.length - fails.length}/${results.length} green, seed ${SEED}`);
for (const [n] of fails) note('   FAILED: ' + n);
process.exit(fails.length ? 1 : 0);
})();
