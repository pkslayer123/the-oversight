#!/usr/bin/env node
// test-feast-surge-20261010.js — diagnostic + proof for the feast-surge
// regression (armed 49/60 but used only 13/60 in the survival-validation
// sweep, vs baseline armed 36/60 / used 21/60).
//
// Instruments per run (winseek policy, validation day loop):
//   - armDay: first day s.prog.feastSurge becomes truthy
//   - useDay: first day s.prog.feastSurgeUsed becomes truthy
//   - strikes: player strikes (feastBurn is called on every player strike)
//   - burns: strikes where banked() >= 300 (real feastburn fires)
//   - bankedAtArm, banked at each strike post-arm
//   - endDay, endReason
//
// Usage: SEEDS="1-16" node scripts/test-feast-surge-20261010.js
'use strict';
const path = require('path');
const ROOT = path.join(__dirname, '..');
const { loadGame, setupGame, driveFights, driveContests } = require('./sim-harness');
const { winseek } = require('./policies/winseek');

function instrument(Game, st) {
  // feastBurn is called on EVERY player strike (game.js strike path).
  const fb = Game.feastBurn;
  Game.feastBurn = function () {
    const s = this.state.scholar || {};
    let banked = 0;
    try { banked = this.banked ? this.banked() : 0; } catch (e) {}
    st.strikes++;
    if (st.armSeen) st.strikesPostArm++;
    st.bankedSamples.push(banked);
    if (banked >= 300) st.burns++;
    const armedBefore = !!((s.prog || {}).feastSurge);
    const r = fb ? fb.call(this) : 0;
    const usedAfter = !!((s.prog || {}).feastSurgeUsed);
    if (armedBefore && usedAfter && !st.usedSeen) {
      st.useDay = (s.day || 0); st.usedSeen = true; st.bankedAtUse = banked;
    }
    return r;
  };
  // flee reasons: wrap ctx counters via the policy's own ctx keys — poll per part.
  st.fleeTrack = { bad: 0, filled: 0, known: 0 };
}

function poll(Game, st) {
  const s = Game.state.scholar || {};
  const armed = !!((s.prog || {}).feastSurge);
  const used = !!((s.prog || {}).feastSurgeUsed);
  if (armed && !st.armSeen) {
    st.armSeen = true; st.armDay = s.day || 0;
    try { st.bankedAtArm = Game.banked ? Game.banked() : 0; } catch (e) {}
    try { st.resAtArm = (Game.progState().surgeResonance || 0); } catch (e) {}
  }
  if (used && !st.usedSeen) { st.usedSeen = true; st.useDay = s.day || 0; }
  // flee-reason counters live on the policy ctx
  const ctx = st.ctx || {};
  st.fleeTrack.bad = ctx.fledBad || 0;
  st.fleeTrack.filled = ctx.fledFilled || 0;
  st.fleeTrack.known = ctx.fledKnown || 0;
  // daily banked sample (max seen)
  try {
    const b = Game.banked ? Game.banked() : 0;
    if (b > (st.maxBanked || 0)) { st.maxBanked = b; st.maxBankedDay = s.day || 0; }
  } catch (e) {}
}

async function runOne(Game, policy, days, st) {
  if (policy.setup) { try { await policy.setup(Game, st.ctx); } catch (e) {} }
  let day = 0;
  for (day = 1; day <= days; day++) {
    for (let p = 0; p < 3; p++) {
      if (Game.over) break;
      if (policy.upkeep) { try { policy.upkeep(Game, st.ctx); } catch (e) {} }
      driveFights(Game, policy, st.ctx);
      driveContests(Game, policy, st.ctx);
      poll(Game, st);
      if (Game.over) break;
      try { Game.doAction('wait'); } catch (e) {}
      poll(Game, st);
      driveFights(Game, policy, st.ctx);
      driveContests(Game, policy, st.ctx);
      poll(Game, st);
      if (Game.over) break;
    }
    if (Game.over) break;
    if (policy.daily) { try { policy.daily(Game, st.ctx); } catch (e) {} }
    driveFights(Game, policy, st.ctx);
    driveContests(Game, policy, st.ctx);
    poll(Game, st);
    if (Game.over) break;
    try { Game.sleep(); } catch (e) {}
    driveFights(Game, policy, st.ctx);
    driveContests(Game, policy, st.ctx);
    poll(Game, st);
    if (Game.over) break;
    if (((Game.state.village || {}).roster || []).length === 0) break;
  }
  const endReason = Game.over ? (Game.villageLost ? 'village-lost' : 'over-other') : (day >= days ? 'survived' : 'pop-zero');
  return { endReason, endDay: Math.min(day, days) };
}

function parseSeeds(s) {
  const out = [];
  for (const part of String(s || '1-16').split(',')) {
    const m = part.match(/^(\d+)-(\d+)$/);
    if (m) { for (let i = +m[1]; i <= +m[2]; i++) out.push(i); }
    else if (part.trim()) out.push(+part.trim());
  }
  return out;
}

// PART 1 (fast unit proof): the dry-burn consumption bug.
// feastBurn is called on EVERY player strike. The progression.js wrap
// consumes the armed surge (and marks feastSurgeUsed) on ANY call — even
// when the war chest is empty and the base burn returns 0 (no feastburn,
// no narration). The arm message promises "Next feastburn surges ×N":
// a strike with no banked fuel is not a feastburn, so the surge should
// stay armed. Returns {pass, detail}.
async function dryBurnProof() {
  const out = { checks: [] };
  const ok = (name, cond, detail) => out.checks.push({ name, pass: !!cond, detail: detail || '' });
  const { Game } = await loadGame({ seed: 424242, mode: 'survival-validation' });
  await setupGame(Game);
  const s = Game.state.scholar;
  s.kcal = 2000; // banked() = max(0, 2000-2400) = 0: empty war chest
  let banked = 0;
  try { banked = Game.banked(); } catch (e) {}
  ok('empty war chest in the fixture', banked < 300, `banked=${banked}`);
  // arm the surge directly (the channelSentiment path is covered by the
  // channeling-gap suite; here we test the burn-site contract)
  s.prog = s.prog || {};
  s.prog.feastSurge = 2.0;
  const said = [];
  const _say = Game.say;
  Game.say = function (t) { said.push(String(t)); try { return _say.call(this, t); } catch (e) {} };
  const r = Game.feastBurn(); // what every player strike calls
  Game.say = _say;
  ok('dry strike: base burn returns 0 (no feastburn)', r === 0, `r=${r}`);
  ok('dry strike: surge stays armed (not silently wasted)', s.prog.feastSurge === 2.0, `feastSurge=${s.prog.feastSurge}`);
  ok('dry strike: feastSurgeUsed NOT marked', s.prog.feastSurgeUsed !== true, `used=${s.prog.feastSurgeUsed}`);
  ok('dry strike: no surge narration (nothing happened)', !said.some(t => t.includes('FEAST SURGE')), said.slice(-2).join(' | ').slice(0, 120));
  // and a REAL burn still consumes + marks + narrates
  s.kcal = 5000; // banked = 2600
  s.prog.feastSurge = 2.0;
  s.prog.feastSurgeUsed = false;
  const said2 = [];
  Game.say = function (t) { said2.push(String(t)); try { return _say.call(this, t); } catch (e) {} };
  const r2 = Game.feastBurn();
  Game.say = _say;
  ok('real burn: returns > 0', r2 > 0, `r=${r2}`);
  ok('real burn: surge consumed', s.prog.feastSurge === false, `feastSurge=${s.prog.feastSurge}`);
  ok('real burn: feastSurgeUsed marked', s.prog.feastSurgeUsed === true, `used=${s.prog.feastSurgeUsed}`);
  ok('real burn: surge narrated', said2.some(t => t.includes('FEAST SURGE ×2')), said2.slice(-2).join(' | ').slice(0, 120));
  return out;
}

// LOOP=old: drive via the shared sim-harness runDays (raw tickAction(128)),
// the Worker-E day loop, on CURRENT code. LOOP=new (default): the
// villagerTurn-corrected doAction('wait') loop from the validation sweep.
async function runOldLoop(Game, policy, days, st) {
  const { runDays } = require('./sim-harness');
  const p = Object.assign({}, policy);
  const ou = policy.upkeep, od = policy.daily;
  p.upkeep = (G, ctx) => { if (ou) { try { ou(G, ctx); } catch (e) {} } poll(G, st); };
  p.daily = (G, ctx) => { if (od) { try { od(G, ctx); } catch (e) {} } poll(G, st); };
  const res = await runDays(Game, p, { days, sampleEvery: 999999 });
  return { endReason: res.endReason, endDay: res.days };
}

(async () => {
  // ---- PART 1: dry-burn unit proof (fast) ----
  console.log('== PART 1: dry-burn consumption proof ==');
  const proof = await dryBurnProof();
  let pFail = 0;
  for (const c of proof.checks) {
    console.log(`${c.pass ? 'PASS' : 'FAIL'} ${c.name}${c.detail ? ' — ' + c.detail : ''}`);
    if (!c.pass) pFail++;
  }
  console.log(`PART 1: ${proof.checks.length - pFail}/${proof.checks.length} green\n`);
  if (process.env.UNIT === '1') process.exit(pFail ? 1 : 0);

  // ---- PART 2: sweep instrumentation (slow) ----
  const seeds = parseSeeds(process.env.SEEDS || '1-16');
  const days = parseInt(process.env.DAYS || '200', 10);
  const rows = [];
  for (const seed of seeds) {
    const st = { ctx: { policyId: 'winseek', notes: [] }, strikes: 0, strikesPostArm: 0, burns: 0,
      bankedSamples: [], armSeen: false, armDay: null, useDay: null,
      usedSeen: false, bankedAtArm: null, bankedAtUse: null, resAtArm: null };
    const { Game } = await loadGame({ seed, mode: 'survival-validation' });
    await setupGame(Game);
    instrument(Game, st);
    const loop = process.env.LOOP || 'new';
    const res = loop === 'old' ? await runOldLoop(Game, winseek, days, st) : await runOne(Game, winseek, days, st);
    const pg = (() => { try { return Game.progState(); } catch (e) { return {}; } })();
    const endArmed = !!(((Game.state.scholar || {}).prog || {}).feastSurge);
    const endUsed = !!(((Game.state.scholar || {}).prog || {}).feastSurgeUsed);
    const postArmStrikes = st.bankedSamples.length; // all strikes counted; arm usually mid-run
    const bAtArm = st.bankedAtArm == null ? 'n/a' : Math.round(st.bankedAtArm);
    const medBanked = st.bankedSamples.length
      ? Math.round(st.bankedSamples.slice().sort((a, b) => a - b)[Math.floor(st.bankedSamples.length / 2)])
      : 'n/a';
    rows.push({ seed, armDay: st.armDay, useDay: st.useDay, endArmed, endUsed,
      strikes: st.strikes, strikesPostArm: st.strikesPostArm || 0, burns: st.burns, bankedAtArm: bAtArm, medBankedStrike: medBanked,
      maxBanked: Math.round(st.maxBanked || 0), maxBankedDay: st.maxBankedDay || null,
      fledBad: st.fleeTrack.bad, fledFilled: st.fleeTrack.filled, fledKnown: st.fleeTrack.known,
      resAtArm: st.resAtArm, sentiment: !!pg.sentimentTaught,
      endDay: res.endDay, endReason: res.endReason });
    console.log(`seed ${seed}: arm=${st.armDay == null ? '-' : st.armDay} use=${st.useDay == null ? '-' : st.useDay} ` +
      `strikes=${st.strikes}(postArm ${st.strikesPostArm || 0}) burns=${st.burns} banked@arm=${bAtArm} medBanked@strike=${medBanked} ` +
      `maxBanked=${Math.round(st.maxBanked || 0)}@d${st.maxBankedDay || '-'} flee[bad ${st.fleeTrack.bad}/filled ${st.fleeTrack.filled}/known ${st.fleeTrack.known}] ` +
      `end=${res.endReason} d${res.endDay}`);
  }
  const armed = rows.filter(r => r.armDay != null);
  const used = rows.filter(r => r.useDay != null);
  const armedUnused = armed.filter(r => r.useDay == null);
  console.log(`\nSUMMARY n=${rows.length}: armed=${armed.length} used=${used.length} armed-unused=${armedUnused.length}`);
  if (armedUnused.length) {
    console.log('armed-unused detail:');
    for (const r of armedUnused) {
      console.log(`  seed ${r.seed}: armDay=${r.armDay} endDay=${r.endDay} (${r.endReason}) strikes=${r.strikes} burns=${r.burns} banked@arm=${r.bankedAtArm} medBanked@strike=${r.medBankedStrike}`);
    }
  }
})();
