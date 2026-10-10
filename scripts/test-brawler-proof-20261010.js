#!/usr/bin/env node
// Hostile-brawler adversarial playtest, 2026-10-10 (playtest loop, archetype 5).
// The brawler's verbs are weapons: break combat, intimidation, proxy murder.
//
//   A. EXPLOIT — intimidation shakedown loop: is food unbounded? Cost vs gain.
//   B. EXPLOIT — proxy murder: engineer a monster kill of a villager ally;
//                check attribution (killerId), village reaction, corpse loot.
//   C. HONESTY — sweep-beam "won't fall until it fires": the guarantee is
//                enforced by DEATH THROES at the kill, not by the windup hold —
//                so door-flee + re-engage cannot dodge the beam. Proved here.
//   D. SOFTLOCK — simultaneous player+monster death: does the fight resolve?
//   E. EXPLOIT — provoke-to-kill pipeline: intimidate x3 -> snap -> kill in
//                "self-defense". Is the provocation priced, or is it a
//                consequence-free murder machine?
//
// Run: node scripts/test-brawler-proof-20261010.js
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');

let pass = 0, fail = 0;
const failures = [];
function ok(cond, name, detail) {
  if (cond) { pass++; }
  else { fail++; failures.push(name + (detail ? ' — ' + detail : '')); }
  console.log((cond ? '  ok  ' : '  FAIL') + ' ' + name + (detail && !cond ? ' — ' + detail : ''));
}

// ---------- seeded RNG BEFORE eval (modules capture Math.random at load) ----------
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const SEED = parseInt(process.env.SEED || '0xB0A910', 16);
Math.random = mulberry32(SEED);

global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
global.window = global; // equipment.js needs window at load; removed before play
const FILES = ['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
  'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
  'src/js/game.js', 'src/js/encounters.js', 'src/js/conversation.js', 'src/js/convo-mood.js',
  'src/js/convoTopics.js', 'src/js/convo-wants.js', 'src/js/convo-dialogue.js', 'src/js/convo-beats.js',
  'src/js/convo-scene.js', 'src/js/examine.js', 'src/js/equipment.js', 'src/js/journal.js',
  'src/js/party.js', 'src/js/party-formal.js', 'src/js/truth.js', 'src/js/contests.js',
  'src/js/broadcast.js', 'src/js/contestEngine.js', 'src/js/alienPlayers.js', 'src/js/storage.js',
  'src/js/perceive.js', 'src/js/carexplore.js', 'src/js/justice.js', 'src/js/food.js',
  'src/js/betrayal.js', 'src/js/corpses.js', 'src/js/corruption.js', 'src/js/lifeseed.js',
  'src/js/progression.js', 'src/js/ledger.js', 'src/js/abilityActions.js', 'src/js/monsterBehaviors.js',
  'src/js/statusEffects.js', 'src/js/villager-agency.js', 'src/js/fieldFights.js',
  'src/js/villager-objectives.js', 'src/js/codex-people.js', 'src/js/membership.js',
  'src/js/hierarchy.js', 'src/js/debug-scenarios.js', 'src/js/build.js'];
for (const f of FILES) { try { eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); } catch (e) { console.log('EVAL FAIL', f, e.message); process.exit(2); } }
delete global.window; // keep combat on the sync path
const Game = globalThis.Scattering.Game;
const sayLog = [];
const origSay = Game.say.bind(Game);
Game.say = (t) => { sayLog.push(String(t)); try { return origSay(t); } catch (e) {} };

const crimesOf = (type, victim) => ((Game.state.village.justice || {}).crimes || [])
  .filter(c => (!type || c.type === type) && (!victim || c.victim === victim));
const roster = () => (Game.state.village.roster || []).filter(id => id !== Game.villagerId);

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();

  // ================= A. INTIMIDATION SHAKEDOWN LOOP =================
  console.log('\n== A. intimidation shakedown loop ==');
  for (const vid of roster()) {
    try {
      const p = Game.getPerson ? Game.getPerson(vid) : null;
      if (p) { p.pack = p.pack || []; p.pack.push({ name: 'Smoked meat', kcalEach: 300, units: 6, spoilDay: 999 }); }
    } catch (e) {}
  }
  const trustOf = (vid) => ((Game.state.village.trust || {})[vid] === undefined ? 10 : Game.state.village.trust[vid]);
  const trustBefore = {}; for (const vid of roster()) trustBefore[vid] = trustOf(vid);
  const kcalOf = () => (Game.state.scholar.inventory || []).reduce((a, i) => a + (i.kcalEach || 0) * (i.units || 0), 0);
  const k0 = kcalOf();
  let snaps = 0, fled = 0;
  const roster0 = roster().length;
  const crime0 = crimesOf('intimidation').length;
  for (let day = 0; day < 3; day++) {
    Game.state.scholar.day = day + 1;
    for (const vid of roster().slice()) {
      try {
        const r = Game.intimidate(vid);
        if (r === 'fight') snaps++;
        if (r === 'fled') fled++;
        if (Game.tbfight) Game.tbfight = null; // walk away from snap-fights for the measurement
      } catch (e) { console.log('  intimidate threw for', vid, e.message); }
    }
  }
  const gained = kcalOf() - k0;
  let trustLost = 0; for (const vid of roster()) trustLost += Math.max(0, (trustBefore[vid] || 0) - trustOf(vid));
  const crime1 = crimesOf('intimidation').length;
  console.log(`  roster ${roster0} -> ${roster().length}; kcal +${Math.round(gained)}; trust lost ${Math.round(trustLost)}; snaps ${snaps}; fled ${fled}; intimidation crimes +${crime1 - crime0}`);
  ok(gained > 0, 'A1 shakedown yields food (the verb works)');
  ok(fled + snaps > 0, 'A2 breaking point bites within 3 days of daily shakedowns');
  ok(crime1 - crime0 >= roster0, 'A3 every shakedown is a recorded crime', `+${crime1 - crime0} for ${roster0} villagers`);
  ok(gained / (roster0 * 3) <= 800, 'A4 per-shakedown yield bounded by the demand cap', `${Math.round(gained / (roster0 * 3))} kcal/shake`);

  // ================= B. PROXY MURDER =================
  console.log('\n== B. proxy murder: monster kills the villager ally ==');
  Game.tbfight = null;
  Game.map.px = 4; Game.map.py = 4;
  Game.state.scholar.mx = 4; Game.state.scholar.my = 4;
  const ally = roster()[0];
  try { Game.state.village.positions[ally] = { mx: 5, my: 4 }; } catch (e) {}
  Game.startCombat('bulldozer');
  ok(!!Game.tbfight, 'B1 fight started');
  const vf = Game.tbfight && Game.tbfight.fighters.find(x => x.kind === 'villager' && x.villagerId === ally);
  const mf = Game.tbfight && Game.tbfight.fighters.find(x => x.kind === 'monster');
  console.log('  ally fighter present:', !!vf);
  let monsterKill = false;
  if (Game.tbfight && vf && mf) {
    vf.hp = 1; mf.mx = vf.mx + 1; mf.my = vf.my;
    for (let i = 0; i < 6 && vf.alive; i++) {
      Game.tbfight.turnIdx = Game.tbfight.order.indexOf(mf.key);
      try { Game.tbMonsterTurn(mf); } catch (e) { console.log('  tbMonsterTurn threw:', e.message); break; }
    }
    monsterKill = !vf.alive;
  }
  console.log('  monster landed the kill:', monsterKill);
  ok(monsterKill, 'B2 monster AI targets and kills villager allies (proxy murder is possible)');
  if (monsterKill) {
    const deaths = (Game.state.corpses || []).filter(c => c && c.villagerId === ally);
    const d = deaths[deaths.length - 1];
    ok(!!d, 'B3 villager death registered a corpse');
    ok(!d || d.killerId == null, 'B4 killerId is NOT the player — honest attribution', d ? `killerId=${d.killerId}` : '');
    const evts = (Game.state.village.events || []).filter(e => e && e.type === 'murder' && e.victim === ally);
    ok(evts.length === 0, 'B5 no MURDER event for a monster kill (not the player\'s killing)');
    console.log(`  corpse items lootable: ${d && d.items ? d.items.length : 0} (theft allowed, socially punished — lootCorpse is witness-gated)`);
  }
  Game.tbfight = null;

  // ================= C. BEAM GUARANTEE vs DOOR =================
  console.log('\n== C. sweep-beam "won\'t fall until it fires" vs door-flee ==');
  Game.startCombat('gallowdeer');
  const bm = Game.tbfight && Game.tbfight.fighters.find(x => x.kind === 'monster');
  if (bm) {
    // mid-windup lethal hit -> the hold
    bm.telegraph = { pattern: { sweep: true, type: 'beam' }, cells: [] };
    bm.hasFired = false; bm.hp = 10; bm.maxHp = 100;
    sayLog.length = 0;
    const p0 = Game.tbFighter('p');
    Game.tbfight.turnIdx = Game.tbfight.order.indexOf('p');
    p0.acted = false; p0.moveLeft = 9;
    Game.tbPlayerStrike(bm.key);
    ok(bm.hp === 1, 'C1 death-hold keeps the winding beam monster at 1hp', `hp=${bm.hp}`);
    ok(sayLog.some(t => /won't fall until it fires/.test(t)), 'C2 hold narrated honestly');
    // now the door-flee scenario: fresh re-engage at 1hp, NO windup (light dissipated)
    Game.tbEnd('fled');
    Game.startCombat('gallowdeer');
    const bm2 = Game.tbfight && Game.tbfight.fighters.find(x => x.kind === 'monster');
    bm2.telegraph = null; bm2.hasFired = false; bm2.hp = 1; bm2.maxHp = 100;
    const pp = Game.tbFighter('p'); const php0 = pp.hp;
    sayLog.length = 0;
    Game.tbDamage(bm2.key, 50, 'you', 'p', { quiet: true });
    const throes = sayLog.some(t => /death throes/.test(t));
    console.log(`  fresh 1hp kill: alive=${bm2.alive} throes=${throes} playerHp ${php0}->${pp.hp}`);
    ok(!bm2.alive && throes, 'C3 the beam fires anyway — DEATH THROES enforce the guarantee at the kill');
    ok(pp.hp < php0, 'C4 the throe beam lands real damage (no free dodge via door)');
  } else { ok(false, 'C setup: no monster'); }
  Game.tbfight = null;

  // ================= D. SIMULTANEOUS DEATH =================
  console.log('\n== D. player and last monster die in the same beat ==');
  Game.state.scholar.health = 88;
  // strip death-cheats: the scenario is about the double-KO path, and a
  // background second_wind would legitimately revive (caught on seed 0x1234)
  try {
    const s = Game.state.scholar;
    const noCheat = (a) => !['second_wind', 'molt', 'phoenix_clause'].includes((a && a.id) || a);
    s.backgroundAbilities = (s.backgroundAbilities || []).filter(noCheat);
    s.abilities = (s.abilities || []).filter(noCheat);
    Game.state.phoenixLink = null;
  } catch (e) {}
  Game.startCombat('hushwolf');
  ok(!!Game.tbfight, 'D1 fight started');
  if (Game.tbfight) {
    const dm = Game.tbfight.fighters.find(x => x.kind === 'monster');
    const bearerBefore = Game.villagerId;
    Game.tbDamage('p', 9999, 'test', dm ? dm.key : null, { quiet: true });
    if (dm && dm.alive) Game.tbDamage(dm.key, 9999, 'test', 'p', { quiet: true });
    try { Game.tbEndCheck(); } catch (e) { console.log('  tbEndCheck threw:', e.message); }
    const resolved = !Game.tbfight || Game.tbfight.over === true;
    console.log('  fight live:', !!Game.tbfight, '| bearer changed (mantle passed):', Game.villagerId !== bearerBefore);
    ok(resolved, 'D2 fight resolves (no stuck turn engine)');
    ok(Game.villagerId !== bearerBefore, 'D3 player death passes the mantle (village-as-protagonist)');
  }
  Game.tbfight = null;

  // ================= E. PROVOKE-TO-KILL PIPELINE =================
  console.log('\n== E. provoke-to-kill: intimidate x3 -> snap -> "self-defense" kill ==');
  Game.state.scholar.health = 88;
  // force cautious marks: the snap path only exists for cautious/withdrawn,
  // and generated rosters don't always include one (seed 0x1234 had none).
  // Several candidates: each has a 50% flee chance per breaking-point roll.
  const cands = roster().slice(0, 4);
  for (const cid of cands) {
    try {
      const vp = (Game.data.villagers || []).find(x => x.id === cid);
      if (vp) { vp.personality = vp.personality || {}; vp.personality.temperament = 'cautious'; }
    } catch (e) {}
  }
  console.log('  candidates:', cands.length);
  let mark = null, snapped = false;
  for (const cand of cands.slice(0, 4)) {
    try {
      Game.npcNeeds(cand).fear = 100;
      // seed two recent threats so the breaking-point gate is armed deterministically
      Game.remember(cand, 'you_threatened', 'demanded their food');
      Game.remember(cand, 'you_threatened', 'demanded their food');
    } catch (e) {}
    for (let i = 0; i < 10 && !snapped; i++) {
      if (!roster().includes(cand)) break; // fled — breaking point, try next mark
      try {
        const r = Game.intimidate(cand);
        if (r === 'fight') { snapped = true; mark = cand; }
        if (Game.tbfight && !snapped) Game.tbfight = null;
      } catch (e) { break; }
    }
    if (snapped) break;
    if (Game.tbfight) Game.tbfight = null;
  }
  console.log('  mark:', mark, 'snapped:', snapped);
  ok(snapped && !!Game.tbfight && Game.tbfight.betrayal, 'E1 repeated shakedowns make the victim snap into a betrayal fight');
  if (snapped && Game.tbfight) {
    ok(Game.tbfight.aggressor === 'npc', 'E2 snap-fight marks the NPC as aggressor (they swung first)');
    const hk = 'h_' + mark;
    const h = Game.tbFighter(hk);
    if (h) {
      h.hp = 1;
      const p = Game.tbFighter('p');
      Game.tbfight.turnIdx = Game.tbfight.order.indexOf('p');
      p.acted = false; p.moveLeft = 9;
      sayLog.length = 0;
      // strike until down (hostile may dodge/beg; force via tbDamage if strike refuses)
      let guard = 0;
      while (h.alive && guard++ < 6 && Game.tbfight) {
        p.acted = false;
        const before = h.hp;
        Game.tbPlayerStrike(hk);
        if (h.hp >= before && h.alive) Game.tbDamage(hk, 999, 'you', 'p', { quiet: true });
        try { if (Game.tbfight && !Game.tbfight.over) Game.tbEndCheck(); } catch (e) {}
        if (!Game.tbfight || Game.tbfight.over) break;
      }
      const murders = crimesOf('murder', mark);
      const m = murders[murders.length - 1];
      console.log('  murder crimes for mark:', murders.length, m ? `justified=${m.justified} witnessed=${m.witnessed}` : '');
      ok(murders.length > 0, 'E3 the kill is recorded as a murder crime');
      ok(m && m.justified === true, 'E4 flagged justified (self-defense) — reduced heat, not zero consequence');
      const intim = crimesOf('intimidation', mark).length;
      console.log(`  intimidation crimes on record for mark: ${intim} (the provocation is priced)`);
      ok(intim >= 2, 'E5 the shakedowns that drove the snap are on the record', `got ${intim}`);
      const e6say = sayLog.filter(t => /look at you differently|fire feels smaller/.test(t));
      const e6grief = Game.state.village.grief || 0;
      const traumaNow = (Game.state.scholar.trauma || 0);
      console.log(`  E6 evidence: murderReactionLines=${e6say.length} deathGrief=${e6grief} trauma=${traumaNow}`);
      // Unwitnessed by design: the murder branch early-returns (no "they look
      // at you differently"), but the generic death grief fires, trauma lands,
      // and the crime sits unsolved for the detective systems. Steve's design.
      ok(m && m.witnessed === false && e6say.length === 0 && e6grief > 0 && traumaNow > 0,
        'E6 unwitnessed kill = unsolved murder by design (death-grief + trauma + recorded crime, no murder reaction)');
    } else { ok(false, 'E setup: no hostile fighter'); }
  }
  Game.tbfight = null;

  console.log(`\n==== ${pass} passed, ${fail} failed (seed ${SEED.toString(16)}) ====`);
  if (failures.length) { console.log('FAILURES:'); for (const f of failures) console.log(' - ' + f); }
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS CRASH:', e); process.exit(2); });
