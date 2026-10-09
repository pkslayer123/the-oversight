// VILLAGER XP & SYSTEM GRANTS (Steve 2026-10-09): "System abilities aren't
// RNG, they are earned by villagers acting like players."
// Proof: (a) XP accrues from >=4 distinct real hook sites; (b) threshold
// grants are deterministic (same history -> same ability) x3 seeds;
// (c) a pure forager never earns a combat ability; (d) the villager-held
// phoenix path fires end-to-end with an EARNED phoenix (via the grant flow,
// never npcGrantAbility directly); (e) no RNG in the grant path.
// Seeded; SEED env override.
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ROOT = path.join(__dirname, '..');

function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const SEED = parseInt(process.env.SEED || '20261009', 10);

function boot(seed) {
  Math.random = mulberry32(seed);
  global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
  const order = execSync("grep -o 'src/js/[^\"'\"'\"']*\\.js' index.html | head -80", { cwd: ROOT }).toString().split('\n')
    .filter(s => s && !/app\.js|sprites\.js|tile-scenes\.js|move-anim\.js|drama\.js/.test(s));
  global.window = global;
  order.forEach(f => { try { eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); } catch (e) { console.log(`LOAD FAIL ${f}: ${e.message}`); } });
  delete global.window;
  const Game = globalThis.Scattering.Game;
  Game.say = function () {}; Game.sysSay = function () {}; Game.audioEvent = function () {};
  if (Game.drama === undefined) Game.drama = function () {};
  return Game;
}

let pass = 0, fail = 0;
const failures = [];
function assert(cond, msg) { if (cond) pass++; else { fail++; failures.push(msg); console.log('  FAIL: ' + msg); } }
function section(t) { console.log('\n=== ' + t + ' ==='); }

async function fresh(Game) {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  try { Game.ensureVillagerPositions(); } catch (e) {}
  const s = Game.state.scholar;
  s.day = 15; Game.state.systemArrived = true;
  s.hp = 100; s.maxHp = 100; s.kcal = 3000; s.trauma = 0;
  Game.state.over = false;
  return s;
}
function vids(Game) { return (Game.state.village.roster || []).filter(id => id !== Game.villagerId); }
function held(Game, vid) { return ((Game.state.village.npcAbilities || {})[vid] || []).slice(); }

async function main() {
  for (const seed of [SEED, SEED + 1, SEED + 2]) {
    section('seed ' + seed);
    const Game = boot(seed);
    await fresh(Game);
    const [va, vb, vc, vd] = vids(Game);

    // ---- (a) XP accrues from >=4 distinct real hook sites ----
    // A1. firesideTeaching -> social (teacher earns)
    const teacher = va;
    const plantId = (Game.data.plants || [])[0] && Game.data.plants[0].id;
    assert(plantId, 'a1: plant data exists');
    Game.state.village.sharedKnowledge = {};
    Game.state.village.sharedKnowledge[plantId] = { discoveredBy: teacher, day: 1 };
    Game.state.village.homecomingFireside = true; // bypass the ambient gate deterministically
    const socBefore = (Game.npcXp(teacher).social || 0);
    try { Game.firesideTeaching(true); } catch (e) { console.log('  firesideTeaching threw: ' + e.message); }
    assert(Game.npcXp(teacher).social > socBefore, 'a1: firesideTeaching grants social XP to the teacher');

    // A2. villagerHealCheck -> craft (camp healer earns)
    // (strip the scholar's care abilities: otherwise the PLAYER is the camp
    // healer and no villager earns -- correct behavior, wrong test setup)
    try {
      const careIds = ['triage', 'field_medicine', 'herbal_remedy'];
      const strip = arr => (arr || []).filter(e => careIds.indexOf((e && e.id) || e) < 0);
      Game.state.scholar.abilities = strip(Game.state.scholar.abilities);
      Game.state.scholar.backgroundAbilities = strip(Game.state.scholar.backgroundAbilities);
    } catch (e) {}
    const healer = vb, hurt = vc;
    const hp = Game.getPerson(healer); if (hp) hp.formerOccupation = 'nurse';
    Game.state.village.health = Game.state.village.health || {};
    Game.state.village.health[hurt] = 50;
    const craftBefore = (Game.npcXp(healer).craft || 0);
    try { Game.villagerHealCheck(hurt, 'Hurty'); } catch (e) { console.log('  villagerHealCheck threw: ' + e.message); }
    assert(Game.npcXp(healer).craft > craftBefore, 'a2: villagerHealCheck grants craft XP to the camp healer');

    // A3. fieldFight vKill -> combat (2 XP for the kill)
    const fighter = vd;
    Game.state.village.health[fighter] = 100;
    const cBefore = (Game.npcXp(fighter).combat || 0);
    let rec = null;
    try { rec = Game.fieldFight(fighter, { id: 'mite', hp: [1, 1], attack: { damage: [0, 0], name: 'nip' }, speed: 1, wave: 1 }, null, {}); }
    catch (e) { console.log('  fieldFight threw: ' + e.message); }
    assert(rec && rec.outcome === 'vKill', 'a3: fieldFight vs 1-HP mite is a vKill (got ' + (rec && rec.outcome) + ')');
    assert((Game.npcXp(fighter).combat || 0) >= cBefore + 2, 'a3: fieldFight vKill grants 2 combat XP');

    // A4. villageLives forage -> field (run the day; someone hauls)
    const fBefore = vids(Game).reduce((t, id) => t + (Game.npcXp(id).field || 0), 0);
    for (let i = 0; i < 30; i++) { try { Game.villageLives(); } catch (e) {} }
    const fAfter = vids(Game).reduce((t, id) => t + (Game.npcXp(id).field || 0), 0);
    assert(fAfter > fBefore, 'a4: 30x villageLives accrues field XP across the roster');

    // ---- (b) deterministic threshold grants, kit order ----
    const fe = vids(Game).find(id => !(Game.vpOf(id) || {}).dead) || va;
    for (let i = 0; i < 3; i++) Game.villagerGainXP(fe, 'field', 1, 'test');
    assert(Game.npcHasAbility(fe, 'game_sense'), 'b1: 3 field XP -> game_sense (kit[0])');
    for (let i = 0; i < 5; i++) Game.villagerGainXP(fe, 'field', 1, 'test'); // 8 total
    assert(Game.npcHasAbility(fe, 'field_dressing'), 'b2: 8 field XP -> field_dressing (kit[1])');
    for (let i = 0; i < 8; i++) Game.villagerGainXP(fe, 'field', 1, 'test'); // 16 total
    assert(Game.npcHasAbility(fe, 'stalk'), 'b3: 16 field XP -> stalk (kit[2])');
    assert(JSON.stringify(held(Game, fe).slice(0, 3)) === JSON.stringify(['game_sense', 'field_dressing', 'stalk']),
      'b4: grants follow fixed kit order exactly');

    // ---- (c) pure forager never earns combat ----
    const pure = vids(Game).find(id => id !== fe && !(Game.vpOf(id) || {}).dead) || vb;
    for (let i = 0; i < 64; i++) Game.villagerGainXP(pure, 'field', 1, 'test');
    const ph = held(Game, pure);
    const combatKit = Game.NPC_ABILITY_KITS.combat;
    assert(ph.filter(id => combatKit.indexOf(id) >= 0).length === 0, 'c1: 64 field XP grants zero combat-kit abilities');
    assert((Game.npcXp(pure).combat || 0) === 0, 'c2: forager combat XP stays 0');
    assert(ph.length === 5, 'c3: 5 field grants at 64 XP (thresholds 3/8/16/32/64), got ' + ph.length);

    // ---- (d) villager-held phoenix end-to-end, EARNED ----
    const phx = vids(Game).find(id => id !== fe && id !== pure && !(Game.vpOf(id) || {}).dead) || vc;
    // earn it: 32 combat XP through the real grant flow (never npcGrantAbility)
    for (let i = 0; i < 32; i++) Game.villagerGainXP(phx, 'combat', 1, 'test');
    assert(Game.npcHasAbility(phx, 'phoenix_clause'), 'd1: 32 combat XP earns phoenix_clause via System grant');
    const sayLines = [];
    const _say = Game.say; Game.say = t => { sayLines.push(String(t)); };
    let threw = null;
    try { Game.removeVillager(phx, 'killed'); } catch (e) { threw = e; }
    Game.say = _say;
    assert(!threw, 'd2: removeVillager on the clause-holder does not throw');
    const phoenixMentioned = sayLines.some(t => /phoenix/i.test(t));
    assert(phoenixMentioned, 'd3: the clause-holder death fires the phoenix path (say log mentions phoenix)');
    assert(!Game.npcHasAbility(phx, 'phoenix_clause'), 'd4: the clause is spent');
    assert((Game.state.village.roster || []).indexOf(phx) >= 0, 'd5: the holder is NOT quietly removed -- the link holds their death');
    assert(Game.state.phoenixLink || sayLines.some(t => /burn/i.test(t)), 'd6: link held (choice/struggle) or burn resolved');

    // ---- (e) no RNG in the grant path ----
    const g1 = vids(Game).find(id => !(Game.vpOf(id) || {}).dead && held(Game, id).length === 0) || va;
    const realRandom = Math.random;
    Math.random = () => 0.0;
    for (let i = 0; i < 16; i++) Game.villagerGainXP(g1, 'social', 1, 'test');
    const grantsZero = held(Game, g1).slice();
    // reset: fresh xp record for a second villager
    const g2 = vids(Game).find(id => id !== g1 && !(Game.vpOf(id) || {}).dead && held(Game, id).length === 0) || vb;
    Math.random = () => 0.999999;
    for (let i = 0; i < 16; i++) Game.villagerGainXP(g2, 'social', 1, 'test');
    const grantsOne = held(Game, g2).slice();
    Math.random = realRandom;
    assert(JSON.stringify(grantsZero) === JSON.stringify(grantsOne),
      'e1: Math.random 0.0 vs 0.999999 -> identical grants ' + JSON.stringify(grantsZero));
    assert(JSON.stringify(grantsZero.slice(0, 3)) === JSON.stringify(['peacemaker', 'mediator', 'scream_cheese']),
      'e2: social kit order is fixed priority');
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) { console.log('FAILURES:\n' + failures.join('\n')); process.exit(1); }
}

main().catch(e => { console.error('HARNESS FAIL:', e); process.exit(2); });
