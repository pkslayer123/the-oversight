#!/usr/bin/env node
// HOSTILE PLAYTEST (detective archetype, 2026-10-08): play as an attacker, not a tourist.
// Targets: the lie/justice/moot machinery — false accusations without cost,
// evidence forgery, bribery exploits, confrontation softlocks, label honesty.
// Run: SEED=N node scripts/attack-detective-20261008.js
const H = require('./harness-detective.js');
const verdicts = [];
const attack = (name, broke, detail) => { verdicts.push([name, broke]); console.log(`[${broke ? 'BREAK' : 'HELD '} ] ${name}${detail ? ' — ' + detail : ''}`); };
const keepAlive = s => { s.kcal = 2400; s.hydration = 100; if (s.health < 200) s.health = 500; };

(async () => {
  await H.Game.init();
  console.log('== SEED ' + H.SEED + ' ==');
  const G = H.Game;

  // ---- ATTACK 1: the accused buys the moot with the village's own food ----
  // Hostile: commit a witnessed theft, stand accused, bribe every voter using
  // an EMPTY pack (pantry funds it), check acquittal + whether anything punishes it.
  {
    const s = H.fresh(); keepAlive(s);
    const victim = G.npcIds().find(id => id !== s.id && G.state.village.roster.includes(id));
    G.recordCrime('theft', { victim, witnessed: true });
    const c = G.openPlayerCase(victim, 'theft', [{ type: 'theft', victim, witnessed: true }], false);
    H.say();
    // fill pantry, empty pack: the bribe money comes from the village
    G.state.village.pantryKcal = 200000;
    s.inventory = [];
    const packBefore = G.playerPackKcal();
    let bribed = 0, traces = 0;
    for (const vid of G.npcIds()) {
      if (c.accused.includes(vid)) continue;
      if (!G.caseBribable(c, vid)) continue;
      if (!G.canAffordBribe(c, vid)) continue;
      const price = G.caseBribePrice(c, vid);
      const ok = G.bribeVoter(c.id, vid, G.villagerId, price);
      if (ok) { G.payBribe(c, vid, price); bribed++; }
      H.say();
    }
    const tracesSeen = (G.getDoubts ? 0 : 0);
    const pantryAfter = G.state.village.pantryKcal;
    const spent = 200000 - pantryAfter;
    // now run the trial deterministically-ish: tally via conductTrial
    let acquitted = 0, trials = 0;
    for (let i = 0; i < 12; i++) {
      const c2 = G.openPlayerCase(victim, 'theft', [{ type: 'theft', victim, witnessed: true }], false);
      for (const vid of G.npcIds()) {
        if (c2.accused.includes(vid) || !G.caseBribable(c2, vid)) continue;
        const price = G.caseBribePrice(c2, vid);
        G.state.village.pantryKcal = 200000;
        if (G.bribeVoter(c2.id, vid, G.villagerId, price)) G.payBribe(c2, vid, price);
      }
      H.say();
      try {
        const t = G.tallyVotes(c2, false); // calm day
        const need = Math.floor((t.present.length + (t.playerVoter ? 1 : 0)) / 2) + 1;
        if (t.guilty < need) acquitted++;
        trials++;
      } catch (e) { attack('A1-trial-crash', true, e.message); }
      c2.status = 'resolved';
    }
    attack('A1 accused-buys-moot-with-pantry', bribed > 0 && spent > 0 && acquitted >= 10,
      `packBefore=${packBefore} pantrySpent=${spent} votersBribed=${bribed} acquitted=${acquitted}/${trials} (calm days)`);
  }

  // ---- ATTACK 2: double-bribe the same voter (UI gate only in convoChoices?) ----
  {
    const s = H.fresh(); keepAlive(s);
    const victim = G.npcIds().find(id => id !== s.id && G.state.village.roster.includes(id));
    G.recordCrime('theft', { victim, witnessed: true });
    const c = G.openPlayerCase(victim, 'theft', [{ type: 'theft', victim, witnessed: true }], false);
    H.say();
    const vid = G.npcIds().find(id => !c.accused.includes(id) && G.caseBribable(c, id));
    G.state.village.pantryKcal = 200000;
    const price = G.caseBribePrice(c, vid);
    const r1 = G.bribeVoter(c.id, vid, G.villagerId, price);
    const r2 = G.bribeVoter(c.id, vid, G.villagerId, price); // direct re-call: no idempotency in engine
    const n = (c.bribes || []).filter(b => b.voter === vid && b.by === G.villagerId).length;
    attack('A2 double-bribe-same-voter', n > 1, `first=${!!r1} second=${!!r2} entries=${n}`);
  }

  // ---- ATTACK 3: kill the confronter mid-confrontation — ladder softlock? ----
  {
    const s = H.fresh(); keepAlive(s);
    const victim = G.npcIds().find(id => id !== s.id);
    G.recordCrime('theft', { victim, witnessed: true });
    // walk the ladder: 4 day-parts per day; heat 15 (theft) -> need more heat; add attack
    G.recordCrime('attack', { victim, witnessed: true });
    G.recordCrime('attack', { victim, witnessed: true });
    let confront = null;
    for (let i = 0; i < 30 && !confront; i++) {
      G.advancePart(); H.say();
      const j = G.justiceState();
      if (j.stage >= 2 && j.confrontedBy) confront = j.confrontedBy;
    }
    if (!confront) { attack('A3 dead-confronter-softlock', false, 'no confrontation reached in 30 parts'); }
    else {
      // murder the confronter unseen
      const v = G.state.village;
      v.roster = v.roster.filter(id => id !== confront);
      try { G.recordCrime('murder', { victim: confront, witnessed: false }); } catch (e) {}
      const j0 = G.justiceState();
      let stageAfter = null, crashed = null;
      for (let i = 0; i < 40; i++) {
        try { G.advancePart(); H.say(); } catch (e) { crashed = e.message; break; }
        keepAlive(G.state.scholar);
      }
      const j = G.justiceState();
      stageAfter = j.stage;
      const mootDemanded = j.mootDemanded;
      const openCases = (G.betrayalState().cases || []).filter(x => (x.status === 'open' || x.status === 'dormant') && x.accused.includes(G.villagerId)).length;
      attack('A3 dead-confronter-softlock', !!crashed || (stageAfter === 2 && j0.pendingConfront),
        `crashed=${crashed || 'no'} stage=${j0.stage}->${stageAfter} mootDemanded=${mootDemanded} openPlayerCases=${openCases} pendingConfront=${!!j.pendingConfront}`);
    }
  }

  // ---- ATTACK 4: verdict with a near-empty roster (crash/softlock?) ----
  {
    const s = H.fresh(); keepAlive(s);
    const v = G.state.village;
    const keep = v.roster.slice(0, 3);
    v.roster = keep;
    const victim = keep.find(id => id !== G.villagerId);
    G.recordCrime('theft', { victim, witnessed: true });
    const c = G.openPlayerCase(victim, 'theft', [{ type: 'theft', victim, witnessed: true }], false);
    H.say();
    let crashed = null, convicted = null;
    try { const t = G.tallyVotes(c, false); H.say(); convicted = t.guilty; } catch (e) { crashed = e.message; }
    attack('A4 tiny-roster-trial', !!crashed, `crashed=${crashed || 'no'} guiltyVotes=${convicted}`);
  }

  // ---- ATTACK 5: fabricated accusation — press the accuser twice, belief pump? ----
  {
    const s = H.fresh(); keepAlive(s);
    const accuser = G.npcIds().find(id => id !== s.id);
    const c = G.openPlayerCase(accuser, 'theft', [], true); // fabricated
    H.say();
    const b0 = JSON.stringify(c.belief);
    const r1 = G.defendPressAccuser(c.id);
    const r2 = G.defendPressAccuser(c.id); // should be one-shot
    const delta = Object.keys(c.belief).reduce((sum, k) => sum + (c.belief[k] || 0), 0);
    attack('A5 fabricated-press-repeat', r2 !== null, `first=${!!r1} secondRepeat=${r2 !== null} beliefTotalAfter=${delta}`);
  }

  // ---- ATTACK 6: honesty — bribe label says "Secret"/"Expensive" but pays from pantry ----
  {
    const s = H.fresh(); keepAlive(s);
    const victim = G.npcIds().find(id => id !== s.id);
    G.recordCrime('theft', { victim, witnessed: true });
    const c = G.openPlayerCase(victim, 'theft', [{ type: 'theft', victim, witnessed: true }], false);
    H.say();
    G.state.village.pantryKcal = 50000;
    s.inventory = []; // empty pack: payBribe MUST hit the pantry
    const vid = G.npcIds().find(id => !c.accused.includes(id) && G.caseBribable(c, id) && G.canAffordBribe(c, id));
    const price = G.caseBribePrice(c, vid);
    const packKcal = G.playerPackKcal();
    G.bribeVoter(c.id, vid, G.villagerId, price);
    G.payBribe(c, vid, price);
    const pantryHit = 50000 - G.state.village.pantryKcal;
    // find the bribe option label in convoChoices
    let label = null;
    try {
      const choices = G.convoChoices(vid) || [];
      const b = choices.find(x => String(x.id).startsWith('betrayal:bribe:'));
      if (b) label = b.label;
    } catch (e) { label = 'ERR ' + e.message; }
    attack('A6 bribe-label-vs-pantry', pantryHit > 0 && packKcal === 0 && !/pantry/i.test(label || ''),
      `pack=${packKcal} pantryHit=${pantryHit} label="${label}"`);
  }

  // ---- ATTACK 7: bribe the ACCUSED voter directly (engine gate present?) ----
  {
    const s = H.fresh(); keepAlive(s);
    const victim = G.npcIds().find(id => id !== s.id);
    G.recordCrime('theft', { victim, witnessed: true });
    const c = G.openPlayerCase(victim, 'theft', [{ type: 'theft', victim, witnessed: true }], false);
    H.say();
    G.state.village.pantryKcal = 50000;
    const accusedId = c.accused[0];
    const r = G.bribeVoter(c.id, accusedId, G.villagerId, 800);
    attack('A7 bribe-accused-voter', r !== null, `engineAccepted=${!!r}`);
  }

  // ---- ATTACK 8: NPC bribery against accused player gets exposed loop? investigate finds own bribes? ----
  {
    const s = H.fresh(); keepAlive(s);
    const accuser = G.npcIds().find(id => id !== s.id);
    const c = G.openPlayerCase(accuser, 'theft', [], true);
    H.say();
    // player bribes, then investigates: does investigateBribery "find" the player's own bribe (self-incrimination)?
    G.state.village.pantryKcal = 50000;
    const vid = G.npcIds().find(id => !c.accused.includes(id) && G.caseBribable(c, id));
    G.bribeVoter(c.id, vid, G.villagerId, G.caseBribePrice(c, vid));
    H.say();
    const found = G.investigateBribery(c.id) || [];
    const selfFound = found.some(b => b.by === G.villagerId);
    attack('A8 investigate-finds-own-bribe', selfFound, `found=${found.length} selfAmongThem=${selfFound}`);
  }

  // ---- ATTACK 9: mootIn countdown while player exiled — trial on an exile? ----
  {
    const s = H.fresh(); keepAlive(s);
    const accuser = G.npcIds().find(id => id !== s.id);
    const c = G.openPlayerCase(accuser, 'theft', [], true);
    H.say();
    try { G.fleeBeforeVerdict(c.id); } catch (e) {}
    H.say();
    attack('A9 flee-exile-then-moot', c.status === 'resolved' && G.justiceExiled(), `status=${c.status} exiled=${G.justiceExiled()}`);
  }

  // ---- ATTACK 10: honesty — pay-restitution label names the cost; does engine take exactly that? ----
  {
    const s = H.fresh(); keepAlive(s);
    const victim = G.npcIds().find(id => id !== s.id);
    G.recordCrime('theft', { victim, witnessed: true });
    G.recordCrime('attack', { victim, witnessed: true });
    // reach confrontation
    let tries = 0;
    while (tries++ < 40) { G.advancePart(); H.say(); const j = G.justiceState(); if (j.stage >= 2 && j.pendingConfront) break; }
    const j = G.justiceState();
    const owed = G.justiceRestitutionOwed();
    // load the pack with exact owed kcal
    s.inventory = [{ name: 'meat', kcalEach: 100, units: Math.ceil(owed / 100) + 5, kg: 0.1 }];
    const pack0 = G.playerPackKcal();
    const r = G.justiceRespond('pay');
    const pack1 = G.playerPackKcal();
    const taken = pack0 - pack1;
    attack('A10 restitution-takes-what-it-says', r && r.enough && Math.abs(taken - r.paid) < 1 && taken >= owed * 0.5,
      `owed=${owed} paid=${r && r.paid} packTaken=${taken} enough=${r && r.enough}`);
  }

  const n = verdicts.filter(v => v[1]).length;
  console.log(`\n== ${n} BREAKS / ${verdicts.length} attacks ==`);
  process.exit(0);
})();
