#!/usr/bin/env node
// HUNTER LOOP (playtest loop 2026-10-07, Steve): play the hunter archetype for
// real at current HEAD — stalk, ambush, night monster fight, wounded tracking,
// trapline at dawn — and judge feel. Also re-verifies the hunter-audit's open
// findings: (1) 3 synergies undiscoverable, (2) meat bonus unnamed.
// AFTER the synergy fix lands, the same beats should show discovery working.
//
// Loads engine from ROOT (env override) so before/after runs are comparable.
// Run: node scripts/play-feel-20261007-hunter-loop.js  (SEED env override)
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ROOT = process.env.HUNTER_ROOT || '/tmp/hunter-loop-head';
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
function note(t) { console.log(t); }
function flush(tag, max = 3) { const take = says.splice(0).slice(0, max); for (const t of take) note(`   | ${tag} ${String(t).slice(0, 160)}`); }
function clearSays() { says.splice(0); }
let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; note(`  ok   ${name}`); }
  else { fail++; note(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}
function grant(id, level) {
  const s = Game.state.scholar;
  s.abilities = s.abilities || [];
  let e = s.abilities.find(a => a.id === id);
  if (!e) { e = { id, name: id, desc: '', level: level || 1, xp: 0 }; s.abilities.push(e); }
  else e.level = level || e.level || 1;
  return e;
}
function setDay(d, part) { Game.state.village.day = d; Game.state.scholar.day = d; Game.dayPart = part || 0; }
function endTurn() {
  if (!Game.tbfight || Game.tbfight.over) return;
  if (!Game.tbIsPlayerTurn()) return;
  const p = Game.tbFighter('p'); if (p) { p.moveLeft = 0; p.acted = true; }
  Game.tbAfterPlayerAction();
}
function awaitPlayerTurn(max = 12) {
  // After a turn-spending ability (take_aim), the monster acts; wait until
  // it's the player's turn again. (Harness turn hygiene: never strike when
  // it's not your turn — tbPlayerStrike no-ops and looks like 0 damage.)
  let n = 0;
  while (Game.inCombat() && !Game.tbfight.over && !Game.tbIsPlayerTurn() && n < max) {
    Game.tbAfterPlayerAction(); n++;
  }
}

(async () => {
  await Game.init();
  note(`seed=${SEED}  ROOT=${ROOT}`);
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  const s = Game.state.scholar;
  s.health = 100; s.kcal = 2600; s.hydration = 80; s.energy = 100;
  s.trauma = 0; s.mx = 4; s.my = 4;
  Game.state.weather = 'clear';
  clearSays();

  // ============ A. THE NIGHT HUNT ============
  note('\n=== A. NIGHT HUNT: stalk -> ambush -> fight (gallowdeer) ===');
  ['stalk', 'blood_trail', 'ambush', 'animal_ken', 'game_sense', 'patient_aim', 'field_dressing', 'tracker', 'dead_aim'].forEach(id => grant(id, 2));
  setDay(12, 3); // night
  check('it is night', Game.isNight());
  clearSays();
  Game.useAbility('stalk', 'stalk_prey');
  check('stalk_prey narrates (no silent turn)', says.length > 0 && says.join(' ').length > 40, JSON.stringify(says).slice(0, 80));
  flush('stalk');
  clearSays();
  Game.useAbility('ambush', 'set_ambush');
  // DESIGN (verified): set_ambush costs a combat turn, so it's combat-context
  // by design — the pre-combat ambush verb is lay_wait (explore). The refusal
  // must be honest, not silent.
  check('set_ambush outside combat refuses honestly (combat verb by design)', /combat action/i.test(says.join(' ')), says.join(' ').slice(0, 80));
  flush('ambush');
  clearSays();
  Game.startCombat('gallowdeer');
  check('night fight started vs gallowdeer', Game.inCombat());
  check('tbfight has an id (read_stance once-per-fight key)', !!(Game.tbfight && Game.tbfight.id));
  const mkey = Game.tbfight.fighters.find(f => f.kind === 'monster').key;
  clearSays();
  Game.useAbility('game_sense', 'read_stance');
  const stanceSaid = says.join(' ');
  check('read_stance FIRST use actually reads (not "already read")', !/already read this fight/i.test(stanceSaid), stanceSaid.slice(0, 90));
  flush('stance');
  clearSays();
  Game.useAbility('patient_aim', 'take_aim');
  check('take_aim arms 2.5x (matches action text)', !!(s.aimBonus && s.aimBonus.mult === 2.5), JSON.stringify(s.aimBonus));
  check('turn cost is grammatical ("You focus")', /You focus — that costs your action/.test(says.join(' ')), says.join(' ').slice(0, 60));
  flush('aim');
  // Turn economy: take_aim spends the ACTION but not your moves — the turn
  // advances only when moves are spent too. Play it for real: move, then the
  // monster answers, then strike on the next player turn with the aim held.
  endTurn();
  awaitPlayerTurn();
  const m0 = Game.tbFighter(mkey).hp;
  Game.tbPlayerStrike(mkey);
  const dmg = m0 - Game.tbFighter(mkey).hp;
  note(`   aimed strike dealt ${dmg} (2.5x of a 10-16 roll = 25+ expected)`);
  check('aimed strike lands with the 2.5x (verbs have teeth)', dmg >= 25, `dmg=${dmg}`);
  endTurn();
  clearSays();
  Game.useAbility('dead_aim', 'dead_aim_shot');
  check('dead_aim_shot arms 3x ignore-armor (matches card)', !!(s.deadAimShot && s.deadAimShot.mult === 3.0 && s.deadAimShot.ignoreArmor), JSON.stringify(s.deadAimShot));
  flush('deadaim');
  try { Game.tbfight.over = true; } catch (e) {}
  s.health = 100;

  // ============ B. WOUNDED TRACKING ============
  note('\n=== B. WOUNDED TRACKING: read_sign -> track -> follow_blood ===');
  setDay(12, 1);
  for (const [ab, ac] of [['game_sense', 'read_sign'], ['tracker', 'track'], ['blood_trail', 'follow_blood'], ['animal_ken', 'read_beast']]) {
    clearSays();
    const r = Game.useAbility(ab, ac);
    const txt = says.join(' ');
    check(`${ab}.${ac} executes + narrates`, r !== false && txt.length > 40, txt.slice(0, 80));
  }
  // stalk settles an active animal encounter (awareness drops — the approach holds)
  s.animal = { id: 'wild_turkey', mx: 5, my: 5, aware: 0.8, pstate: 'wary' };
  clearSays();
  Game.useAbility('stalk', 'stalk_prey');
  check('stalk calms the active animal (aware 0.8 -> <=0.2)', (s.animal.aware || 1) <= 0.2, `aware=${s.animal.aware}`);
  check('stalk flag armed for the strike', s.stalkActive === true);
  s.animal = null;

  // ============ C. FIELD DRESSING: the kill and the bonus ============
  note('\n=== C. FIELD DRESSING: dress the carcass, name the bonus ===');
  clearSays();
  // Hunted game lands in the inventory as a carcass (hiddenKcal already
  // carries the field-dressing bonus from the kill — no double-dip).
  s.inventory = (s.inventory || []).concat([
    { foodKind: 'meat', foodState: 'carcass', hiddenKcal: 3900, name: 'deer (carcass)', plantId: 'meat_deer' },
  ]);
  const k0 = s.kcal;
  Game.useAbility('field_dressing', 'dress_game');
  const gained = s.kcal - k0;
  // Net = 3900 meat − 40 kcal action cost. The old impl re-multiplied ×1.3
  // (would have been +5070 gross); now the carcass converts at face value.
  check('dress_game converts the carcass (no re-multiply: net +3860)', gained === 3860, `+${gained}`);
  check('dress_game NAMES the field-dressing bonus', /Field Dressing ×/.test(says.join(' ')), says.join(' ').slice(0, 120));
  flush('dress');
  const killLine = Game.encKillLine({ id: 'wild_turkey', calories: 3000 }, 3900);
  note(`   kill line: ${String(killLine).slice(0, 170)}`);
  // DEFERRED to engine owner (sibling has 276-line WIP in encounters.js hunt region):
  // encKillLine should name the field-dressing bonus when kcal > base.
  note(`   DEFERRED: kill line ${/field.?dress/i.test(killLine) ? 'NAMES' : 'does NOT yet name'} the field-dressing bonus — flagged for engine owner.`);

  // ============ D. TRAPLINE AT DAWN ============
  note('\n=== D. TRAPLINE: set snare, sleep, dawn check ===');
  s.tools = [{ recipeId: 'snare', uses: 2 }];
  setDay(12, 2);
  clearSays();
  Game.setTrap('snare');
  check('snare set', (Game.playerTile().traps || []).length === 1);
  flush('trap');
  clearSays();
  try { Game.endDay(); } catch (e) { note('   endDay threw: ' + e.message); }
  const trapSaid = says.join(' ');
  note(`   dawn said: ${trapSaid.slice(0, 200) || '(nothing about traps)'}`);
  check('dawn trap check speaks (catch or empty, never silent)', /trap|snare|empty|nothing/i.test(trapSaid), trapSaid.slice(0, 100));

  // ============ E. SYNERGY DISCOVERY: the deliberate grind ============
  note('\n=== E. SYNERGY DISCOVERY (3 combined uses per path, same day-part) ===');
  function attemptPath(synId, legs) {
    for (let d = 0; d < 3; d++) {
      setDay(20 + d, 1);
      for (const leg of legs) Game.noteAbilityUse(leg, { day: 20 + d, part: 1 });
    }
    return {
      attempts: (Game.state.scholar.synergyAttempts || {})[synId] || 0,
      unlocked: (Game.state.scholar.synergies || []).includes(synId),
    };
  }
  const r1 = attemptPath('clean_kill', ['patient_aim', 'game_sense']);
  note(`   clean_kill via [patient_aim + game_sense] x3: attempts=${r1.attempts} unlocked=${r1.unlocked}`);
  check('clean_kill DISCOVERABLE via a requires_any path', r1.unlocked === true, `attempts=${r1.attempts}`);
  const r2 = attemptPath('blood_tracker', ['blood_trail', 'tracker']);
  note(`   blood_tracker via [blood_trail + tracker] x3: attempts=${r2.attempts} unlocked=${r2.unlocked}`);
  check('blood_tracker DISCOVERABLE via a requires_any path', r2.unlocked === true, `attempts=${r2.attempts}`);
  // apex_predator: synergy legs must count as satisfied-by-discovery (minLevel 3)
  grant('animal_ken', 3); grant('stalk', 3); grant('ambush', 3);
  const r3 = attemptPath('apex_predator', ['animal_ken', 'stalk']);
  note(`   apex_predator via [clean_kill(discovered) + animal_ken] x3: attempts=${r3.attempts} unlocked=${r3.unlocked}`);
  check('apex_predator DISCOVERABLE (synergy leg = discovered)', r3.unlocked === true, `attempts=${r3.attempts}`);
  // activation gating: undiscovered-but-held synergy must not be permanently active
  Game.state.scholar.synergies = (Game.state.scholar.synergies || []).filter(id => id !== 'clean_kill');
  Game.recomputeActiveSynergies();
  const activeLeak = (Game.state.scholar.activeSynergies || []).includes('clean_kill');
  check('recomputeActiveSynergies: undiscovered clean_kill not active', !activeLeak);

  note(`\n==== ${pass} ok / ${fail} FAIL ====`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('HARNESS ERROR: ' + (e && e.stack || e)); process.exit(2); });
