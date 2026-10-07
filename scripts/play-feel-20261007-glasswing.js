#!/usr/bin/env node
// PLAY-AUDIT (Steve 2026-10-07): Glasswing Darter + Sunbasker, played AS A PLAYER.
// Queue #4 of the flesh-out loop. Engine is READ-ONLY — this script only observes.
//
//   GLASSWING — circles high (untargetable), picks a target, falls like a thrown
//     knife. The SHADOW is the warning — move. Miss → grounded, vulnerable.
//   SUNBASKER — basks to charge: each sunny turn makes the next bite worse.
//     Break the bask (hit it / shade it) and it's just a lizard.
//
// Verdicts wanted: telegraph reads on the grid, bask legible + breakable, fights
// fun/scary not just functional, knownCue coaching after pattern learned, every
// audio hook resolves in the CombatAudio registry, distinct from other
// divers/chargers, no silent turns, counterplay legible.
//
// Engine loaded READ-ONLY from HEAD (git show). Seeded mulberry32 PRNG:
//   node scripts/play-feel-20261007-glasswing.js          (default seed)
//   SEED=2 node scripts/play-feel-20261007-glasswing.js   (second seed)
// Exit code non-zero on assertion failure.
const { execSync } = require('child_process');
const path = require('path');

const SEED = parseInt(process.env.SEED || '20261007', 10);
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
Math.random = mulberry32(SEED);

const ROOT = path.join(__dirname, '..');
function gitShow(p) {
  return execSync('git show HEAD:' + p, { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 }).toString('utf8');
}

// ---- load the FULL production script list in index.html order, from HEAD ----
// minus DOM-only app.js/sprites.js/tile-scenes.js/move-anim.js. Window stubbed
// for the eval phase, then deleted before playing (else combat goes async).
const html = gitShow('index.html');
const allScripts = [];
const re = /src\/js\/[a-z0-9_\/-]+\.js/g;
let m;
while ((m = re.exec(html))) if (!allScripts.includes(m[0])) allScripts.push(m[0]);
const SKIP = new Set(['src/js/app.js', 'src/js/sprites.js', 'src/js/tile-scenes.js', 'src/js/move-anim.js']);
const scripts = allScripts.filter(s => !SKIP.has(s));
global.window = global; // eval-phase stub (AGENTS.md: NODE HARNESS lesson)
global.document = {
  getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
  createElement: () => ({ style: {}, appendChild: () => {}, setAttribute: () => {}, addEventListener: () => {} }),
  addEventListener: () => {}, body: { appendChild: () => {} }, head: { appendChild: () => {} },
};
global.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
try {
  for (const f of scripts) eval(gitShow(f));
} finally {
  delete global.window; // sync combat path
}
const Game = globalThis.Scattering.Game;
if (!Game) { console.error('HARNESS ERROR: Game did not load'); process.exit(2); }

// data served from HEAD (never the worktree)
global.fetch = (f) => Promise.resolve({
  json: () => Promise.resolve(JSON.parse(gitShow(String(f).replace(/^\/+/, '')))),
});

// ---- instrumentation: every say line + every audio hook, per round ----
const sayLines = [];      // {round, text}
const audioFired = [];    // {round, name}
let round = 0;
let silentMonsterTurns = 0;
let monsterTurnsSeen = 0;
const _say = Game.say.bind(Game);
Game.say = function (t) { sayLines.push({ round, text: String(t) }); return _say(t); };
const _audioEvent = Game.audioEvent.bind(Game);
Game.audioEvent = function (name, data) {
  audioFired.push({ round, name: String(name) });
  return _audioEvent(name, data);
};
let scen = '?';
// Precise hook: tbMonsterTurn(c) is the per-monster AI dispatch. A monster
// turn that produces zero say lines is a silent turn (Steve's no-silent rule).
const _tbMonsterTurn = Game.tbMonsterTurn.bind(Game);
const silentDetails = [];
Game.tbMonsterTurn = function (c) {
  const before = sayLines.length;
  const r = _tbMonsterTurn(c);
  monsterTurnsSeen++;
  if (sayLines.length === before) {
    silentMonsterTurns++;
    const m = c || {};
    silentDetails.push({ scen, round,
      mon: `${m.key}:${((m.mdef || {}).id)}:${m.beamPhase || '?'}${m.sbFlat ? ':flat' : ''}${m.telegraph ? ':tg' : ''}@${m.mx},${m.my}` });
  }
  return r;
};

function note(t) { console.log(t); }
function P() { return Game.tbFighter('p'); }
function MON() { return (Game.tbfight ? Game.tbfight.fighters : []).find(x => x.kind === 'monster' && x.alive && !x.fled); }
function linesSince(n) { return sayLines.slice(n).map(l => l.text); }
function endTurn() {
  if (!Game.tbfight || Game.tbfight.over) return;
  if (!Game.tbIsPlayerTurn()) return;
  const p = P(); p.moveLeft = 0; p.acted = true;
  Game.tbAfterPlayerAction();
}
function newRun() {
  try { if (Game.tbfight) Game.tbEnd('fled'); } catch (e) {}
  Game.genDetail = () => Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => 'grass'));
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  s.health = 500; s.kcal = 2000;
  s.abilities = []; s.backgroundAbilities = [];
  s.stats = s.stats || {}; s.stats.agi = 5;
  Game.dayPart = 1; // daytime: both monsters are diurnal
  Game.audio = {};  // audioEvent hook above still records; synths checked statically
  return s;
}
function teach(id) {
  // the REAL gate is tbPatternKnown: codex.monsters[id].patterns[attackName]
  // (earned by surviving the attack — tbLearnPattern). Teach it honestly.
  try {
    const e = Game.ensureMonsterEntry(id);
    e.stage = 'observed';
    const atk = (Game.data.monsters.find(x => x.id === id) || {}).attack || {};
    if (atk.name) { e.patterns = e.patterns || {}; e.patterns[atk.name] = true; }
    e.attacksSeen = atk.name ? [atk.name] : ['x'];
  } catch (err) {}
}
function unteach(id) {
  try { delete Game.state.codex.monsters[id]; } catch (e) {}
}

// move the player one step toward (tx,ty) using real moves
function stepToward(tx, ty) {
  const p = P();
  let guard = 10;
  while (guard-- > 0 && (p.mx !== tx || p.my !== ty) && p.moveLeft > 0 && Game.tbIsPlayerTurn()) {
    const dx = Math.sign(tx - p.mx), dy = Math.sign(ty - p.my);
    if (!Game.tbPlayerMove(p.mx + dx, p.my + dy)) break;
  }
}

// ================= A. PRE-COMBAT DIVE TRAP =================
function scenarioA() {
note('=== A. GLASSWING PRE-COMBAT DIVE TRAP (shadow grows on every action) ===');
const trapRes = { ticksNarrated: 0, missOk: false, hitOk: false, hitDmg: 0, shadowCloseFired: 0, combatErr: null };
  const s = newRun();
  s.mx = 4; s.my = 4;
  s.gwTrap = { turns: 0, tileX: 4, tileY: 4, monsterId: 'glasswing' };
  const a0 = audioFired.length;
  // player reads the shadow and MOVES OFF the tile after tick 1
  for (let i = 1; i <= 3; i++) {
    const l0 = sayLines.length;
    Game.gwTrapTick();
    const fresh = linesSince(l0);
    trapRes.ticksNarrated += fresh.length > 0 ? 1 : 0;
    if (i === 1) { s.mx = 6; s.my = 4; note('  YOU: see the shadow darkening — move off the tile → (6,4)'); }
  }
  trapRes.missOk = (s.gwTrap === null) && s.health === 500;
  trapRes.shadowCloseFired = audioFired.slice(a0).filter(a => a.name === 'glasswingShadowClose').length;
  note(`  trap miss: narrated ${trapRes.ticksNarrated}/3 ticks, shadowClose audio x${trapRes.shadowCloseFired}, hp ${s.health}, trap cleared: ${s.gwTrap === null}`);

  // hit case: stand still — damage lands, trap clears
  const s2 = newRun();
  s2.mx = 4; s2.my = 4;
  s2.gwTrap = { turns: 0, tileX: 4, tileY: 4, monsterId: 'glasswing' };
  let combatErr = null;
  const hp0 = s2.health;
  for (let i = 1; i <= 3; i++) {
    try { Game.gwTrapTick(); } catch (e) { combatErr = String(e && e.message || e); break; }
  }
  trapRes.hitDmg = hp0 - s2.health;
  trapRes.hitOk = trapRes.hitDmg > 0 && s2.gwTrap === null;
  note(`  trap hit: dmg ${trapRes.hitDmg}, trap cleared: ${s2.gwTrap === null}${combatErr ? ', COMBAT ENTRY ERROR: ' + combatErr : ''}`);
  trapRes.combatErr = combatErr;
  return trapRes;
}

// ================= B. GLASSWING IN-COMBAT DIVE =================
note('\n=== B. GLASSWING IN-COMBAT: circle → dive → grounded ===');
const gw = { fights: 0, kills: 0, divesDeclared: 0, divesMissed: 0, divesHit: 0, groundedWindows: 0, groundedKills: 0, hpLost: 0, shadowShapesOk: 0, shadowShapesBad: 0, coachSeen: 0, circleStrikeResult: null, untaughtDread: false, untaughtNoCoach: true };
let gwOpts = {};
function gwBrain(firstFight) {
  const mm = MON(), p = P();
  if (!mm || !Game.tbIsPlayerTurn()) return;
  if (gwOpts.standStill && !gwOpts.stoodStill) {
    // eat the dive: do nothing until it lands
    gwOpts.stoodStill = true;
    note('  YOU: stand still. Let it come.');
    endTurn(); return;
  }
  const tg = mm.telegraph;
  if (!gwOpts.standStill && tg && tg.cells && tg.cells.length && tg.cells.some(c => c.cx === p.mx && c.cy === p.my)) {
    // THE COUNTER: the shadow is on YOUR tile — move.
    let best = null, bd = 1e9;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const nx = p.mx + dx, ny = p.my + dy;
      if (nx < 1 || nx > 7 || ny < 1 || ny > 7) continue;
      if (tg.cells.some(c => c.cx === nx && c.cy === ny)) continue;
      const dd = Math.abs(dx) + Math.abs(dy);
      if (dd < bd) { bd = dd; best = [nx, ny]; }
    }
    if (best) stepToward(best[0], best[1]);
    note(`  YOU: shadow on my tile — MOVE → (${p.mx},${p.my})`);
    endTurn(); return;
  }
  const grounded = mm.beamPhase === 'grounded';
  const d = Math.max(Math.abs(p.mx - mm.mx), Math.abs(p.my - mm.my));
  const w = Game.equippedWeapon();
  if (!p.acted && d <= (w.range || 1) && (grounded || (mm.altitude || 'low') === 'low')) {
    const hp0 = mm.hp;
    Game.tbPlayerStrike(mm.key);
    const dealt = hp0 - mm.hp;
    if (grounded && dealt > 0 && !mm.alive) gw.groundedKills++;
    note(`  YOU: strike (${w.name})${grounded ? ' — GROUNDED, now!' : ''} → dealt ${dealt}, darter hp ${mm.hp}`);
    endTurn(); return;
  }
  if (!grounded && d > 1 && p.moveLeft > 0 && (mm.altitude || 'high') === 'low') { stepToward(mm.mx, mm.my); note(`  YOU: close in → (${p.mx},${p.my})`); }
  else note(`  YOU: hold (phase=${mm.beamPhase}, alt=${mm.altitude}, d=${d})`);
  endTurn();
}
function gwFight(taught, tag, maxTurns, opts) {
  opts = opts || {}; gwOpts = opts;
  const s = newRun();
  if (taught) teach('glasswing'); else unteach('glasswing');
  s.equipped = { weapon: { itemId: 'fire_hardened_spear', name: 'Fire-hardened spear' } };
  s.mx = 4; s.my = 6;
  const lFight0 = sayLines.length; // capture BEFORE startCombat (first-contact lines live there)
  Game.startCombat('glasswing');
  const mm0 = MON();
  if (opts.farSpawn) { mm0.mx = 1; mm0.my = 1; mm0.beamPhase = 'circle'; mm0.telegraph = null; mm0.altitude = 'high'; }
  scen='GW:'+tag;
  note(`\n### ${tag}: ${mm0.name} hp ${mm0.hp} (${taught ? 'pattern LEARNED' : 'first contact'})`);
  const hp0 = s.health;
  let turn = 0, sawDive = false;
  while (Game.tbfight && !Game.tbfight.over && turn < maxTurns) {
    turn++; round++;
    const mm = MON(); if (!mm) break;
    if (turn <= 8 || mm.beamPhase === 'dive' || mm.beamPhase === 'grounded')
      note(`— t${turn}: phase=${mm.beamPhase || '?'} alt=${mm.altitude || '?'} @(${mm.mx},${mm.my}) hp=${mm.hp} | you @(${P().mx},${P().my})`);
    // grid-contract sampling: the shadow IS the telegraph
    if (mm.beamPhase === 'dive' && mm.telegraph) {
      sawDive = true; gw.divesDeclared++;
      const sh = Game.gwDiveShadow();
      const ok = sh && sh.phase === 'dive' && sh.tile && typeof sh.tile.x === 'number'
        && typeof sh.turnsLeft === 'number' && Array.isArray(sh.streak);
      if (ok) gw.shadowShapesOk++; else gw.shadowShapesBad++;
      if (turn <= 8) note(`    gwDiveShadow: ${ok ? 'OK' : 'BAD ' + JSON.stringify(sh)}`);
      if (mm.telegraph.cueText && /MOVE/.test(mm.telegraph.cueText)) gw.coachSeen++;
    }
    if (Game.tbIsPlayerTurn()) gwBrain(gw.fights === 0); else endTurn();
  }
  const dead = !MON();
  const over = Game.tbfight && Game.tbfight.over;
  const fresh = linesSince(lFight0).join('\n');
  if (dead) gw.kills++;
  if (sawDive) {
    // resolve outcome from log: climbed (hit) vs crashed (miss)
    if (/hits the dirt where its target was|GROUNDED\. Now/.test(fresh)) { gw.divesMissed++; gw.groundedWindows++; }
    if (/snatches at .* and climbs/.test(fresh)) gw.divesHit++;
  }
  gw.hpLost += hp0 - s.health;
  if (!taught) {
    gw.untaughtDread = /shadow moves wrong against the sun/.test(fresh);
    gw.untaughtNoCoach = !/Watch the shadow, not the bug/.test(fresh) || /\(It dives at where you STAND/.test(fresh) === false;
    gw.untaughtNoCoach = !/It dives at where you STAND/.test(fresh);
  }
  note(`RESULT: ${dead ? 'DARTER SLAIN' : over ? 'over: ' + Game.tbfight.result : 'STALEMATE ' + turn + 't'} | your hp lost ${Math.round(hp0 - s.health)}`);
  return { dead, turn };
}
(async () => {
  await Game.init();
  Game.canSee = () => true;
  const trapRes = scenarioA();

  for (let i = 0; i < 4; i++) { gw.fights++; gwFight(true, `glasswing fight ${i + 1}`, 40); }
  // probe: swing a spear at a CIRCLING (high) darter — the designed answer is
  // "out of reach, watch the shadow". Deterministic: monster held adjacent.
  {
    const s = newRun(); teach('glasswing');
    s.equipped = { weapon: { itemId: 'fire_hardened_spear', name: 'Fire-hardened spear' } };
    s.mx = 4; s.my = 6;
    scen = 'GW:circle-strike probe';
    Game.startCombat('glasswing');
    const mm = MON(); mm.mx = 4; mm.my = 5; mm.beamPhase = 'circle'; mm.altitude = 'high'; mm.telegraph = null;
    const l0 = sayLines.length, hp0 = mm.hp;
    if (Game.tbIsPlayerTurn()) Game.tbPlayerStrike(mm.key);
    gw.circleStrikeResult = { dealt: hp0 - mm.hp, lines: linesSince(l0).join(' | ').slice(0, 260) };
    note(`\n### circle-strike probe: dealt ${gw.circleStrikeResult.dealt} — "${gw.circleStrikeResult.lines.slice(0, 150)}"`);
    try { if (Game.tbfight) Game.tbEnd('fled'); } catch (e) {}
  }
  gw.fights++; gwFight(true, 'glasswing CIRCLE PHASE (far spawn, taught)', 40, { farSpawn: true });
  gw.fights++; gwFight(true, 'glasswing STAND STILL (eat the dive, taught)', 40, { standStill: true });
  gw.fights++; gwFight(false, 'glasswing FIRST CONTACT (untaught)', 40);

  note('\n--- glasswing aggregate ---');
  note(`fights=${gw.fights} kills=${gw.kills} divesDeclared=${gw.divesDeclared} missed=${gw.divesMissed} hit=${gw.divesHit} groundedWindows=${gw.groundedWindows} groundedKills=${gw.groundedKills}`);
  note(`shadow shapes ok=${gw.shadowShapesOk} bad=${gw.shadowShapesBad} | coach cue seen x${gw.coachSeen} | hp lost total=${Math.round(gw.hpLost)}`);
  note(`circle-strike probe: ${JSON.stringify(gw.circleStrikeResult)}`);
  note(`first contact: dread=${gw.untaughtDread} no-coaching=${gw.untaughtNoCoach}`);

  // ================= C. SUNBASKER =================
  note('\n=== C. SUNBASKER: bask → charged → bite ===');
  const sb = { baskTurns: 0, maxChargeSeen: 0, biteDeclared: 0, biteCoachSeen: 0, biteDmg: [], biteDmgBroken: [], breakEvents: 0, flattenOk: false, flattenKillable: false, fights: 0, kills: 0, hpLost: 0, haloOk: 0, haloBad: 0, trackingTest: null };

  // C1: hold still adjacent — watch the charge build, the bite declare, the bite land
  {
    const s = newRun(); teach('sunbasker');
    s.equipped = { weapon: { itemId: 'fire_hardened_spear', name: 'Fire-hardened spear' } };
    s.mx = 4; s.my = 5;
    Game.startCombat('sunbasker');
    const mm = MON(); mm.mx = 4; mm.my = 4; // adjacent
    scen='C1';
    note('\n### C1 sunbasker: HOLD — let it bask (taught)');
    const l0 = sayLines.length, hp0 = s.health;
    let turn = 0;
    while (Game.tbfight && !Game.tbfight.over && turn < 6) {
      turn++; round++;
      const m2 = MON(); if (!m2) break;
      note(`— t${turn}: phase=${m2.beamPhase} charge=${m2.sbCharge || 0} flat=${!!m2.sbFlat} @(${m2.mx},${m2.my}) hp=${m2.hp}`);
      const halo = Game.sbHeatKeys();
      const hok = halo && typeof halo.charge === 'number' && halo.monster && Array.isArray(halo.ring);
      if ((m2.sbCharge || 0) > 0) { if (hok) sb.haloOk++; else sb.haloBad++; }
      if ((m2.sbCharge || 0) > sb.maxChargeSeen) sb.maxChargeSeen = m2.sbCharge;
      if (m2.telegraph && m2.telegraph.dmg) {
        sb.biteDeclared++;
        const dmg = m2.telegraph.dmg;
        if (/It tracks: hit it NOW/.test(linesSince(l0).join(' '))) sb.biteCoachSeen++;
        note(`    BITE DECLARED: dmg range [${dmg}]`);
      }
      if (Game.tbIsPlayerTurn()) { note('  YOU: hold. Watching the gold build.'); endTurn(); }
      else endTurn();
    }
    const fresh = linesSince(l0).join('\n');
    const lost = hp0 - s.health;
    sb.biteDmg.push(lost);
    if (/Its scales go from dull brown to gold/.test(fresh)) sb.baskTurns++;
    note(`C1: maxCharge=${sb.maxChargeSeen} biteDeclared=${sb.biteDeclared} coach=${sb.biteCoachSeen} hp lost=${Math.round(lost)} chargeSpent=${MON() ? MON().sbCharge : 'dead'}`);
  }

  // C2: break the bask mid-windup — let it charge to 2 (bite declared), then
  // strike on the windup turn. The bite should land WEAK (base 8-14).
  // Monster HP buffed so it survives to declare.
  {
    const s = newRun(); teach('sunbasker');
    s.equipped = { weapon: { itemId: 'fire_hardened_spear', name: 'Fire-hardened spear' } };
    s.mx = 4; s.my = 5;
    Game.startCombat('sunbasker');
    const mm = MON(); mm.mx = 4; mm.my = 4; mm.hp = 200; mm.maxHp = 200;
    scen='C2';
    note('\n### C2 sunbasker: BREAK IT mid-windup (taught, hp buffed)');
    const l0 = sayLines.length, hp0 = s.health, a0 = audioFired.length;
    let turn = 0, broke = false, struckWindup = false;
    while (Game.tbfight && !Game.tbfight.over && turn < 10) {
      turn++; round++;
      const m2 = MON(); if (!m2) break;
      const declared = !!(m2.telegraph && m2.telegraph.dmg);
      note(`— t${turn}: phase=${m2.beamPhase} charge=${m2.sbCharge || 0} declared=${declared} basker hp=${m2.hp}`);
      if (Game.tbIsPlayerTurn()) {
        const w = Game.equippedWeapon();
        const d = Math.max(Math.abs(P().mx - m2.mx), Math.abs(P().my - m2.my));
        if (declared && !struckWindup && d <= (w.range || 1) && !P().acted) {
          const chBefore = m2.sbCharge || 0;
          Game.tbPlayerStrike(m2.key);
          struckWindup = true;
          if (chBefore > 0 && (m2.sbCharge || 0) === 0) broke = true;
          note(`  YOU: STRIKE mid-windup (charge was ${chBefore}) → charge now ${m2.sbCharge || 0}`);
        } else if (!declared) { note('  YOU: hold — letting it charge'); }
        else note('  YOU: hold');
        endTurn();
      } else endTurn();
    }
    const lost = hp0 - s.health;
    // the weakened bite: C2 strikes at the FIRST declare, so the first
    // resolved bite in the log is the one whose windup was broken.
    const post = linesSince(l0).join('\n');
    const biteM = post.match(/Sun-Charged Bite hits you for (\d+)/);
    const weakenedBite = biteM ? parseInt(biteM[1], 10) : null;
    sb.biteDmgBroken.push(weakenedBite !== null ? weakenedBite : lost);
    sb.breakEvents = audioFired.slice(a0).filter(a => a.name === 'baskBreak').length;
    sb.brokeWindup = broke;
    const fresh = post;
    note(`C2: mid-windup strike=${struckWindup} charge-zeroed=${broke} baskBreak audio x${sb.breakEvents} weakened bite=${sb.biteDmgBroken[0]} (charged bite would be 16-22; base 8-14)`);
    note(`    break narration present: ${/knocks the (charge|sunlight) out of its scales/.test(fresh)}`);
    try { if (Game.tbfight) Game.tbEnd('fled'); } catch (e) {}
  }

  // C2b: FULLY CHARGED bite, uninterrupted — the scary number, for the notes.
  {
    const s = newRun(); teach('sunbasker');
    s.equipped = { weapon: { itemId: 'fire_hardened_spear', name: 'Fire-hardened spear' } };
    s.mx = 4; s.my = 5;
    Game.startCombat('sunbasker');
    const mm = MON(); mm.mx = 4; mm.my = 4; mm.hp = 200; mm.maxHp = 200;
    scen='C2b';
    note('\n### C2b sunbasker: EAT the fully-charged bite (taught, hp buffed)');
    const hp0 = s.health;
    let turn = 0;
    while (Game.tbfight && !Game.tbfight.over && turn < 10) {
      turn++; round++;
      const m2 = MON(); if (!m2) break;
      if (Game.tbIsPlayerTurn()) { note(`— t${turn}: charge=${m2.sbCharge || 0} declared=${!!(m2.telegraph && m2.telegraph.dmg)} — YOU hold`); endTurn(); }
      else endTurn();
    }
    const lost = hp0 - s.health;
    sb.biteDmg.push(lost);
    note(`C2b: charged bite hp lost=${Math.round(lost)} (declared 16-22 at charge 2)`);
    try { if (Game.tbfight) Game.tbEnd('fled'); } catch (e) {}
  }

  // C5: the bite TRACKS — move off during windup, it should still land.
  {
    const s = newRun(); teach('sunbasker');
    s.equipped = { weapon: { itemId: 'fire_hardened_spear', name: 'Fire-hardened spear' } };
    s.mx = 4; s.my = 5;
    Game.startCombat('sunbasker');
    const mm = MON(); mm.mx = 4; mm.my = 4; mm.hp = 200; mm.maxHp = 200;
    scen='C5';
    note('\n### C5 sunbasker: DODGE the declared bite by moving (taught, hp buffed)');
    const hp0 = s.health;
    let turn = 0, moved = false, declaredSeen = false;
    while (Game.tbfight && !Game.tbfight.over && turn < 10) {
      turn++; round++;
      const m2 = MON(); if (!m2) break;
      const declared = !!(m2.telegraph && m2.telegraph.dmg);
      if (declared) declaredSeen = true;
      if (Game.tbIsPlayerTurn()) {
        if (declared && !moved) { stepToward(6, 7); moved = true; note(`— t${turn}: bite declared — YOU move away → (${P().mx},${P().my})`); }
        else note(`— t${turn}: charge=${m2.sbCharge || 0} declared=${declared} — YOU hold`);
        endTurn();
      } else endTurn();
    }
    const lost = hp0 - s.health;
    sb.trackingTest = { declaredSeen, moved, lost: Math.round(lost) };
    note(`C5: declared=${declaredSeen} moved=${moved} hp lost=${Math.round(lost)} (tracking => should still land ~16-22)`);
    try { if (Game.tbfight) Game.tbEnd('fled'); } catch (e) {}
  }

  // C3: shade — it flattens, becomes just a lizard
  {
    const s = newRun(); teach('sunbasker');
    s.equipped = { weapon: { itemId: 'fire_hardened_spear', name: 'Fire-hardened spear' } };
    s.mx = 4; s.my = 5;
    Game.genDetail = () => Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => 'tree'));
    Game.startCombat('sunbasker');
    const mm = MON(); mm.mx = 4; mm.my = 4;
    scen='C3';
    note('\n### C3 sunbasker: SHADE (tree canopy)');
    const l0 = sayLines.length;
    let turn = 0;
    while (Game.tbfight && !Game.tbfight.over && turn < 3) {
      turn++; round++;
      const m2 = MON(); if (!m2) break;
      note(`— t${turn}: flat=${!!m2.sbFlat} charge=${m2.sbCharge || 0} phase=${m2.beamPhase}`);
      if (Game.tbIsPlayerTurn()) endTurn(); else endTurn();
    }
    const m3 = MON();
    sb.flattenOk = !!(m3 && m3.sbFlat);
    const fresh = linesSince(l0).join('\n');
    note(`    flatten narration: ${/No sun, no fight/.test(fresh)} | heat halo null in shade: ${Game.sbHeatKeys() === null}`);
    // kill the flattened lizard
    let kt = 0;
    while (MON() && kt++ < 30) {
      round++;
      const m4 = MON(); if (!m4) break;
      if (Game.tbIsPlayerTurn()) {
        const d = Math.max(Math.abs(P().mx - m4.mx), Math.abs(P().my - m4.my));
        if (d <= 1 && !P().acted) Game.tbPlayerStrike(m4.key);
        endTurn();
      } else endTurn();
    }
    sb.flattenKillable = !MON();
    note(`C3: flattened=${sb.flattenOk} then killable=${sb.flattenKillable}`);
  }

  // C4: real fights — pressure the bask, kill it
  function sbBrain() {
    const mm = MON(), p = P();
    if (!mm || !Game.tbIsPlayerTurn()) return;
    const w = Game.equippedWeapon();
    const d = Math.max(Math.abs(p.mx - mm.mx), Math.abs(p.my - mm.my));
    const tg = mm.telegraph;
    if (tg && tg.dmg && d <= (w.range || 1) && !p.acted) {
      const h0 = mm.hp;
      Game.tbPlayerStrike(mm.key);
      note(`  YOU: bite incoming — STRIKE to starve it → dealt ${h0 - mm.hp}, charge ${mm.sbCharge || 0}`);
      endTurn(); return;
    }
    if (!p.acted && d <= (w.range || 1)) {
      const h0 = mm.hp;
      Game.tbPlayerStrike(mm.key);
      note(`  YOU: strike → dealt ${h0 - mm.hp}, basker hp ${mm.hp}, charge ${mm.sbCharge || 0}`);
      endTurn(); return;
    }
    if (d > 1 && p.moveLeft > 0) { stepToward(mm.mx, mm.my); note(`  YOU: close in → (${p.mx},${p.my})`); }
    else note(`  YOU: hold (charge=${mm.sbCharge || 0})`);
    endTurn();
  }
  for (let i = 0; i < 4; i++) {
    const s = newRun(); teach('sunbasker');
    s.equipped = { weapon: { itemId: 'fire_hardened_spear', name: 'Fire-hardened spear' } };
    s.mx = 4; s.my = 6;
    Game.startCombat('sunbasker');
    const mm0 = MON(); mm0.mx = 4; mm0.my = 4;
    scen='C4';
    note(`\n### C4 sunbasker fight ${i + 1}: pressure the bask`);
    const hp0 = s.health;
    let turn = 0;
    while (Game.tbfight && !Game.tbfight.over && turn < 40) {
      turn++; round++;
      const mm = MON(); if (!mm) break;
      if (turn <= 10) note(`— t${turn}: phase=${mm.beamPhase} charge=${mm.sbCharge || 0} @(${mm.mx},${mm.my}) hp=${mm.hp}`);
      if (Game.tbIsPlayerTurn()) sbBrain(); else endTurn();
    }
    sb.fights++;
    if (!MON()) sb.kills++;
    sb.hpLost += hp0 - s.health;
    note(`RESULT: ${!MON() ? 'BASKER SLAIN' : 'STALEMATE ' + turn + 't'} | hp lost ${Math.round(hp0 - s.health)}`);
  }

  // ================= D. AUDIO REGISTRY =================
  // The CombatAudio registry object: from its first entry to `Game.audio =`.
  note('\n=== D. AUDIO HOOK RESOLUTION (CombatAudio registry in app.js) ===');
  const appSrc = gitShow('src/js/app.js');
  const regStart = appSrc.indexOf('combatStart() { combatStartHit()');
  const regEnd = appSrc.indexOf('Game.audio = CombatAudio');
  const regBlock = appSrc.slice(regStart - 300, regEnd);
  const firedNames = [...new Set(audioFired.map(a => a.name))];
  const unregistered = [];
  for (const n of firedNames) {
    const esc = n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const inReg = new RegExp('(^|[^a-zA-Z0-9_])' + esc + '\\s*\\(').test(regBlock);
    const hasSynth = new RegExp('function ' + esc + '\\s*\\(').test(appSrc);
    note(`  audio '${n}': fired x${audioFired.filter(a => a.name === n).length} | registry=${inReg} | synth=${hasSynth}`);
    if (!inReg) unregistered.push(n + (hasSynth ? ' (synth exists, not exported)' : ' (NO SYNTH)'));
  }
  const keyHooks = ['glasswingCircle', 'glasswingDive', 'glasswingLand', 'glasswingClimb', 'glasswingShadowClose', 'baskCharge', 'baskBreak', 'baskFlatten'];
  const missingKeys = keyHooks.filter(k => !firedNames.includes(k));
  note(`  key hooks never fired this run: ${missingKeys.join(', ') || 'none'}`);

  // ================= VERDICTS =================
  note('\n=== ASSERTIONS (seed ' + SEED + ') ===');
  const fails = [];
  const ok = (cond, label) => { note((cond ? 'PASS' : 'FAIL') + ' ' + label); if (!cond) fails.push(label); };
  ok(trapRes.ticksNarrated === 3, 'trap: every shadow tick narrated (3/3)');
  ok(trapRes.shadowCloseFired >= 2, `trap: shadowClose audio escalates (x${trapRes.shadowCloseFired})`);
  ok(trapRes.missOk, 'trap: moving off the tile dodges cleanly (hp unchanged, trap cleared)');
  ok(trapRes.hitOk, `trap: standing still eats the dive (dmg ${trapRes.hitDmg})`);
  ok(!trapRes.combatErr, 'trap: dive-hit combat entry did not throw' + (trapRes.combatErr ? ' — ' + trapRes.combatErr : ''));
  if (gw.divesDeclared > 0) {
    ok(gw.divesMissed > 0, `glasswing: dodging the shadow tile forces a miss (missed ${gw.divesMissed}/${gw.divesDeclared})`);
    ok(gw.groundedWindows > 0, `glasswing: miss → grounded window (x${gw.groundedWindows})`);
  } else note('SKIP dive assertions: no dives declared (small-n gate)');
  ok(gw.kills >= 1, `glasswing: killable as a player (${gw.kills}/${gw.fights} fights)`);
  ok(gw.shadowShapesBad === 0 && gw.shadowShapesOk > 0, `glasswing: gwDiveShadow grid contract valid (ok ${gw.shadowShapesOk}, bad ${gw.shadowShapesBad})`);
  ok(gw.coachSeen > 0, `glasswing: knownCue coaching surfaces once learned (x${gw.coachSeen})`);
  ok(gw.circleStrikeResult && gw.circleStrikeResult.dealt === 0 && /out of .* reach|Watch the shadow/.test(gw.circleStrikeResult.lines),
    `glasswing: circling = out of spear reach, coached honestly ("${(gw.circleStrikeResult && gw.circleStrikeResult.lines || '').slice(0, 90)}")`);
  ok(gw.untaughtDread, 'glasswing: first contact is dread, not a lecture');
  ok(gw.untaughtNoCoach, 'glasswing: first contact has no coaching');
  ok(silentMonsterTurns === 0, `no silent monster turns (${monsterTurnsSeen} monster turns seen)`);
  if (silentDetails.length) note('    silent turns: ' + JSON.stringify(silentDetails.slice(0, 8)));
  ok(sb.maxChargeSeen >= 2, `sunbasker: bask builds charge over held turns (max ${sb.maxChargeSeen})`);
  ok(sb.biteDeclared > 0, `sunbasker: bite declared at charge 2+ (x${sb.biteDeclared})`);
  ok(sb.biteCoachSeen > 0, `sunbasker: tracking-bite coaching surfaces once learned (x${sb.biteCoachSeen})`);
  ok(sb.haloBad === 0 && sb.haloOk > 0, `sunbasker: sbHeatKeys grid contract valid (ok ${sb.haloOk}, bad ${sb.haloBad})`);
  ok(sb.breakEvents > 0 || /knocks the (charge|sunlight) out/.test(sayLines.map(l => l.text).join(' ')),
    `sunbasker: hitting it breaks the bask (baskBreak audio x${sb.breakEvents})`);
  ok(sb.brokeWindup === true, 'sunbasker: mid-windup strike zeroes the charge');
  ok(sb.biteDmgBroken.length && sb.biteDmgBroken[0] <= 16, `sunbasker: mid-windup hit starves the bite (lost ${Math.round(sb.biteDmgBroken[0] || 0)}, base 8-14)`);
  ok(sb.trackingTest && sb.trackingTest.declaredSeen && sb.trackingTest.lost >= 8,
    `sunbasker: bite TRACKS — moving during windup doesn't dodge (lost ${sb.trackingTest ? sb.trackingTest.lost : 'n/a'})`);
  ok(sb.flattenOk, 'sunbasker: shade flattens it (no sun, no fight)');
  ok(sb.flattenKillable, 'sunbasker: flattened lizard is still killable');
  ok(sb.kills >= 1, `sunbasker: killable with pressure (${sb.kills}/${sb.fights} fights)`);
  ok(unregistered.length === 0, `audio: every fired hook resolves in CombatAudio registry${unregistered.length ? ' — MISSING: ' + unregistered.join(',') : ''}`);
  ok(missingKeys.length === 0, `audio: all 8 key hooks fired at least once${missingKeys.length ? ' — never fired: ' + missingKeys.join(',') : ''}`);
  note(`\nSEED ${SEED}: ${fails.length} failures`);
  if (fails.length) { note('FAILURES: ' + fails.join(' | ')); process.exit(1); }
  note('ALL GREEN');
})().catch(e => { console.error('HARNESS ERROR:', e); process.exit(2); });
