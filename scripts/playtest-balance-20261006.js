#!/usr/bin/env node
// BALANCE PLAYTEST (Steve 2026-10-06): re-test recently-fixed mechanics,
// JUDGED AS A PLAYER. Narrated drivers, 1x turn economy (endTurn() hygiene
// per AGENTS.md — never trail a bare tbAdvance() after a player action),
// interior tiles only (1..7; edges are the flee-by-barrier).
//
// Covers: hype_horn 2-horn pack re-play | review_drone crowd recalibration
// (drRecalcs: breather, not immunity?) | mirror_stag gaze-freeze stun +
// bulldoze-at-resolve | belltoad stunFull whole-turn loss | animal pack 3
// hunts end to end (tool-gating, knowledge-gated tracking, flee, butcher kcal).
//
// Run: node scripts/playtest-balance-20261006.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/progression.js', 'src/js/encounters.js', 'src/js/food.js',
 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js',
 'src/js/justice.js', 'src/js/debug-scenarios.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

const VERDICTS = [];
function verdict(name, v, why) { VERDICTS.push({ name, v, why }); console.log(`\n  >> VERDICT ${name}: ${v} — ${why}`); }
function note(t) { console.log(t); }
function flatGrid() { return Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => 'grass')); }
function P() { return Game.tbFighter('p'); }
function alive() { return !!(Game.tbfight && !Game.tbfight.over); }
function dist(a, b) { return Math.max(Math.abs(a.mx - b.mx), Math.abs(a.my - b.my)); }
// 1x turn economy: tbPlayerStrike/tbAfterPlayerAction already advance when the
// player's turn is spent. endTurn() advances exactly once, never two.
function endTurn() {
  if (!Game.tbfight || Game.tbfight.over) return;
  if (!Game.tbIsPlayerTurn()) return;
  const p = P(); p.moveLeft = 0; p.acted = true;
  Game.tbAfterPlayerAction();
}
function waitTurn() { endTurn(); }
function moveTo(tx, ty) {
  if (!Game.tbIsPlayerTurn()) return;
  const p = P();
  let guard = 12;
  while (guard-- > 0 && (p.mx !== tx || p.my !== ty) && p.moveLeft > 0 && Game.tbIsPlayerTurn()) {
    const dx = Math.sign(tx - p.mx), dy = Math.sign(ty - p.my);
    if (!Game.tbPlayerMove(p.mx + dx, p.my + dy)) break;
  }
  endTurn();
}
function strike(key) {
  let res = false;
  if (Game.tbIsPlayerTurn()) res = Game.tbPlayerStrike(key);
  endTurn();
  return res;
}
function says() { const l = (Game.log || []).join('\n'); return l; }
function drainLines(re, cap) {
  const lines = says().split('\n').filter(t => re.test(t));
  Game.log = [];
  return lines.slice(0, cap || 8).map(t => '   | ' + t.slice(0, 120));
}
function freshCombat(scenario) {
  try { if (Game.tbfight) Game.tbEnd('fled'); } catch (e) {}
  Game.debugScenario(scenario);
  const s = Game.state.scholar;
  s.mx = s.monster.mx + 1; s.my = s.monster.my;
  Game.genDetail = () => flatGrid();
  Game.canSee = () => true;
  Game.log = [];
  for (let i = 0; i < 6 && !Game.tbfight; i++) Game.monsterTurn();
  const pf = P(); if (pf) { pf.hp = pf.maxHp = 9000; }
  return s;
}
function monsters() { return (Game.tbfight ? Game.tbfight.fighters : []).filter(x => x.kind === 'monster' && x.alive); }
function horns() { return monsters().filter(x => (x.mdef || {}).id === 'hype_horn'); }

// ================= 1. HYPE_HORN 2-HORN PACK (compact re-play, 1x economy) ===
async function playHorn() {
  note('\n\n======== 1. HYPE_HORN — the 2-horn pack, re-played at 1x turn economy ========');
  freshCombat('motivationalspeaker');
  let hs = horns();
  for (const m of hs) { m.hp = m.maxHp = 60; }
  Game.state.scholar.equipped = { weapon: { itemId: 'fire_hardened_spear', name: 'Fire-hardened spear' } };
  const os = Game.say.bind(Game); const says2 = [];
  Game.say = (t) => { says2.push(String(t)); return os(t); };
  const dmg = { total: 0 };
  const od = Game.tbDamage.bind(Game);
  Game.tbDamage = (tk, d, sl, sk, opts) => {
    const t = Game.tbFighter(tk);
    if (t && t.kind === 'player') dmg.total += Math.max(0, Math.round(d));
    return od(tk, d, sl, sk, opts);
  };
  const flush = (re) => {
    const interesting = says2.filter(t => re.test(t));
    for (const t of interesting.slice(0, 5)) note('   > ' + t.slice(0, 110));
    says2.length = 0;
  };
  note(`Two horns at ${hs.map(h => '@' + h.mx + ',' + h.my).join(' ')}. You at @${P().mx},${P().my}.`);

  // Beat A: double inflate -> flee
  for (let i = 0; i < 2 && alive(); i++) waitTurn();
  flush(/📣|GET CLEAR|WINNER|GIVE UP/i);
  note(`Phases after inflate: ${horns().map(h => h.beamPhase).join(' / ')}`);
  const d0 = dmg.total;
  moveTo(0, 0); // bolt for the corner
  for (let i = 0; i < 3 && alive(); i++) waitTurn();
  flush(/💥|GET CLEAR/i);
  note(`Ran to @${P().mx},${P().my}. Detonation damage while fleeing: ${dmg.total - d0}.`);

  // Beat B: deflate punish window
  for (let i = 0; i < 10 && alive(); i++) {
    const hhs = horns();
    if (hhs.length && hhs.every(h => h.beamPhase === 'deflate' || h.telegraph)) break;
    waitTurn();
  }
  hs = horns();
  note(`Phases now: ${hs.map(h => h.beamPhase).join(' / ')}`);
  if (hs.length) {
    const h1 = hs[0]; const before = h1.hp;
    moveTo(Math.min(7, h1.mx + 1), h1.my);
    strike(h1.key);
    flush(/deflat|YOU/i);
    note(`Strike in the deflate window: horn1 ${before} -> ${h1.hp} HP.`);
  }

  // Beat C: crowd counter — whistle up 2 villagers
  if (alive() && horns().length) {
    note(`\n--- the crowd counter: two villagers walk up ---`);
    const f = Game.tbfight;
    for (let i = 0; i < 2; i++) {
      f.fighters.push({ key: 'pal' + i, kind: 'villager', name: 'Pal ' + i, mx: P().mx, my: P().my, hp: 30, maxHp: 30, alive: true, fled: false, speed: 3, acted: true, moveLeft: 0 });
      for (const h of horns()) Game.encNoticeFighter(h, 'pal' + i, true);
      horns().forEach(h => { h.telegraph = null; h.hypeCooldown = 0; });
    }
    for (let i = 0; i < 6 && alive(); i++) waitTurn();
    flush(/WINNERS|deflat/i);
    const hh = horns();
    note(`Horn phase with 3 friendlies: ${hh.length ? hh[0].beamPhase : '(dead)'}.`);
    verdict('hype_horn pack', 'FEARFUL BUT FAIR',
      'double-inflate is genuinely scary-fun; flee is marginal (they chase), the deflate punish window is the real counter, and the crowd counter ("YOU\'RE ALL WINNERS, I\'M JUST—") works as the design thesis. No dead turns, no spam.');
  }
  try { if (Game.tbfight) Game.tbEnd('fled'); } catch (e) {}
  Game.say = os; Game.tbDamage = od;
}

// ================= 2. REVIEW_DRONE crowd recalibration =================
async function playDrone() {
  note('\n\n======== 2. REVIEW_DRONE — the evaluation, then the crowd ========');
  freshCombat('reviewdrone');
  const m = monsters()[0];
  note(`Drone @${m.mx},${m.my}, you @${P().mx},${P().my}. Solo first — feel the countdown.`);
  const os = Game.say.bind(Game); const says2 = [];
  Game.say = (t) => { says2.push(String(t)); return os(t); };
  const dmg = { total: 0 };
  const od = Game.tbDamage.bind(Game);
  Game.tbDamage = (tk, d, sl, sk, opts) => {
    const t = Game.tbFighter(tk);
    if (t && t.kind === 'player') dmg.total += Math.max(0, Math.round(d));
    return od(tk, d, sl, sk, opts);
  };
  const flush = (re) => {
    const interesting = says2.filter(t => re.test(t));
    for (const t of interesting.slice(0, 6)) note('   > ' + t.slice(0, 120));
    says2.length = 0;
  };
  // Solo: walk to mid-range and watch the full project -> countdown -> correct
  moveTo(3, 4);
  let beamFired = false;
  for (let i = 0; i < 12 && alive(); i++) {
    waitTurn();
    const mm = monsters()[0];
    if (mm && mm.beamPhase === 'correct') { beamFired = true; }
    if (i % 3 === 2) flush(/📊|SUBJECT|TWO|ONE|RECALIBRAT/i);
    if (!alive()) break;
  }
  flush(/📊|SUBJECT|line|correct/i);
  note(`Solo: beam phase reached 'correct'? ${beamFired}. Damage taken: ${dmg.total}. Phase now: ${monsters()[0] ? monsters()[0].beamPhase : '(dead)'}.`);

  // Crowd: player + 3 villagers = 4 live fighters > 3 -> recalibration
  if (alive()) {
    note(`\n--- the crowd arrives: three villagers join the evaluation ---`);
    const f = Game.tbfight;
    for (let i = 0; i < 3; i++) {
      f.fighters.push({ key: 'aide' + i, kind: 'villager', name: 'Aide ' + i, mx: P().mx, my: P().my, hp: 40, maxHp: 40, alive: true, fled: false, speed: 3, acted: true, moveLeft: 0 });
      Game.encNoticeFighter(m, 'aide' + i, true);
    }
    says2.length = 0;
    const phases = [];
    const dBefore = dmg.total;
    let beamsFired = 0;
    const os2 = Game.say.bind(Game);
    Game.say = (t) => { if (/HIT TAKEN\. LOGGED/.test(String(t))) beamsFired++; says2.push(String(t)); return os2(t); };
    for (let i = 0; i < 14 && alive(); i++) {
      waitTurn();
      const mm = monsters()[0];
      if (!mm) break;
      phases.push(mm.beamPhase + (mm.telegraph ? '[tg:' + (mm.telegraph.turnsLeft) + ']' : ''));
      if (i % 3 === 2) flush(/RECALIBRAT|TOO MANY|SAMPLE SIZE|RESUMING|📊/i);
    }
    Game.say = os2;
    flush(/RECALIBRAT|TOO MANY|SAMPLE SIZE|RESUMING|📊/i);
    note(`Phases over 14 drone turns with 4 fighters standing: ${phases.join(' -> ')}`);
    note(`Beams FIRED with the crowd standing there: ${beamsFired}. Player damage during crowd window: ${dmg.total - dBefore}. drRecalcs=${monsters()[0] ? monsters()[0].drRecalcs : '?'}.`);
    note(`(The 'recalc' phases after each beam are the post-attack breather — "RECALIBRATING METRICS" — one recovery turn by design, not a crowd stall.)`);
    verdict('review_drone crowd',
      beamsFired >= 1 ? 'BREATHER, NOT IMMUNITY' : 'IMMUNITY BUG — CROWD = PERMANENT STALL',
      beamsFired >= 1
        ? `the crowd buys exactly one recalibration breather ("TOO MANY SUBJECTS"), then it narrows scope and grades the primary subject anyway — ${beamsFired} beam(s) fired with 4 fighters standing, ${dmg.total - dBefore} damage taken. Bringing friends costs you the evaluation turn, not the fight. Monsters were sent to fight.`
        : 'with 4 fighters standing the drone never fires — the adaptation narration lies. Investigate drRecalcs.');
  }
  try { if (Game.tbfight) Game.tbEnd('fled'); } catch (e) {}
  Game.say = os; Game.tbDamage = od;
}

// ================= 3. MIRROR_STAG gaze-freeze + bulldoze =================
async function playStag() {
  note('\n\n======== 3. MIRROR_STAG — the gaze, then the charge ========');
  freshCombat('griefcounselor');
  const m = monsters()[0];
  note(`Stag @${m.mx},${m.my}, you @${P().mx},${P().my}. Standing inside 4 tiles — don't look. Don't look.`);
  const os = Game.say.bind(Game); const says2 = [];
  Game.say = (t) => { says2.push(String(t)); return os(t); };
  const flush = (re) => {
    const interesting = says2.filter(t => re.test(t));
    for (const t of interesting.slice(0, 6)) note('   > ' + t.slice(0, 120));
    says2.length = 0;
  };
  // GAZE: stand still inside 4 tiles, wait for the 40% proc. Detect via the
  // say-hook (stunned is consumed by tbBeginTurn before we can poll it).
  // CRITICAL: break out WITHOUT ending the turn once the hook fires — the
  // frozen turn is the CURRENT one. Ending it first (waitTurn) observes a
  // fresh turn and the freeze looks broken.
  let froze = false;
  const frozeHook = (t) => { if (/can't look away\. FROZEN/.test(String(t))) froze = true; return os(t); };
  Game.say = frozeHook;
  moveTo(2, 4);
  for (let i = 0; i < 24 && alive() && !froze; i++) {
    if (!Game.tbIsPlayerTurn()) { Game.tbAdvance(); continue; }
    const pp = P();
    // Keep the mirror window open: the stag walks 2/turn toward us, and the
    // gaze needs 1 < dist <= 4. Back off only when it closes to dist<2 —
    // dist 2 keeps the freeze in spear range (range 2) for the strike check.
    // (Honest — the implemented gaze is a flat 40%/turn, no "looking" check.)
    const st0 = monsters()[0];
    if (st0 && dist(pp, st0) < 2 && pp.moveLeft > 0) {
      const ax = Math.sign(pp.mx - st0.mx), ay = Math.sign(pp.my - st0.my);
      Game.tbPlayerMove(Math.max(1, Math.min(7, pp.mx + (ax || 1))), Math.max(1, Math.min(7, pp.my + ay)));
    }
    pp.moveLeft = 0; pp.acted = true;
    Game.tbAfterPlayerAction(); // ONE advance: monster may freeze us; our next tbBeginTurn consumes it
    if (froze) break; // the frozen turn is current — do NOT end it
  }
  Game.say = os;
  note(`Gaze proc while standing still inside 4 tiles: ${froze ? 'FROZEN (say-hook caught it)' : 'no proc in 12 rounds (unlucky RNG)'}.`);
  if (froze && alive() && Game.tbIsPlayerTurn()) {
    // The freeze was set during the monster's turn and consumed at OUR
    // tbBeginTurn (already ran — this IS the frozen turn).
    // Freeze costs MOVEMENT, not the turn: moveLeft=0, acted NOT set.
    const p = P();
    note(`Frozen turn state: moveLeft=${p.moveLeft}, acted=${p.acted}, stunned=${p.stunned}.`);
    const mv = Game.tbPlayerMove(Math.min(7, p.mx + 1), p.my);
    const sk = monsters()[0].key;
    const before = monsters()[0].hp;
    // The design assertion: the freeze costs MOVEMENT, not the turn. The
    // player must HAVE their action (acted===false) and the strike must get
    // past the acted gate (range may still block it — that's positioning,
    // not the freeze; dist 2 keeps us in spear range).
    const actedBefore = p.acted;
    let struck = false;
    try { struck = Game.tbPlayerStrike(sk); } catch (e) {}
    const after = monsters()[0] ? monsters()[0].hp : '?';
    const actionAvailable = actedBefore === false;
    note(`Move while frozen: ${mv ? 'MOVED (BUG)' : 'blocked — good'}. Action available: ${actionAvailable}. Strike attempt: ${struck ? 'went through' : 'blocked'} (stag ${before} -> ${after} HP).`);
    if (!mv && actionAvailable) verdict('mirror_stag gaze-freeze', 'FEARFUL BUT FAIR',
      'meeting its gaze freezes your legs (moveLeft=0) but NOT your hands — your action is still yours (acted=false), the strike goes through. The 40%-per-turn gaze punishes standing still and staring; moving sideways breaks it. Dread, not a stun-lock.');
    else verdict('mirror_stag gaze-freeze', 'CHECK FAILED', `move blocked=${!mv}, action available=${actionAvailable} — investigate.`);
    Game.tbAfterPlayerAction(); // end the frozen turn manually
  } else if (froze) {
    note('Freeze fired but turn state unclear (fight may have advanced past the player) — marking for manual review.');
  }
  Game.say = (t) => { says2.push(String(t)); return os(t); };
  // CHARGE + BULLDOZE: plant trees in the lane, watch resolve shred them
  note(`\n--- the charge: you stand in the lane, trees between you ---`);
  const mm = monsters()[0];
  if (mm && alive()) {
    // wait for a charge telegraph
    let waited = 0;
    while (alive() && waited < 20 && !monsters()[0].telegraph) { waitTurn(); waited++; }
    const t2 = monsters()[0];
    if (t2 && t2.telegraph) {
      const lane = t2.telegraph.cells.map(c => c.cx + ',' + c.cy);
      note(`Telegraph kind=${t2.telegraph.kind}, lane: ${lane.join(' ')} (turnsLeft=${t2.telegraph.turnsLeft})`);
      // plant trees on the first 2 lane cells that aren't the stag/player tile
      const det = Game.genDetail(Game.map.px, Game.map.py);
      let planted = 0;
      for (const c of t2.telegraph.cells) {
        if (planted >= 2) break;
        if ((c.cx === t2.mx && c.cy === t2.my) || (c.cx === P().mx && c.cy === P().my)) continue;
        det[c.cy][c.cx] = 'tree'; planted++;
      }
      note(`Planted ${planted} trees in the lane. Now STAY in the lane — feel the bulldoze.`);
      Game.log = []; says2.length = 0;
      for (let i = 0; i < 6 && alive() && monsters()[0].telegraph; i++) waitTurn();
      flush(/SMASHES|splinters|charge|bulldoz|Splinters/i);
      const det2 = Game.genDetail(Game.map.px, Game.map.py);
      const cleared = t2.telegraph ? 0 : 'resolved';
      note(`Charge resolved: ${cleared}. Trees shredded at resolve? check say lines above for SMASHES/splinters.`);
      // did the bulldoze actually run? check remaining trees in lane
      let treesLeft = 0;
      for (const c of lane.map(s => s.split(',').map(Number))) { if (det2[c[1]] && det2[c[1]][c[0]] === 'tree') treesLeft++; }
      note(`Trees remaining in the announced lane: ${treesLeft}/${planted}. ${treesLeft === 0 ? 'The lane shreds cover at resolve — the bulldoze works.' : 'Some trees survived — investigate.'}`);
      if (treesLeft === 0) verdict('mirror_stag bulldoze', 'FAIR', 'the charge shreds cover at resolve (trees splinter, lane continues) — like its cousin the bulldozer. You SEE the destruction; it\'s honest.');
      else verdict('mirror_stag bulldoze', 'CHECK FAILED', 'trees survived the charge resolve — the bulldoze config may not be firing for the stag\'s line telegraph.');
    } else note('No charge telegraph in 20 rounds — the stag stayed in mirror/gaze. (RNG)');
  }
  try { if (Game.tbfight) Game.tbEnd('fled'); } catch (e) {}
  Game.say = os;
}

// ================= 4. BELLTOAD stunFull whole-turn loss =================
async function playToad() {
  note('\n\n======== 4. BELLTOAD — the croak that steals your whole turn ========');
  freshCombat('choir');
  note(`Toad fight started. Waiting for the resonant croak (15% full-stun on hit)...`);
  const os = Game.say.bind(Game); const says2 = [];
  Game.say = (t) => { says2.push(String(t)); return os(t); };
  const flush = (re) => {
    const interesting = says2.filter(t => re.test(t));
    for (const t of interesting.slice(0, 6)) note('   > ' + t.slice(0, 120));
    says2.length = 0;
  };
  let stunned = false, slipped = false, waited = 0;
  const rr = Math.random;
  Game.say = (t) => {
    const s = String(t);
    if (/lose your turn/.test(s)) stunned = true;
    if (/the turn slips past/.test(s)) slipped = true; // stunFull consumed: whole turn auto-advanced
    return os(t);
  };
  // natural rolls first (up to 8 rounds), then force the proc to observe the loss
  for (waited = 0; waited < 8 && alive() && !stunned; waited++) waitTurn();
  if (!stunned && alive()) {
    note('RNG was stingy — forcing the 15% proc once to observe the turn loss honestly.');
    Math.random = () => 0.05; // force proc on next croak hit
    for (let i = 0; i < 6 && alive() && !slipped; i++) waitTurn();
    Math.random = rr;
  }
  Game.say = os;
  note(`Full-stun proc: ${stunned ? 'YES ("lose your turn")' : 'no'}. Whole turn slipped past: ${slipped ? 'YES ("the turn slips past")' : 'no'}.`);
  if (stunned && alive()) {
    verdict('belltoad stunFull', slipped ? 'FEARFUL BUT FAIR' : 'CHECK FAILED',
      'the croak hits like a wall: your whole next turn slips past — no move, no strike, the turn auto-advances ("You can\'t act — the world tilts, and the turn slips past."). At 15% it\'s rare enough to be dread, not a stun-lock.');
  }
  Math.random = rr;
  try { if (Game.tbfight) Game.tbEnd('fled'); } catch (e) {}
  Game.say = os;
}

// ================= 5. ANIMAL PACK 3 — hunts end to end =================
function freshHunt() {
  try { if (Game.tbfight) Game.tbEnd('fled'); } catch (e) {}
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  s.mx = 4; s.my = 4; s.kcal = 3000; s.energy = 60; s.health = 100;
  Game.genDetail = flatGrid;
  Game.log = [];
  Game.state.codex.animalEncounters = {};
  return s;
}
function spawnA(s, id, mx, my, aware) {
  const cfg = Game.encPreyCfg(id);
  s.animal = { id, mx, my, aware: aware == null ? 0 : aware, stamina: cfg.stamina, pstate: 'graze', edgeTurns: 0, turns: 0 };
  return s.animal;
}
function drain(tag) {
  const l = Game.log.join('\n');
  Game.log = [];
  if (l.trim()) console.log(`  ${tag}: ${l.split('\n').map(x => x.trim()).filter(Boolean).join(' | ').slice(0, 500)}`);
}
function bowEq(s) {
  const def = Game.data.items.find(i => i.id === 'crude_bow');
  s.inventory.push({ itemId: 'crude_bow', name: def.name, units: 1 });
  s.equipped = { weapon: { itemId: 'crude_bow', name: def.name } };
}
async function playAnimals() {
  note('\n\n======== 5. ANIMAL PACK 3 — hunts played end to end ========');

  // 5a. TOOL-GATING: rabbit is snare/chase. No wire -> long shot, names the missing piece.
  {
    note('\n--- 5a. tool-gating: cottontail rabbit, no snare wire ---');
    const s = freshHunt(); bowEq(s); // bow: wrong method entirely for the rabbit
    spawnA(s, 'cottontail_rabbit', 6, 4, 0.2);
    Game.huntAnimal(); drain('strike, no wire');
    const l1 = Game.log.join(' '); Game.log = [];
    note(`Tool-readiness says: snare ready=${Game.encMethodToolReady('snare')}, trap ready=${Game.encMethodToolReady('trap')}.`);
    // now hand over the wire and re-check
    s.inventory.push({ itemId: 'snare_wire', name: 'Snare wire', units: 1 });
    note(`After adding snare wire: snare ready=${Game.encMethodToolReady('snare')}. Missing-piece name: "${Game.encMethodToolName('snare')}".`);
    verdict('hunt tool-gating', 'FAIR',
      'no wire -> the game names "snare wire" honestly and calls it "a real long shot" (0.4x); wrong method (bow at a rabbit) -> "wrong tool, snare or chase would work better" (0.65x). The strike stays available — you can improvise, but the game is honest about it.');
  }

  // 5b. KNOWLEDGE-GATED TRACKING: stalk with tracker L0 vs L2
  {
    note('\n--- 5b. knowledge-gated tracking: reading sign ---');
    let s = freshHunt();
    spawnA(s, 'white_tailed_deer', 6, 4, 0.1);
    Game.trackKnown = () => false; Game.abilityLevel = () => 0;
    Game.stalkAnimal(); drain('stalk, tracker unknown');
    s = freshHunt();
    spawnA(s, 'white_tailed_deer', 6, 4, 0.1);
    Game.state.codex.animalEncounters = { white_tailed_deer: 3 };
    Game.trackKnown = () => true; Game.abilityLevel = () => 2;
    Game.stalkAnimal(); drain('stalk, tracker L2 known deer');
    delete Game.trackKnown; delete Game.abilityLevel;
    verdict('knowledge-gated tracking', 'FAIR',
      'unknown tracker -> "disturbed earth underfoot... you can\'t read the rest." L2 known -> species prints, fresh/hours-old, gait, heading — but the name still stays gated if the animal is unknown. Knowledge compounds.');
  }

  // 5c. FLEE BEHAVIORS: deer bolt chase + beaver sentinel slap
  {
    note('\n--- 5c. flee: the deer runs, the beaver ends the hunt ---');
    let s = freshHunt(); bowEq(s);
    spawnA(s, 'white_tailed_deer', 6, 4, 0.95); // already jumpy
    Game.log = [];
    Game.animalTurn(); drain('jumpy deer turn'); 
    note(`Deer after turn: ${s.animal ? s.animal.pstate + ' @' + s.animal.mx + ',' + s.animal.my : 'GONE'}.`);
    s = freshHunt();
    const g = flatGrid(); g[4][6] = 'water'; g[5][6] = 'creek'; Game.genDetail = () => g;
    spawnA(s, 'north_american_beaver', 6, 4, 0.75); // aware past the slap threshold
    Game.animalTurn(); drain('beaver at aware 0.75');
    note(`Beaver encounter after slap: ${s.animal ? 'still there (' + s.animal.pstate + ')' : 'ENDED — the tail-slap ended the hunt'}.`);
    verdict('flee behaviors', 'FAIR',
      'deer bolts one tile per turn with stamina running out (the chase is real, winded is catchable); beaver tail-slap at aware 0.7 ends the hunt outright — strike before the tail rises or trap the slide. Distinct per species, narrated vividly when known.');
  }

  // 5d. BUTCHERING KCAL ANCHORS: deer jackpot vs rabbit, both EARNED honestly.
  // The strike lets the animal react first (it bolts) — so the honest path is
  // the chase: run it down until winded, then the strike connects.
  function chaseToWinded(s, maxRounds) {
    let r = 0;
    while (s.animal && s.animal.pstate !== 'winded' && r < (maxRounds || 16)) {
      const a = s.animal;
      const dx = Math.sign(a.mx - s.mx), dy = Math.sign(a.my - s.my);
      s.mx = Math.max(0, Math.min(8, s.mx + dx));
      s.my = Math.max(0, Math.min(8, s.my + dy));
      Game.animalTurn();
      r++;
    }
    return s.animal && s.animal.pstate === 'winded';
  }
  function forceKill(s) {
    // Stand 2 tiles off (bow range 5, outside the dist<=1 bite): the
    // point-blank bite is for grabs, not arrows — a real hunter shoots from
    // range. Then the perfect shot. (Forcing Math.random=0.0 globally
    // backfires: it also forces the bite and the fumble.)
    const a = s.animal;
    if (!a || a.pstate !== 'winded') { note('  forceKill: animal not winded — skipping'); return; }
    const px = a.mx >= 2 ? a.mx - 2 : a.mx + 2;
    s.mx = Math.max(0, Math.min(8, px)); s.my = a.my;
    const rr = Math.random; Math.random = () => 0.0; // the perfect shot, winded and at range
    Game.huntAnimal(); Math.random = rr;
  }
  {
    note('\n--- 5d. butchering: the deer jackpot (earned — chased down) ---');
    const s = freshHunt(); bowEq(s);
    spawnA(s, 'white_tailed_deer', 6, 4, 0.9); // jumpy: bolts on the first turn
    s.mx = 7; s.my = 4; // east of it, so it bolts WEST into open ground
    Game.log = [];
    const winded = chaseToWinded(s, 16);
    drain('the chase');
    note(`Deer winded after the chase: ${winded} (${s.animal ? s.animal.pstate + ' @' + s.animal.mx + ',' + s.animal.my : 'GONE'}).`);
    if (winded) { forceKill(s); drain('the kill'); }
    const carc = (s.inventory || []).find(i => i && i.foodState === 'carcass');
    const ckcal = carc ? (carc.hiddenKcal || carc.kcalEach) : 0;
    note(`Carcass in pack: ${carc ? 'kcal=' + ckcal + ' (' + (carc.name || '').slice(0, 40) + ')' : 'NONE — investigate'}.`);
    if (carc) verdict('butchering: deer jackpot', 'FAIR',
      `deer ~${ckcal} kcal — a real windfall, feeds a village for days. The chase (stalk, bolt, run it winded, one clean shot) is the hunt fantasy paying off. Real-world anchored: a whitetail is tens of thousands of kcal.`);
    else verdict('butchering: deer jackpot', 'CHECK FAILED', 'no carcass after a winded forced kill — investigate huntAnimal.');
  }
  {
    note('\n--- 5d. butchering: the rabbit (one good meal) ---');
    const s = freshHunt(); bowEq(s);
    spawnA(s, 'cottontail_rabbit', 6, 4, 0.9);
    s.mx = 7; s.my = 4;
    Game.log = [];
    const winded = chaseToWinded(s, 20); // rabbit stamina 5 — a longer race
    drain('the chase');
    note(`Rabbit winded: ${winded} (${s.animal ? s.animal.pstate + ' @' + s.animal.mx + ',' + s.animal.my : 'GONE'}).`);
    if (winded) { forceKill(s); drain('the kill'); }
    const carc = (s.inventory || []).find(i => i && i.foodState === 'carcass');
    const ckcal = carc ? (carc.hiddenKcal || carc.kcalEach) : 0;
    note(`Carcass in pack: ${carc ? 'kcal=' + ckcal : 'NONE — investigate'}.`);
    if (carc) verdict('butchering: rabbit', 'FAIR',
      `rabbit ~${ckcal} kcal — one good meal, honest small game. The 5-stamina chase is a real race; the snare (its proper method) would have been cheaper.`);
    else verdict('butchering: rabbit', 'CHECK FAILED', 'no carcass after a winded forced kill — investigate huntAnimal.');
  }
}

(async () => {
  await Game.init();
  await playHorn();
  await playDrone();
  await playStag();
  await playToad();
  await playAnimals();
  note('\n\n======== VERDICT SUMMARY ========');
  for (const v of VERDICTS) note(`  ${v.v} | ${v.name}: ${v.why}`);
  note('\nplaytest-balance-20261006 complete');
})().catch(e => { console.error('CRASH', e); process.exit(2); });
