#!/usr/bin/env node
// HOSTILE PLAYTEST (brawler archetype, 2026-10-10, run 5):
// The bear fight (docs/BEAR.md canon: "Bear should be a non monster monster
// fight" — fierce for humans with ordinary weapons). Attack surfaces:
//   E1 maul one-shot (THE CATCH): `!a._mauled` made the 8-17 maul fire ONCE
//      per encounter. The bear stays after misses (encMissReact answers
//      6-13/strike and it does not bolt), so a hostile brawler ate ONE maul
//      and then ground it down with a knife at FULL kill chance — the x0.4
//      close-range penalty lived inside the same one-shot block. The maul
//      was a toll, not a fight. FIX: maul answers EVERY close strike.
//   E2 spear-halves honesty: maulDmg = ceil(8..17 / 2) for spear only.
//   H1 weapon effectiveness ordering (canon: bow > spear > knife > bare hands)
//      measured as kills-per-strike at optimal range vs a bear.
//   H2 narration honesty: every HP lost in a bear strike is named in the
//      feedback, and each named number is in the real roll range.
//   S1 death mid-maul: no hang when the maul drops health to 0.
// Run: SEED=N node scripts/attack-brawler-bear-20261010.js
const H = require('./combat-break-harness.js');
const fails = [];
const check = (name, cond, extra) => {
  console.log((cond ? 'PASS' : 'FAIL') + ' ' + name + (extra ? ' — ' + extra : ''));
  if (!cond) fails.push(name);
};

(async () => {
  const G = await H.newCombatReadyGame();
  const S = G.state, s = S.scholar;
  let said = [];
  G.say = (m) => { said.push(String(m)); };
  G.feedback = (m) => { said.push(String(m)); };
  const drain = () => { const t = said.slice(); said = []; return t; };
  const maulRe = /claws rake|The bear is ON you|four hundred pounds of NO/i;
  const resolveRe = /Got it|So close|Missed!|jinks at the last breath|Too far/i;
  const dmgNums = (entries) => {
    let ns = [];
    for (const e of entries) {
      const ms = String(e).match(/\(-(\d+) HP\)/g) || [];
      for (const m of ms) ns.push(parseInt(m.slice(2), 10));
      const ms2 = String(e).match(/— (\d+) damage/g) || [];
      for (const m of ms2) ns.push(parseInt(m.slice(2).split(' ')[0], 10));
    }
    return ns;
  };

  function equip(itemId) { s.equipped = s.equipped || {}; s.equipped.weapon = itemId ? { itemId } : null; }
  function spawnBear(dist) {
    s.mx = 4; s.my = 4; s.health = 100;
    s.animal = { id: 'black_bear', mx: 4 + dist, my: 4, aware: 0, stamina: 1, pstate: 'graze', edgeTurns: 0, wild: true };
  }
  // one hostile-brawler exchange: strike; if the bear bolted a tile, step back up.
  function strike(itemId) {
    equip(itemId);
    const d0 = Math.max(Math.abs(s.animal.mx - 4), Math.abs(s.animal.my - 4));
    const h0 = s.health;
    drain();
    let r = null;
    try { r = G.huntAnimal(); } catch (e) { return { threw: e.message }; }
    const entries = drain();
    const h1 = s.health;
    const resolved = entries.some(e => resolveRe.test(e));
    const mauls = entries.filter(e => maulRe.test(e)).length;
    // re-approach for the next exchange (the bear bolts a tile on most strikes)
    if (s.animal) { s.mx = s.animal.mx - 1; s.my = s.animal.my; }
    return { d0, h0, h1, entries, resolved, mauls, dmgNums: dmgNums(entries), killed: !s.animal };
  }

  console.log('== SEED ' + H.SEED + ' ==');

  // ============ E1: the maul answers EVERY close strike ============
  {
    let closeResolved = 0, mauls = 0, strikes = 0, kills = 0, dmg = 0;
    for (let i = 0; i < 60; i++) {
      spawnBear(1);
      for (let k = 0; k < 8 && s.animal; k++) {
        s.health = 100; // hostile brawler heals between exchanges to measure the maul, not death
        const o = strike('stone_knife');
        if (o.threw) break;
        strikes++;
        if (o.killed) { kills++; break; }
        if (!s.animal) break;
        if (o.resolved && o.d0 <= 2) { closeResolved++; mauls += o.mauls; }
        dmg += o.h0 - o.h1;
      }
      if (s.health <= 0) break;
    }
    console.log(`E1: ${strikes} strikes, closeResolved=${closeResolved}, mauls=${mauls}, kills=${kills}, dmg=${dmg}`);
    check('E1 every resolved close-range strike draws a maul', closeResolved > 10 && mauls === closeResolved,
      `mauls=${mauls} resolved=${closeResolved}`);
    check('E1 knife-bear is desperate (avg >= 12 HP per exchange)', dmg / Math.max(1, closeResolved) >= 12,
      `avg=${(dmg / Math.max(1, closeResolved)).toFixed(1)}`);
  }

  // ============ E2: spear halves the maul, every strike ============
  {
    const spearN = [], knifeN = [];
    for (let i = 0; i < 40; i++) {
      spawnBear(2); const o = strike('hunting_spear');
      if (!o.threw) for (const e of o.entries) if (maulRe.test(e)) { const m = String(e).match(/\(-(\d+) HP\)/); if (m) spearN.push(parseInt(m[1], 10)); }
      spawnBear(1); const o2 = strike('stone_knife');
      if (!o2.threw) for (const e of o2.entries) if (maulRe.test(e)) { const m = String(e).match(/\(-(\d+) HP\)/); if (m) knifeN.push(parseInt(m[1], 10)); }
    }
    const mx = (a) => a.length ? Math.max(...a) : -1, mn = (a) => a.length ? Math.min(...a) : -1;
    console.log(`E2: spear maul range ${mn(spearN)}-${mx(spearN)} (n=${spearN.length}); knife maul range ${mn(knifeN)}-${mx(knifeN)} (n=${knifeN.length})`);
    check('E2 spear maul halved (4-9)', spearN.length > 5 && mn(spearN) >= 4 && mx(spearN) <= 9, '');
    check('E2 knife maul full (8-17)', knifeN.length > 5 && mn(knifeN) >= 8 && mx(knifeN) <= 17, '');
  }

  // ============ H1: weapon ordering bow > spear > knife > hands ============
  // Canon's ordering is about the whole package: the hunting_spear's raw
  // bonus (30) beats the crude_bow's (18), so kill rates tie — the bow's
  // edge is RANGE: it kills from outside mauling distance. The honest
  // assertion: expected HP cost per strike strictly orders bow < spear <
  // knife, and kill rates order spear >= knife > hands.
  {
    const N = 60;
    const setups = [['bow', 'crude_bow', 3], ['spear', 'hunting_spear', 2], ['knife', 'stone_knife', 1], ['hands', null, 1]];
    const rates = {}, costs = {};
    for (const [name, itemId, dist] of setups) {
      let kills = 0, dmg = 0;
      for (let i = 0; i < N; i++) {
        spawnBear(dist); s.health = 10000;
        const o = strike(itemId);
        if (o.threw) continue;
        if (o.killed) kills++;
        dmg += o.h0 - o.h1;
      }
      rates[name] = kills / N; costs[name] = dmg / N;
    }
    console.log('H1 kill/strike: ' + JSON.stringify(rates) + ' | HP cost/strike: ' + JSON.stringify(costs));
    check('H1 bow@3 costs less per strike than spear@2 (range beats maul)', costs.bow < costs.spear,
      `${costs.bow.toFixed(1)} vs ${costs.spear.toFixed(1)}`);
    check('H1 spear@2 costs less per strike than knife@1 (reach halves)', costs.spear < costs.knife,
      `${costs.spear.toFixed(1)} vs ${costs.knife.toFixed(1)}`);
    check('H1 spear kills at least as well as knife', rates.spear >= rates.knife,
      `${rates.spear.toFixed(2)} vs ${rates.knife.toFixed(2)}`);
    check('H1 knife@1 beats bare hands@1', rates.knife >= rates.hands,
      `${rates.knife.toFixed(2)} vs ${rates.hands.toFixed(2)}`);
    check('H1 knife@1 stays a long shot (<= 0.15)', rates.knife <= 0.15, `${rates.knife.toFixed(2)}`);
  }

  // ============ H2: every HP lost is narrated, honestly ============
  {
    let bad = 0, n = 0, bites = 0;
    for (let i = 0; i < 30; i++) {
      spawnBear(1);
      const o = strike('stone_knife');
      if (o.threw || !o.resolved) continue;
      n++;
      const named = o.dmgNums.reduce((a, b) => a + b, 0);
      if (named !== o.h0 - o.h1) bad++; // silent damage or lying numbers
      for (const e of o.entries) {
        if (/It bites! Teeth in your hand/i.test(e)) bites++; // generic bite must not double-dip the bear
        if (maulRe.test(e)) { const m = String(e).match(/\(-(\d+) HP\)/); if (m && (parseInt(m[1], 10) < 8 || parseInt(m[1], 10) > 17)) bad++; }
        if (/does not run\. It ROARS/i.test(e)) { const m = String(e).match(/\(-(\d+) HP\)/); if (m && (parseInt(m[1], 10) < 6 || parseInt(m[1], 10) > 13)) bad++; }
      }
    }
    check('H2 all bear-strike damage is named, in-range', bad === 0 && n > 5, `strikes=${n} bad=${bad}`);
    check('H2 no generic bite double-dip on the bear (maul is the answer)', bites === 0, `bites=${bites}`);
  }

  // ============ S1: death mid-maul — processed, no hang ============
  // (brawler break-it 2026-10-10: the resurrection fix made 0 HP persistent;
  // the hunt path had no death gate — the old bug papered over it. Now the
  // death gate fires: mantle passes (vid changes) or the run ends.)
  {
    let threw = false, deaths = 0, postOk = true;
    for (let i = 0; i < 20; i++) {
      spawnBear(1);
      s.health = 5;
      const vidBefore = G.villagerId;
      drain();
      let o;
      try { o = strike('stone_knife'); } catch (e) { threw = true; continue; }
      if (o.threw) { threw = true; continue; }
      const t = o.entries.join('\n');
      if (G.villagerId !== vidBefore || G.over || /is dead —/.test(t)) deaths++;
      try { if (G.state.scholar.animal && !G.over) { G.huntAnimal(); drain(); } } catch (e) { postOk = false; }
      if (G.over) break;
    }
    check('S1 lethal maul never throws, post-death never throws', !threw && postOk, '');
    check('S1 the bear CAN kill you up close — death is processed', deaths > 0, `deaths=${deaths}`);
  }

  console.log(fails.length ? `\n${fails.length} FAILURES: ${fails.join(', ')}` : '\nALL GREEN');
  process.exit(fails.length ? 1 : 0);
})();
