#!/usr/bin/env node
// HUNTER PATH RE-VERIFY at HEAD (Steve 2026-10-07): re-check every finding from
// the 2026-10-07 hunter play-audit against PRISTINE HEAD after sibling fixes
// (bc7b599, 60a9eec/b15ec93, 10db816 "Hunter loop").
//
// Verdicts are PROVEN in-harness, not asserted:
//   FIXED       - the old broken behavior no longer reproduces; the wired
//                 behavior is demonstrated.
//   STILL BROKEN- the old broken behavior still reproduces (asserted so that
//                 a future change flips the test and we notice either way).
//   PARTIAL     - part of the finding is fixed, part remains.
//
// ENGINE READ-ONLY. Loads pristine HEAD from /tmp/hunter-reverify
// (`git archive HEAD src index.html`). New files only.
//
// Run: node scripts/test-hunter-reverify-20261007.js   (SEED env override)
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ROOT = process.env.HUNTER_ROOT || '/tmp/hunter-reverify';
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const SEED = parseInt(process.env.SEED || '7', 10);
Math.random = mulberry32(SEED);
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
const order = execSync("grep -o 'src/js/[^\"'']*\\.js' index.html | head -60", { cwd: ROOT }).toString().split('\n').filter(s => s && !/app\.js|sprites\.js|tile-scenes\.js|move-anim\.js/.test(s));
global.window = global;
global.document = {
  getElementById: () => null,
  createElement: () => ({ textContent: '', innerHTML: '', style: {}, setAttribute() {}, appendChild() {} }),
  head: { appendChild() {} }, body: {},
};
order.forEach(f => { try { eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); } catch (e) { console.log('LOAD FAIL ' + f + ': ' + e.message); process.exit(2); } });
delete global.window; delete global.document;
const Game = globalThis.Scattering.Game;

const says = [];
const osay = Game.say.bind(Game);
Game.say = (t) => { says.push(String(t)); return osay(t); };
const warns = [];
const owarn = console.warn.bind(console);
console.warn = (...a) => { warns.push(a.join(' ')); return owarn(...a); };
function note(t) { console.log(t); }
function clearSays() { says.splice(0); }
let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; note(`  ok   ${name}`); }
  else { fail++; note(`  FAIL ${name}${detail ? ' -- ' + detail : ''}`); }
}
function grant(id, level) {
  const s = Game.state.scholar;
  s.abilities = s.abilities || [];
  let e = s.abilities.find(a => a.id === id);
  if (!e) { e = { id, name: id, desc: '', level: level || 1, xp: 0 }; s.abilities.push(e); }
  else e.level = level || e.level || 1;
  return e;
}
function setDay(d, p) { Game.state.village.day = d; Game.state.scholar.day = d; Game.dayPart = p || 0; }
function endTurn() {
  if (!Game.tbfight || Game.tbfight.over) return;
  if (!Game.tbIsPlayerTurn()) return;
  const pl = Game.tbFighter('p'); if (pl) { pl.moveLeft = 0; pl.acted = true; }
  Game.tbAfterPlayerAction();
}
function awaitPlayerTurn(max = 12) {
  let n = 0;
  while (Game.inCombat() && !Game.tbfight.over && !Game.tbIsPlayerTurn() && n < max) { Game.tbAfterPlayerAction(); n++; }
}

(async () => {
  await Game.init();
  note(`seed=${SEED} ROOT=${ROOT} (pristine HEAD)`);
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  const s = Game.state.scholar;
  try { Game.location = 'haven'; } catch (e) {}
  s.health = 100; s.kcal = 3000; s.hydration = 80; s.energy = 100;
  s.trauma = 0; s.mx = 4; s.my = 4;
  Game.state.weather = 'clear';
  s.inventory = (s.inventory || []).concat([{ itemId: 'knife', name: 'Knife', units: 1, kg: 0.4 }]);
  clearSays();

  const KIT = ['stalk', 'blood_trail', 'ambush', 'animal_ken', 'game_sense', 'patient_aim', 'field_dressing', 'tracker', 'dead_aim'];
  KIT.forEach(id => grant(id, 2));

  // ============ A. FINDING 1: synergy discovery_method + requires_any wiring ============
  note('\n=== A. FINDING 1: 3 synergies discoverable? (was: undiscoverable, 2 defects) ===');
  const syns = Game.data.synergies;
  const byId = id => syns.find(x => x.id === id);
  for (const id of ['clean_kill', 'blood_tracker', 'apex_predator']) {
    const dm = (byId(id) || {}).discovery_method;
    check(`${id} has discovery_method`, !!(dm && dm.type), JSON.stringify(dm || null).slice(0, 60));
  }
  function attemptPath(synId, legs) {
    for (let d = 0; d < 3; d++) {
      setDay(20 + d, 1);
      for (const leg of legs) Game.noteAbilityUse(leg, {});
    }
    return {
      attempts: (Game.state.scholar.synergyAttempts || {})[synId] || 0,
      unlocked: (Game.state.scholar.synergies || []).includes(synId),
    };
  }
  const r1 = attemptPath('clean_kill', ['patient_aim', 'game_sense']);
  note(`   clean_kill via [patient_aim + game_sense] x3: attempts=${r1.attempts} unlocked=${r1.unlocked}`);
  check('FIXED: clean_kill attempt-counter increments (requires_any consulted)', r1.attempts > 0, `attempts=${r1.attempts}`);
  check('FIXED: clean_kill UNLOCKS after 3 combined uses', r1.unlocked === true);
  const r2 = attemptPath('blood_tracker', ['blood_trail', 'tracker']);
  note(`   blood_tracker via [blood_trail + tracker] x3: attempts=${r2.attempts} unlocked=${r2.unlocked}`);
  check('FIXED: blood_tracker UNLOCKS after 3 combined uses', r2.unlocked === true);

  // ============ B. FINDING 2: apex_predator satisfiable? (was: synergy-id legs unsatisfiable) ====
  note('\n=== B. FINDING 2: apex_predator satisfiable? (was: impossible) ===');
  check("abilityLevel('clean_kill') is 0 (synergies still aren't abilities)", Game.abilityLevel('clean_kill') === 0);
  grant('animal_ken', 3); grant('stalk', 3); grant('ambush', 3); grant('dead_aim', 3);
  const r3 = attemptPath('apex_predator', ['animal_ken', 'stalk']);
  note(`   apex_predator via [clean_kill(discovered) + animal_ken] x3: attempts=${r3.attempts} unlocked=${r3.unlocked}`);
  check('FIXED: apex_predator UNLOCKS (discovered synergy counts as a held leg)', r3.unlocked === true);
  // Activation gating: requires_any now gates recomputeActiveSynergies too.
  Game.recomputeActiveSynergies();
  const heldLegs = (Game.state.scholar.activeSynergies || []);
  check('discovered clean_kill is ACTIVE while legs held', heldLegs.includes('clean_kill'));
  // Strip every leg: discovered-but-unheld must NOT be permanently active (the old bug).
  const legIds = ['patient_aim', 'game_sense', 'dead_aim', 'tracker', 'stalk', 'ambush'];
  const saved = s.abilities.filter(a => legIds.includes(a.id));
  s.abilities = s.abilities.filter(a => !legIds.includes(a.id));
  Game.recomputeActiveSynergies();
  const leak = (Game.state.scholar.activeSynergies || []).includes('clean_kill');
  check('FIXED: clean_kill not permanently active (requires_any gates activation)', leak === false);
  s.abilities = s.abilities.concat(saved);
  Game.recomputeActiveSynergies();

  // ============ C. FINDING 3: 13 actions execute? (was: doAction "unknown kind", silent turns) ====
  note('\n=== C. FINDING 3: 13 actions via Game.useAbility() (was: 13 silent turns) ===');
  setDay(21, 1);
  const exploreActs = [
    ['game_sense', 'read_sign'], ['patient_aim', 'clean_shot'], ['tracker', 'track'],
    ['stalk', 'stalk_prey'], ['blood_trail', 'follow_blood'], ['ambush', 'lay_wait'],
    ['animal_ken', 'read_beast'],
  ];
  // dress_game is tested separately below (it needs a carcass in the pack —
  // with no game to dress it honestly refuses, which is correct).
  for (const [ab, ac] of exploreActs) {
    clearSays();
    let r;
    try { r = Game.useAbility(ab, ac); } catch (e) { r = 'THREW:' + e.message; }
    const txt = says.join(' ');
    check(`${ab}.${ac} executes + narrates`, r === true && txt.length > 40, `${r} | ${txt.slice(0, 70)}`);
  }
  // stalk calms an active animal encounter (promise: "animals won't flee your approach")
  s.animal = { id: 'wild_turkey', mx: 5, my: 5, aware: 0.8, pstate: 'wary' };
  clearSays();
  Game.useAbility('stalk', 'stalk_prey');
  check('stalk settles active animal (aware 0.8 -> <=0.2)', (s.animal.aware || 1) <= 0.2, `aware=${s.animal.aware}`);
  check('stalk flag armed for the strike', s.stalkActive === true);
  s.animal = null;
  // lay_wait arms the flag consumed by checkAnimals on the next tile entry
  check('lay_wait armed (consumed by next animal encounter)', s.layWaitActive === true);
  // dress_game: no double-dip, names the bonus
  s.inventory = (s.inventory || []).concat([
    { foodKind: 'meat', foodState: 'carcass', hiddenKcal: 3900, name: 'deer (carcass)', plantId: 'meat_deer' },
  ]);
  clearSays();
  const k0 = s.kcal;
  Game.useAbility('field_dressing', 'dress_game');
  const gained = s.kcal - k0;
  check('dress_game converts carcass at face value (no re-multiply: net +3860)', gained === 3860, `+${gained}`);
  check('dress_game NAMES the field-dressing bonus (no-silent-actions)', /Field Dressing \u00d7/.test(says.join(' ')), says.join(' ').slice(0, 110));
  // Combat-context actions refuse honestly outside combat (design: combat verbs).
  clearSays();
  const ambRefuse = Game.useAbility('ambush', 'set_ambush');
  check('set_ambush outside combat refuses honestly (not silent)', ambRefuse === false && /combat action/i.test(says.join(' ')), says.join(' ').slice(0, 70));

  // ============ D. IN-COMBAT: the combat-context actions arm + strike consumes ====
  // Each beat gets a FRESH fight: strikes can kill the monster, and turn-
  // spending abilities (read_stance/take_aim) consume the turn, so beats are
  // isolated with a newFight() helper. (Harness hygiene, not engine behavior.)
  note('\n=== D. COMBAT ACTIONS: take_aim / dead_aim_shot / set_ambush / read_stance ===');
  setDay(22, 3); // night
  function newFight(mid) {
    try { if (Game.tbfight) Game.tbfight.over = true; } catch (e) {}
    s.health = 100; s.kcal = 3000;
    Game.startCombat(mid);
    if (!Game.inCombat()) return null;
    return Game.tbfight.fighters.find(f => f.kind === 'monster').key;
  }
  let mkey = newFight('gallowdeer');
  check('fight started vs gallowdeer', Game.inCombat());
  check('tbfight has an id (read_stance once-per-fight key)', !!(Game.tbfight && Game.tbfight.id));
  // Ambush passive FIRST: round-1 strike before any turn-spending ability.
  clearSays();
  let m = Game.tbFighter(mkey);
  const hp0 = m.hp;
  Game.tbPlayerStrike(mkey);
  const firstDmg = hp0 - Game.tbFighter(mkey).hp;
  check('ambush passive fires on round-1 strike (AMBUSH: first blood)', /AMBUSH: first blood/.test(says.join(' ')), says.join(' ').slice(0, 80));
  note(`   round-1 strike with ambush L2 passive: ${firstDmg}`);
  // read_stance (spends the turn — do it after the passive strike).
  endTurn(); awaitPlayerTurn();
  clearSays();
  Game.useAbility('game_sense', 'read_stance');
  check('read_stance FIRST use reads (not "already read")', !/already read this fight/i.test(says.join(' ')), says.join(' ').slice(0, 90));
  endTurn(); awaitPlayerTurn();
  // take_aim arms 2.5x (matches action text "2.5x damage and cannot miss")
  mkey = newFight('gallowdeer');
  clearSays();
  Game.useAbility('patient_aim', 'take_aim');
  check('take_aim arms 2.5x (matches card text)', !!(s.aimBonus && s.aimBonus.mult === 2.5), JSON.stringify(s.aimBonus));
  check('take_aim cost is grammatical ("You focus")', /You focus/.test(says.join(' ')), says.join(' ').slice(0, 60));
  endTurn(); awaitPlayerTurn();
  clearSays();
  m = Game.tbFighter(mkey);
  const hp1 = m.hp;
  Game.tbPlayerStrike(mkey);
  const aimedDmg = hp1 - Game.tbFighter(mkey).hp;
  check('aimed strike lands with TAKE AIM narration', /TAKE AIM/.test(says.join(' ')), `dmg=${aimedDmg} | ${says.join(' ').slice(0, 80)}`);
  check('aimed strike hits hard (2.5x teeth: >=25)', aimedDmg >= 25, `dmg=${aimedDmg}`);
  // dead_aim_shot arms 3x + ignore-armor (matches card text "3x damage, ignores armor")
  mkey = newFight('gallowdeer');
  clearSays();
  Game.useAbility('dead_aim', 'dead_aim_shot');
  check('dead_aim_shot arms 3x + ignoreArmor (matches card text)', !!(s.deadAimShot && s.deadAimShot.mult === 3.0 && s.deadAimShot.ignoreArmor), JSON.stringify(s.deadAimShot));
  endTurn(); awaitPlayerTurn();
  clearSays();
  m = Game.tbFighter(mkey);
  const hp2 = m.hp;
  Game.tbPlayerStrike(mkey);
  const deadDmg = hp2 - Game.tbFighter(mkey).hp;
  const deadTxt = says.join(' ');
  check('dead-aim strike narrates DEAD AIM', /DEAD AIM/.test(deadTxt), `dmg=${deadDmg} | ${deadTxt.slice(0, 80)}`);
  check('dead-aim strike hits very hard (3x teeth: >=30)', deadDmg >= 30, `dmg=${deadDmg}`);
  // set_ambush in combat arms the 2x next-attack flag; strike consumes it.
  mkey = newFight('gallowdeer');
  clearSays();
  Game.useAbility('ambush', 'set_ambush');
  check('set_ambush in combat arms ambushReady (2x)', !!(s.ambushReady && s.ambushReady.mult === 2.0), JSON.stringify(s.ambushReady));
  endTurn(); awaitPlayerTurn();
  clearSays();
  m = Game.tbFighter(mkey);
  const hp3 = m.hp;
  Game.tbPlayerStrike(mkey);
  const ambDmg = hp3 - Game.tbFighter(mkey).hp;
  check('ambush strike narrates AMBUSH (2x consumed)', /AMBUSH: they never saw it coming/.test(says.join(' ')), `dmg=${ambDmg} | ${says.join(' ').slice(0, 80)}`);
  try { Game.tbfight.over = true; } catch (e) {}
  s.health = 100; s.kcal = 3000;

  // Dead Aim vs ARMOR: the "armor won't save them" promise, on an armored beast.
  note('\n=== D2. DEAD AIM vs ARMOR (hushwolf, armor 2) ===');
  mkey = newFight('hushwolf');
  check('fight started vs armored hushwolf', Game.inCombat());
  clearSays();
  Game.useAbility('dead_aim', 'dead_aim_shot');
  endTurn();
  // Hushwolf hits hard and fast — top up the player's fighter HP so the
  // await can't kill the scholar mid-harness (harness hygiene, not engine).
  try { const pf = Game.tbFighter('p'); if (pf) pf.hp = pf.maxhp || pf.hp; } catch (e) {}
  awaitPlayerTurn();
  clearSays();
  const hm = Game.tbFighter(mkey);
  const hhp = hm.hp;
  Game.tbPlayerStrike(mkey);
  const hmAfter = Game.tbFighter(mkey);
  const hdmg = hhp - (hmAfter ? hmAfter.hp : 0); // null = the strike KILLED it
  const htxt = says.join(' ');
  note(`   dead-aim strike vs armored hushwolf: ${hdmg}${hmAfter ? '' : ' (KILL)'}`);
  check('armor ignored line fires (hide might as well not be there)', /might as well not be there/.test(htxt), htxt.slice(0, 120));
  check('ignoreArmorNext flag consumed (no permanent armor-pierce)', !s.ignoreArmorNext, `flag=${s.ignoreArmorNext}`);
  try { Game.tbfight.over = true; } catch (e) {}
  s.health = 100; s.kcal = 3000;

  // ============ E. FINDING 4: modifier targets consumed? (was: 9/10 dead) ============
  note('\n=== E. FINDING 4: modifier consumption sweep (pristine HEAD src/js) ===');
  const targets = ['stealth.move_silent', 'hunt.track_wounded', 'combat.first_strike_damage', 'animal.behavior_read', 'hunt.first_shot_damage', 'hunt.meat_yield', 'hunt.wounded_find', 'hunt.wounded_time', 'hunt.intimidate', 'combat.vs_beast_damage'];
  const consumed = {};
  for (const t of targets) {
    const files = execSync(`grep -rl "modTarget('${t}'" ${ROOT}/src/js/*.js ${ROOT}/src/js/engine/*.js 2>/dev/null || true`).toString().split('\n').filter(f => f && !/engine\/modifiers\.js/.test(f));
    consumed[t] = files.map(f => f.replace(ROOT + '/', ''));
    note(`   ${consumed[t].length ? 'CONSUMED' : 'dead     '} ${t} <- ${consumed[t].join(', ') || '(none)'}`);
  }
  const nowConsumed = Object.keys(consumed).filter(t => consumed[t].length > 0).sort();
  const expectConsumed = ['combat.first_strike_damage', 'combat.vs_beast_damage', 'hunt.meat_yield'].sort();
  check('PARTIAL: 3 targets consumed (meat_yield + first_strike + vs_beast)', JSON.stringify(nowConsumed) === JSON.stringify(expectConsumed), JSON.stringify(nowConsumed));
  const stillDead = Object.keys(consumed).filter(t => !consumed[t].length).sort();
  check('STILL BROKEN: 7 targets remain pipelined-but-never-consumed', stillDead.length === 7, JSON.stringify(stillDead));

  // ============ F. FINDING 5: meat bonus naming (was: silent) ============
  note('\n=== F. FINDING 5: is the meat bonus NAMED anywhere? (was: silent) ===');
  const killLine = (function () { try { return Game.encKillLine({ id: 'wild_turkey', calories: 3000 }, 3900); } catch (e) { return 'ERR ' + e.message; } })();
  note(`   kill line: ${String(killLine).slice(0, 150)}`);
  const killNames = /field.?dress/i.test(killLine);
  check('PARTIAL: dress_game action names the bonus, but encKillLine still does NOT', !killNames, killLine.slice(0, 100));
  note('   (kill-line naming was DEFERRED to engine owner by the fix worker — flagged, not fixed)');

  // ============ G. OLD ROUTE: doAction still warns (documents useAbility as the route) ====
  note('\n=== G. OLD ROUTE: doAction(actionId) unchanged (was: "unknown kind") ===');
  const actionIds = ['read_sign', 'read_stance', 'take_aim', 'clean_shot', 'dress_game', 'track', 'dead_aim_shot', 'stalk_prey', 'follow_blood', 'set_ambush', 'lay_wait', 'read_beast', 'calm_beast'];
  let unknown = 0;
  warns.length = 0;
  for (const aid of actionIds) {
    const w0 = warns.length; clearSays();
    try { Game.doAction(aid, {}); } catch (e) { warns.push('THREW: ' + e.message); }
    if (warns.slice(w0).some(w => w.includes(aid) && /unknown kind/i.test(w))) unknown++;
  }
  check('doAction still warns "unknown kind" for all 13 (useAbility is the live route)', unknown === 13, `${unknown}/13`);

  // ============ H. PLAY-FEEL: the night hunt as a player ============
  note('\n=== H. PLAY-FEEL: night hunt — stalk, lay in wait, the encounter ===');
  setDay(23, 3);
  s.kcal = 3000;
  clearSays();
  Game.useAbility('stalk', 'stalk_prey');
  const stalkTxt = says.join(' ');
  check('stalk narrates the fantasy (uninteresting shadow)', /uninteresting|shadow/i.test(stalkTxt), stalkTxt.slice(0, 80));
  clearSays();
  Game.useAbility('ambush', 'lay_wait');
  check('lay_wait narrates the setup', /blind spot|downwind/i.test(says.join(' ')), says.join(' ').slice(0, 80));
  // Walk until an animal encounter fires; the laid ambush should hold it hidden.
  // Seed the tile's wildlife stock first (ecology: hunted-out tiles spawn nothing).
  // NOTE: the harness starts on the haven tile, which has no animal biome — a
  // real player walks out to hunt. Move to the nearest forest/meadow tile.
  s.animal = null;
  try {
    let tx = Game.map.px, ty = Game.map.py, best = 1e9;
    for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) {
      const tt = Game.map.tiles[y][x];
      if (tt && (tt.type === 'forest' || tt.type === 'meadow')) {
        const d = Math.abs(x - Game.map.px) + Math.abs(y - Game.map.py);
        if (d < best) { best = d; tx = x; ty = y; }
      }
    }
    Game.map.px = tx; Game.map.py = ty;
    const wt = Game.map.tiles[ty][tx];
    wt.wildlife = wt.wildlife || {};
    const ttype = wt.type;
    const cand = (Game.data.animals || []).find(a => (a.biomes || []).includes(ttype));
    if (cand) wt.wildlife[cand.id] = (wt.wildlife[cand.id] || 0) + 3;
    note(`   walked to ${ttype} tile (${tx},${ty}), stocked ${cand ? cand.id : 'none'}`);
  } catch (e) { note('   tile setup: ' + e.message); }
  let encounterHidden = null;
  for (let i = 0; i < 40 && encounterHidden === null; i++) {
    Game.checkAnimals();
    if (s.animal) encounterHidden = (s.animal.aware === 0);
  }
  check('an animal encounter fired', s.animal !== null, 'no encounter in 40 tries');
  if (s.animal) {
    check('lay-in-wait held: encounter starts with you hidden (aware 0)', encounterHidden === true, `aware=${s.animal.aware}`);
    note(`   encounter said: ${says.slice(-2).join(' | ').slice(0, 160)}`);
  }
  s.animal = null;
  // Wounded tracking chain: track -> follow_blood narrate the loop.
  clearSays();
  Game.useAbility('tracker', 'track');
  const trackTxt = says.join(' ');
  clearSays();
  Game.useAbility('blood_trail', 'follow_blood');
  const bloodTxt = says.join(' ');
  check('track + follow_blood narrate the wounded-trail fantasy', trackTxt.length > 40 && bloodTxt.length > 40, `${trackTxt.slice(0, 60)} || ${bloodTxt.slice(0, 60)}`);

  note(`\n=== RESULT: ${pass} ok, ${fail} FAIL ===`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR:', e && e.stack || e); process.exit(2); });
