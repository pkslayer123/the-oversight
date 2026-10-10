// MISER BREAK-IT 2026-10-10 — take-first trust farms + keepsake/ash honesty.
// Hostile player vs the stash/armory/pharmacy grant rules.
//
// BREAKS UNDER TEST:
//  A. TAKE-FIRST TRUST FARM (tools/weapons/medicine): the 2026-10-09 fix
//     killed donate->take (+2/-5) but left take->donate open. Take someone
//     else's deposited item, "donate" it back: the unconditional +2 fires
//     every cycle and the take-back sting never does (takes always lead
//     gives). Measured pre-fix: +2 trust/cycle, infinite.
//  B. MATERIAL 0-BAND GRANT: digging out of material debt (net -10 -> +5)
//     minted +1 for crossing the 0 band — repaying what you took is not a
//     donation. The comment says grants happen on 10-unit NET bands; the
//     formula granted on the 0-band too.
//  C. KEEPSAKE TOOL DONATION: isStashableTool/donateTool never checked
//     keepsake (armory/pharmacy do). The stash strips items to
//     {itemId, name} — donating a sentimental tool DESTROYED its sentimental
//     charge. The pack UI even offered the Stash button (Drop hides for
//     keepsakes; Stash showed).
//  D. ASH-HONOR DOUBLE GRANT: say line + ontology promise +8; the engine
//     stacked the ordinary +2 underneath (+10).
//
// SOFTLOCK/HONESTY regression checks: buryCache 0-unit coercion (exactly 1,
// finite, item consumed), takeFromCache stale index message, digUpCache
// wrong-node message + cache retained, "Take 5" heavy-pack honesty,
// anonymous skim ledger text.
// Usage: node scripts/test-miser-takefirst-20261010.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

// SEED BEFORE EVAL (AGENTS.md 2026-10-08): modules capture Math.random at load.
let _s = 0xBEEF;
function mulberry32(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
Math.random = mulberry32(_s);

global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
// equipment.js needs window at load; delete before playing (sync combat path).
global.window = global;
const ORDER = ['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
  'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
  'src/js/game.js', 'src/js/encounters.js', 'src/js/conversation.js', 'src/js/convo-mood.js',
  'src/js/convoTopics.js', 'src/js/convo-wants.js', 'src/js/convo-dialogue.js', 'src/js/convo-beats.js',
  'src/js/convo-scene.js', 'src/js/examine.js', 'src/js/equipment.js', 'src/js/journal.js',
  'src/js/party.js', 'src/js/party-formal.js', 'src/js/truth.js', 'src/js/contests.js',
  'src/js/contestEngine.js', 'src/js/alienPlayers.js', 'src/js/storage.js', 'src/js/perceive.js',
  'src/js/carexplore.js', 'src/js/justice.js', 'src/js/food.js', 'src/js/betrayal.js',
  'src/js/corpses.js', 'src/js/lifeseed.js', 'src/js/progression.js', 'src/js/ledger.js',
  'src/js/abilityActions.js', 'src/js/monsterBehaviors.js', 'src/js/statusEffects.js',
  'src/js/villager-agency.js', 'src/js/fieldFights.js', 'src/js/villager-objectives.js',
  'src/js/codex-people.js', 'src/js/membership.js', 'src/js/hierarchy.js',
  'src/js/debug-scenarios.js', 'src/js/build.js'];
ORDER.forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
delete global.window;
const Game = globalThis.Scattering.Game;

async function main() {
await Game.init();

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}${extra ? ': ' + extra : ''}`); }
}
function lastSay() { return (Game.log || []).slice(-1)[0] || ''; }
function trustOf() {
  const v = Game.state.village, vid = Game.state.scholar.villagerId;
  return (v.trust || {})[vid] === undefined ? 15 : v.trust[vid];
}
function freshGame() {
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  Game.state.scholar.mx = 4; Game.state.scholar.my = 4;
  Game.state.scholar.inventory = [];
  Game.state.scholar.villagerId = Game.generatedRoster[0].id;
  Game.state.scholar.insideHaven = true;
  try { Game.map.px = Game.state.village.px ?? 4; Game.map.py = Game.state.village.py ?? 4; } catch (e) {}
  const access = Game.havenStoresAccess ? Game.havenStoresAccess() : 'inside';
  if (access === 'none') throw new Error('physical-stores gate closed in harness; cannot test stash paths');
}
function invIdx(id) {
  return (Game.state.scholar.inventory || []).findIndex(i => (i.itemId || i.id) === id);
}

// ---------- A. TAKE-FIRST TRUST FARM ----------
function takeFirstCycle(section) {
  // section: 'tool' | 'weapon' | 'medicine'
  freshGame();
  const id = section === 'tool' ? 'multitool' : section === 'weapon' ? 'kitchen_knife' : 'field_dressing_kit';
  const name = section === 'tool' ? 'Multitool' : section === 'weapon' ? 'Kitchen knife' : 'Field dressing kit';
  const st = Game.stashState();
  const pile = section === 'tool' ? st.tools : section === 'weapon' ? st.weapons : st.medicine;
  pile.push({ itemId: id, name }); // someone ELSE's deposit — the player never gave this
  const t0 = trustOf();
  for (let k = 0; k < 5; k++) {
    if (section === 'tool') Game.takeTool(id);
    else if (section === 'weapon') Game.takeWeapon(id);
    else Game.takeMedicine(id);
    const idx = invIdx(id);
    if (idx < 0) { ok(`take-first ${section}: item reached pack`, false, 'take failed'); return; }
    if (section === 'tool') Game.donateTool(idx);
    else if (section === 'weapon') Game.donateWeapon(idx);
    else Game.donateMedicine(idx);
  }
  const t1 = trustOf();
  ok(`take-first ${section} farm dead (no trust minted)`, (t1 - t0) <= 0, `delta=${t1 - t0} over 5 cycles`);
}
takeFirstCycle('tool');
takeFirstCycle('weapon');
takeFirstCycle('medicine');

// honest donations still rewarded: first gift of your own item grants +2
for (const [section, id] of [['tool', 'multitool'], ['weapon', 'kitchen_knife'], ['medicine', 'field_dressing_kit']]) {
  freshGame();
  Game.state.scholar.inventory.push({ itemId: id, name: id, units: 1, kg: 0.5 });
  const t0 = trustOf();
  const idx = invIdx(id);
  if (section === 'tool') Game.donateTool(idx);
  else if (section === 'weapon') Game.donateWeapon(idx);
  else Game.donateMedicine(idx);
  ok(`honest ${section} donation still +2`, trustOf() - t0 === 2, `delta=${trustOf() - t0}`);
}

// take-back sting still fires on your own gift
freshGame();
Game.state.scholar.inventory.push({ itemId: 'multitool', name: 'Multitool', units: 1, kg: 0.5 });
{
  const t0 = trustOf();
  Game.donateTool(invIdx('multitool'));
  Game.takeTool('multitool');
  ok('own tool take-back still -3 net (+2/-5)', trustOf() - t0 === -3, `delta=${trustOf() - t0}`);
}

// ---------- B. MATERIAL 0-BAND GRANT ----------
freshGame();
{
  const st = Game.stashState();
  st.materials.branch = 20; // NPC-contributed stock; the player gave nothing
  const t0 = trustOf();
  Game.takeMaterial('branch', 10); // net -10 (revoke -1 for dipping below 0)
  const tDip = trustOf();
  Game.addMaterial('branch', 15); // gathered honestly
  Game.donateMaterial('branch', 15); // net -10 -> +5
  const t1 = trustOf();
  ok('material debt dip costs the band revoke', tDip === t0 - 1, `dip delta=${tDip - t0}`);
  ok('no 0-band grant when digging out of debt', t1 === tDip, `grant delta=${t1 - tDip} (want 0)`);
}
freshGame();
{
  Game.addMaterial('branch', 20);
  const t0 = trustOf();
  Game.donateMaterial('branch', 20); // net 0 -> +20: bands 10, 20
  ok('honest 20-branch donation still +2', trustOf() - t0 === 2, `delta=${trustOf() - t0}`);
}

// ---------- C. KEEPSAKE TOOL DONATION ----------
freshGame();
{
  const keep = { itemId: 'multitool', name: 'Multitool', units: 1, kg: 0.5, sentimental: true };
  Game.state.scholar.inventory.push(keep);
  ok('isStashableTool refuses keepsake (UI hides Stash)', Game.isStashableTool(keep) === false);
  const n0 = Game.state.scholar.inventory.length;
  Game.donateTool(invIdx('multitool'));
  const still = Game.state.scholar.inventory.length === n0 &&
    Game.state.scholar.inventory[invIdx('multitool')].sentimental === true;
  ok('keepsake tool donation refused, item intact', still, `say="${lastSay()}"`);
  ok('refusal is honest', /Not the village's/.test(lastSay()), `say="${lastSay()}"`);
}
freshGame();
{
  const kw = { itemId: 'kitchen_knife', name: 'Kitchen knife', units: 1, kg: 0.5, sentimental: true };
  ok('isStashableWeapon refuses keepsake (UI hides Armory)', Game.isStashableWeapon(kw) === false);
}

// ---------- D. ASH-HONOR GRANT HONESTY ----------
freshGame();
{
  Game.state.scholar.inventory.push({ itemId: 'multitool', name: 'Multitool', units: 1, kg: 0.5, ashOf: 'dead123' });
  const t0 = trustOf();
  Game.donateTool(invIdx('multitool'));
  const d = trustOf() - t0;
  ok('ash-honor grants +8 as said (not +10)', d === 8, `delta=${d}`);
  ok('ash-honor say line present', (Game.log || []).some(l => /Trust \+8/.test(l)), `tail="${(Game.log || []).slice(-3).join(' | ')}"`);
}

// ---------- SOFTLOCK / HONESTY REGRESSIONS ----------
// 0-unit food bury: coerces to exactly 1 finite unit, item consumed (no infinite)
freshGame();
{
  Game.state.scholar.inventory.push({ name: 'Berries', kcalEach: 50, units: 0, kg: 0.1, spoilDay: 9999 });
  Game.buryCache('food', 0, 1);
  const c = Game.playerCaches()[Game.playerCaches().length - 1];
  const cu = c && c.items[0] && c.items[0].units;
  ok('0-unit bury coerces to exactly 1 finite unit', cu === 1 && isFinite(cu), `units=${cu}`);
  ok('0-unit item consumed by bury', !Game.state.scholar.inventory.some(i => i.name === 'Berries'));
}
// stale cache index: honest message, no silent null
freshGame();
{
  Game.addMaterial('branch', 3);
  Game.buryCache('material', 'branch', 3);
  const c = Game.playerCaches()[Game.playerCaches().length - 1];
  Game.takeFromCache(c.id, 99, 1);
  ok('stale cache index says so', /Nothing there to take/.test(lastSay()), `say="${lastSay()}"`);
}
// dig at the wrong node: honest message, cache retained
freshGame();
{
  Game.addMaterial('branch', 2);
  Game.buryCache('material', 'branch', 2);
  const c = Game.playerCaches()[Game.playerCaches().length - 1];
  Game.map.px = 99;
  Game.digUpCache(c.id);
  ok('wrong-node dig is honest', /Not here/.test(lastSay()), `say="${lastSay()}"`);
  ok('wrong-node dig retains cache', Game.playerCaches().some(x => x.id === c.id));
  Game.map.px = 4;
}
// "Take 5" with a heavy pack: takes what fits, says the true number
freshGame();
{
  const st = Game.stashState();
  st.materials.branch = 10;
  Game.addMaterial('stone', 52); // 15.6kg + 2kg water = 17.6 of 20kg: fits 4 of 5 branches
  const t0 = trustOf();
  Game.takeMaterial('branch', 5);
  const got = Game.materialCount('branch');
  ok('heavy pack takes only what fits', got === 4, `got=${got}`);
  ok('heavy take says the true number', /Took 4/.test(lastSay()), `say="${lastSay()}"`);
  void t0;
}
// anonymous skim ledger: "someone", never blaming the player
freshGame();
{
  Game.stashLog('take', 'Branch', 2, null);
  const txt = Game.stashLedgerText(5);
  ok('anonymous skim ledger says someone', /someone took 2× Branch/.test(txt), `txt="${txt}"`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error('HARNESS ERROR:', e); process.exit(2); });
