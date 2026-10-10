#!/usr/bin/env node
// Break-it combat round 7 (2026-10-09): hostile pass, fresh ground only.
// Rounds 1-6 vectors are NOT re-attacked; their suites re-ran green separately.
// BEFORE=1 detection: every numbered check FAILS on pre-fix code (verified via stash).
// Seed: fixed default 20261009, SEED env override. Green required x>=3 seeds.
const H = require('./combat-r3-harness.js');
const fs = require('fs');
const path = require('path');
const SEED = process.env.SEED || '20261009';
let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS', name); }
  else { fail++; console.log('  FAIL', name, extra || ''); }
}
function quiet(Game) {
  Game.say = () => {}; Game.audioEvent = () => {}; Game.drama = () => {};
  Game.sysSay = () => {}; Game.combatWitnessReact = () => {};
}
// In-memory localStorage so save()/load() round-trip in node.
function stubStorage() {
  const store = {};
  global.localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    key: (i) => Object.keys(store)[i],
    get length() { return Object.keys(store).length; },
  };
}
function grant(Game, id) {
  const s = Game.state.scholar;
  s.abilities = s.abilities || [];
  if (!s.abilities.find(a => ((a && a.id) || a) === id)) s.abilities.push({ id });
}
// Build a real betrayal fight via the production path.
function synthBetrayal(Game, vid) {
  const s = Game.state.scholar;
  s.mx = 4; s.my = 4;
  return Game.startBetrayalCombat(vid, { aggressor: 'player' });
}

(async () => {
  console.log('break-combat7 seed=' + SEED);

  // T1. SAVE/LOAD MID-BETRAYAL-FIGHT: the hostile was dropped as a "phantom
  // fighter" (no mdef to reattach) and the betrayal flag was never persisted,
  // so the reload resolved a person-fight as tbEnd('won') — free win, no
  // aftermath. Autosave fires every 30s mid-combat: this hit real players.
  {
    stubStorage();
    const Game = await H.newCombatReadyGame();
    quiet(Game);
    const vid = (Game.state.village.roster || [])[0];
    synthBetrayal(Game, vid);
    const hk = 'h_' + vid;
    const h = Game.tbFighter(hk);
    h.hp = 5; // wounded — the r6 wound truth must survive the reload too
    ok('T1a betrayal fight live', !!(Game.tbfight && Game.tbfight.betrayal), 'betrayal=' + (Game.tbfight && Game.tbfight.betrayal));
    const sr = Game.save();
    ok('T1b save ok', sr === true, 'save=' + sr);
    const key = Game.listSaves()[0].key;
    // Simulate the reload: fresh state, fight rebuilt from the snapshot.
    const lr = Game.load(key);
    ok('T1c load ok', lr === true, 'load=' + lr);
    const f = Game.tbfight;
    ok('T1d fight restored', !!(f && !f.over), 'tbfight=' + !!f);
    ok('T1e betrayal flag survives reload', !!(f && f.betrayal === true), 'f.betrayal=' + (f && f.betrayal));
    const h2 = f && Game.tbFighter(hk);
    ok('T1f hostile NOT dropped as phantom', !!(h2 && h2.kind === 'hostile'), 'hostile=' + !!h2);
    ok('T1g hostile HP preserved (5)', !!(h2 && h2.hp === 5), 'hp=' + (h2 && h2.hp));
    ok('T1h aftermath context rebuilt', !!(Game._lastBetrayal && Game._lastBetrayal.betrayer === vid),
      JSON.stringify(Game._lastBetrayal && { b: Game._lastBetrayal.betrayer }));
    // The fight must still resolve as a BETRAYAL fight: killing the betrayer
    // now must route to betrayal_won (with aftermath), never a monster 'won'.
    const said = [];
    Game.say = (x) => said.push(String(x));
    Game.tbDamage(hk, 9999, 'you');
    Game.tbEndCheck();
    ok('T1i kill resolves betrayal_won, not monster won',
      said.some(x => /It's done/.test(x)) && !said.some(x => x.includes('WINNER!')),
      JSON.stringify(said.slice(-4)));
    delete global.localStorage;
  }

  // T2. WAR CRY HONESTY: "All enemies must pass a courage check" — the old
  // filter skipped kind 'hostile', so in a betrayal fight the bellow hit
  // nobody and ate the turn.
  {
    const Game = await H.newCombatReadyGame();
    quiet(Game);
    grant(Game, 'war_cry');
    const vid = (Game.state.village.roster || [])[0];
    synthBetrayal(Game, vid);
    const hk = 'h_' + vid;
    Game.state.scholar.kcal = 5000;
    const realRandom = Math.random;
    Math.random = () => 0.0; // courage check always fails
    try {
      Game.useAbility('war_cry', 'bellow');
      const h = Game.tbFighter(hk);
      ok('T2a hostile affected by war cry (stunned)', (h.stunned || 0) > 0, 'stunned=' + h.stunned);
    } finally { Math.random = realRandom; }
  }

  // T3. READ THE FIGHT copy: combat-only action (r6) — "before it starts" was a lie.
  {
    const abs = JSON.parse(fs.readFileSync(path.join(H.ROOT, 'src/data/abilities.json'), 'utf8'));
    const ab = abs.find(a => a.id === 'brawler_instinct');
    const act = ab.actions.find(a => a.id === 'read_fight');
    ok('T3a effect no longer claims "before it starts"', !/before it starts/i.test(act.effect), act.effect);
    ok('T3b description no longer claims "before it starts"', !/before it starts/i.test(ab.description), ab.description);
  }

  // T4. MENACE copy: "+intimidation in this conversation, -trust afterward"
  // — neither was wired anywhere (no convo read, no trust hit). Copy must not
  // promise what the engine doesn't do.
  {
    const Game = await H.newCombatReadyGame();
    const said = [];
    Game.say = (x) => said.push(String(x));
    Game.audioEvent = () => {}; Game.drama = () => {};
    grant(Game, 'fear_aura');
    Game.state.scholar.kcal = 5000;
    const abs = JSON.parse(fs.readFileSync(path.join(H.ROOT, 'src/data/abilities.json'), 'utf8'));
    const act = abs.find(a => a.id === 'fear_aura').actions.find(a => a.id === 'menace');
    ok('T4a effect drops the +intimidation promise', !/\+intimidation/i.test(act.effect), act.effect);
    ok('T4b effect drops the -trust promise', !/-trust/i.test(act.effect), act.effect);
    const v0 = JSON.stringify(Game.state.village.trust || {});
    Game.useAbility('fear_aura', 'menace');
    ok('T4c impl says no -trust line', !said.some(x => /-trust/i.test(x)), JSON.stringify(said));
    ok('T4d no phantom trust change', v0 === JSON.stringify(Game.state.village.trust || {}));
  }

  // T5. REFUSE DEATH kcal: engine does Math.max(kcal, 500) — a top-up, not +500.
  {
    const Game = await H.newCombatReadyGame();
    quiet(Game);
    const s = Game.state.scholar;
    if (!Game.hasAbility('second_wind')) { s.abilities = s.abilities || []; s.abilities.push({ id: 'second_wind' }); }
    s.kcal = 3000; s.health = 0;
    Game.maybeCheatDeath();
    ok('T5a high kcal NOT topped up (+500 would be a lie)', s.kcal === 3000, 'kcal=' + s.kcal);
    ok('T5b survived at 1 HP', s.health === 1, 'health=' + s.health);
    const abs = JSON.parse(fs.readFileSync(path.join(H.ROOT, 'src/data/abilities.json'), 'utf8'));
    const act = abs.find(a => a.id === 'second_wind').actions.find(a => a.id === 'refuse_death');
    ok('T5c copy no longer says "gain 500 kcal"', !/gain 500 kcal/i.test(act.effect), act.effect);
  }

  // T6. VILLAGER HELP honesty: "+12 HP" was stated even when the cap absorbed most of it.
  {
    const Game = await H.newCombatReadyGame();
    const said = [];
    Game.say = (x) => said.push(String(x));
    Game.audioEvent = () => {}; Game.drama = () => {}; Game.sysSay = () => {};
    const vid = (Game.state.village.roster || [])[0];
    const ally = (Game.state.village.roster || [])[1];
    // A loyal party member must be IN the fight to take the help turn.
    const ps = Game.partyState();
    ps.party = ps.party || [];
    if (!ps.party.includes(ally)) ps.party.push(ally);
    synthBetrayal(Game, vid);
    // Force the ally's help decision: patch villagerDecide for one turn.
    const S = globalThis.Scattering;
    const origDecide = S.combat.villagerDecide;
    S.combat.villagerDecide = () => ({ moves: [], action: { type: 'help', target: 'p' } });
    try {
      const p = Game.tbFighter('p');
      p.hp = p.maxHp - 3; // nearly full: only 3 can land
      Game.tbVillagerTurn(Game.tbFighter('v_' + ally));
      const line = said.find(x => x.includes('patches you up'));
      ok('T6a help states actual healed (+3, not +12)', !!line && line.includes('+3 HP'), line || JSON.stringify(said));
    } finally { S.combat.villagerDecide = origDecide; }
  }

  // T7. tbEnd RESULT-STRING CENSUS: every string ever passed to tbEnd must be
  // handled (won/lost/fled/routed + betrayal trio) or end cleanly (calmed).
  {
    const files = ['game.js', 'party.js', 'encounters.js', 'abilityActions.js', 'app.js', 'debug-scenarios.js'];
    const found = new Set();
    for (const fn of files) {
      const src = fs.readFileSync(path.join(H.ROOT, 'src/js', fn), 'utf8');
      const re = /tbEnd\(\s*(?:this\.tbEnd\()?['"]([a-z_]+)['"]/g;
      let m;
      while ((m = re.exec(src))) found.add(m[1]);
      // ternary form: tbEnd(cond ? 'a' : 'b')
      const re2 = /tbEnd\([^)]*\?\s*'([a-z_]+)'\s*:\s*'([a-z_]+)'/g;
      while ((m = re2.exec(src))) { found.add(m[1]); found.add(m[2]); }
    }
    const handled = new Set(['won', 'lost', 'fled', 'routed', 'calmed', 'betrayal_won', 'betrayal_routed', 'betrayal_yielded']);
    const unhandled = [...found].filter(x => !handled.has(x));
    ok('T7a all tbEnd strings handled-or-clean', unhandled.length === 0,
      'found=[' + [...found].sort().join(',') + '] unhandled=[' + unhandled.join(',') + ']');
  }

  // T8. WIRED ACTIONS resolve honestly (break-it abilities 2026-10-10): the
  // four actions this block used to assert as UNWIRED are now wired. They
  // fire (or refuse pre-payment with an honest line) — the "isn't wired up
  // yet" message is reserved for genuinely unwired actions, covered below.
  {
    const Game = await H.newCombatReadyGame();
    const said = [];
    Game.say = (x) => said.push(String(x));
    Game.audioEvent = () => {}; Game.drama = () => {}; Game.sysSay = () => {};
    H.synthFight(Game, 'ducks_in_a_row');
    grant(Game, 'scream_cheese'); grant(Game, 'pocket_sand');
    grant(Game, 'leech'); grant(Game, 'peacemaker');
    const s = Game.state.scholar;
    s.kcal = 5000;
    const p = Game.tbFighter('p');
    const m = Game.tbFighter('m_test');
    // scream: fires, stuns, spends the turn exactly once
    let r = Game.useAbility('scream_cheese', 'scream');
    ok('T8a scream_cheese.scream fires and stuns', r === true && m.stunned > 0, 'ret=' + r);
    ok('T8b scream spends the turn once', p.acted === true, 'acted=' + p.acted);
    ok('T8c scream charges the copy\'s 20 kcal', s.kcal === 4980, 'kcal=' + s.kcal);
    // pocket sand: fresh turn, fires, blinds 2 rounds
    p.acted = false;
    r = Game.useAbility('pocket_sand', 'throw_sand');
    ok('T8d pocket_sand.throw_sand fires and blinds', r === true && m.blind === 2, 'ret=' + r + ' blind=' + m.blind);
    // leech stance: no allies in this fight — honest pre-payment refusal,
    // turn kept, and NOT the wiring message
    p.acted = false;
    r = Game.useAbility('leech', 'leech_stance');
    ok('T8e leech.leech_stance refuses with no one to shield', r === false && p.acted === false, 'ret=' + r);
    ok('T8f leech refusal is honest, not the wiring message',
      said.some(x => x.includes('No one here to shield')) && !said.some(x => x.includes("isn't wired up yet")),
      JSON.stringify(said.slice(-2)));
    // walk_in: fires — they stand down or you're exposed
    p.acted = false;
    r = Game.useAbility('peacemaker', 'walk_in');
    ok('T8g peacemaker.walk_in resolves', r === true && (m.fled === true || p.exposedTurns > 0),
      'ret=' + r + ' fled=' + m.fled + ' exposed=' + p.exposedTurns);
    // the wiring guard itself still fires for genuinely unwired actions
    Game.data.abilities.push({ id: 'fake_unwired_test', name: 'Fake', actions: [{ id: 'doom', context: 'explore', name: 'Doom', cost: {}, effect: 'x' }] });
    s.abilities.push({ id: 'fake_unwired_test' });
    const r2 = Game.useAbility('fake_unwired_test', 'doom');
    ok('T8h wiring guard still fires for genuinely unwired actions',
      r2 === false && said.some(x => x.includes("isn't wired up yet")), 'ret=' + r2);
    Game.data.abilities.pop();
    s.abilities = s.abilities.filter(a => ((a && a.id) || a) !== 'fake_unwired_test');
  }

  // T9. BETRAYAL WOUND STASH (r6 F5) still holds: flee at 5 HP, re-engage at 5.
  {
    const Game = await H.newCombatReadyGame();
    quiet(Game);
    const vid = (Game.state.village.roster || [])[0];
    synthBetrayal(Game, vid);
    const hk = 'h_' + vid;
    Game.tbFighter(hk).hp = 5;
    // Flee via the barrier path the engine uses.
    Game.tbFighter('p').fled = true;
    Game.tbEndCheck();
    ok('T9a fight ended', !Game.tbfight, 'tbfight=' + !!Game.tbfight);
    const stashed = ((Game.state.village || {}).betrayalWounds || {})[vid];
    ok('T9b wound stashed (5)', stashed === 5, 'stashed=' + stashed);
    synthBetrayal(Game, vid);
    ok('T9c re-engage restores 5 HP, not flat 40', Game.tbFighter(hk).hp === 5, 'hp=' + Game.tbFighter(hk).hp);
  }

  console.log(`\nbreak-combat7: ${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
