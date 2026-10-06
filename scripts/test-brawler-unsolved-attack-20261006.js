// Regression: unseen killing marks the opening 'attack' unsolved (2026-10-06).
// The 'attack' crime is recorded at fight start, before witnesses are knowable.
// If the victim dies unseen, the village can't know about the attack either —
// same rule as unwitnessed murder (justiceHeat): no heat, crime stays on the
// books for the detective/moot path. A witnessed killing keeps its heat.
// Also: playerAttacks on a dead game (this.over) refuses instead of starting
// a phantom fight.
// Usage: node scripts/test-brawler-unsolved-attack-20261006.js (exit 1 on failure)
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/party.js', 'src/js/justice.js',
 'src/js/conversation.js', 'src/js/truth.js', 'src/js/journal.js', 'src/js/betrayal.js',
 'src/js/corpses.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

const failures = [];
const check = (name, cond, detail) => {
  console.log((cond ? 'PASS' : 'FAIL') + ' ' + name + (detail ? ' — ' + detail : ''));
  if (!cond) failures.push(name);
};
const endTurn = () => { if (Game.tbfight && Game.tbIsPlayerTurn()) { try { Game.tbPlayerEndTurn(); } catch (e) {} } };
const crimesOf = (vid) => Game.justiceState().crimes.filter(c => c.victim === vid);

function killVictim(vid) {
  Game.playerAttacks(vid);
  // witnesses must survive to the killing blow or the kill reads unwitnessed;
  // the test is about the marking, not witness durability
  for (const wf of Game.tbfight.fighters.filter(f => f.kind === 'villager')) { wf.hp = wf.maxHp = 500; }
  let guard = 0;
  while (Game.tbfight && guard++ < 60) {
    const foe = Game.tbfight.fighters.find(f => f.key !== 'p' && f.alive && !f.fled);
    if (!foe) break;
    foe._yielded = true; // fight to the death: no yield
    if (foe.hp > 15) { Game.tbPlayerStrike(foe.key); }
    else break;
    endTurn();
  }
  // deterministic killing blow (strikes are RNG; the test is about aftermath,
  // not strike damage). tbDamage runs the same killing-blow path; the fight
  // end-check normally happens in tbAfterPlayerAction after a strike.
  if (Game.tbfight) {
    const foe = Game.tbfight.fighters.find(f => f.key !== 'p' && f.alive && !f.fled);
    if (foe) Game.tbDamage(foe.key, 999, 'the last blow', 'p');
    try { Game.tbEndCheck(); } catch (e) {}
    endTurn();
  }
  return !Game.tbfight;
}

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const v = Game.state.village, me = Game.villagerId;
  // quiet the ambient-heat term: everyone trusts at 50
  for (const id of v.roster) { v.trust = v.trust || {}; v.trust[id] = 50; }
  const feed = () => { const s = Game.state.scholar; s.kcal = 2400; s.hydration = 100; s.health = 100; };
  feed();

  // ---- CASE 1: unseen killing ----
  const v1 = v.roster.find(id => id !== me);
  Game.playerAttacks(v1);
  const heatAfterAttack = Game.justiceHeat();
  check('attack crime counts heat while the fight is live', heatAfterAttack >= 20, 'heat=' + heatAfterAttack);
  // finish the kill solo: no party members, no witnesses
  if (!killVictim(v1)) { console.log('FAIL setup: case-1 fight did not end'); process.exit(1); }
  check('unseen kill ends the fight', !Game.tbfight);
  const c1 = crimesOf(v1);
  const atk1 = c1.find(c => c.type === 'attack');
  const mur1 = c1.find(c => c.type === 'murder');
  check('unseen kill records a murder crime', !!mur1, JSON.stringify(c1.map(c => c.type)));
  check('murder crime is unwitnessed', mur1 && mur1.witnessed === false);
  check('opening attack crime marked unsolved (witnessed:false)', atk1 && atk1.witnessed === false,
    'attack=' + JSON.stringify(atk1 && { witnessed: atk1.witnessed }));
  check('unseen killing leaves no heat (attack 0 + murder 0)',
    Game.justiceHeat() === 0, 'heat=' + Game.justiceHeat());
  check('crimes stay on the books for the detective path', c1.length >= 2);
  feed();

  // ---- CASE 2: witnessed killing keeps its heat ----
  const v2 = v.roster.find(id => id !== me && !crimesOf(id).length);
  const wit = v.roster.find(id => id !== me && id !== v2);
  Game.partyState().party = [wit]; // loyal witness joins the fight
  const heatBefore2 = Game.justiceHeat();
  killVictim(v2);
  const c2 = crimesOf(v2);
  const atk2 = c2.find(c => c.type === 'attack');
  const mur2 = c2.find(c => c.type === 'murder');
  check('witnessed kill: attack crime stays witnessed', atk2 && atk2.witnessed !== false,
    'attack=' + JSON.stringify(atk2 && { witnessed: atk2.witnessed }));
  check('witnessed kill: murder crime is witnessed', mur2 && mur2.witnessed !== false);
  check('witnessed killing keeps its heat', Game.justiceHeat() >= heatBefore2 + 20,
    `heat ${heatBefore2} -> ${Game.justiceHeat()}`);
  feed();

  // ---- CASE 3: the dead don't start fights ----
  Game.over = true;
  const r = Game.playerAttacks(v.roster.find(id => id !== me && !crimesOf(id).length) || me);
  check('playerAttacks refuses when the game is over', r === false && !Game.tbfight);
  Game.over = false;

  if (failures.length) { console.log('FAILURES:', failures.join('; ')); process.exit(1); }
  console.log('ALL UNSOLVED-ATTACK TESTS PASS');
})().catch(e => { console.error('TEST ERROR:', e.message); process.exit(1); });
