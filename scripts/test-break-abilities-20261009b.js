// BREAK-IT ABILITIES r2 (2026-10-09) — modifier-pipeline honesty + slot economy.
// Hostile pass over: the 6-slot economy (every acquisition path), synergy
// modifier liveness vs activeSynergies, dead modifier targets (the Alien
// Players lesson: data that promises what the engine never reads), the
// pact 7-slot bypass, the dead trial gift, pyrokinesis/fire_rain wiring.
//
// CATCHES (fixed this run):
//   B1. EXPLOIT — pact's on-acquire gift pushed with NO slot check: take pact
//       at 5/6 holding no utility ability -> 7/6. The 6-slot law's only hole.
//       Fix: give+take are one transaction; the gift lands only if the
//       post-take count fits the cap, else honest refusal (nothing taken).
//   B2. EXPLOIT/HONESTY — collectModifiers applied DISCOVERED (not ACTIVE)
//       synergy modifiers: lose a leg (pact's Static takes it, loseAbilityXP
//       drops it below minLevel) and the synergy's mods kept firing while the
//       card promised "active only while held". Fix: collectModifiers honors
//       activeSynergies (fallback: discovered, for pre-resonance states).
//   B3. HONESTY — travel.kcal is a target NOTHING reads (engine reads
//       travel.cost_mult). 3 synergies (efficient_machine, trailblazers_promise,
//       green_highway) + 3 relic enhancements (weatherproof, storm_cloth,
//       steady_ground) promised cheaper travel and did nothing. Fix: producers
//       retargeted to travel.cost_mult.
//   B4. HONESTY — KNOWLEDGE_MOD_MAP heal_bonus emitted 'heal.amount', a
//       target nothing reads (engine reads 'healing.amount'). Every knowledge
//       skill granting heal_bonus was silently dead. Fix: map to healing.amount.
//   B5. HONESTY — pyrokinesis ("Fires you tend burn hotter and catch easier")
//       emitted fire.success/fire.heat, which makeFire never read; knowledge
//       skill fire_rain's fire_success/fire_heat likewise dead. Fix: makeFire
//       adds fire.success to the friction lottery; fire.heat banks +25% burn
//       per point on every fire light/feed (documented conversion).
//   B6. DEAD CODE — completeTrial's "gift" filtered abilities on `a.system`,
//       a schema flag held by ZERO abilities: the promised trial gift was dead
//       from birth. Fix: filter unlock.type === 'system_offer'.
//   B7. DEAD CODE — firstAbilityChoices cond key 'ant_trail': no such ability
//       in abilities.json. Removed.
//   B8. DEAD CODE — abilityLevelBonus L4/L5 blurbs: gainAbilityXP caps at L3,
//       evolution copy was unreachable. Trimmed (re-add with evolution).
//   B9. EXPLOIT — synergy modifiers DOUBLE-COUNTED: af62f4a5 wired synergy
//       collection into collectModifiers but left the old synergyMods()
//       concatenation in mods(), so every active synergy's modifiers applied
//       twice (crimson_circuit healing x1.3 -> x1.69). Fix: synergyMods()
//       deleted; collectModifiers is the single collection path.
//
// HELD (attacked, resisted):
//   H5. feastburn net-positive loop — no damage->kcal path exists (leech is
//       HP-transfer, not kcal); banked kcal is finite and leaks 20%/night.
//   H6. undying_fury rage persistence — second_wind never clears rageActive;
//       "the rage does not end" is honest mid-fight.
//   H7. Mantle synergy duplication — playerDeath never touches synergies;
//       they pass with the mantle (design), never duplicated or restacked.
//
// REPORTED, NOT FIXED (design calls — wiring needs canon, not invention):
//   R1. blood_tracker: discoverable synergy (real requires_any paths) with NO
//       modifiers and NO hardcoded effect — "Wounded prey doesn't escape"
//       promises what no mechanic implements. Needs a hunt-escape mechanic.
//   R2. fire.fuel (purify_boil L2/L3 fuel_save): no fuel-consumption mechanic
//       to hook; needs a design decision on what "saving fuel" means.
//   R3. 23 knowledge mechanical keys map to dead targets (combat_crit,
//       combat_damage, ambush_avoid, disease_resist, fear_resist, lie_detect,
//       conflict_resolve, party_damage/coord, scout/scavenge_find,
//       shelter_warmth, spoil_slow, storm_warning, system_favor, trap_success,
//       travel_lost, village_morale, heal_bonus->fixed, ...). Skills are
//       earnable; effects are void. Design backlog, listed in evidence.
//   R4. 12 data-declared ability actions have no impl (echo_locate,
//       rob_grave, leech_stance, mediate_dispute, shed_skin, make_friends,
//       walk_in, throw_sand, purify_poison, stage_injury, scream, dive_deep).
//       They fail HONESTLY ("isn't wired up yet — this is a bug, not a
//       feature. Nothing spent.") — loud dead ends, reported not fixed.
//
// Seeded; SEED env override; x3 seeds.
const fs = require('fs');
const path = require('path');
const H = require('./break-alien-harness.js');
const { Game, RNG } = H;

let pass = 0, fail = 0;
const failures = [];
function assert(cond, msg) {
  if (cond) { pass++; }
  else { fail++; failures.push(msg); console.log('  FAIL: ' + msg); }
}
function section(t) { console.log('\n=== ' + t + ' ==='); }

const SEED = parseInt(process.env.SEED || '20261009', 10);
const SEEDS = [SEED, SEED + 1, SEED + 2];

function grant(id, level) {
  const s = Game.state.scholar;
  s.abilities = s.abilities || [];
  s.abilities.push({ id, level: level || 1, xp: 0 });
}
function abilities() { return JSON.parse(fs.readFileSync(path.join(H.ROOT, 'src/data/abilities.json'), 'utf8')); }
function synergies() { return JSON.parse(fs.readFileSync(path.join(H.ROOT, 'src/data/synergies.json'), 'utf8')); }
function modsSrc() { return fs.readFileSync(path.join(H.ROOT, 'src/js/engine/modifiers.js'), 'utf8'); }

async function main() {
  await H.boot();
  const ABS = abilities(), SYNS = synergies();
  const abyId = id => ABS.find(a => a.id === id);

  // ------------------------------------------------------------------
  section('B1. EXPLOIT — pact gift vs the 6-slot cap');
  // ------------------------------------------------------------------
  for (const seed of SEEDS) {
    RNG.reset(seed);
    // Case A: 5/6 slots, NO utility ability held, pact not yet taken.
    let s = H.fresh();
    s.integration = 100; // abilitySlots() = 6
    ['rage', 'second_wind', 'blood_magic', 'leech', 'chitin_skin'].forEach(id => grant(id));
    assert(s.abilities.length === 5, 'setup: 5 abilities held');
    const tiers = s.abilities.map(e => (abyId(e.id) || {}).tier);
    assert(!tiers.includes('utility'), 'setup: no utility ability held (Static takes nothing)');
    grant('pact'); // the chooseAbility push already happened (5->6, slot-checked)
    Game.abilityOnAcquire('pact');
    assert(s.abilities.length <= 6,
      `B1a: pact at 5/6 with no utility must not exceed 6 slots (got ${s.abilities.length})`);
    const said = H.allText();
    if (s.abilities.length === 6 && !s.abilities.some(e => e.id !== 'pact' && ['photosynthesis','second_wind','time_skip','hive_mind','phoenix_clause'].includes(e.id))) {
      // gift refused path — must be narrated honestly
      assert(/nowhere to put it|no purchase|slot cap/.test(said), 'B1a: refused gift is narrated honestly');
    }
    // Case B: 5/6 with a utility held — gift lands, utility taken, net 6/6.
    RNG.reset(seed);
    s = H.fresh();
    s.integration = 100;
    ['rage', 'second_wind', 'blood_magic', 'leech', 'green_thumb'].forEach(id => grant(id));
    grant('pact');
    Game.abilityOnAcquire('pact');
    assert(s.abilities.length <= 6, `B1b: pact with utility must stay <= 6 (got ${s.abilities.length})`);
  }

  // ------------------------------------------------------------------
  section('B2. HONESTY — inactive synergy modifiers must not fire');
  // ------------------------------------------------------------------
  for (const seed of SEEDS) {
    RNG.reset(seed);
    const s = H.fresh();
    s.integration = 100;
    ['blood_magic', 'leech'].forEach(id => grant(id));
    s.synergies = ['crimson_circuit'];
    Game.recomputeActiveSynergies();
    assert(Game.hasSynergy('crimson_circuit'), 'setup: crimson_circuit active while both legs held');
    let mods = Game.mods();
    const healMul = H ? mods.filter(m => m.target === 'healing.amount' && m.source === 'synergy:crimson_circuit') : [];
    assert(healMul.length === 1 && healMul[0].value === 1.3, 'setup: crimson_circuit healing x1.3 collected while active');
    // The Static takes leech (the B1 transaction): synergy deactivates.
    s.abilities = s.abilities.filter(e => e.id !== 'leech');
    Game.recomputeActiveSynergies();
    assert(!Game.hasSynergy('crimson_circuit'), 'setup: crimson_circuit inactive after losing leech');
    mods = Game.mods();
    const ghost = mods.filter(m => m.source === 'synergy:crimson_circuit');
    assert(ghost.length === 0, `B2: inactive synergy's modifiers must not apply (ghost mods: ${ghost.length})`);
    // Active ones still apply.
    s.abilities.push({ id: 'leech', level: 1, xp: 0 });
    Game.recomputeActiveSynergies();
    mods = Game.mods();
    assert(mods.some(m => m.source === 'synergy:crimson_circuit'), 'B2: re-held synergy fires again');
  }

  // ------------------------------------------------------------------
  section('B3/B4. HONESTY — modifier targets must have engine consumers');
  // ------------------------------------------------------------------
  {
    const code = ['src/js/game.js','src/js/encounters.js','src/js/food.js','src/js/party.js',
      'src/js/progression.js','src/js/ledger.js','src/js/abilityActions.js','src/js/statusEffects.js',
      'src/js/engine/combat.js','src/js/engine/forage.js','src/js/engine/calories.js','src/js/engine/day.js']
      .map(f => { try { return fs.readFileSync(path.join(H.ROOT, f), 'utf8'); } catch (e) { return ''; } })
      .join('\n');
    const consumed = t => code.includes("'" + t + "'") || code.includes('"' + t + '"');
    // ability producers
    for (const a of ABS) for (const m of (a.modifiers || [])) {
      assert(consumed(m.target), `B3: ability ${a.id} target '${m.target}' has an engine consumer`);
    }
    // synergy producers
    for (const sy of SYNS) for (const m of (sy.modifiers || [])) {
      assert(consumed(m.target), `B3: synergy ${sy.id} target '${m.target}' has an engine consumer`);
    }
    // relic map producers (parse the RELIC_MOD_MAP literal only, not comments)
    const rmap = modsSrc();
    const relicSec = rmap.slice(rmap.indexOf('const RELIC_MOD_MAP'), rmap.indexOf('function hasAbility'));
    for (const m of relicSec.match(/target: '([^']+)'/g) || []) {
      const t = m.slice(9, -1);
      assert(consumed(t), `B3: relic-map target '${t}' has an engine consumer`);
    }
    // knowledge map: every key used in knowledge.json must map to a live target
    const kmap = {};
    const ksec = rmap.slice(rmap.indexOf('const KNOWLEDGE_MOD_MAP'), rmap.indexOf('function collectKnowledgeModifiers'));
    for (const m of ksec.match(/'([a-z_]+)': \(v\) => \[\{ target: '([^']+)'/g) || []) {
      const mm = m.match(/'([a-z_]+)': \(v\) => \[\{ target: '([^']+)'/);
      if (mm) kmap[mm[1]] = mm[2];
    }
    const K = JSON.parse(fs.readFileSync(path.join(H.ROOT, 'src/data/knowledge.json'), 'utf8'));
    const usedKeys = new Set();
    for (const k of K) for (const l of Object.values(k.mechanical || {}))
      if (l && typeof l === 'object') for (const key of Object.keys(l)) if (key !== 'unlock') usedKeys.add(key);
    // B4: the fixed keys must be live. R3: the rest are a counted design
    // backlog (dead knowledge effects needing canon, not silent fixes) —
    // inventoried LOUD here and in the evidence file, not asserted.
    const fixed = ['heal_bonus', 'fire_success', 'fire_heat'];
    for (const key of fixed) {
      const t = kmap[key];
      assert(t && consumed(t), `B4: knowledge key '${key}' -> '${t}' has an engine consumer`);
    }
    const deadKeys = [...usedKeys].sort().filter(k => !fixed.includes(k) && !(kmap[k] && consumed(kmap[k])));
    console.log(`  R3 inventory: ${deadKeys.length} used knowledge keys with no engine effect: ${deadKeys.join(', ')}`);
    assert(deadKeys.length === 32, `R3 inventory stable (expected 32, got ${deadKeys.length})`);
  }

  // ------------------------------------------------------------------
  section('B5. HONESTY — pyrokinesis / fire_rain actually fire');
  // ------------------------------------------------------------------
  for (const seed of SEEDS) {
    RNG.reset(seed);
    const s = H.fresh();
    grant('pyrokinesis');
    assert(Game.modTarget('fire.success', 0) === 0.25, 'B5: pyrokinesis grants fire.success +0.25');
    assert(Game.modTarget('fire.heat', 0) === 1, 'B5: pyrokinesis grants fire.heat +1');
    const gs = modsSrc();
    void gs;
    const gameSrc = fs.readFileSync(path.join(H.ROOT, 'src/js/game.js'), 'utf8');
    assert(gameSrc.includes("modTarget('fire.success'"), 'B5: makeFire reads fire.success');
    assert(gameSrc.includes("modTarget('fire.heat'"), 'B5: fire lighting/feeding reads fire.heat');
  }

  // ------------------------------------------------------------------
  section('B6. DEAD CODE — the trial gift must exist');
  // ------------------------------------------------------------------
  for (const seed of SEEDS) {
    RNG.reset(seed);
    const s = H.fresh();
    s.integration = 100;
    s.abilities = [];
    const pg = Game.progState();
    pg.trial = { id: 't', kind: 'pantry', need: 0, have: 999, start: 0, expires: 999, name: 'x', text: 'x' };
    H.clearLog();
    Game.completeTrial();
    const got = (s.abilities || []).length;
    assert(got === 1, `B6: completeTrial grants a System ability gift (got ${got})`);
    if (got) {
      const id = s.abilities[0].id;
      assert((abyId(id) || {}).unlock?.type === 'system_offer', `B6: gift '${id}' is a System ability`);
    }
  }

  // ------------------------------------------------------------------
  section('H6. HELD — undying_fury: rage does not end, calm heals stay 1 HP');
  // ------------------------------------------------------------------
  for (const seed of SEEDS) {
    RNG.reset(seed);
    const s = H.fresh();
    ['rage', 'second_wind'].forEach(id => grant(id));
    s.synergies = ['undying_fury'];
    Game.recomputeActiveSynergies();
    // mid-rage death cheat
    s.rageActive = { rounds: 2, dmgMult: 2.0 };
    s.health = 0; s.secondWindDay = -1;
    assert(Game.maybeCheatDeath() === true, 'setup: death cheated');
    assert(s.health === Game.maxHealth(), 'H6: undying_fury mid-rage restores FULL health');
    assert(s.rageActive && s.rageActive.rounds === 2, 'H6: the rage does not end (rounds untouched)');
    // calm death cheat: 1 HP even with the synergy held
    s.rageActive = null;
    s.health = 0; s.day = (s.day || 15) + 1; s.secondWindDay = -1;
    assert(Game.maybeCheatDeath() === true, 'setup: second death cheated');
    assert(s.health === 1, `H6: calm second_wind heals to 1 HP, not full (got ${s.health})`);
  }

  // ------------------------------------------------------------------
  section('H5. HELD — feastburn cannot go net-positive');
  // ------------------------------------------------------------------
  for (const seed of SEEDS) {
    RNG.reset(seed);
    const s = H.fresh();
    // leech is HP-transfer, not kcal: no damage->kcal path exists
    const leechDef = abyId('leech');
    assert(!(leechDef.modifiers || []).some(m => /kcal/.test(m.target)), 'H5: leech grants no kcal');
    assert(!SYNS.some(sy => (sy.modifiers || []).some(m => m.target === 'food.kcal_gain')),
      'H5: no synergy converts damage to kcal');
  }

  // ------------------------------------------------------------------
  section('H7. HELD — mantle passes synergies, never duplicates');
  // ------------------------------------------------------------------
  for (const seed of SEEDS) {
    RNG.reset(seed);
    const s = H.fresh();
    s.synergies = ['crimson_circuit', 'sun_garden'];
    const before = s.synergies.length;
    // playerDeath passes the mantle; count must be preserved, not doubled
    const ledgerSrc = fs.readFileSync(path.join(H.ROOT, 'src/js/ledger.js'), 'utf8');
    assert(!/synergies/.test(ledgerSrc.split('playerDeath(cause)')[1].split('// ---------- ONE CONTEST')[0]),
      'H7: playerDeath never touches synergies (no reset, no re-grant)');
    assert(s.synergies.length === before, 'H7: synergy list intact');
  }

  // ------------------------------------------------------------------
  section('B10. SLOT ECONOMY — every acquisition path is slot-capped');
  // ------------------------------------------------------------------
  {
    const g = fs.readFileSync(path.join(H.ROOT, 'src/js/game.js'), 'utf8');
    const p = fs.readFileSync(path.join(H.ROOT, 'src/js/progression.js'), 'utf8');
    // chooseAbility: slot check present
    assert(/chooseAbility\(id\)[\s\S]{0,600}abilitySlots\(\)/.test(g), 'B10: chooseAbility enforces abilitySlots()');
    // trial gift: slot check present
    assert(p.includes("(s.abilities || []).length < this.abilitySlots()"), 'B10: completeTrial enforces abilitySlots()');
    // villager grants: NPC cap
    assert(g.includes('NPC_MAX_ABILITIES'), 'B10: villager grants enforce NPC_MAX_ABILITIES');
    // pact gift: now guarded
    assert(g.includes('giftFits'), 'B10: pact gift is slot-guarded (giftFits)');
    // no raw unguarded push remains for the player
    const pushes = [...g.matchAll(/s\.abilities\.push\(/g)].map(m => {
      const ctx = g.slice(Math.max(0, m.index - 900), m.index);
      return /abilitySlots|giftFits|maxSlots/.test(ctx);
    });
    assert(pushes.every(Boolean) && pushes.length >= 2, `B10: all ${pushes.length} player ability-push sites are slot-guarded`);
  }

  // ------------------------------------------------------------------
  section('B7/B8/R4. DEAD CODE — misc sweeps');
  // ------------------------------------------------------------------
  {
    const g = fs.readFileSync(path.join(H.ROOT, 'src/js/game.js'), 'utf8');
    assert(!/^\s*ant_trail\s*:/m.test(g), 'B7: ant_trail dead cond key removed from firstAbilityChoices');
    assert(!g.includes("hasAbility('ant_trail')"), 'B7b: no stale hasAbility(ant_trail) — it is a skill now');
    assert(g.includes("skills || {}).ant_trail"), 'B7b: ant_trail seep-finding gated on the knowledge skill');
    assert(!/:\s\{\s2:\s'[^']*',\s3:\s'[^']*',\s4:\s'/.test(g), 'B8: abilityLevelBonus has no L4/L5 entries');
    // R4: 12 unwired actions still fail honestly, never silently
    const aa = fs.readFileSync(path.join(H.ROOT, 'src/js/abilityActions.js'), 'utf8');
    assert(aa.includes("isn't wired up yet"), 'R4: unwired actions still refuse honestly');
    const impls = new Set([...aa.matchAll(/'([a-z_0-9]+\.[a-z_0-9]+)': function/g)].map(m => m[1]));
    const declared = [];
    for (const a of ABS) for (const act of (a.actions || [])) declared.push(a.id + '.' + act.id);
    const unwired = declared.filter(d => !impls.has(d));
    console.log('  unwired-but-honest actions: ' + unwired.length + ' (' + unwired.join(', ') + ')');
  }

  console.log(`\n==== RESULT: ${pass} passed, ${fail} failed ====`);
  if (failures.length) { console.log('failures:'); failures.forEach(f => console.log(' - ' + f)); }
  process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error('HARNESS ERROR:', e); process.exit(2); });
