#!/usr/bin/env node
// test-monsters-break-20261010.js — BREAK-IT: monsters system (run 13).
// Hostile player with full knowledge of the code. Four fronts:
//   1. EXPLOIT — kill-credit double-count, friendly fire, flee rewards, armor honesty
//   2. SOFTLOCK — every monster fight must terminate (incl. union_rep, turtle, kite)
//   3. HONESTY — telegraph cells vs actual damage cells; counters; knowledge gating
//   4. DEAD-CODE — every monster wired: behavior entry, predicate, sprites, knownCue,
//      codex stages, attack pattern, hook resolution, index.html load order.
// Seeds Math.random BEFORE eval (sim-harness does this). 3 seeds.
const fs = require('fs');
const path = require('path');
const H = require('./sim-harness');

const SEEDS = [20261010, 777, 424242];
let pass = 0, fail = 0;
const failures = [];
function ok(name, cond, detail) {
  if (cond) { pass++; }
  else { fail++; failures.push(`${name} :: ${detail || ''}`); console.log('FAIL ' + name + (detail ? ' :: ' + detail : '')); }
}
function note(s) { console.log(`\n## ${s}`); }

const ROOT = path.join(__dirname, '..');
const monsters = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'data', 'monsters.json'), 'utf8'));
const byId = {};
for (const m of monsters) byId[m.id] = m;

async function freshGame(seed) {
  const { Game } = await H.loadGame({ seed, mode: 'probe' });
  await H.setupGame(Game);
  Game.state.scholar.day = 20; // System arrived; wave 2 unlocked for spawn tests
  return Game;
}

// Start a fight with a durable player (1000 HP fighter) and a tbEnd wrapper
// that records the terminal result (tbEnd nulls Game.tbfight on some paths).
function startTestFight(Game, mid) {
  Game.startCombat(mid);
  const p = Game.tbFighter('p');
  if (p) { p.hp = 1000; p.maxHp = 1000; }
  Game._testResult = null;
  if (!Game._tbEndWrapped) {
    Game._tbEndWrapped = true;
    const _tbEnd = Game.tbEnd.bind(Game);
    Game.tbEnd = function (r) { try { Game._testResult = r; } catch (e) {} return _tbEnd(r); };
  } else {
    Game._testResult = null;
  }
}

// Drive one full fight. policy: 'slayer' (strike nearest) or 'dodger' (flee to
// corner, never attack — used for honesty instrumentation; monster must still
// act every round). Returns {rounds, result}.
function driveFight(Game, policy, maxRounds) {
  maxRounds = maxRounds || 200;
  let rounds = 0;
  const seenRounds = new Set();
  while (Game.tbfight && !Game.tbfight.over && rounds < maxRounds) {
    if (Game.over) break;
    const f = Game.tbfight;
    seenRounds.add(f.round);
    if (Game.tbIsPlayerTurn()) {
      const p = Game.tbFighter('p');
      if (policy === 'slayer' || policy === 'linebreaker') {
        const isRep = (x) => policy === 'linebreaker' && Game.urIs && Game.urIs(x);
        const tgt = f.fighters.find(x => x.kind === 'monster' && x.alive && !x.fled && (x.hp || 0) > 0 && !isRep(x))
          || f.fighters.find(x => x.kind === 'monster' && x.alive && !x.fled && (x.hp || 0) > 0);
        if (tgt) {
          // close to strike range first (slayer walks; scatterers flee)
          try {
            const d0 = Math.max(Math.abs(tgt.mx - p.mx), Math.abs(tgt.my - p.my));
            if (d0 > 1 && p.moveLeft > 0) {
              const dx = Math.sign(tgt.mx - p.mx), dy = Math.sign(tgt.my - p.my);
              Game.tbPlayerMove(p.mx + dx, p.my + dy);
            }
          } catch (e) {}
          try { Game.tbPlayerStrike(tgt.key); } catch (e) {}
        }
      } else if (policy === 'quiet') {
        // MODERATOR quiet counter: the documented escape is going quiet —
        // 5 waits lift the mute ("it loses the thread"), then close+strike.
        // Varying verbs flips it; spamming one verb keeps it muted forever.
        const mo = f.fighters.find(x => Game.modIs && Game.modIs(x));
        const muted = (mo && mo.modMuted) || [];
        if (mo) {
          const d0 = Math.max(Math.abs(mo.mx - p.mx), Math.abs(mo.my - p.my));
          if (!muted.includes('strike') && d0 <= 1) {
            try { Game.tbPlayerStrike(mo.key); } catch (e) {}
          } else if (!muted.includes('move') && d0 > 1 && p.moveLeft > 0) {
            const dx = Math.sign(mo.mx - p.mx), dy = Math.sign(mo.my - p.my);
            try { Game.tbPlayerMove(p.mx + dx, p.my + dy); } catch (e) {}
          }
          // else: muted or blocked — fall through to WAIT, which lifts the mute
        }
      } else if (policy === 'dodger') {
        // step toward corner (0,0)-ish, away from telegraph cells
        try {
          const danger = new Set();
          for (const mo of f.fighters) {
            if (mo.kind === 'monster' && mo.telegraph && mo.telegraph.cells) {
              for (const c of mo.telegraph.cells) danger.add(c.cx + ',' + c.cy);
            }
          }
          let bx = p.mx, by = p.my, bd = -1;
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
            const nx = p.mx + dx, ny = p.my + dy;
            if (nx < 0 || nx > 8 || ny < 0 || ny > 8) continue;
            if (danger.has(nx + ',' + ny)) continue;
            const d = nx + ny; // toward (0,0)
            if (bd < 0 || d < bd) { bd = d; bx = nx; by = ny; }
          }
          if (bx !== p.mx || by !== p.my) { try { Game.tbPlayerMove(bx, by); } catch (e) {} }
        } catch (e) {}
      }
      if (!Game.tbfight || Game.tbfight.over) break;
      if (Game.tbIsPlayerTurn()) {
        // WAIT is the honest turn-ender (tbPlayerWait notes the verb for the
        // moderator's rolling window and advances; the manual closer skipped
        // the note and made the mute unliftable — a test artifact, not a bug).
        // WAIT DOUBLE-ADVANCE lesson: tbPlayerWait advances internally; call
        // nothing after it. If the policy already acted it returns false.
        try { Game.tbPlayerWait(); } catch (e) { break; }
      }
    } else {
      // not player turn: nudge the engine (browser would step async; harness is sync)
      try { Game.tbAdvance && Game.tbAdvance(); } catch (e) { break; }
    }
    rounds++;
    if (rounds >= maxRounds) break;
  }
  const f = Game.tbfight;
  return { rounds, over: !f || !!f.over || !!Game._testResult, result: (f && f.result) || Game._testResult || 'none', distinctRounds: seenRounds.size };
}

(async () => {
  // ============ SECTION 1: DEAD CODE / CONTENT WIRING (static) ============
  note('S1 dead-code: every monster wired end to end');
  {
    const beh = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'data', 'monsterBehaviors.json'), 'utf8'));
    const behIds = Object.keys((beh.behaviors || {}));
    const gameSrc = fs.readFileSync(path.join(ROOT, 'src', 'js', 'game.js'), 'utf8');
    const mbSrc = fs.readFileSync(path.join(ROOT, 'src', 'js', 'monsterBehaviors.js'), 'utf8');
    const spSrc = fs.readFileSync(path.join(ROOT, 'src', 'js', 'sprites.js'), 'utf8');
    const registry = [...mbSrc.matchAll(/^\s{4}([a-zA-Z_][a-zA-Z0-9_]*):\s*function\s*\(game,\s*m\)/gm)].map(x => x[1]);
    const idxHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    ok('30 monsters in data', monsters.length === 30, 'got ' + monsters.length);
    for (const m of monsters) {
      const id = m.id;
      ok(`${id}: behavior entry`, behIds.includes(id), 'missing from monsterBehaviors.json');
      const predRe = new RegExp(`id === '${id}'`);
      ok(`${id}: predicate in game.js`, predRe.test(gameSrc), 'no xxxIs predicate');
      ok(`${id}: calm sprite`, spSrc.includes(id + '_calm'), 'missing');
      ok(`${id}: aggro sprite`, spSrc.includes(id + '_aggro'), 'missing');
      ok(`${id}: encounter.knownCue`, !!((m.encounter || {}).knownCue), 'missing coaching');
      const cs = m.codexStages || {};
      ok(`${id}: codex stages`, !!(cs.unknown && cs.observed && cs.slain), 'incomplete');
      const atk = m.attack || {};
      ok(`${id}: attack block`, !!(atk.name && atk.damage && atk.telegraph && atk.pattern && atk.pattern.type), 'incomplete');
      const hooks = (((beh.behaviors || {})[id] || {}).preTurnHooks) || [];
      for (const h of hooks) ok(`${id}: hook ${h} registered`, registry.includes(h), 'dangling hook name');
    }
    // load order: monsterBehaviors.js must come after game.js + encounters.js
    const lines = idxHtml.split('\n');
    const li = (n) => lines.findIndex(l => l.includes('src/js/' + n));
    ok('index.html: game.js before monsterBehaviors.js', li('game.js') < li('monsterBehaviors.js') && li('game.js') > 0);
    ok('index.html: encounters.js before monsterBehaviors.js', li('encounters.js') < li('monsterBehaviors.js'));
  }

  // ============ SECTION 2: SOFTLOCK — every fight terminates ============
  for (const seed of SEEDS) {
    note(`SEED ${seed} — S2 softlock: all 30 fights terminate`);
    for (const m of monsters) {
      const Game = await freshGame(seed);
      let started = false;
      try { startTestFight(Game, m.id); started = !!Game.tbfight; } catch (e) { started = false; }
      ok(`${m.id}: fight starts`, started, 'startCombat failed');
      if (!started) continue;
      // union_rep: the designed counter is breaking the line — kill allies
      // first so the walkout collapses, then the rep. A rep-only slayer
      // wastes turns on the untargetable walkout and dies: winnable-by-play,
      // not winnable-by-rote. The test plays the counter.
      // moderator: the flip game — spam-strike gets strike muted forever.
      // The patient policy reads the live mute and varies verbs.
      const pol = m.id === 'union_rep' ? 'linebreaker' : m.id === 'moderator' ? 'quiet' : 'slayer';
      const r = driveFight(Game, pol, 200);
      ok(`${m.id}: fight terminates`, r.over, `not over after ${r.rounds} rounds`);
      // 'routed' = the monster broke and ran (fleeAt) — a legitimate terminal,
      // no kill credit, no phantom. It must still END the fight.
      ok(`${m.id}: result set`, ['won', 'lost', 'fled', 'dissolved', 'routed'].includes(r.result), 'result=' + r.result);
      // union_rep: the one that "does not fight" — it must still DIE to strikes
      if (m.id === 'union_rep') ok('union_rep: killable despite not fighting', r.result === 'won', r.result);
      // moderator: the flip game is winnable when played (mute respected)
      if (m.id === 'moderator') ok('moderator: winnable via the quiet counter (wait lifts mute)', r.result === 'won', r.result);
    }
  }

  // ============ SECTION 3: HONESTY — telegraph cells vs damage cells ============
  for (const seed of SEEDS) {
    note(`SEED ${seed} — S3 honesty: damage never lands outside the shown telegraph`);
    for (const m of monsters) {
      const Game = await freshGame(seed);
      startTestFight(Game, m.id);
      const dmgEvents = [];
      const _tbDamage = Game.tbDamage.bind(Game);
      Game.tbDamage = function (key, dmg, source, atkKey, opts) {
        try {
          const f = this.tbfight;
          const tgt = f && this.tbFighter(key);
          // attribute to a monster attacker via atkKey or source naming
          let attacker = null;
          if (atkKey) attacker = f && f.fighters.find(x => x.key === atkKey);
          if (!attacker) {
            attacker = f && f.fighters.find(x => x.kind === 'monster' && x.alive &&
              source && typeof source === 'string' && source.includes(x.name));
          }
          dmgEvents.push({
            targetKey: key, attackerId: attacker && attacker.mdef && attacker.mdef.id,
            tx: tgt && tgt.mx, ty: tgt && tgt.my,
            cells: attacker && attacker.telegraph && attacker.telegraph.cells
              ? attacker.telegraph.cells.map(c => c.cx + ',' + c.cy) : null,
            kind: attacker && attacker.telegraph && attacker.telegraph.kind,
          });
        } catch (e) {}
        return _tbDamage(key, dmg, source, atkKey, opts);
      };
      // dodger: player never attacks, monster gets full attack cycles
      driveFight(Game, 'dodger', 120);
      Game.tbDamage = _tbDamage;
      let lies = 0, checked = 0;
      for (const ev of dmgEvents) {
        if (!ev.attackerId || !ev.cells || ev.kind !== 'squares') continue;
        checked++;
        const pos = ev.tx + ',' + ev.ty;
        if (!ev.cells.includes(pos)) {
          lies++;
          if (lies <= 2) console.log(`  LIE? ${ev.attackerId} hit ${ev.targetKey} at ${pos} outside ${ev.cells.length} telegraphed cells`);
        }
      }
      ok(`${m.id}: telegraph honest (${checked} telegraphed hits)`, lies === 0, `${lies} hits outside telegraph`);
    }
  }

  // ============ SECTION 4: EXPLOIT ============
  for (const seed of SEEDS) {
    note(`SEED ${seed} — S4 exploit: kill credit, friendly fire, flee, armor`);
    // 4a. ONE BODY = ONE KILL (wave gate)
    {
      const Game = await freshGame(seed);
      const before = (Game.state.waveKills || {})[1] || 0;
      startTestFight(Game, 'bulldozer');
      const r = driveFight(Game, 'slayer', 200);
      const after = (Game.state.waveKills || {})[1] || 0;
      ok('bulldozer kill: waveKills +1 exactly', r.result === 'won' && after - before === 1, `result=${r.result} delta=${after - before}`);
    }
    // 4b. SNAKE DE-DUPE (ducks_in_a_row segments are one creature)
    {
      const Game = await freshGame(seed);
      const before = (Game.state.waveKills || {})[1] || 0;
      startTestFight(Game, 'ducks_in_a_row');
      const segs = Game.tbfight.fighters.filter(x => x.kind === 'monster');
      const r = driveFight(Game, 'slayer', 200);
      const after = (Game.state.waveKills || {})[1] || 0;
      ok(`ducks: ${segs.length} segments count as ONE kill`, r.result === 'won' && after - before === 1, `result=${r.result} delta=${after - before}`);
    }
    // 4c. FLEE GRANTS NOTHING
    {
      const Game = await freshGame(seed);
      const before = Object.assign({}, Game.state.waveKills || {});
      startTestFight(Game, 'hushwolf');
      for (const mo of Game.tbfight.fighters) if (mo.kind === 'monster') mo.fled = true;
      try { Game.tbEndCheck(); } catch (e) {}
      const after = Game.state.waveKills || {};
      const delta = Object.keys(after).reduce((s, k) => s + ((after[k] || 0) - (before[k] || 0)), 0);
      const ended = !Game.tbfight || Game.tbfight.over || !!Game._testResult;
      ok('fled monsters grant no waveKill', ended && delta === 0, `ended=${ended} delta=${delta}`);
    }
    // 4d. NO MONSTER-ON-MONSTER DAMAGE (friendly-fire farm blocked)
    {
      const Game = await freshGame(seed);
      startTestFight(Game, 'bright_idea'); // burst r2 — the AoE farm candidate
      // smuggle a second monster into the fight
      const f0 = Game.tbfight.fighters.find(x => x.kind === 'monster');
      const clone = Object.assign({}, f0, { key: 'm2', mx: 4, my: 5, hp: 500, maxHp: 500 });
      Game.tbfight.fighters.push(clone);
      Game.tbfight.order = Game.tbfight.order || [];
      let monsterHitMonster = 0;
      const _tbDamage = Game.tbDamage.bind(Game);
      Game.tbDamage = function (key, dmg, source, atkKey, opts) {
        try {
          const f = this.tbfight;
          const tgt = f && this.tbFighter(key);
          const atk = atkKey && f && f.fighters.find(x => x.key === atkKey);
          if (tgt && tgt.kind === 'monster' && atk && atk.kind === 'monster') monsterHitMonster++;
        } catch (e) {}
        return _tbDamage(key, dmg, source, atkKey, opts);
      };
      driveFight(Game, 'dodger', 80);
      Game.tbDamage = _tbDamage;
      ok('burst never damages other monsters', monsterHitMonster === 0, `${monsterHitMonster} monster-on-monster hits`);
    }
    // 4e. ARMOR MODEL HONESTY: absorbed = min(hit-1, round(hit*r)), r = P/(P+20)
    {
      const Game = await freshGame(seed);
      startTestFight(Game, 'hummice');
      const p = Game.tbFighter('p');
      Game.armorBonus = () => 20; // P=20 -> r=0.5
      const hpBefore = p.hp;
      Game.tbDamage('p', 40, 'test-blow', null, {});
      const taken = hpBefore - p.hp;
      // absorbed = min(39, round(40*0.5)) = 20 -> taken = 20
      ok('armor P=20 halves a 40-hit', taken === 20, `took ${taken}, expected 20`);
      Game.armorBonus = () => 100; // P=100 -> r=100/120=0.8333
      const hp2 = p.hp;
      Game.tbDamage('p', 40, 'test-blow', null, {});
      const taken2 = hp2 - p.hp;
      // absorbed = min(39, round(40*0.8333)) = min(39,33) = 33 -> taken = 7
      ok('armor P=100: 40-hit takes 7 (never immune)', taken2 === 7, `took ${taken2}, expected 7`);
      Game.armorBonus = () => 10000; // absurd stacking: at least 1 always lands
      const hp3 = p.hp;
      Game.tbDamage('p', 40, 'test-blow', null, {});
      const taken3 = hp3 - p.hp;
      ok('armor cannot immunize (hit-1 clamp)', taken3 === 1, `took ${taken3}, expected 1`);
      delete Game.armorBonus;
    }
  }

  // ============ SECTION 5: COUNTERS (Undertale-style, must actually work) ============
  for (const seed of SEEDS) {
    note(`SEED ${seed} — S5 counters`);
    // 5a. DRONE CROWD OVERLOAD: 3+ live targets -> recalc, telegraph cleared
    {
      const Game = await freshGame(seed);
      startTestFight(Game, 'review_drone');
      const f = Game.tbfight;
      // add 3 villager allies
      const mk = (k, n) => ({ key: k, kind: 'villager', name: n, alive: true, fled: false, hp: 100, maxHp: 100, mx: 3, my: 3, speed: 3, moveLeft: 3, acted: false });
      f.fighters.push(mk('v1', 'A'), mk('v2', 'B'), mk('v3', 'C'));
      let recalced = false;
      const _say = Game.say.bind(Game);
      Game.say = function (t) { try { if (/RECALIBRATING/.test(t)) recalced = true; } catch (e) {} return _say(t); };
      for (let i = 0; i < 6 && !recalced; i++) {
        const mo = f.fighters.find(x => x.kind === 'monster');
        try { Game.tbMonsterTurn(mo); } catch (e) {}
        if (f.over) break;
      }
      Game.say = _say;
      ok('drone: crowd of 4 forces recalc', recalced, 'no RECALIBRATING line');
    }
    // 5b. TURTLE FLIP: flipped turtle cannot bunker, loses armor
    {
      const Game = await freshGame(seed);
      startTestFight(Game, 'speedbump_turtle');
      const mo = Game.tbfight.fighters.find(x => x.kind === 'monster');
      mo.turtleFlipped = 3;
      let bunkered = false;
      const _say = Game.say.bind(Game);
      Game.say = function (t) { try { if (/Sealed\. Waiting you out/.test(t)) bunkered = true; } catch (e) {} return _say(t); };
      for (let i = 0; i < 4; i++) { try { Game.tbMonsterTurn(mo); } catch (e) {} if (Game.tbfight.over) break; }
      Game.say = _say;
      ok('flipped turtle never bunkers', !bunkered && (mo.turtleBunker || 0) === 0, `bunkered=${bunkered} bunker=${mo.turtleBunker}`);
    }
    // 5c. TICK TORCH: latched tick + torch in pack -> burned off
    {
      const Game = await freshGame(seed);
      startTestFight(Game, 'alien_tick');
      const mo = Game.tbfight.fighters.find(x => x.kind === 'monster');
      const p = Game.tbFighter('p');
      p.mx = mo.mx + 1; p.my = mo.my; // adjacent: latch next turn
      Game.hasItem = () => true; // torch in pack
      let released = false;
      const _say = Game.say.bind(Game);
      Game.say = function (t) { try { if (/burned off/.test(t)) released = true; } catch (e) {} return _say(t); };
      for (let i = 0; i < 6 && !released; i++) { try { Game.tbMonsterTurn(mo); } catch (e) {} if (Game.tbfight.over) break; }
      Game.say = _say;
      delete Game.hasItem;
      ok('tick: torch burns off latch', released, 'no burn-off line');
    }
    // 5d. PAPARAZZO codex documents the re-center (knowledge-gated counterplay)
    {
      const slain = (byId.paparazzo.codexStages || {}).slain || '';
      ok('paparazzo slain text documents prediction/re-center', /predict|re-center|recenter|learns your dodge/i.test(slain), slain.slice(0, 80));
    }
    // 5e. MOSQUITO: bite can land alien-pool disease (eurika/east_nile), never mundane
    {
      const src = fs.readFileSync(path.join(ROOT, 'src', 'js', 'game.js'), 'utf8');
      ok('mosquito bite draws from alien pool only', src.includes("['eurika', 'east_nile']"), 'pool list not found');
      ok('mosquito bite never grants a mundane disease', !/mosquito[\s\S]{0,600}gut_rot|trichinosis|wound_fever/i.test(src.slice(src.indexOf("['eurika', 'east_nile']") - 200, src.indexOf("['eurika', 'east_nile']") + 400)), 'mundane leak near bite');
    }
  }

  // ============ SECTION 6: KNOWLEDGE GATING ============
  for (const seed of SEEDS) {
    note(`SEED ${seed} — S6 knowledge gating`);
    const Game = await freshGame(seed);
    // fresh codex: telegraph unknown
    const mdef = byId.review_drone;
    const known0 = Game.encTelegraphKnown({ mdef: { id: 'review_drone', attack: mdef.attack } });
    ok('telegraph hidden for unknown monster', known0 === false, 'got ' + known0);
    // 'observed' stage alone does NOT reveal (design: knowledge is earned —
    // witnessing the pattern or slaying teaches it, not the stage label)
    Game.ensureMonsterEntry('review_drone').stage = 'observed';
    const knownObs = Game.encTelegraphKnown({ mdef: { id: 'review_drone', attack: mdef.attack } });
    ok('observed alone does not reveal telegraph', knownObs === false, 'got ' + knownObs);
    // slain reveals
    Game.ensureMonsterEntry('review_drone').stage = 'slain';
    const known1 = Game.encTelegraphKnown({ mdef: { id: 'review_drone', attack: mdef.attack } });
    ok('telegraph shown once slain', known1 === true, 'got ' + known1);
    // pattern learned through play reveals (witness path)
    const Game2 = await freshGame(seed);
    Game2.startCombat('review_drone');
    const mo = Game2.tbfight.fighters.find(x => x.kind === 'monster');
    Game2.tbLearnPattern(mo);
    const known2 = Game2.encTelegraphKnown({ mdef: { id: 'review_drone', attack: mdef.attack } });
    ok('telegraph shown once pattern witnessed', known2 === true, 'got ' + known2);
    // unknown monster shows descriptor, not name/stats
    const disp = Game.monsterDisplayName ? Game.monsterDisplayName('review_drone') : null;
    ok('unknown monster display is descriptor-like', typeof disp === 'string' && !/Performance Review/.test(disp), String(disp).slice(0, 60));
  }

  console.log(`\n==== RESULT: ${pass} pass, ${fail} fail ====`);
  if (failures.length) { console.log('FAILURES:'); for (const f of failures) console.log(' - ' + f); process.exit(1); }
  console.log('All monster break-it checks green.');
})();
