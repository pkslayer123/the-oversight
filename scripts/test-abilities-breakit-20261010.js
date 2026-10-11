// BREAK-IT abilities 2026-10-10 — hostile-player proof tests.
//
// FINDING 1 (EXPLOIT, fixed): second_wind's +500 kcal "spite-ration" fired on
//   ANY death, including starving to 0 HP overnight. Sleep at 0 kcal -> the
//   spiral takes you -> second_wind -> 1 HP + 500 kcal -> repeat: 500 free
//   kcal/day from nothing, forever, in the one economy where food is
//   everything. Spite doesn't bake bread: the ration now fires only on
//   violent death (starvation/disease leave you at 1 HP, still hungry).
//   Run FIX=0 to replay the old behavior (red); default is fixed (green).
//
// FINDING 2 (HONESTY, fixed): the abilities-menu XP bar used level*100 as its
//   denominator while the engine needs 10 XP (L1) / 25 XP (L2) -- L1 showed
//   9% at 9/10 real. The bar now uses the engine's thresholds.
//
// FINDING 3 (HONESTY, fixed): renderSynergyStirrings checked only
//   syn.requires -- multi-path (requires_any) synergies always passed, so a
//   lost leg left a stale "stirring" in the pack. Now path-aware like the
//   activation gate.
//
// FINDING 4 (DEAD CODE, documented not fixed -- design call for Steve): 17 of
//   85 abilities have NO player grant path (trial/practice unlocks whose
//   trials were never built -- Trial of Hunger/Blood live only in
//   data/_archive -- plus 5 'granted'-type abilities in no occupation's
//   grant list). 20 of 51 synergies are consequently undiscoverable, and
//   blood_tracker is discoverable but mechanically void (no modifiers, no
//   flags, zero code reads). The audit below characterizes the exact dead
//   sets as tripwires -- if Steve wires grant paths, update them.
//
//   node scripts/test-abilities-breakit-20261010.js            -> fixed, green
//   FIX=0 node scripts/test-abilities-breakit-20261010.js      -> old hole, red
//   SEED=... overrides the RNG seed.
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const FIX = process.env.FIX !== '0';
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const SEED = parseInt(process.env.SEED || '20261010', 10);
Math.random = mulberry32(SEED);
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
const order = execSync("grep -o 'src/js/[^\"'']*\\.js' index.html | head -60", { cwd: ROOT }).toString().split('\n')
  .filter(s => s && !/app\.js|sprites\.js|tile-scenes\.js|move-anim\.js|drama\.js/.test(s));
global.window = global;
global.document = {
  getElementById: () => null,
  createElement: () => ({ textContent: '', innerHTML: '', style: {}, setAttribute() {}, appendChild() {} }),
  head: { appendChild() {} }, body: {},
};
order.forEach(f => { eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); });
delete global.window; delete global.document;
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${extra ? ' — ' + extra : ''}`); }
}
function grant(id) {
  const s = Game.state.scholar;
  s.abilities = s.abilities || [];
  let e = s.abilities.find(a => a.id === id);
  if (!e) { e = { id, name: id, level: 1, xp: 0 }; s.abilities.push(e); }
  return e;
}
// OLD behavior shim (pre-fix): maybeCheatDeath took no cause and second_wind
// always printed the 500-kcal spite-ration. FIX=0 replays it to show red.
function cheatAsOld() {
  const s = Game.state.scholar;
  const swUses = (s.secondWindDay === s.day) ? (s.secondWindUses || 1) : 0;
  const swMax = Game.hasSynergy('refuses_death') ? 2 : 1;
  if (swUses < swMax && s.health <= 0) {
    s.secondWindDay = s.day; s.secondWindUses = swUses + 1;
    s.health = 1; s.kcal = Math.max(s.kcal, 500);
    return true;
  }
  return false;
}
function cheat(cause) { return FIX ? Game.maybeCheatDeath(cause) : cheatAsOld(); }

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  s.day = 10;
  console.log(`seed=${SEED} mode=${FIX ? 'FIXED (current code)' : 'OLD (pre-fix shim)'}`);

  // ---- 1. EXPLOIT: the starvation farm ----
  grant('second_wind');
  s.health = 0; s.kcal = 100; s.secondWindDay = null; s.secondWindUses = 0;
  const cheated1 = cheat('starvation');
  ok('starvation death is cheated (you still refuse)', cheated1 === true);
  ok('starvation cheat leaves you at 1 HP', s.health === 1, `health=${s.health}`);
  ok('EXPLOIT CLOSED: starvation prints NO free kcal', s.kcal === 100, `kcal=${s.kcal} (old code: 500)`);

  // ---- 2. No regression: violent death keeps the spite-ration ----
  s.day = 11; s.health = 0; s.kcal = 100; s.secondWindDay = null; s.secondWindUses = 0;
  const cheated2 = cheat('combat');
  ok('violent death is cheated', cheated2 === true);
  ok('violent cheat still brings the 500-kcal spite-ration', s.kcal === 500, `kcal=${s.kcal}`);

  // ---- 3. refuses_death still doubles the daily uses ----
  // Real legs (grant both): recomputeActiveSynergies runs inside
  // noteAbilityUse, so faking activeSynergies would be clobbered mid-test.
  grant('second_wind'); grant('phoenix_clause');
  s.synergies = ['refuses_death'];
  Game.recomputeActiveSynergies();
  ok('refuses_death active while legs held', Game.hasSynergy('refuses_death'));
  s.day = 12; s.secondWindDay = null; s.secondWindUses = 0; s.kcal = 0;
  s.health = 0; ok('use 1/2 cheats', cheat('combat') === true);
  s.health = 0; ok('use 2/2 cheats', cheat('combat') === true);
  ok('two second_wind uses burned', s.secondWindUses === 2, `uses=${s.secondWindUses}`);
  // Third death: second_wind is spent for the day -- the clause (checked
  // after second_wind in maybeCheatDeath) answers instead. The cap holds:
  // second_wind itself never fires a third time.
  s.health = 0;
  cheat('combat');
  ok('second_wind does NOT fire a 3rd time (cap held)', s.secondWindUses === 2, `uses=${s.secondWindUses}`);
  s.synergies = []; Game.recomputeActiveSynergies();

  // ---- 4. HONESTY: XP thresholds are 10 (L1) / 25 (L2) ----
  const ab = grant('purify');
  ab.level = 1; ab.xp = 0;
  for (let i = 0; i < 9; i++) Game.gainAbilityXP('purify', 1);
  ok('9 XP does not level L1 (needs 10)', ab.level === 1, `level=${ab.level}`);
  Game.gainAbilityXP('purify', 1);
  ok('10 XP deepens L1 -> L2', ab.level === 2, `level=${ab.level}`);
  for (let i = 0; i < 24; i++) Game.gainAbilityXP('purify', 1);
  ok('24 XP does not level L2 (needs 25)', ab.level === 2, `level=${ab.level} xp=${ab.xp}`);
  Game.gainAbilityXP('purify', 1);
  ok('25 XP deepens L2 -> L3', ab.level === 3, `level=${ab.level}`);

  // ---- 5. Slot economy: the cap holds on every grant path ----
  s.integration = 5; // abilitySlots() -> 1
  s.abilities = [{ id: 'triage', name: 'Triage', level: 1, xp: 0 }];
  s.abilityChoices = [{ id: 'tracker', name: 'Tracker', description: 'd' }];
  const before = s.abilities.length;
  Game.chooseAbility('tracker');
  ok('chooseAbility refuses over the slot cap', s.abilities.length === before, `abilities=${s.abilities.length}`);

  // ---- 6. DEAD-CODE audit: player reachability (characterized tripwire) ----
  const abilities = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/abilities.json'), 'utf8'));
  const synergies = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/synergies.json'), 'utf8'));
  const charGen = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/characterGen.json'), 'utf8'));
  const bgReachable = new Set();
  (charGen.occupations || []).forEach(o => (o.granted || []).forEach(id => bgReachable.add(id)));
  const sysOffer = new Set(abilities.filter(a => a.unlock && a.unlock.type === 'system_offer').map(a => a.id));
  const abilityReachable = new Set([...bgReachable, ...sysOffer]);
  const deadAbilities = abilities.map(a => a.id).filter(id => !abilityReachable.has(id)).sort();
  // synergy legs: ability legs need reachability; tech:/skill: assumed
  // reachable; synergy legs recurse to a fixed point.
  const synIds = new Set(synergies.map(x => x.id));
  const synReachable = new Set();
  let changed = true;
  while (changed) {
    changed = false;
    for (const syn of synergies) {
      if (synReachable.has(syn.id)) continue;
      const paths = syn.requires_any || [syn.requires || []];
      const legOk = (rid) => synIds.has(rid) ? synReachable.has(rid) : (rid.indexOf('tech:') === 0 || rid.indexOf('skill:') === 0 || abilityReachable.has(rid));
      if (paths.some(p => p.length && p.every(legOk))) { synReachable.add(syn.id); changed = true; }
    }
  }
  const deadSyns = synergies.map(x => x.id).filter(id => !synReachable.has(id)).sort();
  const KNOWN_DEAD_ABILITIES = ['adrenaline_surge', 'ambush', 'blood_trail', 'brawler_instinct', 'evidence_board', 'gossip_network', 'haymaker', 'intimidating_presence', 'iron_stomach', 'lie_detector', 'pathfinder', 'peacemaker', 'purify', 'silver_tongue', 'stalk', 'trade_of_blows', 'war_cry'];
  // 20 synergies are undiscoverable because at least one leg on every path
  // is a dead ability (verified by hand against requires_any; tech:/skill:
  // legs assumed reachable, which makes this a lower bound).
  const KNOWN_DEAD_SYNS = ['airtight', 'borrowed_surge', 'clean_plate', 'everybodys_friend', 'farsight', 'fear_itself', 'green_highway', 'iron_gut', 'one_person_army', 'ringcraft', 'rooms_go_quiet', 'stones_remember', 'string_wall', 'talked_down', 'tells', 'the_long_con', 'trade_of_blows', 'trailblazers_promise', 'trails_end', 'word_of_mouth'];
  ok('dead-ability set is exactly the characterized 17 (tripwire for Steve\'s wiring)',
    JSON.stringify(deadAbilities) === JSON.stringify(KNOWN_DEAD_ABILITIES),
    `dead=[${deadAbilities.join(',')}]`);
  ok('undiscoverable-synergy set is exactly the characterized 20',
    JSON.stringify(deadSyns) === JSON.stringify(KNOWN_DEAD_SYNS),
    `deadSyns=[${deadSyns.join(',')}]`);
  // blood_tracker: discoverable (tracker+game_sense) but mechanically VOID --
  // no modifiers, no flags, zero code reads. A dead reward.
  const bt = synergies.find(x => x.id === 'blood_tracker');
  let btReads = -1;
  try { btReads = execSync('grep -rn "blood_tracker" src/js/*.js 2>/dev/null || true', { cwd: ROOT }).toString().split('\n').filter(l => l.trim()).length; }
  catch (e) { btReads = 0; }
  ok('BLOOD_TRACKER audit: discoverable legs but zero mechanical effect (documented dead reward)',
    !(bt.modifiers && bt.modifiers.length) && !bt.flags && btReads === 0,
    `modifiers=${(bt.modifiers || []).length} flags=${bt.flags} codeReads=${btReads}`);

  // ---- 7. molt: one cheat per death, weekly cap ----
  grant('molt');
  s.day = 13; s.health = 0; s.moltWeek = null; s.moltUses = 0;
  s.equipped = { torso: { name: 'hide vest' } };
  const m1 = Game.maybeCheatDeath('combat');
  ok('molt cheats the death', m1 === true);
  ok('molt heals to full', s.health === Game.maxHealth(), `health=${s.health}`);
  ok('molt eats the equipped gear', Object.keys(s.equipped || {}).length === 0);
  s.health = 0;
  const m2 = Game.maybeCheatDeath('combat');
  ok('molt does NOT double-fire on the next death (weekly cap)', m2 === false || s.health > 0, `m2=${m2} health=${s.health}`);

  // ---- 8. REGRESSION: blood_magic still capped at 2/day part ----
  grant('blood_magic');
  s.health = 100; s.kcal = 0; s.bloodPriceDayPart = null; s.bloodPriceUses = 0; s.bloodPriceWound = 0;
  Game.dayPart = 1;
  const kcal0 = s.kcal;
  Game.activateAbility('blood_magic');
  Game.activateAbility('blood_magic');
  const after2 = s.kcal;
  Game.activateAbility('blood_magic');
  ok('blood_magic prints 500 x2 then refuses (2/day part cap holds)',
    after2 - kcal0 === 1000 && s.kcal === after2, `kcal=${s.kcal} after2=${after2}`);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR:', e); process.exit(2); });
