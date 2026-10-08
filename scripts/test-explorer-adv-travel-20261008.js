#!/usr/bin/env node
// ADVERSARIAL (explorer loop 2026-10-08): travel/map-movement attack surface.
//   V3. travelTo guards: OOB coords fuzz, unlisted targets, stale-blockage race.
//   V4. tryNodeExit in-combat null: reachable? silent? (only caller = app.js dpad, non-combat branch)
//   V5. stranded: ring node with blockages on all 4 exits — always a way through?
//   V7. checkVillageProximity: arrive -> leave -> return = exactly one "NOW" announcement;
//       approach within 2 without landing; combat-push travelTo path.
//   V9. world edge: rim bump says once per game, no crash via negative coords.
// Seeded RNG installed BEFORE eval (modules capture Math.random at load).
// Run: node scripts/test-explorer-adv-travel-20261008.js [SEED]
const fs = require('fs');
const path = require('path');
const WS = '/home/hatch/workspace/worktrees/playtest-explorer';
const SEED = parseInt(process.argv[2] || process.env.SEED || '20261008', 10);
(function seed() {
  let a = SEED >>> 0;
  Math.random = function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
})();
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(WS, f), 'utf8'))) });
global.window = global;
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/conversation.js', 'src/js/convo-mood.js',
 'src/js/convoTopics.js', 'src/js/convo-wants.js', 'src/js/convo-dialogue.js', 'src/js/convo-beats.js',
 'src/js/convo-scene.js', 'src/js/examine.js', 'src/js/equipment.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/party-formal.js', 'src/js/truth.js', 'src/js/contests.js', 'src/js/alienPlayers.js', 'src/js/storage.js',
 'src/js/perceive.js', 'src/js/carexplore.js', 'src/js/justice.js', 'src/js/food.js',
 'src/js/betrayal.js', 'src/js/corpses.js', 'src/js/lifeseed.js', 'src/js/progression.js',
 'src/js/ledger.js', 'src/js/abilityActions.js', 'src/js/monsterBehaviors.js', 'src/js/statusEffects.js',
 'src/js/villager-agency.js', 'src/js/codex-people.js', 'src/js/membership.js', 'src/js/hierarchy.js',
 'src/js/debug-scenarios.js', 'src/js/build.js'
].forEach(f => eval(fs.readFileSync(path.join(WS, f), 'utf8')));
delete global.window;
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
const check = (name, cond, detail) => {
  if (cond) { pass++; console.log(`   [OK] ${name}`); }
  else { fail++; console.log(`   [FAIL] ${name}${detail ? ' — ' + detail : ''}`); }
};
const saysMatching = (re) => (Game.log || []).filter(m => re.test(String(m))).length;

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  console.log('=== test-explorer-adv-travel-20261008 (seed ' + SEED + ') ===');
  const sx = Game.map.px, sy = Game.map.py;

  // V3a: OOB fuzz — must return null, never throw
  let threw = null;
  const oob = [[-1, 3], [9, 4], [4, -1], [4, 9], [9, 9], [-5, -5], [4, 99]];
  for (const [x, y] of oob) {
    try { const r = Game.travelTo(x, y); if (r !== null) threw = `travelTo(${x},${y}) returned non-null`; }
    catch (e) { threw = `travelTo(${x},${y}) threw: ${e.message}`; }
  }
  check('V3a travelTo OOB coords -> null, no throw', threw === null, threw);
  check('V3a player unmoved by OOB attempts', Game.map.px === sx && Game.map.py === sy,
    `now at (${Game.map.px},${Game.map.py})`);

  // V3b: unlisted target (d=2 unrevealed is not a travelTarget) -> null
  const unlisted = Game.travelTargets().find(t => t.d >= 2 && !Game.tileAt(t.x, t.y).revealed);
  let r3b = 'no-probe';
  if (unlisted) { try { r3b = Game.travelTo(unlisted.x, unlisted.y); } catch (e) { r3b = 'threw:' + e.message; } }
  check('V3b travelTo unlisted (d=2 unrevealed) target -> null', r3b === null || r3b === 'no-probe',
    r3b === 'no-probe' ? 'no unrevealed d>=2 target this seed' : `got ${JSON.stringify(r3b)}`);

  // V3c: stale-blockage race — blockage appears after targets computed; travelTo
  // must refuse WITH feedback (block object + say), never silently, never travel.
  const ex = sx + 1, ey = sy; // d=1 east, always listed
  Game.tileAt(ex, ey).blockFrom = { dx: -1, dy: 0, type: 'fallen_tree' };
  const logBefore = (Game.log || []).length;
  let r3c = null;
  try { r3c = Game.travelTo(ex, ey); } catch (e) { r3c = { threw: e.message }; }
  const saidBlock = (Game.log || []).slice(logBefore).join(' ');
  check('V3c stale blockage -> block object with kind', r3c && r3c.kind === 'blockage',
    `got ${JSON.stringify(r3c && r3c.kind)}`);
  check('V3c stale blockage -> player told why (no silent refusal)', /fallen tree/i.test(saidBlock),
    `log: "${saidBlock.slice(0, 80)}"`);
  check('V3c stale blockage -> no travel happened', Game.map.px === sx && Game.map.py === sy,
    `now at (${Game.map.px},${Game.map.py})`);
  delete Game.tileAt(ex, ey).blockFrom;

  // V4: tryNodeExit in combat -> null. Monkeypatch inCombat to simulate.
  const realInCombat = Game.inCombat;
  Game.inCombat = () => true;
  let r4 = 'unset';
  try { r4 = Game.tryNodeExit(1, 0); } catch (e) { r4 = 'threw:' + e.message; }
  Game.inCombat = realInCombat;
  check('V4 tryNodeExit in combat -> null (no throw)', r4 === null, `got ${JSON.stringify(r4)}`);
  // static: the only live caller is the app.js dpad handler, which branches on
  // inCombat() BEFORE reaching tryNodeExit — so the null is unreachable dead defense.
  const appSrc = fs.readFileSync(path.join(WS, 'src/js/app.js'), 'utf8');
  const callSites = (appSrc.match(/Game\.tryNodeExit\(/g) || []).length;
  const gameSrc = fs.readFileSync(path.join(WS, 'src/js/game.js'), 'utf8');
  const internalCallers = (gameSrc.match(/[^.]tryNodeExit\(/g) || []).length;
  check('V4 single caller (app.js dpad)', callSites === 1 && internalCallers === 1,
    `app.js calls=${callSites} internal=${internalCallers}`);

  // V5: STRANDED attempt — blockFrom on all 4 orthogonal exits facing the player.
  // Honest design: every blocked tap must refuse WITH feedback (blockage card +
  // say), and there must always be a way through (clear at 0 kcal, or jump the
  // ring: travelTo is a direct hop, and post-arrival reveal() exposes d=2 tiles).
  const dirs = [[1, 0, -1, 0], [-1, 0, 1, 0], [0, 1, 0, -1], [0, -1, 0, 1]];
  for (const [dx, dy, bdx, bdy] of dirs) {
    const t = Game.tileAt(sx + dx, sy + dy);
    if (t) t.blockFrom = { dx: bdx, dy: bdy, type: 'rubble' };
  }
  // blocked tap: honest refusal, not silence, not travel
  const logB = (Game.log || []).length;
  const rBlocked = Game.travelTo(sx + 1, sy);
  const saidB = (Game.log || []).slice(logB).join(' ');
  check('V5 blocked exit refuses honestly (block obj + reason, no travel)',
    rBlocked && rBlocked.kind === 'blockage' && /rubble/i.test(saidB) && Game.map.px === sx,
    `kind=${rBlocked && rBlocked.kind} said="${saidB.slice(0, 50)}"`);
  // post-arrival reveal exposes the ring-jump: d>=2 targets beyond the blockade
  Game.reveal(sx, sy);
  const targets = Game.travelTargets();
  const far = targets.find(t => t.d >= 2 && !Game.travelBlockage(t.x, t.y));
  check('V5 ring of blockages still leaves a way out (revealed d>=2, unblocked)', !!far,
    far ? `(${far.x},${far.y}) d=${far.d}` : `${targets.length} targets`);
  // 0-kcal clearBlockage always works — never stranded even broke and starving
  Game.state.scholar.kcal = 0;
  const clearTarget = { x: sx + 1, y: sy };
  let r5 = null;
  try { r5 = Game.clearBlockage(clearTarget.x, clearTarget.y); } catch (e) { r5 = 'threw:' + e.message; }
  check('V5 clearBlockage works at 0 kcal (never stranded)', !!r5 && !Game.tileAt(clearTarget.x, clearTarget.y).blockFrom,
    `returned ${JSON.stringify(!!r5)}`);
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const t = Game.tileAt(sx + dx, sy + dy); if (t && t.blockFrom) delete t.blockFrom;
  }

  // V7: village proximity — exactly one "NOW" announcement across arrive/leave/return.
  Game.state.otherVillages = Game.state.otherVillages || [];
  const vv = { x: sx + 2, y: sy, name: 'Test Hollow', population: 8, day: 0 };
  Game.state.otherVillages.push(vv);
  const smokeBefore = saysMatching(/smoke on the horizon/);
  Game.travelTo(sx + 1, sy);          // approach within 2 (dist 1), no landing on tile
  const smokeAfterArrive = saysMatching(/smoke on the horizon/);
  Game.travelTo(sx, sy);              // leave: back to haven (dist 2 — still "near")
  Game.travelTo(sx + 1, sy);          // return
  const smokeAfterReturn = saysMatching(/smoke on the horizon/);
  check('V7 arrival announces exactly once', smokeAfterArrive - smokeBefore === 1,
    `announcements=${smokeAfterArrive - smokeBefore}`);
  check('V7 leave+return does not re-announce', smokeAfterReturn === smokeAfterArrive,
    `after-return=${smokeAfterReturn} after-arrive=${smokeAfterArrive}`);
  check('V7 catch-up generated flag set', vv.generated === true, `generated=${vv.generated}`);
  Game.state.otherVillages = Game.state.otherVillages.filter(v => v !== vv);
  // walk back to spawn for the edge test
  Game.map.px = 0; Game.map.py = 4;

  // V9: world edge — rim bump says once per game, then silent; no crash.
  Game.state.scholar.insideHaven = false;
  Game.state.worldEdgeTold = false;
  const edgeBefore = (Game.log || []).length;
  let r9a = 'unset';
  try { r9a = Game.tryNodeExit(-1, 0); } catch (e) { r9a = 'threw:' + e.message; }
  const edgeSaid = (Game.log || []).slice(edgeBefore).join(' ');
  check('V9 rim bump -> null + honest message (once)', r9a === null && /known world ends here/i.test(edgeSaid),
    `r=${JSON.stringify(r9a)} said="${edgeSaid.slice(0, 60)}"`);
  const edgeMid = (Game.log || []).length;
  let r9b = 'unset';
  try { r9b = Game.tryNodeExit(-1, 0); } catch (e) { r9b = 'threw:' + e.message; }
  check('V9 second rim bump silent (no spam)', r9b === null && (Game.log || []).length === edgeMid,
    `r=${JSON.stringify(r9b)} newSays=${(Game.log || []).length - edgeMid}`);
  check('V9 player still on border node', Game.map.px === 0 && Game.map.py === 4,
    `(${Game.map.px},${Game.map.py})`);

  console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS CRASH:', e); process.exit(2); });
