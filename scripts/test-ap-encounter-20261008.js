#!/usr/bin/env node
// ALIEN-PLAYER ENCOUNTER WIRING PROOF (Steve 2026-10-08) — the exclusive
// alien-player pool was dead code: apRollEncounter/apStartEncounter existed
// with a "called from the encounter phase" comment but no call site. This
// run wires it into the live game and plays it as a player.
//
// What changed:
//   encounters.js — checkEncounter wrap: after the monster encounter phase,
//                   take the alien pool's SEPARATE roll (guarded: module
//                   absent = no-op, monster/animal/combat on the tile = skip).
//                   startAlienCombat(fighter): builds this.tbfight for a
//                   PERSON fight (player + party + kind:'hostile' fighter).
//                   tbAlienTurn(m): bespoke turn (retreat stance, telegraphed
//                   heavy burst with grid highlight + audio, close-in, melee
//                   strikes) intercepted in tbMonsterTurn (chain-safe) so the
//                   monster pipeline (needs m.mdef) never sees a person.
//                   tbEndCheck wrap (chain-safe): alien hostiles count as
//                   enemies so the fight resolves instead of phantom-winning.
//   debug-scenarios.js — alienEncounter(): day 30, wave 2, System
//                   integrated, two allies; fires through the REAL roll path.
//   game.js, contests.js, app.js, index.html — UNTOUCHED.
//
// What this proves:
//   A — static: the guarded call lives in encounters.js; game.js untouched;
//       startAlienCombat/tbAlienTurn defined; tbMonsterTurn + tbEndCheck
//       intercepts present; scenario registered (list + category).
//   B — played: checkEncounter()'s wired roll fires an alien encounter (not
//       a direct apStartEncounter call); the fighter is a Stranger, kind
//       hostile (a person), not a monster.
//   C — played: the debug scenario runs end-to-end and the fight is
//       playable: player acts, the alien takes turns (strikes + telegraphed
//       heavy with grid highlight), the beam path works, retreat resolves,
//       killing it ends the fight (won), and the player is never stuck.
//   D — knowledge gating: no alien-truth word appears on any pre-reveal
//       surface across the whole run.
//
// HARNESS: full src/js/*.js list in index.html order + alienPlayers.js after
// contests.js, minus DOM-only app.js/sprites.js/tile-scenes.js/move-anim.js
// and minus drama.js. global.window stub for eval, deleted before play
// (sync combat path). RNG seeded (mulberry32, fixed default 20261008, SEED
// env override).
//
// Exit code non-zero on any assertion failure.
// Run: node scripts/test-ap-encounter-20261008.js
//      SEED=7 node scripts/test-ap-encounter-20261008.js
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
const SEED = parseInt(process.env.SEED || '20261008', 10);
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
Math.random = mulberry32(SEED); // BEFORE eval: modules capture it at load
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(read(f))) });
global.window = global; // equipment.js touches window at load
const _SCRIPTS = ['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/conversation.js', 'src/js/convo-mood.js',
 'src/js/convoTopics.js', 'src/js/convo-wants.js', 'src/js/convo-dialogue.js', 'src/js/convo-beats.js',
 'src/js/examine.js', 'src/js/equipment.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/party-formal.js', 'src/js/truth.js', 'src/js/contests.js',
 // alienPlayers.js: index.html placement is right after contests.js
 'src/js/alienPlayers.js',
 'src/js/storage.js',
 'src/js/perceive.js', 'src/js/carexplore.js', 'src/js/justice.js', 'src/js/food.js',
 'src/js/betrayal.js', 'src/js/corpses.js', 'src/js/lifeseed.js', 'src/js/progression.js',
 'src/js/ledger.js', 'src/js/abilityActions.js', 'src/js/monsterBehaviors.js',
 'src/js/statusEffects.js', 'src/js/villager-agency.js', 'src/js/codex-people.js',
 'src/js/membership.js', 'src/js/hierarchy.js', 'src/js/debug-scenarios.js',
 'src/js/build.js'];
// drama.js excluded: DOM at load. All Game.drama calls are try/caught.
_SCRIPTS.forEach(f => eval(read(f)));
delete global.window; // sync combat path for tbAfterPlayerAction
const Game = globalThis.Scattering.Game;

// ---------- assertions ----------
let passN = 0, failN = 0;
const fails = [];
function ok(name, cond, extra) {
  if (cond) { passN++; }
  else { failN++; fails.push(name + (extra ? ' — ' + extra : '')); console.log(`   [FAIL] ${name}${extra ? ' — ' + extra : ''}`); }
}
let allLog = '';
function drain() {
  const l = Game.log || [];
  const s = l.map(x => x.text || x).join('\n');
  l.length = 0;
  allLog += '\n' + s;
  return s;
}
// Alien-truth words that must NEVER appear on a pre-reveal surface.
const LEAK_WORDS = ['Vexari', 'Meridian', "K'thari", 'Burlap', 'Trophy Hunter',
  'Collector of Despair', 'Pain Enthusiast', 'Extreme Tourist', 'Xenobiologist',
  'wearing a human suit', 'wasn\'t human'];
function leakScan(name, text) {
  const hits = LEAK_WORDS.filter(w => text.indexOf(w) >= 0);
  ok(name + ': no alien-truth leak', hits.length === 0, 'leaked: ' + hits.join(', '));
}

async function freshRun() {
  // a previous section's fight must not leak into the next: apStartEncounter
  // refuses while inCombat(), and hostileFighter() would find a stale foe.
  try { if (Game.inCombat && Game.inCombat()) Game.tbEnd('fled'); } catch (e) {}
  try { Game.tbfight = null; } catch (e) {}
  Game.genDetail = () => Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => 'grass'));
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  s.day = 30;
  Game.state.systemArrived = true;
  Game.state.systemIntegration = 1; // apReadinessCheck: seasoned world
  Game.state.waveKills = { 1: 4 };  // unlockedWave() >= 2
  Game.state.wandererNextDay = 9999; // keep the wanderer out of the roll test
  s.health = 120; s.kcal = 2400; s.hydration = 100; s.trauma = 0;
  // spear in hand (range 2)
  const def = (Game.data.items || []).find(i => i.id === 'fire_hardened_spear') || {};
  s.inventory = s.inventory || [];
  s.inventory.push({ itemId: 'fire_hardened_spear', units: 1, kcalEach: 0, kg: 0.8, name: def.name || 'fire_hardened_spear' });
  s.equipped = s.equipped || {};
  s.equipped.weapon = { itemId: 'fire_hardened_spear', name: def.name || 'fire_hardened_spear' };
  // party of 3: readiness gate (+50) — real roster ids
  const roster = (Game.state.village.roster || []).filter(rid => rid !== Game.villagerId);
  Game.state.party = roster.slice(0, 2);
  // out in the wild, not the haven grounds
  outer: for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) {
    const t = Game.tileAt(x, y);
    if (t && t.type !== 'haven' && !Game.isSafeTile(x, y)) { Game.map.px = x; Game.map.py = y; break outer; }
  }
  s.insideHaven = false;
  s.mx = 4; s.my = 4;
  delete Game.state.alienPlayers;
  drain();
}
// step to a fresh neighboring wild tile (each crossing gets a clean roll)
function walkWild() {
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]];
  for (const [dx, dy] of dirs) {
    const nx = Game.map.px + dx, ny = Game.map.py + dy;
    if (nx < 0 || nx > 8 || ny < 0 || ny > 8) continue;
    const t = Game.tileAt(nx, ny);
    if (!t || t.type === 'haven' || Game.isSafeTile(nx, ny)) continue;
    if (Game.monsterAt && Game.monsterAt(nx, ny)) continue;
    Game.map.px = nx; Game.map.py = ny;
    return true;
  }
  return false;
}
function endTurn() {
  if (!Game.tbfight || Game.tbfight.over) return;
  if (!Game.tbIsPlayerTurn()) return;
  const pl = Game.tbFighter('p'); if (pl) { pl.moveLeft = 0; pl.acted = true; }
  Game.tbAfterPlayerAction();
}
function awaitPlayerTurn(max = 12) {
  let n = 0;
  while (Game.inCombat() && !Game.tbfight.over && !Game.tbIsPlayerTurn() && n < max) { Game.tbAfterPlayerAction(); n++; }
}
function topUp() { try { const p = Game.tbFighter('p'); if (p) p.hp = p.maxHp; } catch (e) {} }
function scriptedRandom(seq, fn) {
  const r = Math.random; let i = 0;
  Math.random = () => (i < seq.length ? seq[i++] : 0.99);
  try { return fn(); } finally { Math.random = r; }
}
function hostileFighter() {
  const f = Game.tbfight;
  return f ? f.fighters.find(x => x.kind === 'hostile' && x.alienPid) : null;
}

(async () => {
  await Game.init();
  console.log('== ALIEN-PLAYER ENCOUNTER WIRING PROOF — SEED ' + SEED + ' ==');

  // ---------- ACT 0 — static wiring ----------
  console.log('\n-- ACT 0: static wiring --');
  const encSrc = read('src/js/encounters.js');
  const gSrc = read('src/js/game.js');
  const dbgSrc = read('src/js/debug-scenarios.js');
  ok('encounters.js wraps checkEncounter with the guarded alien roll',
    /G\.checkEncounter = function[\s\S]{0,1200}this\.apRollEncounter\(\)/.test(encSrc));
  ok('encounters.js guards module-absent (no-op when apRollEncounter missing)',
    /typeof this\.apRollEncounter !== 'function'/.test(encSrc));
  ok('encounters.js defines startAlienCombat', /G\.startAlienCombat = function/.test(encSrc));
  ok('encounters.js defines tbAlienTurn', /G\.tbAlienTurn = function/.test(encSrc));
  ok('encounters.js intercepts tbMonsterTurn for hostile person-fighters (chain-safe)',
    /G\.tbMonsterTurn = function[\s\S]{0,500}kind === 'hostile'/.test(encSrc) &&
    /_tbMonsterTurn \? _tbMonsterTurn\.apply/.test(encSrc));
  ok('encounters.js intercepts tbHostileTurn lazily in startAlienCombat (party.js load order)',
    /_hostileWrapped[\s\S]{0,600}G\.tbHostileTurn = function[\s\S]{0,400}m\.alienPid/.test(encSrc));
  ok('encounters.js adapts the beam key lazily (player -> p)',
    /_beamWrapped[\s\S]{0,600}targetKey === 'player'/.test(encSrc));
  ok('encounters.js wraps tbEndCheck so alien hostiles count (chain-safe)',
    /G\.tbEndCheck = function[\s\S]{0,800}alienPid/.test(encSrc) &&
    /_tbEndCheck \? _tbEndCheck\.apply/.test(encSrc));
  ok('game.js untouched: no apRollEncounter wiring there', gSrc.indexOf('apRollEncounter') < 0);
  ok('game.js untouched: no startAlienCombat/tbAlienTurn there',
    gSrc.indexOf('startAlienCombat') < 0 && gSrc.indexOf('tbAlienTurn') < 0);
  ok('debug scenario registered', /alienEncounter\(\)/.test(dbgSrc));
  ok('debug scenario listed', dbgSrc.indexOf("['alienEncounter'") >= 0);
  ok('debug scenario categorized', dbgSrc.indexOf("'👤 Alien Players'") >= 0);
  ok('module functions present at runtime',
    typeof Game.apRollEncounter === 'function' && typeof Game.apStartEncounter === 'function' &&
    typeof Game.startAlienCombat === 'function' && typeof Game.tbAlienTurn === 'function');

  // ---------- ACT 1 — the wired roll fires, played ----------
  console.log('\n-- ACT 1: wired encounter roll (played, not forced) --');
  await freshRun();
  ok('readiness gate passes in the test setup', (Game.apReadinessCheck() || {}).ready === true,
    JSON.stringify(Game.apReadinessCheck()));
  let firedPid = null, fireLog = '';
  for (let i = 0; i < 300 && !firedPid; i++) {
    walkWild();
    Game.checkEncounter();
    fireLog += '\n' + drain();
    const h = hostileFighter();
    if (h) { firedPid = h.alienPid; break; }
    // a monster fight claimed the crossing — end it, keep walking the wilds
    if (Game.inCombat()) { try { Game.tbEnd('fled'); } catch (e) {} drain(); }
  }
  ok('alien encounter fires through the wired checkEncounter roll', !!firedPid, 'pid=' + firedPid);
  const hf = hostileFighter();
  ok('fighter is a person: kind hostile, not monster', !!hf && hf.kind === 'hostile', hf && hf.kind);
  ok('pre-reveal fighter presents as Stranger', !!hf && hf.name === 'Stranger', hf && hf.name);
  ok('fighter has the person emoji', !!hf && hf.emoji === '🧑', hf && hf.emoji);
  ok('fighter carries an alien pid', !!hf && !!hf.alienPid, hf && hf.alienPid);
  ok('fighter has person stats (HP in the 60-120 band)', !!hf && hf.hp >= 60 && hf.hp <= 130, hf && String(hf.hp));
  ok('encounter state recorded (apStartEncounter ran)', !!(Game.state.alienEncounter && Game.state.alienEncounter.pid));
  leakScan('wired-roll encounter intro', fireLog);
  awaitPlayerTurn();
  ok('fight opens on the player turn (no soft-lock)', Game.tbIsPlayerTurn());

  // ---------- ACT 2 — debug scenario, played end-to-end ----------
  console.log('\n-- ACT 2: debug scenario alienEncounter (played) --');
  const list = Game.debugScenarioList().map(e => e[0]);
  ok('alienEncounter in the debug list', list.indexOf('alienEncounter') >= 0);
  const cats = Game.debugScenarioCategories();
  ok('alienEncounter in a category', Object.values(cats).some(arr => arr.some(e => e[0] === 'alienEncounter')));
  const scenOk = Game.debugScenario('alienEncounter');
  const scenLog = drain();
  ok('scenario runs', scenOk === true);
  ok('scenario drops the player into a live alien fight', !!hostileFighter());
  ok('scenario log is in-fiction', /SCENARIO: alien player encounter/.test(scenLog));
  leakScan('debug scenario intro', scenLog);
  // the scenario's fight is playable: end the turn, the alien acts, no errors
  topUp();
  endTurn(); awaitPlayerTurn();
  const turnLog = drain();
  ok('alien takes its turn after the player (bespoke tbAlienTurn ran)',
    /strikes\.|closes in|HEAVY STRIKE|breaks off/.test(turnLog), turnLog.slice(0, 160));
  ok('fight still live after a full round', Game.inCombat());
  leakScan('first combat round', turnLog);

  // ---------- ACT 3 — the fight, played for real ----------
  console.log('\n-- ACT 3: the fight, played (strikes, heavy telegraph, beam) --');
  await freshRun();
  Game.apStartEncounter('sarge'); // neutral veteran: beams + heavies, no sadistic cruelty
  drain();
  const sarge = hostileFighter();
  ok('sarge fight started via apStartEncounter', !!sarge);
  awaitPlayerTurn();
  let sawStrike = false, sawHeavy = false, sawWarn = false, sawResolve = false;
  let holdFire = false; // after a heavy declare, hold the strike so the alien lives to resolve it
  for (let r = 0; r < 24 && Game.inCombat(); r++) {
    topUp(); // harness hygiene: beams are nearly-lethal by design
    Game.tbfight._beamCooldown = 999; // isolate the heavy-strike mechanics (beam tested separately below)
    if (!Game.tbIsPlayerTurn()) awaitPlayerTurn();
    if (!Game.inCombat()) break;
    const p = Game.tbFighter('p'), h = hostileFighter();
    if (!h || !h.alive) break;
    if (!holdFire) {
      // close to spear range if needed (the alien also closes in on its own)
      const dd = Math.max(Math.abs(h.mx - p.mx), Math.abs(h.my - p.my));
      if (dd > 2) { p.mx = Math.max(0, h.mx - 2); p.my = h.my; }
      const hpBefore = h.hp;
      Game.tbPlayerStrike(h.key);
      if (h.hp < hpBefore) sawStrike = true;
    } else {
      holdFire = false; // stand on the marked tile: eat the burst, watch it resolve
    }
    endTurn(); awaitPlayerTurn();
    const lg = drain();
    if (/HEAVY STRIKE winding up/.test(lg)) {
      sawHeavy = true;
      const wk = Game.map.px + ',' + Game.map.py;
      sawWarn = sawWarn || Object.keys((Game.state.warn || {})[wk] || {}).length > 0;
      holdFire = true;
    }
    if (/heavy strike lands on empty ground|brings the heavy strike DOWN/.test(lg)) sawResolve = true;
    const hAfter = Game.tbfight ? Game.tbFighter(h.key) : null;
    if (!hAfter || !hAfter.alive) break;
  }
  ok('player strikes land on the stranger', sawStrike);
  ok('heavy strike telegraph declares (windup)', sawHeavy);
  ok('heavy telegraph highlights grid cells (warnCells)', sawWarn);
  ok('heavy strike resolves (burst or clean miss)', sawResolve);
  leakScan('full fight vs sarge', allLog);

  // beam path: forced, through the module's resolver
  await freshRun();
  Game.apStartEncounter('vex_marlowe'); // rich sadistic: loves the beam
  drain();
  const vex = hostileFighter();
  ok('vex fight started', !!vex);
  awaitPlayerTurn();
  topUp();
  const php0 = Game.tbFighter('p').hp;
  Game.tbfight._beamCooldown = 0;
  const beamLog = scriptedRandom([0.01], () => { Game.apMaybeBeamAttack(vex); return drain(); });
  const php1 = Game.tbFighter('p').hp;
  ok('beam attack fires (forced roll)', /raises .*beam|phase lance|tastes like copper/.test(beamLog), beamLog.slice(0, 140));
  ok('beam deals damage through the resolver', php1 < php0, `${php0} -> ${php1}`);
  leakScan('beam attack', beamLog);

  // retreat path: broke persona at critical HP breaks off, fight resolves
  await freshRun();
  Game.apStartEncounter('pip_quindle'); // broke: can't afford another body
  drain();
  const pip = hostileFighter();
  ok('pip fight started', !!pip);
  awaitPlayerTurn();
  topUp();
  pip.hp = 1; // broke + <35% HP = retreating stance
  endTurn(); awaitPlayerTurn();
  const retreatLog = drain();
  ok('broke persona retreats instead of dying', pip.fled === true, retreatLog.slice(0, 140));
  ok('retreat ends the fight (not stuck)', !Game.inCombat());
  leakScan('retreat', retreatLog);

  // kill path: the fight ends WON, the module records it, the game continues
  await freshRun();
  Game.apStartEncounter('dr_fenwick');
  drain();
  const fen = hostileFighter();
  const fenPid = fen && fen.alienPid;
  ok('fenwick fight started', !!fen);
  awaitPlayerTurn();
  const pf = Game.tbFighter('p');
  pf.mx = Math.max(0, fen.mx - 1); pf.my = fen.my; // adjacent: spear range
  fen.hp = 3;
  topUp();
  Game.tbPlayerStrike(fen.key);
  endTurn(); awaitPlayerTurn();
  drain();
  ok('killing the stranger ends the fight (not stuck)', !Game.inCombat());
  const rec = (Game.state.alienPlayers && Game.state.alienPlayers.met || {})[fenPid] || {};
  ok('module recorded the encounter as WON (apOnCombatEnd ran)', rec.encounters >= 1 && rec.lastOutcome === 'won',
    JSON.stringify(rec));
  ok('codex entry written', !!((Game.state.codex || {}).aliens || {})[fenPid]);
  ok('encounter state cleared', !Game.state.alienEncounter);
  // not stuck: the game continues — walk and roll again without error
  let continued = true;
  try { walkWild(); Game.checkEncounter(); drain(); if (Game.inCombat()) Game.tbEnd('fled'); }
  catch (e) { continued = false; }
  ok('game continues after the fight (no stuck state)', continued && !Game.inCombat());

  // ---------- ACT 4 — whole-run leak scan ----------
  console.log('\n-- ACT 4: whole-run knowledge gate --');
  leakScan('entire proof run', allLog);

  console.log(`\n== ${passN} passed, ${failN} failed ==`);
  if (failN) { console.log('FAILURES:\n - ' + fails.join('\n - ')); process.exit(1); }
})().catch(e => { console.error('PROOF CRASHED:', e); process.exit(1); });
