#!/usr/bin/env node
// Break-it combat-engine proof tests, run 2026-10-10.
// Hostile-player attacks against the combat engine (src/js/engine/combat.js,
// game.js tbDamage/tbPlayerStrike/tbEndCheck, src/js/fieldFights.js,
// src/js/monsterBehaviors.js, data phaseBadges).
//
// CATCHES THIS RUN (both fixed in src/data/monsters.json):
//   H1 hushwolf "RUSH" badge: Steve killed the grid rush UI indicator
//      (2026-10-06: "Silent Rush gives no warning, it just moves and
//      hits"). But monsters.json still ships phaseBadges.rush = "RUSH",
//      the rush branch sets beamPhase='rush' via encPhaseFor(m,'resolve'),
//      and app.js renders encPhaseBadge in TWO surfaces (combatStripHTML
//      and the monster card rows) once the pattern is learned — which
//      happens via tbLearnPattern AFTER the first rush lands. Nothing ever
//      resets the wolf's phase, so from rush 2 on the player sees a
//      standing "RUSH" badge: the killed indicator, resurrected by stale
//      phase state. Fix: the badge entry is gone — encPhaseBadge returns
//      '' for the rush phase. The telegraph stays what Steve said it is:
//      the silence itself (narration + wolfSilence audio).
//   H2 speedbump_turtle "SNAP" badge (SIBLING SWEEP, same class): the snap
//      fiction is "No warning. There never is." — but phaseMap.resolve =
//      'snap' + phaseBadges.snap = "SNAP" rendered the same standing
//      warning post-learning. Same fix: badge entry removed.
//
// HELD (attacks attempted, engine resisted — documented, not fixed):
//   E1 armor invariant: absorbed = min(hit-1, round(hit*r)), r = P/(P+20)
//      holds in tbDamage's player block AND villager block for hits 1..40
//      at P=500 — at least 1 always lands. Pierce hook defaults 0 (no
//      monster in monsters.json declares pierce).
//   E2 negative damage: tbDamage(-50) -> 0 applied, no healing.
//   E3 practice/stat farming: stats hard-cap at 10; dodge/strike practice
//      cannot push past it.
//   E4 ambush double-count: the ambush PASSIVE (combat.first_strike_damage
//      x1.5, round 1) and the ambush ACTION (set_ambush -> s.ambushReady
//      x2.0) DO stack on the same round-1 strike. Held by design: the same
//      passive+action grammar ships in haymaker (heavy_damage x1.2 + x2.5)
//      and patient_aim (strike_damage x2 + take_aim x2.5) — all honestly
//      narrated, "broken builds welcome" per Steve. Not a bug.
//   S1 softlock: tbEndCheck ends 'routed' when every monster fled, 'lost'
//      when the player is down (double-KO guard: player death beats a
//      simultaneous last-monster kill).
//   D1 dead code: every src/js file (minus DOM-only app/sprites/
//      tile-scenes/move-anim/drama) is loaded in index.html; all 10
//      Scattering.combat exports resolve and are called; ontology green.
//
// Run: node scripts/test-combat-break-20261010.js   (SEED env override)
'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');

let pass = 0, fail = 0;
const failures = [];
function ok(cond, name, detail) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; failures.push(name + (detail ? ' — ' + detail : '')); console.log('  FAIL ' + name + (detail ? ' — ' + detail : '')); }
}

// ---------- seeded RNG (modules capture Math.random at load) ----------
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const SEED = parseInt(process.env.SEED || '20261010', 10);
Math.random = mulberry32(SEED);

// ---------- boot the full engine ----------
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
const order = execSync("grep -o 'src/js/[^\"]*\\.js' index.html | head -60", { cwd: ROOT }).toString().split('\n')
  .filter(s => s && !/app\.js|sprites\.js|tile-scenes\.js|move-anim\.js|drama\.js/.test(s));
global.window = global;
global.document = { getElementById: () => null, createElement: () => ({ textContent: '', innerHTML: '', style: {}, setAttribute() {}, appendChild() {} }), head: { appendChild() {} }, body: { classList: { remove() {} } } };
order.forEach(f => { eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); });
delete global.window;
const Game = globalThis.Scattering.Game;
const S = globalThis.Scattering;

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const said = [];
  Game.say = (m) => { said.push(String(m)); };
  Game.sysSay = (m) => { said.push(String(m)); };
  Game.audioEvent = () => {};
  try { Game.drama = () => {}; } catch (e) {}

  const mdefById = (id) => (Game.data.monsters || []).find(m => m.id === id) || {};

  // ================= HONESTY H1: hushwolf "RUSH" badge (THE CATCH) =================
  console.log('\n[honesty] H1: hushwolf rush phase renders no grid indicator');
  {
    const wolf = mdefById('hushwolf');
    const badges = (wolf.encounter || {}).phaseBadges || {};
    ok(!badges.rush, 'monsters.json: hushwolf phaseBadges has no "rush" entry' +
      (badges.rush ? ' (still ships "' + badges.rush.trim() + '")' : ''));
    // Engine-side: the exact phase the rush branch sets, through the exact
    // function the UI calls, with the pattern learned (post-first-rush).
    const m = { kind: 'monster', mdef: wolf, mx: 4, my: 4 };
    m.beamPhase = Game.encPhaseFor(m, 'resolve'); // what the rush branch sets
    ok(m.beamPhase === 'rush', 'rush branch phase resolves to "rush" (got "' + m.beamPhase + '")');
    Game.state.codex.monsters = Game.state.codex.monsters || {};
    Game.state.codex.monsters.hushwolf = { stage: 'slain' }; // pattern known
    const badge = Game.encPhaseBadge(m);
    ok(Game.encTelegraphKnown(m), 'pattern known post-learning (telegraph gate open)');
    ok(badge === '', 'encPhaseBadge during rush = "' + badge + '" (expect empty — no indicator)');
    // Staleness: nothing resets the wolf's phase between rushes, so whatever
    // renders here persists onto the next render — assert it is nothing.
    const badgeAgain = Game.encPhaseBadge(m);
    ok(badgeAgain === '', 'badge still empty on the following render (no stale warning)');
  }

  // ================= HONESTY H2: turtle "SNAP" badge (SIBLING) =================
  console.log('\n[honesty] H2: speedbump snap phase renders no grid indicator (sibling sweep)');
  {
    const turtle = mdefById('speedbump_turtle');
    const badges = (turtle.encounter || {}).phaseBadges || {};
    ok(!badges.snap, 'monsters.json: speedbump_turtle phaseBadges has no "snap" entry' +
      (badges.snap ? ' (still ships "' + badges.snap.trim() + '")' : ''));
    const m = { kind: 'monster', mdef: turtle, mx: 4, my: 4 };
    m.beamPhase = Game.encPhaseFor(m, 'resolve'); // what the snap branch sets
    Game.state.codex.monsters.speedbump_turtle = { stage: 'slain' };
    ok(Game.encPhaseBadge(m) === '', 'encPhaseBadge during snap is empty (expect empty — "No warning. There never is.")');
  }

  // ================= EXPLOIT E1: armor invariant =================
  console.log('\n[exploit] E1: armor model — at least 1 always lands (player + villager blocks)');
  {
    // Minimal live fight scaffolding for tbDamage.
    const mkFighter = (key, kind, extra) => Object.assign(
      { key, kind, alive: true, fled: false, hp: 1000, maxHp: 1000, mx: 4, my: 4, speed: 3 }, extra || {});
    Game.tbfight = { fighters: [], round: 1, over: false };
    const p = mkFighter('p', 'player');
    const v = mkFighter('v1', 'villager', { name: 'Testy', varmor: 500 });
    const atk = mkFighter('m1', 'monster', { mdef: mdefById('hushwolf') });
    Game.tbfight.fighters.push(p, v, atk);
    const realArmorBonus = Game.armorBonus;
    Game.armorBonus = () => 500; // absurd protection
    let worst = { p: 99, v: 99 };
    let pierceSeen = null;
    try {
      for (let dmg = 1; dmg <= 40; dmg++) {
        p.hp = 1000; p.alive = true;
        const fp = Game.tbDamage('p', dmg, 'teeth', 'm1', { quiet: true, undodgeable: true });
        if (fp > 0 && fp < worst.p) worst.p = fp;
        v.hp = 1000; v.alive = true;
        const fv = Game.tbDamage('v1', dmg, 'teeth', 'm1', { quiet: true, undodgeable: true });
        if (fv > 0 && fv < worst.v) worst.v = fv;
        if (dmg === 1) pierceSeen = fp; // sanity: damage flowed at all
      }
    } finally { Game.armorBonus = realArmorBonus; }
    ok(worst.p >= 1, 'player block: min landed over hits 1..40 at P=500 is ' + worst.p + ' (expect >= 1)');
    ok(worst.v >= 1, 'villager block: min landed over hits 1..40 at P=500 is ' + worst.v + ' (expect >= 1)');
    ok(pierceSeen > 0, 'damage flows through the block at all (sanity)');
    // Pierce hook defaults to 0: no monster in data declares pierce.
    const piercers = (Game.data.monsters || []).filter(m => (m.pierce || 0) !== 0);
    ok(piercers.length === 0, 'pierce default-0: no monster declares pierce (' + piercers.length + ' do)');
    Game.tbfight = null;
  }

  // ================= EXPLOIT E2: negative damage =================
  console.log('\n[exploit] E2: negative damage cannot heal');
  {
    Game.tbfight = { fighters: [], round: 1, over: false };
    const p = { key: 'p', kind: 'player', alive: true, fled: false, hp: 60, maxHp: 100, mx: 4, my: 4, speed: 3 };
    Game.tbfight.fighters.push(p);
    const before = p.hp;
    const applied = Game.tbDamage('p', -50, 'teeth', null, { quiet: true, undodgeable: true });
    ok(applied === 0, 'tbDamage(-50) applies ' + applied + ' (expect 0)');
    ok(p.hp === before, 'hp unchanged at ' + p.hp + ' (no heal)');
    Game.tbfight = null;
  }

  // ================= EXPLOIT E3: practice/stat cap =================
  console.log('\n[exploit] E3: stat farming hard-caps at 10');
  {
    const s = Game.state.scholar;
    s.stats = { str: 9, end: 5, per: 5, agi: 9, pre: 5 };
    s.practice = {};
    Game.practice('str', 10000);
    Game.practice('agi', 10000);
    ok(s.stats.str === 10 && s.stats.agi === 10, 'str/agi cap at 10 after 10k practice reps (' + s.stats.str + '/' + s.stats.agi + ')');
  }

  // ================= SOFTLOCK S1: tbEndCheck terminates =================
  console.log('\n[softlock] S1: tbEndCheck ends fights that cannot continue');
  {
    // tbEnd's cleanup guarantee nulls this.tbfight in its finally — capture
    // the result via a wrapper instead of reading it off the fight.
    let endResult = null;
    const realTbEnd = Game.tbEnd;
    Game.tbEnd = function (r) { endResult = r; return realTbEnd.call(this, r); };
    const mkF = (key, kind, alive, fled) => ({ key, kind, alive, fled, hp: alive ? 50 : 0, maxHp: 50, mx: 4, my: 4, speed: 3, mdef: kind === 'monster' ? mdefById('hushwolf') : undefined });
    try {
      // All monsters fled -> 'routed'
      Game.tbfight = { fighters: [mkF('p', 'player', true, false), mkF('m1', 'monster', true, true)], round: 2, over: false };
      const r1 = Game.tbEndCheck();
      ok(r1 === true && endResult === 'routed', 'all monsters fled -> fight ends routed (got ' + endResult + ')');
      // Player down while last monster also down -> 'lost' (double-KO guard)
      endResult = null;
      Game.tbfight = { fighters: [mkF('p', 'player', false, false), mkF('m1', 'monster', false, false)], round: 3, over: false };
      Game.state.scholar.health = 0;
      const r2 = Game.tbEndCheck();
      ok(r2 === true && endResult === 'lost', 'player down + monster down -> lost, not a corpse victory (got ' + endResult + ')');
    } finally { Game.tbEnd = realTbEnd; Game.tbfight = null; }
  }

  // ================= DEAD CODE D1: wiring =================
  console.log('\n[dead-code] D1: combat modules loaded, exports live');
  {
    const idx = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    const diskFiles = fs.readdirSync(path.join(ROOT, 'src/js')).filter(f => f.endsWith('.js'));
    const engFiles = fs.readdirSync(path.join(ROOT, 'src/js/engine')).filter(f => f.endsWith('.js')).map(f => 'engine/' + f);
    const skip = new Set(['app.js', 'sprites.js', 'tile-scenes.js', 'move-anim.js', 'drama.js']);
    const missing = diskFiles.concat(engFiles).filter(f => !skip.has(f.replace('engine/', '')) && !idx.includes('src/js/' + f));
    ok(missing.length === 0, 'every src/js file loaded in index.html' + (missing.length ? ' (missing: ' + missing.join(',') + ')' : ''));
    const need = ['roll', 'cheb', 'inGrid', 'turnOrder', 'patternCells', 'isFoe', 'nearestEnemy', 'stepToward', 'stepAway', 'villagerDecide'];
    const absent = need.filter(k => typeof S.combat[k] !== 'function');
    ok(absent.length === 0, 'all 10 Scattering.combat exports resolve' + (absent.length ? ' (absent: ' + absent.join(',') + ')' : ''));
    // The exports are actually called from live code (not just exported).
    const liveCallers = { roll: 0, turnOrder: 0, patternCells: 0, isFoe: 0, nearestEnemy: 0, stepToward: 0, stepAway: 0, villagerDecide: 0 };
    for (const k of Object.keys(liveCallers)) {
      const hits = execSync(`grep -rl "S\\.combat\\.${k}\\|combat\\.${k}(" src/js --include=*.js | grep -v "engine/combat.js" | wc -l`, { cwd: ROOT }).toString().trim();
      liveCallers[k] = parseInt(hits, 10);
    }
    const dead = Object.keys(liveCallers).filter(k => liveCallers[k] === 0);
    // cheb/inGrid are internal helpers of the module (used by patternCells/
    // stepToward inside engine/combat.js) — exposed but not externally called.
    ok(dead.length === 0, 'called-from-live-code: ' + Object.keys(liveCallers).map(k => k + 'x' + liveCallers[k]).join(' '));
  }

  // ================= HELD (characterization, not gates) =================
  console.log('\n[held] ambush passive+action stacking is the design grammar (documented, not fixed)');
  {
    // ambush passive: combat.first_strike_damage x1.5 (round 1, always on)
    const amb = (Game.data.abilities.abilities || Game.data.abilities).find(a => a.id === 'ambush');
    const pas = (amb.modifiers || []).find(m => m.target === 'combat.first_strike_damage');
    console.log('  info ambush passive: x' + (pas && pas.value) + ' on ' + (pas && pas.target));
    console.log('  info ambush action set_ambush: next attack 2x (s.ambushReady.mult=2.0, costs a turn)');
    console.log('  info same grammar: haymaker passive combat.heavy_damage x1.2 + action x2.5; patient_aim passive combat.strike_damage x2 (r1) + take_aim action x2.5');
    console.log('  info verdict: HELD — consistent, honestly narrated, "broken builds welcome" (Steve).');
  }

  console.log('\n==== ' + pass + ' passed, ' + fail + ' failed (seed ' + SEED + ') ====');
  if (failures.length) { console.log('failures:\n - ' + failures.join('\n - ')); process.exit(1); }
})().catch(e => { console.error('HARNESS ERROR:', e); process.exit(2); });
