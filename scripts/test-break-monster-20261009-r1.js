#!/usr/bin/env node
// break-it MONSTERS r1 (2026-10-09) — hostile-player adversarial probes.
// EXPLOIT: corpse/double-loot, kill-count, respawn farm.
// SOFTLOCK: bunker/windup/dive stuck states, picket-line fight ending.
// HONESTY: cedacea1 x1.4 data-vs-combat, wave-2 announcement, hushwolf silence.
// DEAD CODE: wave-2 special mechanics actually FIRE (shame, money shot,
// scan-zones, picket line, grading, voice-mimic, understudy learning).
// RNG: mulberry32, fixed default seed, SEED env override.
'use strict';
const H = require('./break-monsters-harness.js');
const { execSync } = require('child_process');

const SEED = parseInt(process.env.SEED || '1337', 10);
let pass = 0, fail = 0;
const ok = (cond, label) => { if (cond) pass++; else { fail++; console.log('FAIL:', label); } };

const WAVE2 = ['voice_mimic_radio','mirror_stag','review_drone','bright_idea','memory_projector',
  'warranty_caller','understudy','landlord','heckler','paparazzo','union_rep','moderator','statickite'];

// drive a fight: strike on player turns (or study if instructed), advance otherwise
function driveFight(Game, opts) {
  opts = opts || {};
  const log = [];
  const origSay = Game.say.bind(Game);
  let guard = 0;
  while (Game.tbfight && !Game.tbfight.over && guard++ < (opts.maxRounds || 200)) {
    if (Game.tbIsPlayerTurn()) {
      const m = Game.tbfight.fighters.find(x => x.kind === 'monster' && x.alive && !x.fled);
      if (!m) { try { Game.tbAdvance(); } catch (e) { break; } continue; }
      if (opts.cripple === m.key || opts.cripple === true) m.hp = Math.min(m.hp, 1);
      if (opts.crippleAll) {
        for (const x of Game.tbfight.fighters) if (x.kind === 'monster' && x.alive && !x.fled) x.hp = 1;
      }
      try {
        if (opts.study) Game.tbPlayerStudy();
        else { Game.tbPlayerStrike(m.key); try { Game.tbPlayerEndTurn(); } catch (e) {} }
      } catch (e) { log.push('player-act err: ' + e.message); break; }
    } else {
      try { Game.tbAdvance(); } catch (e) { log.push('advance err: ' + e.message); break; }
    }
  }
  return log;
}

function cleanFight(Game) {
  try { if (Game.tbfight) { Game.tbfight.over = true; Game.tbfight = null; } } catch (e) {}
  try { Game.state.scholar.monster = null; } catch (e) {}
}

(async () => {
  H.seedRng(SEED);
  const Game = H.loadGame();
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  s.health = 100;

  // single-monster kill driver: cripple to 1 HP, park it adjacent, strike to kill
  function killSingle(Game, id) {
    Game.startCombat(id);
    const m = Game.tbfight.fighters.find(x => x.kind === 'monster');
    if (!m) return null;
    m.mx = 4; m.my = 5; // adjacent to the player at 4,4
    let guard = 0;
    while (Game.tbfight && !Game.tbfight.over && guard++ < 100) {
      if (Game.tbIsPlayerTurn()) {
        const ms = Game.tbfight.fighters.filter(x => x.kind === 'monster' && x.alive && !x.fled);
        if (!ms.length) break;
        for (const x of ms) { x.hp = 1; x.mx = 4; x.my = 5; }
        try { Game.tbPlayerStrike(ms[0].key); } catch (e) {}
        try { Game.tbPlayerEndTurn(); } catch (e) {}
      } else { try { Game.tbAdvance(); } catch (e) { break; } }
    }
    return Game.tbfight ? Game.tbfight.result : 'ended';
  }

  // ============ EXPLOIT 1: one kill -> exactly one monster corpse ============
  {
    Game.state.waveKills = { 1: 0 };
    const before = (Game.state.corpses || []).length;
    s.health = 100; s.mx = 4; s.my = 4;
    const res = killSingle(Game, 'bulldozer');
    ok(res === 'won' || res === 'ended', `E1: bulldozer fight ends won (got ${res})`);
    cleanFight(Game);
    const after = (Game.state.corpses || []).length;
    ok(after - before === 1, `E1: exactly one new corpse per kill (before ${before} after ${after})`);
  }

  // ============ EXPLOIT 2: corpse take zeroes units — no double-take ========
  {
    const c = (Game.state.corpses || [])[Game.state.corpses.length - 1];
    ok(!!c, 'E2: corpse exists');
    const itemIdx = (c.items || []).findIndex(i => (i.units == null ? 1 : i.units) > 0);
    if (itemIdx >= 0) {
      const invBefore = (s.inventory || []).length;
      Game.corpseTakeItem(c.id, itemIdx);
      const unitsLeft = (c.items[itemIdx] || {}).units || 0;
      ok(unitsLeft === 0, `E2: taking zeroes the corpse stack (left ${unitsLeft})`);
      const again = Game.corpseTakeItem(c.id, itemIdx);
      ok(again === null, 'E2: second take returns null (no double-loot)');
      ok((s.inventory || []).length > invBefore, 'E2: item landed in inventory once');
    } else {
      ok(false, 'E2: no takable item on corpse to test');
    }
  }

  // ============ EXPLOIT 3: recordWaveKill counts exactly once per kill =======
  {
    Game.state.waveKills = { 1: 0 };
    s.health = 100;
    killSingle(Game, 'bulldozer');
    cleanFight(Game);
    ok((Game.state.waveKills[1] || 0) === 1, `E3: one real kill = one wave kill (got ${Game.state.waveKills[1]})`);
  }

  // ============ EXPLOIT 4: maintainWorldMonsters respects cap ===============
  {
    Game.state.systemArrived = true;
    for (let i = 0; i < 40; i++) { try { Game.maintainWorldMonsters(); } catch (e) {} }
    const n = Game.worldMonsters().length, cap = Game.worldMonsterCap();
    ok(n <= cap, `E4: world monsters ${n} <= cap ${cap} after 40 ticks (no spawn spam)`);
  }

  // ============ SOFTLOCK 1: speedbump bunker resolves, fight can end ========
  {
    s.health = 100; s.mx = 4; s.my = 4;
    Game.startCombat('speedbump_turtle');
    const m = Game.tbfight.fighters.find(x => x.kind === 'monster');
    ok(!!m, 'S1: speedbump combat starts');
    m.turtleBunker = 3; // force a short bunker
    let bunkerExpired = false, chipLanded = false;
    let guard = 0;
    while (Game.tbfight && !Game.tbfight.over && guard++ < 120) {
      if ((m.turtleBunker || 0) <= 0) bunkerExpired = true;
      if (Game.tbIsPlayerTurn()) {
        const beforeHp = m.hp;
        try { Game.tbPlayerStrike(m.key); } catch (e) {} try { Game.tbPlayerEndTurn(); } catch (e2) {}
        if (m.hp < beforeHp) chipLanded = true;
      } else { try { Game.tbAdvance(); } catch (e) { break; } }
    }
    const ended = !Game.tbfight || Game.tbfight.over;
    ok(bunkerExpired, 'S1: bunker expires on its own (no permanent turtle state)');
    ok(chipLanded, 'S1: chip damage lands through the bunker (>=1, no immunity)');
    ok(ended, `S1: bunkered fight resolves (guard ${guard})`);
    cleanFight(Game);
  }

  // ============ SOFTLOCK 2: union_rep death scatters the picket line ========
  {
    s.health = 100;
    Game.startCombat('union_rep');
    const rep = Game.tbfight.fighters.find(x => x.kind === 'monster' && Game.urIs(x));
    ok(!!rep, 'S2: union_rep combat starts');
    // let it organize a while so the picket line forms
    let guard = 0;
    while (Game.tbfight && !Game.tbfight.over && guard++ < 40) {
      if (Game.tbIsPlayerTurn()) { try { Game.tbPlayerStudy(); } catch (e) {} }
      else { try { Game.tbAdvance(); } catch (e) { break; } }
    }
    const lineFormed = Game.tbfight && Game.tbfight.fighters.some(x => x.kind === 'monster' && !Game.urIs(x));
    // now kill the rep directly
    if (Game.tbfight && rep && rep.alive) {
      rep.hp = 1;
      guard = 0;
      while (Game.tbfight && !Game.tbfight.over && rep.alive && guard++ < 60) {
        if (Game.tbIsPlayerTurn()) { try { Game.tbPlayerStrike(rep.key); } catch (e) {} try { Game.tbPlayerEndTurn(); } catch (e2) {} }
        else { try { Game.tbAdvance(); } catch (e) { break; } }
      }
    }
    const f = Game.tbfight;
    const picketersAlive = f && f.fighters.some(x => x.kind === 'monster' && !Game.urIs(x) && x.alive && !x.fled);
    ok(!lineFormed || true, 'S2: (info) picket line formed: ' + !!lineFormed);
    ok(!picketersAlive, 'S2: rep death scatters summoned picketers (fight can end)');
    cleanFight(Game);
  }

  // ============ SOFTLOCK 3: windup states resolve (mirror_stag charge) ======
  {
    s.health = 100;
    Game.startCombat('mirror_stag');
    const m = Game.tbfight.fighters.find(x => x.kind === 'monster');
    ok(!!m, 'S3: mirror_stag combat starts');
    let maxSameTele = 0, curTele = null, curRun = 0, fired = false;
    const seen = [];
    let guard = 0;
    while (Game.tbfight && !Game.tbfight.over && guard++ < 120) {
      if (Game.tbIsPlayerTurn()) { try { Game.tbPlayerStudy(); } catch (e) {} }
      else {
        try { Game.tbAdvance(); } catch (e) { break; }
        const t = (m.telegraph && m.telegraph.kind) || 'none';
        if (t !== 'none') fired = fired || true;
        if (t === curTele) { curRun++; } else { curTele = t; curRun = 1; }
        maxSameTele = Math.max(maxSameTele, curRun);
        if (m.beamPhase) seen.push(m.beamPhase);
      }
    }
    ok(maxSameTele < 20, `S3: no telegraph stuck 20+ consecutive monster turns (max ${maxSameTele})`);
    cleanFight(Game);
  }

  // ============ SOFTLOCK 4: nevermore dive state machine resolves ===========
  {
    s.health = 100;
    Game.startCombat('nevermore');
    const m = Game.tbfight.fighters.find(x => x.kind === 'monster');
    ok(!!m, 'S4: nevermore combat starts');
    const phases = new Set();
    let guard = 0;
    while (Game.tbfight && !Game.tbfight.over && guard++ < 200) {
      if (m.beamPhase) phases.add(m.beamPhase);
      if (Game.tbIsPlayerTurn()) {
        try { Game.tbPlayerStrike(m.key); } catch (e) {} try { Game.tbPlayerEndTurn(); } catch (e2) {}
        try { Game.tbPlayerEndTurn(); } catch (e) {}
      } else { try { Game.tbAdvance(); } catch (e) { break; } }
    }
    const ended = !Game.tbfight || Game.tbfight.over;
    ok(ended, 'S4: nevermore fight resolves within 200 rounds');
    ok(phases.size >= 2, `S4: dive machine cycled phases (${[...phases].join(',') || 'none seen'})`);
    cleanFight(Game);
  }

  // ============ HONESTY 1: cedacea1 x1.4 is real in the data ================
  {
    const oldRaw = execSync('git show cedacea1^:src/data/monsters.json', { cwd: H.ROOT }).toString();
    const oldD = JSON.parse(oldRaw); const oldMs = oldD.monsters || oldD;
    let checked = 0, bad = 0;
    for (const id of WAVE2) {
      const now = Game.data.monsters.find(m => m.id === id);
      const was = oldMs.find(m => m.id === id);
      if (!now || !was) continue;
      for (let i = 0; i < 2; i++) {
        const expect = Math.round(was.attack.damage[i] * 1.4);
        const got = now.attack.damage[i];
        checked++;
        if (Math.abs(got - expect) > 1) { bad++; console.log(`  H1 drift: ${id}[${i}] was ${was.attack.damage[i]} now ${got} (x1.4 -> ${expect})`); }
      }
    }
    ok(checked > 0 && bad === 0, `H1: cedacea1 x1.4 applied to wave-2 damage in data (${checked} values, ${bad} drifts)`);
    const maxDmg = Math.max(...WAVE2.map(id => Game.data.monsters.find(m => m.id === id).attack.damage[1]));
    console.log(`  H1 info: post-hardening max wave-2 damage = ${maxDmg} (doc MONSTER-WAVES.md says 12-34)`);
  }

  // ============ HONESTY 2: no runtime double-multiply of the x1.4 ==========
  {
    const fs = require('fs');
    const hits = [];
    for (const f of ['src/js/game.js','src/js/encounters.js','src/js/engine/combat.js']) {
      const src = fs.readFileSync(H.ROOT + '/' + f, 'utf8');
      src.split('\n').forEach((ln, i) => {
        if (/damage.*\*.*1\.4|1\.4.*\*.*damage|wave.*mult|mult.*wave/i.test(ln) && /attack/i.test(ln)) hits.push(`${f}:${i+1}: ${ln.trim()}`);
      });
    }
    ok(hits.length === 0, `H2: no runtime re-multiply of wave damage (hits: ${hits.join(' | ') || 'none'})`);
  }

  // ============ HONESTY 3: wave-2 unlock announcement fires ==================
  {
    const sysLines = [];
    const origSys = Game.sysSay.bind(Game);
    Game.sysSay = (t) => { sysLines.push(t); try { origSys(t); } catch (e) {} };
    Game.state.scholar.day = 8;
    Game.state.waveKills = { 1: 3 }; // one more kill in the fight trips the gate
    const wBefore = Game.unlockedWave();
    ok(wBefore === 1, `H3: day 8 + 3 wave-1 kills = still wave 1 (got ${wBefore})`);
    s.health = 100; s.mx = 4; s.my = 4;
    killSingle(Game, 'bulldozer');
    cleanFight(Game);
    Game.sysSay = origSys;
    const announced = sysLines.some(t => /wave 2/i.test(t) || /Wave 2/i.test(t));
    ok(announced, `H3: wave-2 unlock announcement fired (${sysLines.length} sysSay lines, matched: ${announced})`);
    Game.state.scholar.day = 1; Game.state.waveKills = { 1: 0 };
  }

  // ============ HONESTY 4: hushwolf silence, no rush indicator ==============
  {
    const says = [];
    const origSay = Game.say.bind(Game);
    Game.say = (t) => { says.push(String(t)); try { origSay(t); } catch (e) {} };
    s.health = 100;
    Game.startCombat('hushwolf');
    Game.say = origSay;
    const silence = says.some(t => /silent/i.test(t));
    ok(silence, 'H4: hushwolf combat start narrates the silence (telegraph is silence)');
    cleanFight(Game);
    const fs = require('fs');
    const appSrc = fs.readFileSync(H.ROOT + '/src/js/app.js', 'utf8');
    const rushUI = /rushIndicator|rush-indicator|rushWarn/i.test(appSrc);
    ok(!rushUI, 'H4: no rush-indicator UI remnants in app.js (Steve killed it)');
  }

  // ============ DEAD CODE: wave-2 specials actually fire ====================
  async function mechanicCheck(id, predicate, label) {
    H.seedRng(SEED + id.length);
    global.window = global; // loadGame deletes it; re-stub for equipment.js
    const G2 = H.loadGame();
    await G2.init();
    G2.genRoster('Columbus, Ohio');
    G2.newGame('Columbus, Ohio', null, G2.generatedRoster[0].id);
    G2.depart();
    G2.state.scholar.health = 100;
    G2.state.systemArrived = true;
    try { G2.startCombat(id); } catch (e) { ok(false, `D: ${id} combat failed to start: ${e.message}`); return; }
    const m = G2.tbfight.fighters.find(x => x.kind === 'monster');
    let guard = 0, hit = false, err = null;
    while (G2.tbfight && !G2.tbfight.over && guard++ < 100 && !hit) {
      if (G2.tbIsPlayerTurn()) {
        try { G2.tbPlayerStudy(); } catch (e) { err = e.message; break; }
        try { G2.tbPlayerEndTurn(); } catch (e) {} // study doesn't burn move; end explicitly
      }
      else { try { G2.tbAdvance(); } catch (e) { err = e.message; break; } }
      try { if (predicate(G2, m)) hit = true; } catch (e) {}
    }
    ok(!err, `D: ${id} ran without crash${err ? ' (' + err + ')' : ''}`);
    ok(hit, `D: ${label} (${id})`);
    try { if (G2.tbfight) { G2.tbfight.over = true; G2.tbfight = null; } } catch (e) {}
  }

  await mechanicCheck('heckler', (G, m) => (m.hkShame || 0) > 0, 'shame stacks accumulate');
  await mechanicCheck('paparazzo', (G, m) => (m.pzPrediction || 0) > 0 || ['candid','tracking','exclusive'].includes(m.beamPhase), 'money-shot prediction builds (pzPrediction/phase)');
  await mechanicCheck('statickite', (G, m) => ['rise','mark','transmit','recover','dip'].includes(m.beamPhase), 'scan-zone cycle fires (rise/mark/transmit)');
  await mechanicCheck('union_rep', (G, m) => ['organizing','walkout','picketing'].includes(m.beamPhase) || !!m.urSummoned, 'picket line organizes (phase/summon)');
  await mechanicCheck('review_drone', (G, m) => ['project','countdown','correct','recalc'].includes(m.beamPhase), 'grading cycle runs (project/countdown/correct)');
  await mechanicCheck('voice_mimic_radio', (G, m) => m.vmLure !== undefined || ['call','reveal'].includes(m.beamPhase), 'voice-mimic lure/reveal cycle');
  await mechanicCheck('understudy', (G, m) => ['watching','performing','improv'].includes(m.beamPhase), 'understudy watch/perform cycle');
  await mechanicCheck('bright_idea', (G, m) => ['settle','brighten','bloom','ember'].includes(m.beamPhase), 'inspiration settle/bloom/ember cycle');
  await mechanicCheck('giant_mosquito', (G, m) => ['circle','dive','drink','heavy'].includes(m.beamPhase), 'mosquito circle/dive/drink cycle (tbMosquitoTurn)');
  await mechanicCheck('alien_tick', (G, m) => ['quest','latch','feed','engorged'].includes(m.beamPhase), 'tick quest/latch/feed cycle (tbTickTurn)');
  await mechanicCheck('nightcourt', (G, m) => !!m.beamPhase || !!m.telegraph, 'night court acts (double-dive path reachable)');
  await mechanicCheck('landlord', (G, m) => !!m.beamPhase || (m.llTaxed || 0) > 0 || !!m.telegraph, 'landlord leased-tiles cycle');

  console.log(`\nbreak-monster r1: ${pass} pass, ${fail} fail (seed ${SEED})`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS CRASH:', e.stack || e.message); process.exit(1); });
