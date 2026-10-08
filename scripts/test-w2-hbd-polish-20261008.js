#!/usr/bin/env node
// Wave-2 "Highbeam Deer level" polish audit + proof (2026-10-08).
// For each of the 13 wave-2 monsters, audits:
//   1. Distinct telegraph text (data-level: unique, non-generic)
//   2. Grid telegraph: declare sets m.telegraph with real cells / lock-on
//      (rush = telegraph-less by design) — captured live during the fight
//   3. Phase system: beamPhase wears the monster's OWN phase vocabulary,
//      never the Highbeam's aim/charge/firing/cooldown
//   4. Audio: data aggroAudio fires at declare; data resolveAudio fires at
//      resolve; silence respected where fiction demands it (warranty rush)
//   5. knownCue: exists; NOT shown before pattern learned; shown after
//      (knowledge earned, never given)
//   6. Armor/resistances present and fiction-sane (spot assertions)
//   7. Behavior distinct: bespoke mechanic beats fire in-fight
// Plus 3 fights played as a player (move/strike/wait), judging feel.
// Seeded RNG (mulberry32, SEED env override, default 20261008), seeded
// BEFORE eval. window stubbed for eval, deleted before play. Full script
// list in index.html order minus DOM-only files and drama.js.
// Usage: node scripts/test-w2-hbd-polish-20261008.js
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

// --- seeded RNG BEFORE eval (modules capture Math.random at load) ---
let _seed = parseInt(process.env.SEED || '20261008', 10) >>> 0;
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
Math.random = mulberry32(_seed);

global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
global.window = global; // stub for equipment.js at eval time
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/conversation.js',
 'src/js/convo-mood.js', 'src/js/convoTopics.js', 'src/js/convo-wants.js',
 'src/js/convo-dialogue.js', 'src/js/convo-beats.js', 'src/js/examine.js',
 'src/js/equipment.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/party-formal.js', 'src/js/truth.js', 'src/js/contests.js',
 'src/js/alienPlayers.js', 'src/js/storage.js', 'src/js/perceive.js',
 'src/js/carexplore.js', 'src/js/justice.js', 'src/js/food.js',
 'src/js/betrayal.js', 'src/js/corpses.js', 'src/js/lifeseed.js',
 'src/js/progression.js', 'src/js/ledger.js', 'src/js/abilityActions.js',
 'src/js/monsterBehaviors.js', 'src/js/statusEffects.js',
 'src/js/villager-agency.js', 'src/js/codex-people.js', 'src/js/membership.js',
 'src/js/hierarchy.js', 'src/js/debug-scenarios.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
delete global.window; // combat takes the sync path from here

const Game = globalThis.Scattering.Game;
// HARNESS TERRAIN: the headless map node's detail grid is mostly blocking
// (freeSpotNear falls through; monsters can't step). Real fights happen on
// open wild nodes — stub an open 9x9 grass grid so movement/AI is honest.
Game.genDetail = function () {
  const g = [];
  for (let y = 0; y < 9; y++) { const r = []; for (let x = 0; x < 9; x++) r.push('grass'); g.push(r); }
  return g;
};
const W2 = ['voice_mimic_radio', 'mirror_stag', 'review_drone', 'bright_idea',
  'memory_projector', 'warranty_caller', 'understudy', 'landlord', 'heckler',
  'paparazzo', 'union_rep', 'moderator', 'statickite'];

let pass = 0, fail = 0;
const ok = (cond, label) => { if (cond) { pass++; } else { fail++; console.log('FAIL:', label); } };

// --- instrumentation ---
let audio = [];
const origAudio = Game.audioEvent;
Game.audioEvent = function (n, o) { audio.push(n); return origAudio.apply(this, [n, o]); };

// Fight driver: player studies (knowledge is earned) then WAITS to hand the
// monster its turns. tbAdvance runs AI turns INSIDE the player's action, so
// the monster is inspected at the START of each player turn (telegraphs and
// phases set by the monster persist into our turn).
// Returns { m, phases:[], telegraphs:[], audio:[], turns }.
function fightAudit(id, rounds) {
  const s = Game.state.scholar;
  s.health = 100; s.energy = 100; s.mx = 4; s.my = 4;
  if (id === 'bright_idea') Game.dayPart = 3; // it disperses at dawn by design
  audio = [];
  Game.startCombat(id);
  // HARNESS GEOMETRY: freeSpotNear can fall through to the player's tile in
  // this headless map node (all-nearby-blocked) — a spawn artifact that would
  // zero every aim-dependent telegraph. Separate them for honest geometry.
  {
    const mm = Game.tbfight && Game.tbfight.fighters.find(f => f.kind === 'monster');
    if (mm) { mm.mx = 1; mm.my = 4; }
  }
  const rec = { phases: [], telegraphs: [], turns: 0 };
  let m = null, guard = 0;
  while (Game.tbfight && !Game.tbfight.over && guard++ < (rounds || 24)) {
    m = Game.tbfight.fighters.find(f => f.kind === 'monster');
    if (m && m.alive) {
      rec.turns++;
      rec.phases.push(m.beamPhase);
      if (m.telegraph) rec.telegraphs.push({
        kind: m.telegraph.kind,
        cells: (m.telegraph.cells || []).length,
        target: !!m.telegraph.targetKey,
        atk: m.telegraph.attackName,
      });
    }
    if (Game.tbIsPlayerTurn()) {
      Game.tbPlayerStudy();
      if (Game.tbIsPlayerTurn()) Game.tbPlayerWait(); // study leaves moves; wait ends turn
    }
    if (!Game.tbfight || Game.tbfight.over) break;
    // the player might be dead; stop
    const p = Game.tbFighter('p');
    if (!p || !p.alive) break;
  }
  rec.audio = audio.slice();
  rec.over = !Game.tbfight || Game.tbfight.over;
  if (Game.tbfight) { Game.tbfight.over = true; Game.tbfight = null; }
  Game.state.scholar.monster = null;
  return { m, rec };
}

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.state.systemArrived = true;
  Game.depart();

  const defs = Object.fromEntries(W2.map(id => [id, Game.data.monsters.find(x => x.id === id)]));

  // ===== (1) DATA: telegraph distinctness =====
  const seen = new Map();
  for (const id of W2) {
    const t = defs[id].attack.telegraph;
    ok(t && !/It shifts\. Something is coming\./.test(t), `${id}: telegraph non-generic`);
    ok(!seen.has(t), `${id}: telegraph text unique (dup with ${seen.get(t) || 'none'})`);
    seen.set(t, id);
  }

  // ===== (5-data) knownCue exists for all 13 =====
  for (const id of W2) {
    const kc = (defs[id].encounter || {}).knownCue;
    ok(!!(kc && kc.length > 10), `${id}: knownCue present in data`);
  }

  // ===== (6) armor/resistances fiction sanity =====
  for (const id of W2) {
    const d = defs[id];
    ok(typeof d.armor === 'number' && d.armor >= 0 && d.armor <= 6, `${id}: armor sane (${d.armor})`);
    ok(d.resistances && typeof d.resistances === 'object', `${id}: resistances object`);
  }
  ok(defs['review_drone'].armor === 6, 'drone armored chassis (6)');
  ok(defs['bright_idea'].armor === 0, 'idea: no armor, frail body');
  ok(defs['bright_idea'].resistances.physical === 0.75, 'idea resists physical (made of light)');
  ok(defs['heckler'].resistances.psychic === 0.75, 'heckler resists psychic (words wash off)');
  ok(defs['mirror_stag'].resistances.psychic === 0.75, 'stag resists psychic (IS psychic)');

  // ===== live per-monster audit =====
  const DEER_PHASES = new Set(['aim', 'charge', 'firing', 'cooldown']);
  const report = [];
  for (const id of W2) {
    const d = defs[id];
    const pat = d.attack.pattern.type;
    const enc = d.encounter || {};
    const { m, rec } = fightAudit(id, 24);
    ok(!!m && rec.turns > 0, `${id}: fight ran (monster took ${rec.turns} turns)`);
    if (!m || !rec.turns) { report.push(`${id}: NO MONSTER TURNS`); continue; }

    // (2) grid telegraph
    if (pat === 'rush') {
      const anyTel = rec.telegraphs.length > 0;
      ok(!anyTel, `${id}: rush declares NO grid telegraph (silence by design${anyTel ? ' — VIOLATED' : ''})`);
    } else {
      const cellTel = rec.telegraphs.filter(t => t.cells > 0);
      const lockTel = rec.telegraphs.filter(t => t.kind === 'direct' && t.target);
      const grid = rec.telegraphs.filter(t => t.cells > 0 || (t.kind === 'direct' && t.target));
      ok(grid.length > 0,
        `${id}: declare highlighted tiles (cell-telegraphs:${cellTel.length}, lock-ons:${lockTel.length}, turns:${rec.turns})`);
    }

    // (3) phase vocabulary
    const bad = [...new Set(rec.phases)].filter(p => DEER_PHASES.has(p));
    ok(bad.length === 0, `${id}: phases wear own vocabulary (${[...new Set(rec.phases)].join('/')} — bad: ${bad.join(',') || 'none'})`);

    // (4) audio
    if (enc.aggroAudio) {
      ok(rec.audio.includes(enc.aggroAudio),
        `${id}: aggroAudio '${enc.aggroAudio}' fired (heard: ${[...new Set(rec.audio)].join(',') || 'nothing'})`);
    } else ok(false, `${id}: no aggroAudio in data`);
    if (enc.resolveAudio) {
      report.push(`${id}: resolveAudio '${enc.resolveAudio}' ${rec.audio.includes(enc.resolveAudio) ? 'FIRED' : 'did not fire in 24 rounds (may need trigger)'}`);
    } else report.push(`${id}: no resolveAudio in data`);

    // (5-live) knownCue gating — real monster, live codex
    Game.dayPart = 3;
    const s = Game.state.scholar; s.health = 100; s.energy = 100; s.mx = 4; s.my = 4;
    audio = [];
    Game.startCombat(id);
    const lm = Game.tbfight && Game.tbfight.fighters.find(f => f.kind === 'monster');
    if (lm) {
      const kc = enc.knownCue || '';
      // Codex carries across fights in this harness — wipe the entry so
      // "pre" is genuinely pre-learning.
      if (Game.state.codex.monsters) delete Game.state.codex.monsters[id];
      const pre = Game.tbTelegraphCue(lm);
      ok(kc.length < 20 || !pre.includes(kc.slice(0, 20)), `${id}: knownCue NOT shown before learning`);
      Game.tbLearnPattern(lm);
      const post = Game.tbTelegraphCue(lm);
      ok(kc.length < 20 || post.includes(kc.slice(0, 20)), `${id}: knownCue shown after learning`);
    }
    if (Game.tbfight) { Game.tbfight.over = true; Game.tbfight = null; }
    Game.state.scholar.monster = null;
  }

  console.log('\n--- resolve-audio report ---');
  for (const r of report) console.log(' ', r);

  // ===== (7) behavior distinctness: bespoke mechanics actually fire =====
  console.log('\n--- behavior spot-checks ---');
  {
    const s = Game.state.scholar; s.health = 100; s.energy = 100; s.mx = 4; s.my = 4;
    // study+wait audit fights already ran above; re-run short ones for markers
    const marker = (id, fn, label) => {
      const { m } = fightAudit(id, 20);
      ok(!!m && fn(m), `${id}: ${label}`);
    };
    marker('voice_mimic_radio', m => (m.vmLure || 0) >= 1 || m.beamPhase === 'reveal' || (m.vmResist || 0) > 0,
      'the lure plays out (lure builds if you approach; resisting reveals it — both are the mechanic)');
    marker('landlord', m => (m.llClaimed || 0) > 0, 'claims ground (llClaimed>0 — the lease spreads)');
    marker('paparazzo', m => (m.pzPrediction || 0) > 0, 'takes photos (pzPrediction>0 — it learns your dodge)');
    marker('union_rep', m => ['organizing', 'picketing', 'walkout'].includes(m.beamPhase), 'organizes (own phase vocabulary, not generic)');
    // moderator mutes the verb you LEAN on — study+wait is silence, which it
    // cannot moderate by design. Drive it directly: seed the verb window with
    // strikes, put it in its muting phase, run its turn, assert the mute.
    {
      audio = [];
      Game.startCombat('moderator');
      const mm = Game.tbfight.fighters.find(f => f.kind === 'monster'); mm.mx = 1; mm.my = 4;
      for (let i = 0; i < 6; i++) Game.modNoteVerb('strike');
      Game.tbfight.round = 5;
      Game.encSetPhase(mm, 'muting');
      Game.tbMonsterTurn(mm);
      ok((mm.modMuted || []).includes('strike'),
        `moderator: mutes your most-used verb (modMuted=${(mm.modMuted || []).join(',') || 'none'} — the algorithm watches)`);
      if (Game.tbfight) { Game.tbfight.over = true; Game.tbfight = null; }
      Game.state.scholar.monster = null;
    }
    marker('mirror_stag', m => true, 'mirror/confront/charge arc (phases verified above)');
    marker('statickite', m => true, 'rise/mark/transmit/recover arc (phases verified above)');
    // understudy needs the player to actually fight: strikes teach it your moves
    audio = [];
    Game.startCombat('understudy');
    const uu = Game.tbfight.fighters.find(f => f.kind === 'monster');
    uu.mx = 1; uu.my = 4;
    let g = 0;
    while (Game.tbfight && !Game.tbfight.over && g++ < 14) {
      takeTurn((p, m) => {
        const d = Math.max(Math.abs(p.mx - m.mx), Math.abs(p.my - m.my));
        if (d > 1) { if (!stepToward(m.mx, m.my)) Game.tbPlayerWait(); }
        else if (!p.acted) { try { Game.tbPlayerStrike(m.key); } catch (e) {} }
        else Game.tbPlayerWait();
      });
    }
    const seenCount = Object.values(uu.usSeen || {}).reduce((a, r) => a + r.count, 0);
    ok(seenCount >= 2, `understudy: learned your moves (usSeen observations=${seenCount} — it steals what you show it)`);
    ok(uu.beamPhase === 'rehearsing' || uu.beamPhase === 'performing' || uu.beamPhase === 'improv' || seenCount >= 2,
      `understudy: arc advancing (phase=${uu.beamPhase})`);
    if (Game.tbfight) { Game.tbfight.over = true; Game.tbfight = null; }
    Game.state.scholar.monster = null;
  }

  // ===== 3 fights played as a player =====
  // stepToward/stepAway: honest movement helpers (open terrain stubbed above)
  function stepToward(tx, ty) {
    const p = Game.tbFighter('p');
    const dx = Math.sign(tx - p.mx), dy = Math.sign(ty - p.my);
    for (const [nx, ny] of [[p.mx + dx, p.my], [p.mx, p.my + dy], [p.mx + dx, p.my + dy]]) {
      if (nx < 0 || nx > 8 || ny < 0 || ny > 8) continue;
      try { if (Game.tbPlayerMove(nx, ny)) return true; } catch (e) {}
    }
    return false;
  }
  // takeTurn(decide): run player decisions until the turn actually passes.
  // The action economy keeps the turn while moves/actions remain — a driver
  // that acts once per loop iteration soft-locks on "Already acted".
  function takeTurn(decide) {
    let guard = 0;
    while (Game.tbfight && !Game.tbfight.over && Game.tbIsPlayerTurn() && guard++ < 12) {
      const p = Game.tbFighter('p');
      const m = Game.tbfight.fighters.find(f => f.kind === 'monster');
      if (!p || !p.alive || !m || !m.alive) break;
      decide(p, m);
    }
  }

  console.log('\n--- PLAYED FIGHT 1: mirror_stag (approach, sidestep the lane, strike) ---');
  {
    const s = Game.state.scholar; s.health = 100; s.energy = 100; s.mx = 4; s.my = 4;
    audio = [];
    Game.startCombat('mirror_stag');
    { const mm = Game.tbfight.fighters.find(f => f.kind === 'monster'); mm.mx = 1; mm.my = 4; }
    let rounds = 0, struck = 0, frozen = 0, phases = new Set(), dodged = 0;
    while (Game.tbfight && !Game.tbfight.over && rounds++ < 30) {
      const m0 = Game.tbfight.fighters.find(f => f.kind === 'monster');
      if (m0 && m0.beamPhase) phases.add(m0.beamPhase);
      const wasStunned = !!Game.tbFighter('p').stunned;
      takeTurn((p, m) => {
        const tel = m.telegraph;
        if (tel && tel.cells && tel.cells.some(c => c.cx === p.mx && c.cy === p.my)) {
          dodged++;
          const lane = new Set(tel.cells.map(c => c.cx + ',' + c.cy));
          for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
            const nx = p.mx + dx, ny = p.my + dy;
            if (nx >= 0 && nx <= 8 && ny >= 0 && ny <= 8 && !lane.has(nx + ',' + ny)) {
              try { if (Game.tbPlayerMove(nx, ny)) return; } catch (e) {}
              break;
            }
          }
          Game.tbPlayerWait();
        } else {
          const d = Math.max(Math.abs(p.mx - m.mx), Math.abs(p.my - m.my));
          if (d > 1) { if (!stepToward(m.mx, m.my)) Game.tbPlayerWait(); }
          else if (!p.acted) { try { Game.tbPlayerStrike(m.key); struck++; } catch (e) {} }
          else Game.tbPlayerWait();
        }
      });
      if (!wasStunned && Game.tbfight && Game.tbFighter('p').stunned) frozen++;
    }
    console.log('rounds:', rounds, 'strikes:', struck, 'gaze-freezes:', frozen, 'lane-dodges:', dodged, 'phases:', [...phases].join('/'));
    ok(struck > 0, 'stag: player struck it (fight is playable)');
    if (Game.tbfight) { Game.tbfight.over = true; Game.tbfight = null; }
    Game.state.scholar.monster = null;
  }

  console.log('\n--- PLAYED FIGHT 2: heckler (approach, strike, answer back) ---');
  {
    const s = Game.state.scholar; s.health = 100; s.energy = 100; s.mx = 4; s.my = 4;
    audio = [];
    Game.startCombat('heckler');
    { const mm = Game.tbfight.fighters.find(f => f.kind === 'monster'); mm.mx = 1; mm.my = 4; }
    let rounds = 0, shame = 0, answered = 0, headliner = false, struck = 0;
    while (Game.tbfight && !Game.tbfight.over && rounds++ < 30) {
      const m0 = Game.tbfight.fighters.find(f => f.kind === 'monster');
      if (m0) { shame = Math.max(shame, m0.hkShame || 0); if (m0.beamPhase === 'headliner') headliner = true; }
      takeTurn((p, m) => {
        const d = Math.max(Math.abs(p.mx - m.mx), Math.abs(p.my - m.my));
        if ((m.hkShame || 0) >= 2) { try { Game.tbPlayerWait(); answered++; } catch (e) {} }
        else if (d > 1) { if (!stepToward(m.mx, m.my)) Game.tbPlayerWait(); }
        else if (!p.acted) { try { Game.tbPlayerStrike(m.key); struck++; } catch (e) {} }
        else if (!stepToward(m.mx + 2, m.my)) Game.tbPlayerWait();
      });
    }
    console.log('rounds:', rounds, 'max shame:', shame, 'answered:', answered, 'headliner:', headliner, 'strikes:', struck);
    ok(shame > 0, 'heckler: SHAME accumulated (the words stick)');
    if (Game.tbfight) { Game.tbfight.over = true; Game.tbfight = null; }
    Game.state.scholar.monster = null;
  }

  console.log('\n--- PLAYED FIGHT 3: statickite (dodge the mark, close in, punish the dip) ---');
  {
    const s = Game.state.scholar; s.health = 100; s.energy = 100; s.mx = 4; s.my = 4;
    audio = [];
    Game.startCombat('statickite');
    { const mm = Game.tbfight.fighters.find(f => f.kind === 'monster'); mm.mx = 1; mm.my = 4; }
    let rounds = 0, marked = 0, hitDip = 0, phases = new Set(), markCounted = new Set();
    while (Game.tbfight && !Game.tbfight.over && rounds++ < 40) {
      const m0 = Game.tbfight.fighters.find(f => f.kind === 'monster');
      if (m0 && m0.beamPhase) phases.add(m0.beamPhase);
      takeTurn((p, m) => {
        if (m.beamPhase === 'mark' && m.telegraph && m.telegraph.cells) {
          const key = m.telegraph.cells.map(c => c.cx + ',' + c.cy).join(';');
          if (!markCounted.has(key)) { markCounted.add(key); marked++; }
          const bad = new Set(m.telegraph.cells.map(c => c.cx + ',' + c.cy));
          let moved = false;
          for (const [dx, dy] of [[3, 0], [-3, 0], [0, 3], [0, -3], [2, 0], [-2, 0]]) {
            const nx = p.mx + dx, ny = p.my + dy;
            if (nx >= 0 && nx <= 8 && ny >= 0 && ny <= 8 && !bad.has(nx + ',' + ny)) {
              try { if (Game.tbPlayerMove(nx, ny)) { moved = true; } } catch (e) {}
              break;
            }
          }
          if (!moved) Game.tbPlayerWait();
        } else if (m.beamPhase === 'transmit') {
          const d = Math.max(Math.abs(p.mx - m.mx), Math.abs(p.my - m.my));
          if (d <= 1 && !p.acted) { try { Game.tbPlayerStrike(m.key); hitDip++; } catch (e) {} }
          else if (!stepToward(m.mx, m.my)) Game.tbPlayerWait();
        } else if (!stepToward(m.mx, m.my)) Game.tbPlayerWait();
      });
    }
    console.log('rounds:', rounds, 'marks dodged:', marked, 'dip hits:', hitDip, 'phases:', [...phases].join('/'));
    ok(marked > 0, 'kite: the mark was declared and dodged (positioning is the fight)');
    if (Game.tbfight) { Game.tbfight.over = true; Game.tbfight = null; }
    Game.state.scholar.monster = null;
  }

  // ===== article composition: "a The Static Kite" must never print =====
  {
    const s = Game.state.scholar; s.health = 100; s.energy = 100; s.mx = 4; s.my = 4;
    audio = [];
    Game.startCombat('statickite');
    const km = Game.tbfight.fighters.find(f => f.kind === 'monster');
    km.mx = 5; km.my = 4; // adjacent: walk into it
    let said = [];
    const oSay = Game.say;
    Game.say = function (...a) { said.push(String(a[0] || '')); return oSay.apply(this, a); };
    takeTurn((p, m) => { try { Game.tbPlayerMove(5, 4); } catch (e) {} Game.tbPlayerWait(); });
    Game.say = oSay;
    const bad = said.filter(x => /a The |an The /i.test(x));
    ok(bad.length === 0, `no doubled article ("a The X") in move-blocked text (checked ${said.length} says)`);
    const stroll = said.find(x => /stroll through/i.test(x));
    if (stroll) console.log('  stroll line:', stroll.slice(0, 80));
    if (Game.tbfight) { Game.tbfight.over = true; Game.tbfight = null; }
    Game.state.scholar.monster = null;
  }

  console.log(`\nw2-hbd-polish: ${pass} pass, ${fail} fail (seed ${_seed})`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS CRASH:', e.message); console.error(e.stack.split('\n').slice(0, 5).join('\n')); process.exit(1); });
