#!/usr/bin/env node
// PROOF TEST (detective playtest loop, 2026-10-08): bribery-economy fixes.
// BEFORE (demonstrated by scripts/attack-detective-20261008.js):
//   1. payBribe decremented the phantom pantryKcal scalar -> pantry-funded bribes were FREE.
//   2. canAffordBribe read the phantom scalar -> full pantry read as unaffordable.
//   3. bribeVoter stacked duplicate entries for the same (voter, briber).
//   4. exposeBribery on the player's OWN bribe swung belief +25 (double-dip).
// AFTER: all four hold. Run: SEED=N node scripts/test-detective-bribery-20261008.js
const H = require('./harness-detective.js');
let pass = 0, fail = 0;
const t = (name, cond, detail) => { if (cond) { pass++; console.log(`[ok] ${name}`); } else { fail++; console.log(`[FAIL] ${name}${detail ? ' — ' + detail : ''}`); } };

(async () => {
  await H.Game.init();
  console.log('== SEED ' + H.SEED + ' ==');
  const G = H.Game;

  // FIX 1: payBribe removes REAL pantry items; records the taking.
  {
    const s = H.fresh();
    G.state.village.pantry = [{ name: 'smoked meat', kcalEach: 500, units: 40, kg: 0.2 }];
    s.inventory = [];
    const live0 = G.pantryKcalLive(G.state.village);
    const takes0 = (G.state.village.takes || {})[G.villagerId] || 0;
    G.payBribe(null, 'x', 5000);
    const live1 = G.pantryKcalLive(G.state.village);
    const takes1 = (G.state.village.takes || {})[G.villagerId] || 0;
    t('payBribe removes real pantry food', live0 - live1 === 5000, `live ${live0} -> ${live1}`);
    t('payBribe records the taking', takes1 - takes0 === 5000, `takes ${takes0} -> ${takes1}`);
    H.say();
  }

  // FIX 2: canAffordBribe sees a real-items pantry; pack-first order preserved.
  {
    const s = H.fresh();
    G.state.village.pantry = [{ name: 'smoked meat', kcalEach: 500, units: 40, kg: 0.2 }];
    G.state.village.pantryKcal = 0; // phantom scalar zeroed — must not matter
    s.inventory = [];
    const fakeCase = { accused: [] };
    const cheap = G.caseBribePrice(fakeCase, G.npcIds()[0]);
    t('canAffordBribe reads live pantry (scalar=0)', cheap <= 20000 && G.canAffordBribe(fakeCase, G.npcIds()[0]),
      `price=${cheap}`);
    // pack-first: with a full pack, pantry must NOT be touched
    s.inventory = [{ name: 'meat', kcalEach: 100, units: 50, kg: 0.1 }];
    const live0 = G.pantryKcalLive(G.state.village);
    G.payBribe(null, 'x', 1000);
    t('payBribe spends pack before pantry', G.pantryKcalLive(G.state.village) === live0, `pantry untouched`);
    H.say();
  }

  // FIX 3: bribeVoter idempotent per (voter, briber).
  {
    const s = H.fresh();
    const victim = G.npcIds().find(id => id !== s.id);
    G.recordCrime('theft', { victim, witnessed: true });
    const c = G.openPlayerCase(victim, 'theft', [{ type: 'theft', victim, witnessed: true }], false);
    H.say();
    const vid = G.npcIds().find(id => !c.accused.includes(id) && G.caseBribable(c, id));
    const price = G.caseBribePrice(c, vid);
    const r1 = G.bribeVoter(c.id, vid, G.villagerId, price);
    const r2 = G.bribeVoter(c.id, vid, G.villagerId, price);
    const n = (c.bribes || []).filter(b => b.voter === vid && b.by === G.villagerId).length;
    t('first bribe accepted', r1 === true);
    t('second bribe rejected', r2 === null, `returned ${r2}`);
    t('single bribe entry', n === 1, `entries=${n}`);
    H.say();
  }

  // FIX 4: exposing your own bribe backfires (-30), no double-dip.
  {
    const s = H.fresh();
    const victim = G.npcIds().find(id => id !== s.id);
    const c = G.openPlayerCase(victim, 'theft', [], false); // plot-style case, player NOT accused
    c.playerRole = 'bystander'; c.accuser = victim; c.accused = [G.npcIds().find(id => id !== s.id && id !== victim)];
    H.say();
    const vid = G.npcIds().find(id => !c.accused.includes(id) && !G.isPlayer(id) && G.caseBribable(c, id));
    const price = G.caseBribePrice(c, vid);
    G.bribeVoter(c.id, vid, G.villagerId, price);
    const b0 = Object.values(c.belief).reduce((a, b) => a + (b || 0), 0);
    const ok = G.exposeBribery(c.id, vid);
    const b1 = Object.values(c.belief).reduce((a, b) => a + (b || 0), 0);
    t('self-exposure accepted', ok === true);
    t('self-exposure backfires (belief drops)', b1 - b0 <= -25, `delta=${b1 - b0}`);
    H.say();
  }

  // REGRESSION: NPC bribers still work; accused-voter still blocked.
  {
    const s = H.fresh();
    const victim = G.npcIds().find(id => id !== s.id);
    G.recordCrime('theft', { victim, witnessed: true });
    const c = G.openPlayerCase(victim, 'theft', [{ type: 'theft', victim, witnessed: true }], false);
    H.say();
    const npc = G.npcIds().find(id => !c.accused.includes(id) && !G.isPlayer(id));
    const vid = G.npcIds().find(id => !c.accused.includes(id) && !G.isPlayer(id) && id !== npc && G.caseBribable(c, id));
    const price = G.caseBribePrice(c, vid);
    const rNpc = G.bribeVoter(c.id, vid, npc, price);
    const rAcc = G.bribeVoter(c.id, c.accused[0], G.villagerId, 800);
    t('NPC briber still accepted', rNpc === true);
    t('accused voter still blocked', rAcc === null);
    H.say();
  }

  // FIX 5: weregild +3000 arrives as real food (was phantom scalar).
  {
    const s = H.fresh();
    G.state.village.pantry = [{ name: 'smoked meat', kcalEach: 500, units: 10, kg: 0.2 }];
    const live0 = G.pantryKcalLive(G.state.village);
    G.stockPantry(3000, 'Weregild');
    t('weregild stockPantry path is real', G.pantryKcalLive(G.state.village) - live0 === 3000,
      `live ${live0} -> ${G.pantryKcalLive(G.state.village)}`);
    H.say();
  }

  // FIX 6: visitor welcome removes real food (was phantom scalar).
  {
    const s = H.fresh();
    G.state.village.pantry = [{ name: 'smoked meat', kcalEach: 500, units: 10, kg: 0.2 }];
    const live0 = G.pantryKcalLive(G.state.village);
    const removed = G._removePantryKcal(500);
    t('visitor-feast removal path is real', removed === 500 && G.pantryKcalLive(G.state.village) === live0 - 500,
      `removed=${removed} live ${live0} -> ${G.pantryKcalLive(G.state.village)}`);
    H.say();
  }

  console.log(`\n== ${pass} passed, ${fail} failed ==`);
  process.exit(fail ? 1 : 0);
})();
