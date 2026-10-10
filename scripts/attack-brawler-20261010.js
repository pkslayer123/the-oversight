#!/usr/bin/env node
// HOSTILE PLAYTEST (brawler archetype, 2026-10-10, run 3):
// Attack surfaces: Issue Challenge + End It Before It Starts honesty
// (both were lie-buttons: copy promised effects, impl narrated nothing),
// bellow no-foes turn-eating, useAbility turn-before-impl ordering
// (brace's "next incoming damage" wasn't up for the tap-provoked hit;
// settle_debt cashed the activation-turn hit), bellow stun-lock economy,
// damage-stack audit, stare_down flee->routed, settle_debt/brace copy honesty.
// Run: SEED=N node scripts/attack-brawler-20261010.js
const H = require('./combat-break-harness.js');
const fails = [];
const check = (name, cond, extra) => {
  console.log((cond ? 'PASS' : 'FAIL') + ' ' + name + (extra ? ' — ' + extra : ''));
  if (!cond) fails.push(name);
};

(async () => {
  const G = await H.newCombatReadyGame();
  const S = G.state, v = S.village, s = S.scholar;
  const me = G.villagerId;
  const npcs = () => (v.roster || []).filter(id => id !== me);
  console.log('== SEED ' + H.SEED + ' npcs=' + npcs().length + ' ==');
  let said = [];
  G.say = (m) => { said.push(String(m)); };
  G.sysSay = () => {};
  const sayText = () => { const t = said.join(' '); said = []; return t; };
  const grant = (id) => { s.abilities = s.abilities || []; if (!s.abilities.includes(id)) s.abilities.push(id); };
  let lastResult = null;
  const _tbEnd = G.tbEnd.bind(G);
  G.tbEnd = function (r) { lastResult = r; return _tbEnd(r); };

  // ============ E1: challenge respect farm — one dare a day ============
  {
    grant('war_cry');
    const a = npcs()[0], b = npcs()[1];
    const g0 = (v.gossip || []).filter(g => g.action === 'challenged').length;
    G.useAbility('war_cry', 'challenge', a);           // fires
    const t1 = sayText();
    const fired1 = s.challengeDay === s.day;
    G.useAbility('war_cry', 'challenge', b);           // same day -> refused
    const t2 = sayText();
    const refused2 = /once a day/i.test(t2);
    const g1 = (v.gossip || []).filter(g => g.action === 'challenged').length;
    const mem = ((v.memory || {})[a] || []).some(m => m.t === 'you_challenged');
    check('E1 challenge fires once per day', fired1 && refused2, `fired=${fired1} refused2=${refused2} t2="${t2.slice(0, 60)}"`);
    check('E1 challenge gossip bounded', g1 - g0 === 1, `rumors=${g1 - g0}`);
    check('E1 challenge writes target memory', mem, '');
    check('E1 challenge says the dare stands', /dare is public|dare stands/i.test(t1), t1.slice(0, 80));
  }

  // ============ E2: challenge with no target and no convo — honest refusal ============
  {
    s.challengeDay = -999; // reset guard to isolate the no-target path
    const r = G.useAbility('war_cry', 'challenge', undefined);
    const t = sayText();
    check('E2 challenge no-target refuses', r === false && s.challengeDay === -999,
      `ret=${r} said="${t.slice(0, 70)}"`);
  }

  // ============ E3: end_it_before with no target and no convo — honest refusal ============
  {
    grant('intimidating_presence');
    const r = G.useAbility('intimidating_presence', 'end_it_before', undefined);
    const t = sayText();
    check('E3 end_it_before no-target refuses', r === false && s.postureDay === undefined,
      `ret=${r} said="${t.slice(0, 70)}"`);
  }

  // ============ E4: end_it_before — resentment is real, once a day ============
  {
    const vid = npcs()[2];
    v.trust = v.trust || {}; v.trust[vid] = 20;
    G.useAbility('intimidating_presence', 'end_it_before', vid);   // fires
    const t1 = sayText();
    const t1v = v.trust[vid];
    const mem = ((v.memory || {})[vid] || []).some(m => m.t === 'you_postured');
    G.useAbility('intimidating_presence', 'end_it_before', vid);   // refused
    const t2 = sayText();
    const t2v = v.trust[vid];
    check('E4 end_it_before fires with real resentment', t1v === 15 && mem, `trust 20->${t1v} mem=${mem}`);
    check('E4 end_it_before once a day', /once a day/i.test(t2) && t2v === 15, `trust=${t2v}`);
    check('E4 end_it_before copy honest', /dispute ends here/i.test(t1), t1.slice(0, 80));
  }

  // ============ E5: bellow at an empty room — refused before payment ============
  {
    const mk = H.synthFight(G, 'hushwolf', { mhp: 30, php: 500 });
    grant('war_cry');
    const m = G.tbfight.fightersByKey[mk]; m.mx = 5; m.my = 4;
    m.fled = true; // everyone gone
    s.kcal = 5000;
    const kcal0 = s.kcal;
    const p = G.tbFighter('p'); p.acted = false;
    const r = G.useAbility('war_cry', 'bellow');
    const t = sayText();
    check('E5 bellow no-foes refused before payment',
      r === false && s.kcal === kcal0 && p.acted === false,
      `ret=${r} kcal ${kcal0}->${s.kcal} acted=${p.acted} said="${t.slice(0, 60)}"`);
    G.tbEnd('fled'); G.tbfight = null; lastResult = null;
  }

  // ============ E6: bellow stun-lock economy — stall, not lock ============
  {
    const mk = H.synthFight(G, 'bulldozer', { mhp: 400, php: 500 });
    grant('war_cry');
    const m = G.tbfight.fightersByKey[mk]; m.mx = 5; m.my = 4;
    s.kcal = 5000; s.health = 500;
    const kcal0 = s.kcal;
    let lostTurns = 0, actedTurns = 0, rounds = 0;
    const _mt = G.tbMonsterTurn.bind(G);
    G.tbMonsterTurn = function (mm) {
      if (mm === m && (mm.stunned || 0) > 0) lostTurns++; else actedTurns++;
      return _mt(mm);
    };
    let guard = 0;
    while (G.tbfight && !G.tbfight.over && guard++ < 200 && rounds < 24) {
      const p = G.tbFighter('p');
      if (!p || !p.alive) break;
      if (G.tbIsPlayerTurn() && !p.acted) {
        const ok = G.useAbility('war_cry', 'bellow');
        if (!ok) break;
        rounds++;
      } else { try { G.tbAdvance(); } catch (e) { break; } }
    }
    const earlyEnd = lastResult; lastResult = null;
    G.tbMonsterTurn = _mt;
    const kcalSpent = kcal0 - s.kcal;
    console.log(`    E6: rounds=${rounds} lost=${lostTurns} acted=${actedTurns} kcalSpent=${kcalSpent} earlyEnd=${earlyEnd}`);
    // HELD if the monster still acts sometimes (no true lock) and the stall
    // costs 30 kcal/round. A routed early end is the anti-farm case.
    const held = (earlyEnd === 'routed') || (actedTurns > 0 && lostTurns > 0 && kcalSpent >= rounds * 30);
    check('E6 bellow is a costly stall, not a lock', held,
      `acted=${actedTurns}/${rounds} kcal/round=${rounds ? (kcalSpent / rounds).toFixed(1) : 'n/a'}`);
    if (G.tbfight) { try { G.tbEnd('fled'); } catch (e) {} G.tbfight = null; }
  }

  // ============ E7: damage stack audit — every multiplier narrated ============
  {
    const src = require('fs').readFileSync(require('path').join(H.ROOT, 'src/js/abilityActions.js'), 'utf8');
    const says = [
      'HAYMAKER', 'Heavy hands', 'TRADE OF BLOWS', 'SETTLE THE DEBT',
      'The rage burns out', 'ONE PERSON ARMY: surrounded', 'ONE PERSON ARMY: alone in it',
    ];
    const missing = says.filter(x => !src.includes(x));
    const maxChain = 2.5 * 1.2 * 1.5 * 2.0 * 1.5;
    check('E7 damage stack: all multipliers narrated', missing.length === 0,
      `missing=[${missing}] max chain=${maxChain.toFixed(2)}x — sanctioned min-max, held`);
  }

  // ============ S1: stare_down flee -> routed, no hang ============
  {
    const mk = H.synthFight(G, 'hushwolf', { mhp: 60, php: 500 });
    grant('intimidating_presence');
    const m = G.tbfight.fightersByKey[mk]; m.mx = 5; m.my = 4;
    if (m.mdef) m.mdef.aggression = 'skittish';
    s.kcal = 5000;
    let tries = 0;
    while (G.tbfight && !G.tbfight.over && !m.fled && tries++ < 40) {
      const p = G.tbFighter('p');
      if (G.tbIsPlayerTurn() && !p.acted) {
        G.useAbility('intimidating_presence', 'stare_down', mk);
      } else { try { G.tbAdvance(); } catch (e) { break; } }
    }
    const ended = !G.tbfight || G.tbfight.over;
    const res = lastResult; lastResult = null;
    check('S1 stare_down flee routes the fight, no hang',
      m.fled === true && ended && res === 'routed',
      `fled=${m.fled} ended=${ended} result=${res} tries=${tries}`);
    if (G.tbfight) { try { G.tbEnd('fled'); } catch (e) {} G.tbfight = null; }
  }

  // ============ H1: settle_debt copy vs engine (turn-last: no activation-hit) ============
  {
    const mk = H.synthFight(G, 'hushwolf', { mhp: 60, php: 500 });
    grant('trade_of_blows');
    s.fightDamageTaken = 100; s.debtSettled = false;
    s.kcal = 5000;
    G.useAbility('trade_of_blows', 'settle_debt');
    check('H1 settle_debt = 50% of damage taken', s.settleDebtBonus === 50, `bonus=${s.settleDebtBonus}`);
    G.useAbility('trade_of_blows', 'settle_debt');
    check('H1 settle_debt once per fight', s.settleDebtBonus === 50, `bonus=${s.settleDebtBonus}`);
    if (G.tbfight) { try { G.tbEnd('fled'); } catch (e) {} G.tbfight = null; }
  }

  // ============ H2: brace copy vs engine ============
  // (brace is single-use: consumed on absorb — so the math is tested
  // directly on the consumer; the impl setting the flag is proven by H3)
  {
    s.braceActive = { reduce: 0.6 };
    const out = G._applyAbilityDefenseMods(100, 'test');
    check('H2 brace = 60% reduction (copy honest)', out === 40 && !s.braceActive,
      `100 -> ${out}, consumed=${!s.braceActive}`);
  }

  // ============ H3: brace is up BEFORE the monster's response (turn-last) ============
  {
    const mk = H.synthFight(G, 'bulldozer', { mhp: 400, php: 500 });
    grant('unbreakable');
    const m = G.tbfight.fightersByKey[mk]; m.mx = 5; m.my = 4;
    s.kcal = 5000;
    let braceUpAtMonsterTurn = null;
    const _mt = G.tbMonsterTurn.bind(G);
    G.tbMonsterTurn = function (mm) {
      if (braceUpAtMonsterTurn === null) braceUpAtMonsterTurn = !!(s.braceActive && s.braceActive.reduce);
      return _mt(mm);
    };
    const p = G.tbFighter('p');
    if (G.tbIsPlayerTurn() && !p.acted) G.useAbility('unbreakable', 'brace');
    G.tbMonsterTurn = _mt;
    check('H3 brace up before the tap-provoked response', braceUpAtMonsterTurn === true,
      `braceUp=${braceUpAtMonsterTurn}`);
    if (G.tbfight) { try { G.tbEnd('fled'); } catch (e) {} G.tbfight = null; }
  }

  console.log(fails.length ? `\n${fails.length} FAILURES: ${fails.join(', ')}` : '\nALL GREEN');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
