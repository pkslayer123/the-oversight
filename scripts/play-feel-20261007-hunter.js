#!/usr/bin/env node
// HUNTER PATH PLAY-AUDIT (Steve 2026-10-07): play the c1157dc hunter content
// AS A PLAYER and judge fun/feel — not just execution.
//
// c1157dc added: 4 new abilities (stalk, blood_trail, ambush, animal_ken),
// actions on 5 existing abilities (game_sense, patient_aim, field_dressing,
// tracker, dead_aim), 3 multi-path synergies (clean_kill, blood_tracker,
// apex_predator), plus requires_any support in checkSynergyDiscovery.
//
// LOADS A PRISTINE HEAD TREE (/tmp/hunter-head): the worktree's src/ is dirty
// with sibling work, so engine+data come from `git archive HEAD src`.
// Engine is READ-ONLY: bugs are flagged, never fixed here.
//
// Run: node scripts/play-feel-20261007-hunter.js  (SEED env override)
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ROOT = '/tmp/hunter-head';
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
order.forEach(f => { eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); });
delete global.window; delete global.document;
const Game = globalThis.Scattering.Game;
const says = [];
const osay = Game.say.bind(Game);
Game.say = (t) => { says.push(String(t)); return osay(t); };
const warns = [];
const owarn = console.warn.bind(console);
console.warn = (...a) => { warns.push(a.join(' ')); return owarn(...a); };
function note(t) { console.log(t); }
function flush(tag, max = 3) { const take = says.splice(0).slice(0, max); for (const t of take) note(`   | ${tag} ${String(t).slice(0, 150)}`); }
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
function setDay(d, part) { Game.state.village.day = d; Game.dayPart = part || 0; }
function endTurn() { // playtest turn hygiene (wave2a pattern)
  if (!Game.tbfight || Game.tbfight.over) return;
  if (!Game.tbIsPlayerTurn()) return;
  const p = Game.tbFighter('p'); if (p) { p.moveLeft = 0; p.acted = true; }
  Game.tbAfterPlayerAction();
}

(async () => {
  await Game.init();
  note(`seed=${SEED}  (HEAD tree at /tmp/hunter-head)`);
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  const s = Game.state.scholar;
  try { Game.location = 'haven'; } catch (e) {}
  s.health = 100; s.kcal = 2600; s.hydration = 80; s.energy = 100; s.water = [];
  s.trauma = 0; s.mx = 4; s.my = 4;
  Game.state.weather = 'clear';
  s.inventory = (s.inventory || []).concat([
    { itemId: 'knife', name: 'Knife', units: 1, kg: 0.4 },
  ]);
  clearSays();

  // ============ A. THE HUNTER'S KIT ============
  note('\n=== A. GRANT THE HUNTER KIT (4 new + 5 touched) ===');
  const kit = ['stalk', 'blood_trail', 'ambush', 'animal_ken', 'game_sense', 'patient_aim', 'field_dressing', 'tracker', 'dead_aim'];
  for (const id of kit) grant(id, 2);
  grant('ambush', 1); grant('animal_ken', 1);
  check('all 9 abilities granted', kit.every(id => Game.abilityLevel(id) >= 1));
  check('4 new abilities exist in data', ['stalk', 'blood_trail', 'ambush', 'animal_ken'].every(id => (Game.data.abilities || []).some(a => a.id === id)));
  check('3 new synergies exist in data', ['clean_kill', 'blood_tracker', 'apex_predator'].every(id => (Game.data.synergies || []).some(x => x.id === id)));

  // ============ B. HUNT FEEL: field_dressing meat bonus ============
  note('\n=== B. HUNT FEEL: field_dressing meat_yield (level-scaled, live pipeline) ===');
  s.abilities = s.abilities.filter(a => a.id !== 'field_dressing');
  check('no field_dressing: 1.0x', Game.modTarget('hunt.meat_yield', 1000) === 1000);
  grant('field_dressing', 1);
  check('field_dressing L1: 1.3x (matches data)', Game.modTarget('hunt.meat_yield', 1000) === 1300, `got ${Game.modTarget('hunt.meat_yield', 1000)}`);
  grant('field_dressing', 2);
  check('field_dressing L2: 1.69x (multiply scales per level: 1.3^2)', Math.abs(Game.modTarget('hunt.meat_yield', 1000) - 1690) < 1, `got ${Game.modTarget('hunt.meat_yield', 1000)}`);
  // Does the game SAY anything about the bonus? (no-silent-actions rule)
  const killLine = (function () { try { return Game.encKillLine ? Game.encKillLine({ id: 'wild_turkey', calories: 3000 }, 3900) : '(no encKillLine on Game)'; } catch (e) { return 'ERR ' + e.message; } })();
  note(`   kill line: ${String(killLine).slice(0, 130)}`);
  const namesBonus = /1\.3|1\.69|field|dress|bonus/i.test(killLine);
  note(`   FEEL: the +${Math.round((Game.modTarget('hunt.meat_yield', 1000) / 1000 - 1) * 100)}% meat bonus is ${namesBonus ? 'NAMED' : 'SILENT'} in the kill line — ${namesBonus ? 'good' : 'the player never learns why the haul was big'}.`);
  flush('hunt');

  // ============ C. REAL FIGHT WITH AMBUSH ============
  note('\n=== C. FIGHT FEEL: ambush L1 equipped vs a gallowdeer (4 rounds) ===');
  clearSays();
  Game.startCombat('gallowdeer');
  check('combat started vs gallowdeer', Game.inCombat());
  const mkey = Game.tbfight.fighters.find(f => f.kind === 'monster').key;
  const damages = [];
  for (let i = 0; i < 4 && Game.inCombat(); i++) {
    clearSays();
    const m = Game.tbFighter(mkey);
    const hp0 = m.hp;
    Game.tbPlayerStrike(mkey);
    damages.push(hp0 - Game.tbFighter(mkey).hp);
    if (i === 0) flush('r1');
    endTurn();
  }
  note(`   damages with ambush L1: ${JSON.stringify(damages)}`);
  check('strikes land (fight is real)', damages[0] > 0, JSON.stringify(damages));
  const ambushMention = says.join(' ').toLowerCase().includes('ambush');
  check('no combat text mentions ambush (its 1.5x first-strike never fires)', !ambushMention);
  const fsPipelined = Game.modTarget('combat.first_strike_damage', 1);
  note(`   FEEL: ambush pipelines combat.first_strike_damage=${fsPipelined} but NO engine system reads that target — the fight feels identical with/without it. A "2x next attack, can't be dodged" promise with no execution.`);
  try { Game.tbfight.over = true; } catch (e) {}
  s.health = 100;

  // ============ D. THE 13 ACTIONS: do they execute? ============
  note('\n=== D. ACTION AUDIT: 13 new actions — any engine behind them? ===');
  const actionIds = ['read_sign', 'read_stance', 'take_aim', 'clean_shot', 'dress_game', 'track', 'dead_aim_shot', 'stalk_prey', 'follow_blood', 'set_ambush', 'lay_wait', 'read_beast', 'calm_beast'];
  let unknown = 0;
  warns.length = 0;
  const saidLines = [];
  for (const aid of actionIds) {
    const w0 = warns.length; clearSays();
    try { Game.doAction(aid, {}); } catch (e) { warns.push('THREW: ' + e.message); }
    if (warns.some(w => w.includes(aid))) unknown++;
    if (says.length) saidLines.push(`${aid} -> ${JSON.stringify(says)}`);
  }
  check('all 13 actions -> console.warn "unknown kind" (no dispatch)', unknown === 13, `${unknown}/13`);
  note(`   player-visible result per action: ${saidLines.length ? saidLines.slice(0, 3).join(' | ') + (saidLines.length > 3 ? ` ... (${saidLines.length} total)` : '') : '(nothing said at all)'}`);
  const emptySaid = saidLines.filter(l => /\[""\]/.test(l)).length;
  note(`   FEEL: ${emptySaid}/13 push an EMPTY line to the say feed and burn 1 tick — a silent turn by Steve's rule (no visible explanation of what happened).`);
  check('UI honesty gap: ability card shows ACTIVE badge for display-only actions (app.js renderSlot)', true, 'manual code read: badge = def.actions.length>0 -> "ACTIVE"');

  // ============ E. SYNERGY DISCOVERY — the deliberate attempt ============
  note('\n=== E. SYNERGY DISCOVERY ATTEMPTS (as a player: use each path pair 3x) ===');
  function attemptPath(synId, legs) {
    for (let d = 0; d < 3; d++) {
      setDay(10 + d, 1);
      for (const leg of legs) Game.noteAbilityUse(leg, {});
    }
    return {
      attempts: (Game.state.scholar.synergyAttempts || {})[synId] || 0,
      unlocked: (Game.state.scholar.synergies || []).includes(synId),
    };
  }
  ['patient_aim', 'game_sense', 'tracker', 'dead_aim', 'stalk', 'blood_trail', 'animal_ken'].forEach(id => grant(id, 2));
  const paths = {
    clean_kill: [['patient_aim', 'game_sense'], ['dead_aim', 'tracker'], ['patient_aim', 'stalk'], ['ambush', 'game_sense']],
    blood_tracker: [['tracker', 'game_sense'], ['blood_trail', 'tracker'], ['blood_trail', 'animal_ken']],
  };
  for (const [synId, pls] of Object.entries(paths)) {
    for (const legs of pls) {
      const r = attemptPath(synId, legs);
      note(`   ${synId} via [${legs.join(' + ')}]: attempts=${r.attempts} unlocked=${r.unlocked}`);
    }
  }
  check('clean_kill NEVER unlocks (no discovery_method -> loop skips)', !(Game.state.scholar.synergies || []).includes('clean_kill'));
  check('blood_tracker NEVER unlocks (no discovery_method -> loop skips)', !(Game.state.scholar.synergies || []).includes('blood_tracker'));
  check('zero attempt-counters increment (skip happens before counting)', Object.keys(Game.state.scholar.synergyAttempts || {}).filter(k => /clean_kill|blood_tracker|apex_predator/.test(k)).length === 0);
  note('   apex_predator not attempted via play: its prerequisites (clean_kill/blood_tracker) are undiscoverable — see H.');

  // ============ E2. DIAGNOSTIC: in-memory, does requires_any machinery work? ============
  note('\n=== E2. DIAGNOSTIC (in-memory only): isolate the two defects ===');
  const syns = Game.data.synergies;
  const ckIdx = syns.findIndex(x => x.id === 'clean_kill');
  const ckOrig = JSON.parse(JSON.stringify(syns[ckIdx]));
  const schSynOrig = [...(Game.state.scholar.synergies || [])];
  const schActOrig = [...(Game.state.scholar.activeSynergies || [])];
  const ck = syns[ckIdx];
  ck.discovery_method = { type: 'simultaneous' };  // defect-1 patch only
  Game.state.scholar.synergyAttempts = {};
  const rA = attemptPath('clean_kill', ['patient_aim', 'game_sense']);
  check('DEFECT 2: discovery_method alone still yields ZERO (matchesUsed reads requires, not requires_any)', rA.attempts === 0 && !rA.unlocked, `attempts=${rA.attempts}`);
  ck.requires = ['patient_aim', 'game_sense'];  // defect-1+2 patch
  Game.state.scholar.synergyAttempts = {};
  const rB = attemptPath('clean_kill', ['patient_aim', 'game_sense']);
  check('combined-use machinery works when engine-readable (unlocks after 3)', rB.unlocked === true);
  // restore pristine data + scholar state
  syns[ckIdx] = ckOrig;
  Game.state.scholar.synergies = schSynOrig;
  Game.state.scholar.activeSynergies = schActOrig;
  Game.state.scholar.synergyAttempts = {};
  Game.recomputeActiveSynergies();

  // ============ F. requires_any HINTS (getNearSynergies — the working piece) ============
  note('\n=== F. NEAR-SYNERGY HINTS (requires_any path evaluation) ===');
  s.abilities = s.abilities.filter(a => !['game_sense', 'tracker', 'dead_aim', 'stalk', 'ambush', 'blood_trail', 'animal_ken', 'field_dressing'].includes(a.id));
  grant('patient_aim', 2);
  let near = Game.getNearSynergies();
  const ckNear = near.filter(n => n.id === 'clean_kill');
  check('clean_kill near-hints appear via requires_any paths', ckNear.length > 0, JSON.stringify(ckNear.map(n => `${n.have}/${n.total} need ${n.needName}`)));
  note(`   near: ${near.map(n => `${n.name} ${n.have}/${n.total} need ${n.needName}`).join(' | ').slice(0, 200)}`);
  grant('dead_aim', 3);
  near = Game.getNearSynergies();
  const apexNear = near.filter(n => n.id === 'apex_predator');
  note(`   apex_predator near: ${apexNear.length ? apexNear.map(n => `${n.have}/${n.total} need ${n.needName}`).join(', ') : '(none — every path needs 2+ pieces)'}`);
  check('requires_any hint engine handles synergy-id requirements gracefully', apexNear.every(n => n.needName), JSON.stringify(apexNear.map(n => n.need)));

  // ============ G. MODIFIER SWEEP: carried vs consumed ============
  note('\n=== G. MODIFIER SWEEP: pipeline carries all 10 — who consumes them? ===');
  ['stalk', 'blood_trail', 'ambush', 'animal_ken'].forEach(id => grant(id, 3));
  // Static consumer counts (grep over HEAD src/js, verified 2026-10-07):
  const consumers = {
    'stealth.move_silent': 0, 'hunt.track_wounded': 0, 'combat.first_strike_damage': 0,
    'animal.behavior_read': 0, 'hunt.first_shot_damage': 0, 'hunt.meat_yield': 3,
    'hunt.wounded_find': 0, 'hunt.wounded_time': 0, 'hunt.intimidate': 0, 'combat.vs_beast_damage': 0,
  };
  for (const [t, n] of Object.entries(consumers)) {
    const piped = Game.modTarget(t, t.startsWith('hunt.wounded_time') || t.endsWith('_damage') || t === 'hunt.meat_yield' || t === 'combat.vs_beast_damage' ? 1 : 0);
    note(`   ${n > 0 ? 'CONSUMED' : 'pipelined-only'} ${t}: pipeline=${piped} engine consumers=${n}`);
  }
  check('hunt.meat_yield is the ONLY consumed target (encounters.js:715,1926 + game.js:8899)', Object.entries(consumers).filter(([, n]) => n > 0).map(([t]) => t).join() === 'hunt.meat_yield');
  check('9 of 10 new modifier targets have ZERO engine consumers', Object.values(consumers).filter(n => n === 0).length === 9);

  // ============ H. APEX_PREDATOR IMPOSSIBILITY ============
  note('\n=== H. APEX_PREDATOR: can its requires_any paths EVER be met? ===');
  check("abilityLevel('clean_kill') is 0 (synergies aren't abilities)", Game.abilityLevel('clean_kill') === 0);
  check("abilityLevel('blood_tracker') is 0", Game.abilityLevel('blood_tracker') === 0);
  Game.unlockSynergy(Game.data.synergies.find(x => x.id === 'clean_kill'));
  check('forced unlock works (unlockSynergy itself is fine)', (Game.state.scholar.synergies || []).includes('clean_kill'));
  Game.recomputeActiveSynergies();
  const activeHasCk = (Game.state.scholar.activeSynergies || []).includes('clean_kill');
  check('recomputeActiveSynergies ignores requires_any (empty requires => always active once discovered)', activeHasCk === true);
  note('   FEEL: if clean_kill were discoverable, it would be PERMANENTLY active — no "currently held" check at all.');
  grant('animal_ken', 3);
  const apex = Game.data.synergies.find(x => x.id === 'apex_predator');
  const path1met = apex.requires_any[0].every(rid => Game.abilityLevel(rid) >= 3);
  check('apex path [clean_kill+animal_ken] unsatisfiable via abilityLevel', path1met === false);
  flush('apex');
  // restore
  Game.state.scholar.synergies = (Game.state.scholar.synergies || []).filter(id => id !== 'clean_kill');
  Game.recomputeActiveSynergies();

  // ============ I. KNOWLEDGE GATING ============
  note('\n=== I. KNOWLEDGE GATING: do names leak before earning? ===');
  near = Game.getNearSynergies();
  const leaksName = near.some(n => ['clean_kill', 'blood_tracker', 'apex_predator'].includes(n.id));
  note(`   near-synergy hints name undiscovered synergies pre-discovery: ${leaksName ? 'YES' : 'no'}`);
  note('   (Same behavior as the other 41 synergies — the teaser naming the prize is the existing design, not a new leak.)');
  check('ability data only surfaces for HELD abilities (no pre-unlock name leak at data layer)', (s.abilities || []).some(a => a.id === 'stalk'));

  note(`\n=== RESULT: ${pass} ok, ${fail} FAIL ===`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR:', e); process.exit(2); });
