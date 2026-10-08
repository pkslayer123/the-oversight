#!/usr/bin/env node
// BRAWLER SYNERGY DISCOVERY AUDIT + PROOF — 2026-10-07 (Steve 2026-10-05).
//
// Assignment: audit that every brawler-path synergy has a guessable,
// player-discoverable activation path (a discovery_method / hint wired to
// codex hints), and that the 10 backlog-flagged brawler modifiers
// (run note 2108: "10 brawler modifiers unconsumed") are actually consumed
// by the engine — or honestly removed from data with no mechanic to wire.
//
// Scope: src/data/abilities.json + src/data/synergies.json (read at HEAD
// bytes via git archive extract) and src/js/*.js call sites. AUDIT + PROOF
// ONLY — this script never mutates src/.
//
// Run:  node scripts/test-brawler-synergy-discovery-20261007.js
//       SEED=2 node scripts/test-brawler-synergy-discovery-20261007.js
//   or: REPO_ROOT=/path/to/pristine/extract node scripts/test-brawler-synergy-discovery-20261007.js
//
// Exit code: non-zero on ANY failure. Green-or-honestly-red: the loop
// requires green across seeds (default run covers SEED=7; rerun with
// SEED=1,2,3 per loop rules).

const fs = require('fs');
const path = require('path');

const ROOT = process.env.REPO_ROOT || path.resolve(__dirname, '..');

function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const SEED = parseInt(process.env.SEED || '7', 10);
Math.random = mulberry32(SEED);

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}

const readJSON = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const abilities = readJSON('src/data/abilities.json');
const synergies = readJSON('src/data/synergies.json');
const abilityIds = new Set(abilities.map(a => a.id));
const synergyIds = new Set(synergies.map(s => s.id));
const gameSrc = fs.readFileSync(path.join(ROOT, 'src/js/game.js'), 'utf8');
const appSrc = fs.readFileSync(path.join(ROOT, 'src/js/app.js'), 'utf8');
const jsFiles = fs.readdirSync(path.join(ROOT, 'src/js')).filter(f => f.endsWith('.js'));
const jsSrc = jsFiles.map(f => ({ f, src: fs.readFileSync(path.join(ROOT, 'src/js', f), 'utf8') }));

// ---- Brawler scope ----
// Brawler-EXCLUSIVE leg ids. rage / second_wind / adrenaline_control are
// SHARED legs (they also feed the death-neighborhood: undying_fury,
// refuses_death, cornered_fury) and must NOT scope a synergy into the
// brawler path on their own. Synergy-as-leg ids (unstoppable, fear_itself,
// one_person_army, trade_of_blows) are picked up by the second pass below:
// a leg naming another synergy counts via discovery per checkSynergyDiscovery.
const BRAWLER_LEGS = new Set([
  'brawler_instinct', 'intimidating_presence', 'fear_aura',
  'war_cry', 'haymaker', 'unbreakable',
]);
const SHARED_LEGS = new Set(['rage', 'second_wind', 'adrenaline_control', 'cornered_rat']);
function legsOf(syn) {
  const out = [];
  const paths = syn.requires_any || [syn.requires || []];
  for (const p of paths) out.push(...p);
  return out;
}
const brawlerSyns = synergies.filter(s => legsOf(s).some(l => BRAWLER_LEGS.has(l)));
// Second pass: synergies whose legs are themselves brawler synergies.
for (const s of synergies) {
  if (!brawlerSyns.includes(s) && legsOf(s).some(l => brawlerSyns.some(b => b.id === l))) {
    brawlerSyns.push(s);
  }
}
// Adjacent (shared-leg) synergies — informational only, NOT gated: the
// death-neighborhood borrows rage/second_wind/adrenaline_control.
const adjacentSyns = synergies.filter(s =>
  !brawlerSyns.includes(s) && legsOf(s).some(l => SHARED_LEGS.has(l)));

// ---- A1: every brawler synergy has a well-formed discovery_method ----
console.log('A. discovery_method on every brawler synergy');
check('brawler synergy set identified', brawlerSyns.length === 7,
  `expected 7, got ${brawlerSyns.length}: ${brawlerSyns.map(s => s.id).join(',')}`);
for (const s of brawlerSyns) {
  const dm = s.discovery_method || {};
  check(`${s.id}: discovery_method present`, !!s.discovery_method);
  check(`${s.id}: type non-empty`, typeof dm.type === 'string' && dm.type.length > 0, `type=${JSON.stringify(dm.type)}`);
  check(`${s.id}: hint non-empty (guessable)`, typeof dm.hint === 'string' && dm.hint.trim().length > 0, `hint=${JSON.stringify(dm.hint)}`);
  check(`${s.id}: tease1 non-empty (attempt-1 coaching)`, typeof dm.tease1 === 'string' && dm.tease1.trim().length > 0);
  check(`${s.id}: tease2 non-empty (attempt-2 coaching)`, typeof dm.tease2 === 'string' && dm.tease2.trim().length > 0);
}

// ---- A2: every leg resolves ----
console.log('B. leg resolution');
for (const s of brawlerSyns) {
  const bad = legsOf(s).filter(l => !abilityIds.has(l) && !synergyIds.has(l));
  check(`${s.id}: all legs resolve`, bad.length === 0, `unresolvable: ${bad.join(',')}`);
}
// Adjacent synergies: report discovery coverage (informational, not gated).
for (const s of adjacentSyns) {
  const dm = s.discovery_method || {};
  const okDm = !!s.discovery_method && dm.hint && dm.tease1 && dm.tease2;
  console.log(`  info adjacent ${s.id}: discovery_method ${okDm ? 'well-formed' : 'INCOMPLETE — flag to engine owner'}`);
}

// ---- A3: the 10 backlog modifiers — consumed or honestly removed ----
// From run note 2108 backlog: "10 brawler modifiers unconsumed":
// trade_window, knockdown_resist, stun_duration, heavy_damage, damage_taken,
// morale_break_resist, social.intimidate, enemy_morale, outnumbered_bonus, solo_damage
console.log('C. modifier consumption (data targets x engine call sites)');
function callSites(target) {
  const re = new RegExp(`modTarget\\(['"]${target.replace(/\./g, '\\.')}['"]`);
  const hits = [];
  for (const { f, src } of jsSrc) {
    src.split('\n').forEach((line, i) => { if (re.test(line)) hits.push(`${f}:${i + 1}`); });
  }
  return hits;
}
const EXPECTED_CONSUMED = [
  'combat.trade_window', 'combat.heavy_damage', 'combat.damage_taken',
  'social.intimidate', 'combat.enemy_morale',
  'combat.outnumbered_bonus', 'combat.solo_damage',
];
const EXPECTED_REMOVED = [ // honestly removed 2026-10-07: no mechanic exists to wire into
  'combat.knockdown_resist', 'combat.stun_duration', 'combat.morale_break_resist',
];
// Collect modifier targets actually present in brawler-path data.
const brawlerDataTargets = new Map(); // target -> [source ids]
function noteTarget(t, srcId) {
  if (!brawlerDataTargets.has(t)) brawlerDataTargets.set(t, []);
  brawlerDataTargets.get(t).push(srcId);
}
for (const a of abilities) {
  if (a.pool === 'combat' || BRAWLER_LEGS.has(a.id)) {
    for (const m of (a.modifiers || [])) noteTarget(m.target, `ability:${a.id}`);
  }
}
for (const s of brawlerSyns) {
  for (const m of (s.modifiers || [])) noteTarget(m.target, `synergy:${s.id}`);
}
for (const t of EXPECTED_CONSUMED) {
  const sites = callSites(t);
  check(`${t}: engine consumer exists`, sites.length > 0, 'zero modTarget call sites');
  if (sites.length) console.log(`         ${t} <- ${sites.join(', ')}`);
  check(`${t}: present in brawler data`, brawlerDataTargets.has(t),
    'data target missing — the wire has nothing to read');
}
for (const t of EXPECTED_REMOVED) {
  check(`${t}: honestly removed from data`, !brawlerDataTargets.has(t),
    `still present: ${(brawlerDataTargets.get(t) || []).join(',')}`);
  const sites = callSites(t);
  check(`${t}: no dead references in src/js`, sites.length === 0, `stale sites: ${sites.join(',')}`);
}

// ---- D: machinery statically wired ----
console.log('D. discovery machinery (static)');
check('checkSynergyDiscovery gates on discovery_method (!dm continue)',
  /const dm = syn\.discovery_method;/.test(gameSrc) && /if \(!dm\) continue;/.test(gameSrc));
check('synergyTease reads tease1/tease2', /dm\.tease1/.test(gameSrc) && /dm\.tease2/.test(gameSrc));
check('attempt-2 coaching gated on dm.hint (hint reaches the player)',
  /if \(n === 2 && dm\.hint\)/.test(gameSrc));
check('unlockSynergy exists and recomputes active synergies', (() => {
  const i = gameSrc.indexOf('unlockSynergy(syn)');
  if (i < 0) return false;
  const body = gameSrc.slice(i, i + 4000);
  return body.includes('recomputeActiveSynergies()');
})());
check('synergyMods reads ONLY activeSynergies (knowledge->power gate)',
  /synergyMods\(\)[\s\S]{0,400}?this\.state\.scholar\.activeSynergies/.test(gameSrc));
check('app.js renderSynergyStirrings surfaces hint at attempt 2 (HUD/codex)',
  /function renderSynergyStirrings/.test(appSrc) && /n === 2 && dm\.hint/.test(appSrc));

// ---- E: behavioral — play the discovery loop in node ----
console.log('E. behavioral: play the discovery loop (seeded)');

global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
const order = [...fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').matchAll(/src\/js\/[^"']*\.js/g)]
  .map(m => m[0]).filter((v, i, a) => a.indexOf(v) === i)
  .filter(s => !/app\.js|sprites\.js|tile-scenes\.js|move-anim\.js|drama\.js/.test(s));
global.window = global; // eval-phase stub only (AGENTS.md)
global.document = {
  getElementById: () => null,
  createElement: () => ({ textContent: '', innerHTML: '', style: {}, setAttribute() {}, appendChild() {} }),
  head: { appendChild() {} }, body: {},
};
order.forEach(f => { eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); });
delete global.window; delete global.document;
const Game = globalThis.Scattering.Game;

const says = [];
const osay = Game.say.bind(Game);
Game.say = (t) => { says.push(String(t)); return osay(t); };
const said = () => says.join('\n');
const clearSays = () => { says.splice(0); };

function grant(id, level) {
  const s = Game.state.scholar;
  s.abilities = s.abilities || [];
  let e = s.abilities.find(a => a.id === id);
  if (!e) { e = { id, name: id, desc: '', level: level || 1, xp: 0 }; s.abilities.push(e); }
  else e.level = level || e.level || 1;
  return e;
}
function setDay(d) {
  Game.state.scholar.day = d;
  if (Game.state.village) Game.state.village.day = d;
  Game.dayPart = 0;
}
function combinedUse(legA, legB) { // simultaneous: both in the same day-part
  clearSays();
  Game.noteAbilityUse(legA, {});
  Game.noteAbilityUse(legB, {});
}
function attempts(id) { return (Game.state.scholar.synergyAttempts || {})[id] || 0; }
function discovered(id) { return (Game.state.scholar.synergies || []).includes(id); }
function synergyModSources(target) {
  return Game.synergyMods().filter(m => m.target === target).map(m => m.source);
}

(async () => {
  await Game.init();
  console.log(`seed=${SEED}`);
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  const s = Game.state.scholar;
  s.health = 100; s.kcal = 2600; s.hydration = 80; s.energy = 100;

  // E1: classic two-leg simultaneous synergy (trade_of_blows).
  grant('brawler_instinct', 1); grant('second_wind', 1);
  const tobData = synergies.find(x => x.id === 'trade_of_blows');
  setDay(1); combinedUse('brawler_instinct', 'second_wind');
  check('trade_of_blows: attempt 1 counted', attempts('trade_of_blows') === 1, `attempts=${attempts('trade_of_blows')}`);
  check('trade_of_blows: tease1 spoken verbatim (attempt-1 coaching)',
    said().includes(tobData.discovery_method.tease1), said().slice(0, 220));
  setDay(2); combinedUse('brawler_instinct', 'second_wind');
  check('trade_of_blows: attempt 2 counted', attempts('trade_of_blows') === 2);
  check('trade_of_blows: tease2 spoken verbatim (attempt-2 coaching)',
    said().includes(tobData.discovery_method.tease2), said().slice(0, 220));
  check('trade_of_blows: not yet discovered at 2/3', !discovered('trade_of_blows'));
  setDay(3); combinedUse('brawler_instinct', 'second_wind');
  check('trade_of_blows: discovered after 3 combined uses', discovered('trade_of_blows'));
  check('trade_of_blows: unlock announced', /SYNERGY DISCOVERED: Trade of Blows/i.test(said()));
  // E2: the modifier actually fires once discovered (knowledge -> power).
  check('trade_of_blows: synergy modifier in pipeline',
    synergyModSources('combat.strike_damage').includes('synergy:trade_of_blows'));
  check('trade_of_blows: strike_damage x1.25 via modTarget',
    Math.abs(Game.modTarget('combat.strike_damage', 100) - 125) < 0.001,
    `got ${Game.modTarget('combat.strike_damage', 100)}`);
  // trade window: base 3 + 1 from the trade_of_blows ABILITY modifier
  // (the modifier lives on the ability, not the synergy).
  grant('trade_of_blows', 1);
  check('combat.trade_window: ability modifier consumed',
    Math.abs(Game.modTarget('combat.trade_window', 3) - 4) < 0.001,
    `got ${Game.modTarget('combat.trade_window', 3)}`);

  // E3: requires_any multi-path synergy (unstoppable via rage+iron_stomach, minLevel 2).
  grant('rage', 2); grant('iron_stomach', 2);
  setDay(4); combinedUse('rage', 'iron_stomach');
  check('unstoppable: attempt 1 on rage+iron_stomach path', attempts('unstoppable') === 1, `attempts=${attempts('unstoppable')}`);
  setDay(5); combinedUse('rage', 'iron_stomach');
  setDay(6); combinedUse('rage', 'iron_stomach');
  check('unstoppable: discovered via requires_any path', discovered('unstoppable'));
  check('unstoppable: damage_taken x0.7 via modTarget',
    Math.abs(Game.modTarget('combat.damage_taken', 100) - 70) < 0.001,
    `got ${Game.modTarget('combat.damage_taken', 100)}`);

  // E4: undiscovered synergies stay mechanically dead (gate holds both ways).
  check('fear_itself: undiscovered -> enemy_morale unmodified',
    Math.abs(Game.modTarget('combat.enemy_morale', 1) - 1) < 0.001,
    `got ${Game.modTarget('combat.enemy_morale', 1)}`);
  check('one_person_army: undiscovered -> solo_damage unmodified',
    Math.abs(Game.modTarget('combat.solo_damage', 1) - 1) < 0.001,
    `got ${Game.modTarget('combat.solo_damage', 1)}`);

  console.log(`\n${pass} ok, ${fail} FAIL (seed=${SEED})`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS FATAL:', e && e.stack || e); process.exit(2); });
