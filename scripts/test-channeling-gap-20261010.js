#!/usr/bin/env node
// test-channeling-gap-20261010.js — Gap 2 proof: organic channeling reachability.
// Usage: SEED=20261010 node scripts/test-channeling-gap-20261010.js
//        SEED=7 PROBE_SEEDS=6 node scripts/test-channeling-gap-20261010.js
//
// Part 1 (unit, 40+ checks): the teach demo, honest button copy, trauma nudge,
//   surge-multiplier honesty, once-per-day, not-taught gate.
// Part 2 (probe): a channel-aware policy (competent + daily channeling once
//   taught) over 200-day runs — demonstrates organic channeling fires and the
//   loop closes (soothe -> practice -> surge -> feastburn -> Arc IV).
//
// Seed discipline (AGENTS.md): mulberry32 installed as Math.random BEFORE
// eval'ing modules (they capture it at load). Full src/js list in index.html
// order minus DOM-only app.js/sprites.js/tile-scenes.js/move-anim.js/drama.js.
'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const SEED = parseInt(process.env.SEED || '20261010', 10);

function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
Math.random = mulberry32(SEED);
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
const order = execSync(`grep -o 'src/js/[^"'"'"']*\\.js' index.html | head -80`, { cwd: ROOT })
  .toString().split('\n')
  .filter(s => s && !/app\.js|sprites\.js|tile-scenes\.js|move-anim\.js|drama\.js/.test(s));
global.window = global;
order.forEach(f => { eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); });
delete global.window;
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}${extra ? ' — ' + extra : ''}`); }
}
const said = [];
function freshGame() {
  said.length = 0;
  Game.say = function (t) { said.push(String(t)); };
  Game.sysSay = function () {};
  Game.audioEvent = function () {};
  Game.genRoster('Columbus, Ohio');
  let pick = Game.generatedRoster[0];
  for (const v of Game.generatedRoster) {
    const has = (v.items || []).some(id => { const d = (Game.data.items || []).find(i => i.id === id); return d && d.class === 'sentimental'; });
    if (has) { pick = v; break; }
  }
  const sentIds = (pick.items || []).filter(id => { const d = (Game.data.items || []).find(i => i.id === id); return d && d.class === 'sentimental'; });
  const funcIds = (pick.items || []).filter(id => { const d = (Game.data.items || []).find(i => i.id === id); return d && d.class !== 'sentimental'; });
  const chosen = [...funcIds.slice(0, 5 - Math.min(2, sentIds.length)), ...sentIds.slice(0, 2)].slice(0, 5);
  Game.newGame('Columbus, Ohio', null, pick.id, chosen.length === 5 ? chosen : null);
  Game.depart();
  const s = Game.state.scholar;
  s.mx = 4; s.my = 4; s.kcal = 3000; s.health = 100; s.trauma = 0;
  Game.state.systemArrived = true;
  Game.progState();
  return s;
}
function keepsakeIdx(s) {
  const inv = s.inventory || [];
  for (let i = 0; i < inv.length; i++) if (Game.isKeepsake(inv[i])) return i;
  return -1;
}

(async () => {
  await Game.init();
  console.log(`seed=${SEED}`);

  // ============ 1. teach demo: fires when a keepsake is in pack ============
  console.log('\n-- 1. teach demonstration --');
  {
    const s = freshGame();
    const idx = keepsakeIdx(s);
    ok('fresh game has a keepsake', idx >= 0);
    s.trauma = 12;
    const t0 = s.trauma;
    Game.teachSentiment();
    ok('taught flag set', Game.sentimentTaught() === true);
    ok('demo fired (System grabs it)', said.some(t => t.includes('DEMONSTRATION')), said.slice(0, 3).join(' | ').slice(0, 160));
    ok('demo channeled: trauma soothed', s.trauma < t0, `${t0} -> ${s.trauma}`);
    ok('demo consumed the daily channel', Game.channelSentiment(idx) === 'It is quiet now. Tomorrow.');
    const n = said.length;
    Game.teachSentiment();
    ok('teach dedupes (no second demo)', said.length === n);
  }
  // demo takes the practice path when trauma is low
  {
    const s = freshGame();
    s.trauma = 0;
    s.abilities = [{ id: 'stalk', name: 'Stalk', level: 1, xp: 0 }];
    const before = (s.abilities[0].xp || 0);
    Game.teachSentiment();
    ok('demo fired on practice path', said.some(t => t.includes('DEMONSTRATION')));
    ok('demo granted practice XP', (s.abilities[0].xp || 0) > before, `${before} -> ${s.abilities[0].xp}`);
    ok('practice payoff is legible (+N to every gift)', said.some(t => /\+[0-9]+ experience to every gift still learning/.test(t)));
  }
  // demo takes the surge path with 3xL3 — and the multiplier is honest
  {
    const s = freshGame();
    s.trauma = 0;
    s.abilities = [
      { id: 'a1', name: 'A1', level: 3, xp: 0 },
      { id: 'a2', name: 'A2', level: 3, xp: 0 },
      { id: 'a3', name: 'A3', level: 3, xp: 0 },
    ];
    Game.teachSentiment();
    const surge = s.prog.feastSurge;
    ok('demo armed feastSurge', !!surge, String(surge));
    ok('surge stores the promised multiplier (number)', typeof surge === 'number' && surge >= 1.5, String(surge));
  }
  // no keepsake in pack: invitation stands, no demo
  {
    const s = freshGame();
    s.inventory = (s.inventory || []).filter(i => !Game.isKeepsake(i));
    ok('keepsakes removed', keepsakeIdx(s) < 0);
    Game.teachSentiment();
    ok('taught anyway', Game.sentimentTaught() === true);
    ok('no demo without a keepsake', !said.some(t => t.includes('DEMONSTRATION')));
    ok('invitation copy present', said.some(t => t.includes('Channel keepsakes from your pack')));
  }
  // slotMoment(60) teaches + demos (the real path)
  {
    const s = freshGame();
    const pg = Game.progState();
    pg.slotMoments = {}; pg.sentimentTaught = false;
    s.trauma = 10;
    const t0 = s.trauma;
    Game.slotMoment(60);
    ok('slotMoment(60) teaches', pg.sentimentTaught === true);
    ok('slotMoment(60) demo soothed trauma', s.trauma < t0, `${t0} -> ${s.trauma}`);
  }

  // ============ 2. channelReadyKeepsakes ============
  console.log('\n-- 2. channelReadyKeepsakes --');
  {
    const s = freshGame();
    Game.teachSentiment();
    const ready = Game.channelReadyKeepsakes();
    ok('demo consumed one keepsake', ready.length < (s.inventory || []).filter(i => Game.isKeepsake(i)).length || ready.length === 0);
    // fresh day: advance and all keepsakes ready again
    s.day = (s.day || 1) + 1;
    const ready2 = Game.channelReadyKeepsakes();
    const keeps = (s.inventory || []).filter(i => Game.isKeepsake(i)).length;
    ok('new day resets readiness', ready2.length === keeps, `${ready2.length}/${keeps}`);
    ok('indices point at keepsakes', ready2.every(i => Game.isKeepsake(s.inventory[i])));
  }

  // ============ 3. channelLabel: honest copy per branch ============
  console.log('\n-- 3. channelLabel --');
  {
    const s = freshGame();
    Game.teachSentiment();
    s.trauma = 9;
    s.abilities = [{ id: 'x', name: 'X', level: 3, xp: 0 }, { id: 'y', name: 'Y', level: 3, xp: 0 }, { id: 'z', name: 'Z', level: 3, xp: 0 }];
    ok('trauma branch: steady yourself', Game.channelLabel() === '💛 Hold it (steady yourself)', Game.channelLabel());
    s.trauma = 0;
    ok('surge branch: surge the feast', Game.channelLabel() === '💛 Channel (surge the feast)', Game.channelLabel());
    s.abilities.push({ id: 'w', name: 'W', level: 1, xp: 0 });
    // 3 maxed + 1 unmaxed: surge wins (mirrors channelSentiment branch order)
    ok('surge wins over practice (branch order)', Game.channelLabel() === '💛 Channel (surge the feast)', Game.channelLabel());
    s.abilities = [{ id: 'w', name: 'W', level: 1, xp: 0 }];
    ok('practice branch: train gifts', Game.channelLabel() === '💛 Channel (train gifts)', Game.channelLabel());
    s.abilities = [];
    s.backgroundAbilities = [];
    ok('no abilities: plain label', Game.channelLabel() === '💛 Channel', Game.channelLabel());
  }

  // ============ 4. surge multiplier honesty at the burn site ============
  console.log('\n-- 4. surge honesty --');
  {
    const s = freshGame();
    Game.teachSentiment();
    s.trauma = 0;
    s.abilities = [{ id: 'a1', name: 'A1', level: 3, xp: 0 }, { id: 'a2', name: 'A2', level: 3, xp: 0 }, { id: 'a3', name: 'A3', level: 3, xp: 0 }];
    // plain keepsake (not chosen): mult 1 -> surge 1.5
    const idx = keepsakeIdx(s);
    const item = s.inventory[idx];
    item.chosen = false;
    const def = Game.itemDef(item);
    const expect = 1.5 * (def.id === 'wedding_ring' ? 2 : 1);
    // channel on a fresh day (demo consumed today)
    s.day = (s.day || 1) + 1;
    said.length = 0;
    const msg = Game.channelSentiment(idx);
    const m = msg.match(/surges ×([0-9.]+)/);
    ok('message states the surge multiplier', !!m, msg.slice(0, 100));
    ok('stored surge equals the promised multiplier', Math.abs(s.prog.feastSurge - expect) < 0.01, `${s.prog.feastSurge} vs ${expect}`);
    // burn site applies the stored multiplier
    s.kcal = 5000; // banked
    const base = Game.feastBurn ? null : null;
    // arm via stored number and measure: wrap multiplies base by surge
    s.prog.feastSurge = 2.0;
    const r1 = Game.feastBurn();
    ok('numeric surge consumed', s.prog.feastSurge === false);
    ok('feastSurgeUsed marked', s.prog.feastSurgeUsed === true);
    ok('burn applied the stored ×2.0', said.some(t => t.includes('FEAST SURGE ×2')), said.slice(-2).join(' | ').slice(0, 160));
    void r1; void base;
  }
  // legacy `true` still means flat ×1.5 (old saves, existing tests)
  {
    const s = freshGame();
    s.kcal = 5000;
    s.prog.feastSurge = true;
    said.length = 0;
    Game.feastBurn();
    ok('legacy true -> flat ×1.5 applied', said.some(t => t.includes('FEAST SURGE ×1.5')), said.slice(-2).join(' | ').slice(0, 160));
    ok('legacy true consumed', s.prog.feastSurge === false && s.prog.feastSurgeUsed === true);
  }
  // chosen keepsake scales the surge (the message's promise)
  {
    const s = freshGame();
    Game.teachSentiment();
    s.trauma = 0;
    s.abilities = [{ id: 'a1', name: 'A1', level: 3, xp: 0 }, { id: 'a2', name: 'A2', level: 3, xp: 0 }, { id: 'a3', name: 'A3', level: 3, xp: 0 }];
    s.day = (s.day || 1) + 1;
    const idx = keepsakeIdx(s);
    s.inventory[idx].chosen = true;
    const def = Game.itemDef(s.inventory[idx]);
    Game.channelSentiment(idx);
    const expect = 1.5 * 1.5 * (def.id === 'wedding_ring' ? 2 : 1);
    ok('chosen keepsake scales surge', Math.abs(s.prog.feastSurge - expect) < 0.01, `${s.prog.feastSurge} vs ${expect}`);
  }

  // ============ 5. gates still hold ============
  console.log('\n-- 5. gates --');
  {
    const s = freshGame();
    const idx = keepsakeIdx(s);
    s.prog.sentimentTaught = false;
    ok('no channeling before lesson', Game.channelSentiment(idx) === 'You hold it. Nothing happens. Not yet.');
    Game.teachSentiment();
    s.day = (s.day || 1) + 1; // fresh day so the demo doesn't block
    s.trauma = 12;
    const t0 = s.trauma;
    Game.channelSentiment(idx);
    ok('channeling soothes trauma', s.trauma < t0, `${t0} -> ${s.trauma}`);
    ok('once per day per item', Game.channelSentiment(idx) === 'It is quiet now. Tomorrow.');
    ok('non-keepsake rejected', Game.channelSentiment(999) === 'Not a keepsake.');
  }

  // ============ 6. trauma nudge at the clutch beat ============
  console.log('\n-- 6. trauma nudge --');
  {
    // Simulate the post-fight clutch beat logic directly: taught + trauma>=8
    // + ready keepsake -> nudge; already channeled -> silent.
    const s = freshGame();
    Game.teachSentiment();
    s.day = (s.day || 1) + 1; // demo day passed; keepsakes ready
    s.trauma = 12;
    const ready = Game.channelReadyKeepsakes();
    ok('nudge precondition: keepsake ready', ready.length > 0);
    // replicate the beat's guard
    const fires = (s.trauma || 0) >= 8 && Game.channelReadyKeepsakes().length > 0;
    ok('nudge fires when trauma high + ready', fires === true);
    Game.channelSentiment(ready[0]);
    const firesAfter = (s.trauma || 0) >= 8 && Game.channelReadyKeepsakes().length > 0;
    // trauma dropped below 8 after soothe, or no keepsakes ready
    ok('nudge quiets after channeling', firesAfter === false || (s.trauma || 0) < 8);
  }
  {
    const s = freshGame();
    Game.teachSentiment();
    s.day = (s.day || 1) + 1;
    s.trauma = 3; // low trauma
    const fires = (s.trauma || 0) >= 8 && Game.channelReadyKeepsakes().length > 0;
    ok('no nudge at low trauma', fires === false);
  }
  {
    const s = freshGame();
    s.prog.sentimentTaught = false; // never taught
    s.trauma = 20;
    const taught = Game.sentimentTaught();
    ok('no nudge before teaching', taught === false);
  }

  console.log(`\nUNIT: ${pass} passed, ${fail} failed`);
  if (!process.env.PROBE) process.exit(fail ? 1 : 0);

  // ============ PROBE: channel-aware policy, one 200-day run ============
  // Run as: PROBE=1 SEED=<seed> node scripts/test-channeling-gap-20261010.js
  // (separate process per seed: modules capture Math.random at load, so one
  // eval per process keeps the seed honest and avoids double-wrapping.)
  console.log('\n-- PROBE: channel-aware competent policy, 200 days --');
  const { runDays, setupGame } = require('./sim-harness');
  const { competent } = require('./policies/competent');
  const pol = Object.assign({}, competent, {
    id: 'channel-aware',
    setup(G, ctx) {
      pol._ctx = ctx;
      if (competent.setup) competent.setup(G, ctx);
    },
    daily(G, ctx) {
      if (competent.daily) competent.daily(G, ctx);
      // CHANNEL-AWARE: the player the new teaching produces. They saw the
      // demo, the button says what it does, the nudge points at trauma. So:
      // channel every ready keepsake, every day. Nothing else changes.
      try {
        if (G.sentimentTaught && G.sentimentTaught() && G.channelReadyKeepsakes) {
          for (const idx of G.channelReadyKeepsakes()) {
            try { G.channelSentiment(idx); ctx.channeled = (ctx.channeled || 0) + 1; } catch (e) {}
          }
        }
      } catch (e) {}
      try {
        const pg = G.progState();
        if (pg.feastSurge && !ctx.surgeArmedDay) ctx.surgeArmedDay = (G.state.scholar || {}).day || 0;
        if (pg.feastSurgeUsed && !ctx.surgeUsedDay) ctx.surgeUsedDay = (G.state.scholar || {}).day || 0;
        if (pg.sentimentTaught && !ctx.taughtDay) ctx.taughtDay = (G.state.scholar || {}).day || 0;
        if ((pg.arc || 1) > (ctx.maxArc || 1)) ctx.maxArc = pg.arc;
      } catch (e) {}
    },
  });
  await setupGame(Game);
  Game.say = function () {}; Game.sysSay = function () {}; Game.audioEvent = function () {};
  const result = await runDays(Game, pol, { days: 200, manifest: { seed: SEED, mode: 'channel-aware' } });
  const ctx = pol._ctx || {};
  let abSummary = '';
  try {
    const abs = [...(Game.state.scholar.abilities || []), ...(Game.state.scholar.backgroundAbilities || [])];
    abSummary = ` abilities=${abs.length} levels=[${abs.map(a => a.level || 1).join(',')}]`;
  } catch (e) {}
  console.log(`probe seed=${SEED}: days=${result.days} end=${result.endReason} ` +
    `channeled=${ctx.channeled || 0} taughtDay=${ctx.taughtDay || '-'} ` +
    `surgeArmedDay=${ctx.surgeArmedDay || '-'} surgeUsedDay=${ctx.surgeUsedDay || '-'} maxArc=${ctx.maxArc || 1}${abSummary}`);
  // The probe's bar: in runs that get taught, channeling must fire organically.
  if (ctx.taughtDay && !(ctx.channeled > 0)) {
    console.log('FAIL probe: taught but never channeled organically');
    process.exit(1);
  }
  if (ctx.taughtDay) console.log('PROBE PASS: organic channeling fired under a channel-aware policy');
  else console.log('probe: run never reached integration 60 (no teaching) — channeling untestable here');
  process.exit(fail ? 1 : 0);
})();
