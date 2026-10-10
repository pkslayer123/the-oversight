// MISER BREAK-IT 2026-10-10 (run 2) — pharmacy strip, dose-merge, mid-combat costs.
// Hostile player vs the stash/armory/pharmacy/cache engine paths.
//
// BREAKS UNDER TEST:
//  A. PHARMACY STRIP: the stash stores items as {itemId, name} — donating a
//     dosed medicine (antibiotics, 3 doses) and taking it back returns a
//     BRICK: medType + doses are gone, so the affliction UI (which requires
//     i.medType && i.doses > 0) will never list it again. The say line claims
//     you took your medicine; the item is silently lobotomized. Same class
//     as the keepsake-strip bug fixed 2026-10-10 — the strip contract is
//     incomplete for medicine.
//  B. DOSE-MERGE LAUNDERING: stacksMatch ignores medType/doses, so a 1-dose
//     bottle merges into a 3-dose stack (doses silently destroyed — 4 real
//     doses become a 3-dose pool for 2 bottles), and donateMedicine splices
//     the whole merged stack into ONE stash entry (a bottle vanishes).
//  C. MID-COMBAT FREE ACTIONS: buryCache/digUpCache/takeFromCache and the
//     stash donate/take paths have no tbfight/over guard. tickAction no-ops
//     in combat, so burying mid-fight costs 0 ticks instead of 32 — the cost
//     the UI promises. Same class as the boilWater mid-fight guard
//     (survivalist 2026-10-09).
//
// SOFTLOCK attempt: bury-everything strand (bury all food, walk away, walk
// back — must always be recoverable; "Not here" must keep the cache).
// Usage: node scripts/test-miser-pharmacy-20261010.js
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
function freshGame() {
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  Game.state.scholar.mx = 4; Game.state.scholar.my = 4;
  Game.state.scholar.inventory = [];
  Game.state.scholar.villagerId = Game.generatedRoster[0].id;
  Game.state.scholar.insideHaven = true;
  Game.tbfight = null; Game.over = false;
  try { Game.map.px = Game.state.village.px ?? 4; Game.map.py = Game.state.village.py ?? 4; } catch (e) {}
  const access = Game.havenStoresAccess ? Game.havenStoresAccess() : 'inside';
  if (access === 'none') throw new Error('physical-stores gate closed in harness; cannot test stash paths');
}
function medBottle(doses) {
  return { itemId: 'med_antibiotics', name: 'Antibiotics (amoxicillin)', medType: 'antibiotics',
    doses, units: 1, kcalEach: 0, kg: 0.1 };
}
function usableAsMedicine(it) { return !!(it && it.medType && (it.doses || 0) > 0); }

// ---------- A. PHARMACY ROUND-TRIP ----------
freshGame();
{
  Game.state.scholar.inventory.push(medBottle(3));
  const idx = Game.state.scholar.inventory.findIndex(i => i.itemId === 'med_antibiotics');
  Game.donateMedicine(idx);
  const st = Game.stashState();
  ok('A1 medicine accepted into pharmacy', st.medicine.length === 1, `medicine=${st.medicine.length}`);
  Game.takeMedicine('med_antibiotics');
  const back = Game.state.scholar.inventory.find(i => i.itemId === 'med_antibiotics');
  ok('A2 medicine comes back at all', !!back, 'inventory lost it');
  ok('A3 medType survives the round-trip (BROKEN if bricked)',
    back && back.medType === 'antibiotics', `medType=${back && back.medType}`);
  ok('A4 doses survive the round-trip (BROKEN if bricked)',
    back && back.doses === 3, `doses=${back && back.doses}`);
  ok('A5 returned medicine is usable by the affliction UI (BROKEN if dead)',
    usableAsMedicine(back), `usable=${usableAsMedicine(back)}`);
}

// ---------- B. DOSE-MERGE ----------
freshGame();
{
  const full = medBottle(3), last = medBottle(1);
  ok('B1 mismatched-dose bottles do NOT merge (BROKEN if stacksMatch)',
    !Game.stacksMatch(full, last), '3-dose + 1-dose merged');
  ok('B2 identical fresh bottles do NOT merge either (dose pool is per-bottle)',
    !Game.stacksMatch(medBottle(3), medBottle(3)), 'two 3-dose bottles merged');
  // food merging unaffected: two identical berries still stack
  const b1 = { name: 'Berries', kcalEach: 20, units: 2, spoilDay: 99, kg: 0.05 };
  const b2 = { name: 'Berries', kcalEach: 20, units: 3, spoilDay: 99, kg: 0.05 };
  ok('B3 ordinary food still merges', Game.stacksMatch(b1, b2), 'food merge broke');
}

// ---------- C. MID-COMBAT / OVER GUARDS ----------
freshGame();
{
  Game.addMaterial('branch', 10);
  const clock0 = Game.state.scholar.actionClock || 0;
  Game.tbfight = { fighters: [] }; // mid-fight: tickAction no-ops
  const caches0 = Game.playerCaches().length;
  Game.buryCache('material', 'branch', 2);
  const buried = Game.playerCaches().length > caches0;
  const clock1 = Game.state.scholar.actionClock || 0;
  ok('C1 bury mid-fight is refused (BROKEN if free bury)',
    !buried, `cache created mid-fight, clock ${clock0}->${clock1}`);
  ok('C2 refusal says so honestly', /fight/i.test(lastSay()), `say="${lastSay()}"`);
  // dig + take-from-cache also guarded
  Game.tbfight = null;
  Game.buryCache('material', 'branch', 2);
  const cid = Game.playerCaches()[Game.playerCaches().length - 1].id;
  Game.tbfight = { fighters: [] };
  const inv0 = Game.state.scholar.inventory.length;
  Game.takeFromCache(cid, 0, 1);
  ok('C3 take-from-cache mid-fight is refused (BROKEN if free)',
    /fight/i.test(lastSay()), `say="${lastSay()}"`);
  Game.digUpCache(cid);
  ok('C4 dig-up mid-fight is refused (BROKEN if free)',
    /fight/i.test(lastSay()), `say="${lastSay()}"`);
  ok('C5 cache intact after refused mid-fight digs',
    Game.playerCaches().some(c => c.id === cid), 'cache vanished');
  // stash paths too
  Game.donateMaterial('branch', 1);
  ok('C6 stash donate mid-fight is refused', /fight/i.test(lastSay()), `say="${lastSay()}"`);
  // over guard
  Game.tbfight = null; Game.over = true;
  const c0 = Game.playerCaches().length;
  Game.buryCache('material', 'branch', 1);
  ok('C7 bury after death is refused', Game.playerCaches().length === c0, 'buried while dead');
  Game.over = false;
}

// ---------- D. SOFTLOCK: bury-everything strand ----------
freshGame();
{
  Game.state.scholar.inventory.push(
    { name: 'Dried meat', kcalEach: 400, units: 2, spoilDay: 9999, safe: true, kg: 0.3 });
  Game.buryCache('food', 0, 2);
  const cid = Game.playerCaches()[Game.playerCaches().length - 1].id;
  ok('D1 cache created', !!cid, 'no cache');
  // walk away: dig must refuse honestly and KEEP the cache
  try { Game.map.px += 2; } catch (e) {}
  Game.digUpCache(cid);
  ok('D2 wrong-node dig is honest', /Not here/.test(lastSay()), `say="${lastSay()}"`);
  ok('D3 cache retained after wrong-node dig',
    Game.playerCaches().some(c => c.id === cid), 'cache lost = strand risk');
  // walk back: full recovery
  try { Game.map.px -= 2; } catch (e) {}
  Game.digUpCache(cid);
  const meat = Game.state.scholar.inventory.find(i => i.name === 'Dried meat');
  ok('D4 buried food fully recoverable (no strand)',
    !!meat && meat.units === 2, `units=${meat && meat.units}`);
}

console.log(`\n${pass} passed, ${fail} failed`);

// ---------- F. NPC ARMORY/PHARMACY CONSUMPTION (post-fix only) ----------
if (!fail) {
  freshGame();
  const roster = (Game.state.village.roster || []).filter(id => id !== Game.state.scholar.villagerId);
  const npc = roster[0];
  // F1: NPC borrows ONE weapon from a 2-unit armory entry — the other stays
  Game.stashState().weapons = [{ itemId: 'hatchet', name: 'Hatchet', units: 2 }];
  try { Game.villagerGearUp(npc, true); } catch (e) { console.log('F1 harness err', e.message); }
  const wLeft = Game.stashState().weapons.find(e => e.itemId === 'hatchet');
  ok('F1 NPC borrow decrements units (BROKEN if whole entry devoured)',
    wLeft && wLeft.units === 1, `units=${wLeft && wLeft.units}`);
  // F2: hurt NPC uses ONE dose — the bottle survives
  freshGame();
  const roster2 = (Game.state.village.roster || []).filter(id => id !== Game.state.scholar.villagerId);
  const npc2 = roster2[0];
  Game.stashState().medicine = [{ itemId: 'medfoam_canister', name: 'Medfoam', medType: 'medfoam', doses: 2, units: 1 }];
  Game.state.village.health = Game.state.village.health || {};
  Game.state.village.health[npc2] = 50;
  try { Game.villagerHealCheck(npc2, 'Test NPC'); } catch (e) { console.log('F2 harness err', e.message); }
  const mLeft = Game.stashState().medicine.find(e => e.itemId === 'medfoam_canister');
  ok('F2 NPC heal consumes one dose (BROKEN if whole bottle devoured)',
    mLeft && mLeft.doses === 1, `doses=${mLeft && mLeft.doses}`);
  ok('F3 NPC actually healed', (Game.state.village.health[npc2] || 0) > 50,
    `hp=${Game.state.village.health[npc2]}`);
  console.log(`\n${pass} passed, ${fail} failed (with F)`);
}
process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error('HARNESS ERROR:', e); process.exit(2); });
