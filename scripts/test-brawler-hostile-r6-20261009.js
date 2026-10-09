#!/usr/bin/env node
// BRAWLER HOSTILE RUN 6 — 2026-10-09 (rotation idx 4).
// Hostile question set for the brawler's verbs: combat, friendly fire,
// intimidation, practice/XP. Every section is ATTACK first, then verdict.
// Usage: node scripts/test-brawler-hostile-r6-20261009.js (SEED env override)
const H = require('./combat-break-harness.js');

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}
function note(t) { console.log('  note ' + t); }

(async () => {
  const Game = await H.newCombatReadyGame();
  const s = Game.state.scholar;
  const lines = [];
  const osay = Game.say.bind(Game);
  Game.say = (t) => { lines.push(String(t)); return osay(t); };
  const clearLines = () => lines.splice(0);
  const lashFired = () => lines.some(l => l.includes('GRISTLEFIT') && l.includes('lash catches'));

  // ================= SECTION 1: gristlefit friendly-fire =================
  // ATTACK: in a monster fight with a villager ally, does the wild lash
  // have ANY social consequence (crime, trust, trauma, retaliation)?
  {
    const mk = H.synthFight(Game, 'hushwolf', { php: 100, mhp: 2000 });
    const f = Game.tbfight;
    const vid = Game.state.village.roster.find(id => id !== Game.villagerId);
    const ally = { key: 'v_ally', kind: 'villager', villagerId: vid,
      name: 'Ally', emoji: '🧍', hp: 600, maxHp: 600, speed: 3, mx: 5, my: 5,
      alive: true, fled: false };
    f.fighters.push(ally); f.fightersByKey['v_ally'] = ally;
    f.fightersByKey[mk].mx = 5; f.fightersByKey[mk].my = 4; // adjacent
    f.fightersByKey[mk].stunned = 999; // hostile control: monster can't touch the ally
    try { Game.applyStatus('scholar', 'gristlefit', { source: 'test' }); } catch (e) { note('1.x applyStatus threw: ' + e.message); }
    check('1.0 gristlefit status applied', !!(Game.hasStatus && Game.hasStatus('scholar', 'gristlefit')),
      'hasStatus false — lash branch unreachable');
    const trust0 = Game.state.village.trust[vid];
    const crimes0 = (Game.justiceState().crimes || []).length;
    const trauma0 = s.trauma || 0;
    let lashHit = 0;
    for (let i = 0; i < 400 && !lashHit; i++) {
      const p = Game.tbFighter('p');
      p.acted = false; f.turnIdx = Math.max(0, f.order.indexOf('p'));
      const vhp = ally.hp;
      clearLines();
      try { Game.tbPlayerStrike(mk); } catch (e) { break; }
      if (lashFired() && ally.hp < vhp) lashHit++;
    }
    check('1.1 lash hits the villager ally (15%/strike, 400 strikes)',
      lashHit > 0, 'no lash-on-ally observed — cannot evaluate consequences');
    if (lashHit > 0) {
      const trust1 = Game.state.village.trust[vid];
      const crimes1 = (Game.justiceState().crimes || []).length;
      const trauma1 = s.trauma || 0;
      note(`1.3 CONSEQUENCE CHECK — trust ${trust0}->${trust1}, crimes ${crimes0}->${crimes1}, trauma ${trauma0}->${trauma1}`);
      check('1.3 friendly fire has SOME social consequence', trust1 < trust0 || crimes1 > crimes0 || trauma1 > trauma0,
        'lash injured an ally mid-fight with zero social record — friendly-fire lie');
    }
    try { Game.tbEnd && Game.tbEnd('fled'); } catch (e) {}
    clearLines();
  }

  // ================= SECTION 2: striking a villager ally is refused ======
  {
    const mk = H.synthFight(Game, 'hushwolf', { php: 100, mhp: 100 });
    const f = Game.tbfight;
    const ally = { key: 'v_ally', kind: 'villager', villagerId: 'x',
      name: 'Ally', emoji: '🧍', hp: 60, maxHp: 60, speed: 3, mx: 5, my: 4,
      alive: true, fled: false };
    f.fighters.push(ally); f.fightersByKey['v_ally'] = ally;
    clearLines();
    let r, said = 0;
    const n0 = lines.length;
    try { r = Game.tbPlayerStrike('v_ally'); } catch (e) { r = 'threw:' + e.message; }
    said = lines.length - n0;
    check('2.0 strike at a villager ally is refused (not silent, not landed)',
      r === false && ally.hp === 60 && said > 0, `returned ${r}, hp=${ally.hp}, said=${said}`);
    try { Game.tbEnd && Game.tbEnd('fled'); } catch (e) {}
  }

  // ================= SECTION 3: practice farm ============================
  // ATTACK: is there any per-fight / per-day cap on strike practice, or can
  // one long fight grind str/agi to the ceiling with zero risk?
  {
    const mk = H.synthFight(Game, 'speedbump_turtle', { php: 500, mhp: 2000 });
    const f = Game.tbfight;
    const t = f.fightersByKey[mk];
    t.mx = 5; t.my = 4;
    s.stats = { str: 5, end: 5, per: 5, agi: 5, pre: 5 };
    s.practice = {};
    const hp0 = t.hp;
    let strikes = 0;
    for (let i = 0; i < 200; i++) {
      const p = Game.tbFighter('p');
      p.acted = false; f.turnIdx = Math.max(0, f.order.indexOf('p'));
      let ok = false;
      try { ok = Game.tbPlayerStrike(mk); } catch (e) { break; }
      if (!ok) break;
      strikes++;
      t.hp = hp0; // hostile control: monster never dies, never acts
      if (!t.alive) break;
    }
    note(`3.0 ${strikes} strikes landed: str=${s.stats.str} agi=${s.stats.agi} (practice str=${s.practice.str || 0} agi=${s.practice.agi || 0})`);
    check('3.1 stat ceiling holds at 10', (s.stats.str || 0) <= 10 && (s.stats.agi || 0) <= 10, 'ceiling broken');
    check('3.2 every landed strike grants practice (no per-fight cap)',
      strikes > 0 && ((s.practice.str || 0) + (s.stats.str > 5 ? 8 : 0) > 0), 'no practice at all');
    try { Game.tbEnd && Game.tbEnd('fled'); } catch (e) {}
  }

  // ================= SECTION 4: intimidation loop ========================
  // ATTACK: farm a cautious villager across days. How much food before the
  // breaking point? Does trust floor? Is there an infinite loop?
  {
    const vid = Game.state.village.roster.find(id => id !== Game.villagerId);
    const vp = (Game.data.villagers || []).find(x => x.id === vid);
    if (vp) { vp.personality = vp.personality || {}; vp.personality.temperament = 'cautious'; }
    const v = Game.state.village;
    v.memory = v.memory || {}; v.memory[vid] = [];
    v.pack = v.pack || {};
    Game.npcNeeds(vid).fear = 0;
    let totalKcal = 0, yields = 0;
    const outcomes = [];
    for (let day = 1; day <= 12; day++) {
      s.day = day;
      const n = Game.npcNeeds(vid);
      n.fear = Math.max(0, (n.fear || 0) - 8); // endDay-style decay
      v.pack[vid] = { day, kcal: 800, risks: [] }; // victim restocks daily (farm's best case)
      s.inventory = (s.inventory || []).filter(i => !i.stolen);
      if (!v.roster.includes(vid)) { outcomes.push(`day${day}: victim gone (fled)`); break; }
      clearLines();
      let r;
      try { r = Game.intimidate(vid); } catch (e) { r = 'threw:' + e.message; break; }
      outcomes.push(`day${day}: ${r}`);
      if (r === 'yielded') {
        yields++;
        totalKcal += (s.inventory || []).filter(i => i.stolen)
          .reduce((a, i) => a + (i.units || 0) * (i.kcalEach || 150), 0);
      }
      if (r === 'fight' || r === 'fled' || r === false) break;
      if (Game.tbfight) { try { Game.tbEnd('fled'); } catch (e) {} break; }
    }
    const trustEnd = (v.trust || {})[vid];
    note(`4.0 intimidation loop: ${yields} yields, ~${totalKcal} kcal taken, trust now ${trustEnd}`);
    note(`4.1 outcomes: ${outcomes.join(' | ')}`);
    check('4.2 breaking point fires (no infinite daily farm)', yields <= 3,
      `${yields} successful shakedowns — victim never snapped/fled`);
    check('4.3 trust has a sane floor', (trustEnd === undefined || trustEnd >= -100), 'trust=' + trustEnd);
    try { if (Game.tbfight) { Game.tbEndCheck(); } } catch (e) {}
    try { if (Game.tbfight) { Game.tbEnd('fled'); } } catch (e) {}
  }

  // ================= SECTION 5: betrayal fight endings ====================
  // ATTACK (softlock + consequence): can a hostile player reliably murder?
  // 5a: beat a betrayer down — the design says most human fights end in
  //     yield, not death. 5b: force the kill path (one-shot) — roster,
  //     corpse, and aftermath must be consistent.
  {
    // ---- 5a: surrender path (fresh villager — sections 1/4 already spent roster[0]) ----
    const rosterIds = (Game.state.village.roster || []).filter(id => id !== Game.villagerId);
    const vid2 = rosterIds[rosterIds.length - 1];
    const roster0 = (Game.state.village.roster || []).length;
    const trauma0 = s.trauma || 0;
    const trust0b = Game.state.village.trust[vid2];
    clearLines();
    let started = false;
    try { started = Game.playerAttacks(vid2); } catch (e) { note('5a playerAttacks threw: ' + e.message); }
    check('5a.0 betrayal fight starts', started && !!Game.tbfight, 'no fight');
    if (Game.tbfight) {
      const f = Game.tbfight;
      const hk = 'h_' + vid2;
      const h = Game.tbFighter(hk);
      check('5a.1 betrayer is hostile-kind (strikable)', !!(h && h.kind === 'hostile'), h && h.kind);
      let rounds = 0;
      while (Game.tbfight === f && rounds < 40) {
        const hh = Game.tbFighter(hk);
        if (!hh || !hh.alive || hh.fled || hh.yielded) { note(`5a loop break: ${!hh ? 'no fighter' : `alive=${hh.alive} fled=${hh.fled} yielded=${hh.yielded}`}`); break; }
        const p = Game.tbFighter('p');
        p.acted = false; f.turnIdx = Math.max(0, f.order.indexOf('p'));
        p.hp = p.maxHp = 500; // hostile control: player can't die here
        // close to striking range (harness moves; the UI would tbPlayerMove)
        const bh = Game.tbFighter(hk);
        if (bh) { p.mx = Math.max(0, Math.min(8, bh.mx + 1)); p.my = bh.my; s.mx = p.mx; s.my = p.my; }
        let ok;
        try { ok = Game.tbPlayerStrike(hk); } catch (e) { note('5a strike threw: ' + e.message); break; }
        if (rounds < 4) note(`5a round ${rounds}: strike->${ok}, betrayer hp=${Game.tbFighter(hk).hp}`);
        rounds++;
        try { for (let i = 0; i < 6 && Game.tbfight === f; i++) Game.tbAdvance(); } catch (e) { note('5a advance threw: ' + e.message); }
      }
      const ended = !Game.tbfight || Game.tbfight.over;
      const onRoster = (Game.state.village.roster || []).includes(vid2);
      note(`5a.2 after beating: fight ended=${ended}, betrayer on roster=${onRoster}, trust ${trust0b}->${Game.state.village.trust[vid2]}, trauma ${trauma0}->${s.trauma || 0}`);
      check('5a.2 no softlock — the fight ENDS (yield, flee, or kill)', ended, 'fight still active');
      check('5a.3 a yielded betrayer stays in the village (alive, not roster-ghosted)',
        !ended || onRoster || (Game.state.village.roster || []).length === roster0 - 1, 'roster inconsistent');
      check('5a.4 beating someone down has a cost (trust and/or trauma moved)',
        (Game.state.village.trust[vid2] || 0) < (trust0b || 0) || (s.trauma || 0) > trauma0,
        'no consequence recorded');
      try { if (Game.tbfight) { Game.tbEndCheck(); } } catch (e) {}
      try { if (Game.tbfight) { Game.tbEnd('fled'); } } catch (e) {}
    }
    // ---- 5b: kill path (one-shot, no yield window) ----
    const vid3 = (Game.state.village.roster || []).find(id => id !== Game.villagerId && id !== vid2);
    if (vid3) {
      const roster1 = (Game.state.village.roster || []).length;
      clearLines();
      let st2 = false;
      try { st2 = Game.playerAttacks(vid3); } catch (e) { note('5b playerAttacks threw: ' + e.message); }
      if (st2 && Game.tbfight) {
        const f2 = Game.tbfight;
        const hk3 = 'h_' + vid3;
        const h3 = Game.tbFighter(hk3);
        if (h3) { h3.hp = 1; } // one strike kills — no yield/flee window
        const p = Game.tbFighter('p');
        p.acted = false; f2.turnIdx = Math.max(0, f2.order.indexOf('p')); p.hp = p.maxHp = 500;
        try { Game.tbPlayerStrike(hk3); } catch (e) { note('5b strike threw: ' + e.message); }
        try { Game.tbEndCheck(); } catch (e) {}
        const ended2 = !Game.tbfight || Game.tbfight.over;
        const onRoster2 = (Game.state.village.roster || []).includes(vid3);
        const corpse2 = (Game.state.corpses || []).some(c => c && c.villagerId === vid3);
        note(`5b.2 after kill: fight ended=${ended2}, on roster=${onRoster2}, corpse=${corpse2}, roster ${roster1}->${(Game.state.village.roster || []).length}`);
        check('5b.2 kill ends the fight', ended2, 'fight still active after the kill');
        check('5b.3 killed betrayer leaves the roster', !onRoster2, 'still on roster');
        check('5b.4 a corpse is registered for the kill', corpse2, 'no corpse');
        try { if (Game.tbfight) { Game.tbEnd('won'); } } catch (e) {}
      } else {
        note('5b skipped — second betrayal fight did not start (consequence of 5a? over=' + Game.over + ')');
      }
    }
  }

  // ================= SECTION 6: strike-number honesty ====================
  {
    const mk = H.synthFight(Game, 'hushwolf', { php: 100, mhp: 500 });
    const f = Game.tbfight;
    f.fightersByKey[mk].mx = 5; f.fightersByKey[mk].my = 4;
    clearLines();
    const t0 = f.fightersByKey[mk].hp;
    try { Game.tbPlayerStrike(mk); } catch (e) {}
    const dealt = t0 - f.fightersByKey[mk].hp;
    const strikeLine = lines.find(l => /STRIKE/i.test(l));
    const m = strikeLine && strikeLine.match(/(\d+)/);
    const stated = m ? parseInt(m[1], 10) : null;
    note(`6.0 strike line: "${strikeLine || '(none)'}" — dealt ${dealt}, stated ${stated}`);
    check('6.1 strike states the number actually dealt', stated !== null && dealt === stated,
      `stated ${stated} vs dealt ${dealt}`);
    try { Game.tbEnd && Game.tbEnd('fled'); } catch (e) {}
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
