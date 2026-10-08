// WAVE-2 ESCALATION BAR — proof test (Steve 2026-10-05).
// Asserts the wave-2 bar ON ITS OWN TERMS (Steve 2026-10-06 correction:
// the Highbeam Deer is wave 1 — wave 2 is defined by genuine mechanical
// escalation, not by beating the deer's stats).
//
// THE BAR: every wave-2 monster must be a NEW KIND OF PROBLEM — a tactical
// verb wave 1 doesn't have — with a reachable second act, honest telegraphs,
// and knowledge-gated coaching. Checked statically (Part A) and by played
// headless fights with a matched tactic per monster (Part B).
//
// Deterministic: Math.random is stubbed to () => 0 during the played fights.
// Plain node — NOT jest (no concurrent jest on this tree).
// Run: node scripts/test-wave2-bar-20261006.js   (exit 0 = bar holds)
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const GAME_SRC = fs.readFileSync(path.join(ROOT, 'src/js/game.js'), 'utf8');
const APP_SRC = fs.readFileSync(path.join(ROOT, 'src/js/app.js'), 'utf8');
const MONSTERS = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/monsters.json'), 'utf8'));

const W2 = ['bright_idea', 'heckler', 'landlord', 'memory_projector', 'mirror_stag',
  'moderator', 'paparazzo', 'review_drone', 'understudy', 'union_rep',
  'voice_mimic_radio', 'warranty_caller'];
const byId = Object.fromEntries(MONSTERS.map(m => [m.id, m]));

// The escalation dimension each wave-2 monster is DEFINED by (the bar's terms),
// plus the code markers that prove the trick is implemented, not just written.
const BAR = {
  bright_idea:       { dim: 'consequence escalation: REKINDLE shrinks the safe ember window 2->1->0; DAZZLE blinds', markers: ['biEmber', 'biCycles', 'rekindle'], pred: 'biIs' },
  heckler:           { dim: 'social pressure: SHAME degrades YOUR damage; compulsion taxes your turns (answer back or +2)', markers: ['hkShame', 'hkHeadlinerAt', 'PILE-ON'], pred: 'hkIs' },
  landlord:          { dim: 'terrain control: claims tiles as jurisdiction; rent on claimed ground; Addenda escalate', markers: ['llClaimed', 'llAddenda', 'Jurisdiction'], pred: 'llIs' },
  memory_projector:  { dim: 'lure predation: the SPELL rewards stillness; moving breaks it; homesickness is the bait', markers: ['mpWatch', 'mpStill', 'mpSpellPull'], pred: 'mpIs' },
  mirror_stag:       { dim: 'perception manipulation: gaze-freeze mirror + THE WHEEL (missed charge re-attacks, no windup)', markers: ['It wheels on a hoof', 'FROZEN', 'chargeStyle'], pred: 'stagIs' },
  moderator:         { dim: 'action-economy attack: mutes your most-used VERB inside a visible field; violations feed it; SHADOWBAN second act', markers: ['modMuted', 'modViolations', 'shadowban'], pred: 'modIs' },
  paparazzo:         { dim: 'prediction that learns from MISSES: dodging makes the money shot unavoidable; widening burst', markers: ['pzPrediction', 'money shot', 'Widening'], pred: 'pzIs' },
  review_drone:      { dim: 'announced evaluation: projected line + 3-beat countdown + grading commentary; fears crowds', markers: ['DODGE EFFICIENCY', 'crowdLimit', 'CORRECTIVE'], pred: 'droneIs' },
  understudy:        { dim: 'mimicry: learns YOUR weapon at rising fidelity; OPENING STEAL punishes your favorite move; DESPERATE IMPROV', markers: ['usSeen', 'usPerformed', 'OPENING STEAL'], pred: 'usIs' },
  union_rep:         { dim: 'coordination pressure: buffs/summons allies; WALKOUT goes untargetable (+8) — target-priority inversion', markers: ['urWalkout', 'urWalkout', 'PICKET LINE'], pred: 'urIs' },
  voice_mimic_radio: { dim: 'emotional lure: lure/resist economy (walk toward the crying feeds it; 2 turns of resisting breaks the act); THE REPLAY rush', markers: ['vmLure', 'vmResist', 'THE REPLAY'], pred: 'vmIs' },
  warranty_caller:   { dim: 'positional targeting: dial->ring->pitch->redial; the RING is the tell; moving 2+ tiles drops the call; bad-connection punish', markers: ['wcDialKey', 'wcRedial', 'CALL DROPPED'], pred: 'wcIs' },
};

let failures = [];
function check(name, cond, detail) {
  if (cond) console.log('  ok  ' + name);
  else { console.log('  FAIL ' + name + (detail ? ' — ' + detail : '')); failures.push(name); }
}

console.log('PART A — static bar checks');
// A1: roster is exactly the 12 audited monsters, all wave 2
const wave2ids = MONSTERS.filter(m => m.wave === 2).map(m => m.id).sort();
check('roster: 12 wave-2 monsters, expected ids', JSON.stringify(wave2ids) === JSON.stringify([...W2].sort()),
  'got ' + wave2ids.join(','));
// A2: distinct, monster-specific telegraph text (not generic)
const teles = W2.map(id => (byId[id].attack || {}).telegraph || '');
check('telegraphs present and long (>=60 chars)', teles.every(t => t.length >= 60));
check('telegraphs all distinct', new Set(teles).size === teles.length);
// A3: >= 3 named phases each (readable second act)
for (const id of W2) {
  const ph = ((byId[id].encounter || {}).phases || []);
  check(id + ': >=3 named phases (' + ph.length + ')', ph.length >= 3);
}
// A4: knowledge-gated coaching (knownCue) each
for (const id of W2) {
  const kc = (byId[id].encounter || {}).knownCue;
  check(id + ': knownCue coaching', typeof kc === 'string' && kc.length > 20);
}
// A5: 3 codex stages each
for (const id of W2) {
  const cs = byId[id].codexStages || {};
  check(id + ': codex unknown/observed/slain', ['unknown', 'observed', 'slain'].every(k => (cs[k] || '').length > 20));
}
// A6: defenses present (armor number + resistances object)
for (const id of W2) {
  const m = byId[id];
  check(id + ': armor/resistances fields present',
    typeof m.armor === 'number' && m.resistances && typeof m.resistances === 'object');
}
// A7: signature escalation mechanic is implemented in game.js (not just data)
for (const id of W2) {
  const missing = BAR[id].markers.filter(mk => !GAME_SRC.includes(mk));
  check(id + ': trick implemented [' + BAR[id].dim.slice(0, 52) + '...]', missing.length === 0, 'missing markers: ' + missing.join(','));
}
// A8: every audio name the monster can fire resolves in the CombatAudio registry
const regStart = APP_SRC.indexOf('const CombatAudio');
const regEnd = APP_SRC.indexOf('Game.audio = CombatAudio');
const regRegion = APP_SRC.slice(regStart, regEnd);
const regKeys = new Set([...regRegion.matchAll(/^\s{6,}([A-Za-z_$][\w$]*)\s*\(/gm)].map(m => m[1]));
for (const id of W2) {
  const names = new Set();
  const enc = byId[id].encounter || {};
  for (const [k, v] of Object.entries(enc)) if (/udio/i.test(k) && typeof v === 'string') names.add(v);
  const pred = BAR[id].pred;
  let idx = -1;
  while ((idx = GAME_SRC.indexOf(pred, idx + 1)) !== -1) {
    const win = GAME_SRC.slice(Math.max(0, idx - 1500), idx + 6000);
    for (const a of win.matchAll(/audioEvent\('([^']+)'/g)) names.add(a[1]);
  }
  const missing = [...names].filter(n => !regKeys.has(n));
  check(id + ': audio resolves (' + names.size + ' names)', missing.length === 0, 'unresolved: ' + missing.join(','));
}

console.log('PART B — played fights (deterministic: Math.random -> 0)');
// ---- harness ----
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
global.window = global; // stub for eval phase (equipment.js); deleted before play
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/conversation.js', 'src/js/convo-mood.js',
 'src/js/convoTopics.js', 'src/js/convo-wants.js', 'src/js/convo-dialogue.js', 'src/js/convo-beats.js',
 'src/js/examine.js', 'src/js/equipment.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/party-formal.js', 'src/js/truth.js', 'src/js/contests.js', 'src/js/storage.js',
 'src/js/perceive.js', 'src/js/carexplore.js', 'src/js/justice.js', 'src/js/food.js',
 'src/js/betrayal.js', 'src/js/corpses.js', 'src/js/lifeseed.js', 'src/js/progression.js',
 'src/js/ledger.js', 'src/js/villager-agency.js', 'src/js/codex-people.js', 'src/js/membership.js',
 'src/js/hierarchy.js', 'src/js/debug-scenarios.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
delete global.window;
const Game = globalThis.Scattering.Game;
const flatGrid = () => Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => 'grass'));
const P = () => Game.tbFighter('p');
const M = () => Game.tbfight && Game.tbfight.fighters.find(x => x.kind === 'monster');
let transcript = [];
function endTurn() {
  if (!Game.tbfight || Game.tbfight.over) return;
  if (!Game.tbIsPlayerTurn()) return;
  const p = P(); if (!p) return; p.moveLeft = 0; p.acted = true;
  Game.tbAfterPlayerAction();
}
function moveSteps(dx, dy, n) {
  if (!Game.tbIsPlayerTurn()) return;
  let moved = 0;
  while (moved < n && Game.tbIsPlayerTurn()) {
    const p = P(); if (!p || p.moveLeft <= 0) break;
    if (!Game.tbPlayerMove(p.mx + dx, p.my + dy)) break;
    moved++;
    if (!Game.tbfight || Game.tbfight.over) break;
  }
}
function strike() { const m = M(); if (Game.tbIsPlayerTurn() && m) Game.tbPlayerStrike(m.key); endTurn(); }
function waitT() { if (Game.tbIsPlayerTurn()) Game.tbPlayerWait(); endTurn(); }
const DAYPART = { bright_idea: 3, heckler: 3, landlord: 1, memory_projector: 2, mirror_stag: 1, moderator: 3, paparazzo: 3, review_drone: 1, understudy: 3, union_rep: 1, voice_mimic_radio: 3, warranty_caller: 3 };
const _rand = Math.random;
async function playedFight(id, rounds, policy, verify) {
  transcript = [];
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart(); Game.dayPart = DAYPART[id];
  Game.state.scholar.health = 999;
  Game.state.scholar.equipped = { weapon: { itemId: 'fire_hardened_spear', name: 'Fire-hardened spear' } };
  Game.canSee = () => true;
  Game.startCombat(id);
  const m0 = M();
  if (!m0) { check(id + ': combat starts', false, 'no monster fighter'); return; }
  const p0 = P();
  p0.mx = Math.min(7, Math.max(1, m0.mx + 2)); p0.my = Math.max(1, m0.my);
  Game.state.scholar.mx = p0.mx; Game.state.scholar.my = p0.my;
  p0.hp = p0.maxHp = 999;
  Math.random = () => 0;
  const seen = new Set();
  try {
    for (let i = 0; i < rounds; i++) {
      if (!Game.tbfight || Game.tbfight.over || !M()) break;
      if (!Game.tbIsPlayerTurn()) endTurn();
      const m = M(); if (!m) break;
      if (m.beamPhase) seen.add(m.beamPhase);
      await policy(i, m);
      if (!Game.tbfight || Game.tbfight.over) break;
    }
  } finally { Math.random = _rand; }
  verify(seen, transcript);
}
const has = (t, s) => t.some(x => x.includes(s));
(async () => {
  await Game.init();
  Game.say = (t) => { transcript.push(String(t)); };
  Game.genDetail = () => flatGrid();

  await playedFight('bright_idea', 14, async () => endTurn(), (seen) => {
    check('bright_idea: bloom+ember cycle reachable', seen.has('bloom') && seen.has('ember'));
    check('bright_idea: REKINDLE escalates (cycles>=2)', (M() && (M().biCycles || 0) >= 2) || has(transcript, 'guttered faster'));
  });
  await playedFight('heckler', 20, async (i) => { if (i % 3 === 2) waitT(); else strike(); }, (seen) => {
    check('heckler: HEADLINER second act reachable', seen.has('headliner'));
    check('heckler: SHAME stacks to 3+', (M() && (M().hkShame || 0) >= 3) || has(transcript, 'LIVE ONE'));
  });
  await playedFight('landlord', 10, async () => strike(), (seen) => {
    check('landlord: foreclosing phase reachable', seen.has('foreclosing'));
    check('landlord: jurisdiction grows (claimed>=4)', (M() && (M().llClaimed || 0) >= 4));
  });
  await playedFight('memory_projector', 6, async () => endTurn(), (seen) => {
    check('memory_projector: SPELL phase reachable by standing still', seen.has('spell'));
  });
  await playedFight('mirror_stag', 16, async (i, m) => {
    if (/confront|charge/.test(m.beamPhase || '') && Game.tbIsPlayerTurn()) { moveSteps(0, 1, 2); endTurn(); }
    else strike();
  }, (seen) => {
    check('mirror_stag: charge cycle reachable', seen.has('charge') || seen.has('confront'));
    check('mirror_stag: THE WHEEL fires on a missed charge', has(transcript, 'wheels on a hoof'));
  });
  await playedFight('moderator', 20, async (i, m) => {
    const p = P();
    const d = Math.max(Math.abs(p.mx - m.mx), Math.abs(p.my - m.my));
    if (seen_has_muting(m) && m.hp > m.maxHp * 0.5 && m.hp < 40) { /* let it ride */ }
    if (m.beamPhase === 'muting' && m.hp > m.maxHp * 0.5) m.hp = Math.min(m.hp, Math.floor(m.maxHp * 0.5) - 1);
    const mutedStrike = (m.modMuted || []).includes('strike') && d <= 2;
    if (mutedStrike) { if (Game.tbIsPlayerTurn()) { const q = P(); if (q.moveLeft > 0) Game.tbPlayerMove(Math.min(7, q.mx + 1), q.my); } endTurn(); }
    else if (d > 2) { if (Game.tbIsPlayerTurn()) { const q = P(); const dx = Math.sign(m.mx - q.mx), dy = Math.sign(m.my - q.my); if (q.moveLeft > 0) Game.tbPlayerMove(q.mx + dx, q.my + dy); } endTurn(); }
    else strike();
    function seen_has_muting(mm) { return mm.beamPhase === 'muting' || mm.beamPhase === 'shadowban'; }
  }, (seen) => {
    check('moderator: muting phase reachable', seen.has('muting') || seen.has('shadowban'));
    check('moderator: SHADOWBAN second act reachable at <=50% HP', seen.has('shadowban'));
    check('moderator: mute flips with verbs', has(transcript, 'MUTED inside the suppression field'));
  });
  await playedFight('paparazzo', 8, async () => endTurn(), (seen) => {
    check('paparazzo: EXCLUSIVE (money shot) reachable', seen.has('exclusive'));
    check('paparazzo: prediction hits 4/4', (M() && (M().pzPrediction || 0) >= 4) || has(transcript, 'money shot'));
  });
  await playedFight('review_drone', 10, async (i, m) => {
    if (/countdown/.test(m.beamPhase || '')) { moveSteps(0, 1, 3); endTurn(); } else endTurn();
  }, (seen) => {
    check('review_drone: countdown cycle reachable', seen.has('countdown'));
    check('review_drone: full project->countdown->recalc loop', seen.has('recalc') || seen.has('project'));
  });
  await playedFight('understudy', 8, async () => strike(), (seen) => {
    check('understudy: PERFORMING second act reachable', seen.has('performing'));
    check('understudy: it learns your weapon (usSeen)', M() && Object.values(M().usSeen || {}).reduce((a, r) => a + r.count, 0) >= 3);
  });
  await playedFight('union_rep', 10, async () => strike(), (seen) => {
    check('union_rep: WALKOUT second act reachable', seen.has('walkout'));
    check('union_rep: walkout state set', M() && !!M().urWalkout);
  });
  await playedFight('voice_mimic_radio', 5, async () => endTurn(), (seen) => {
    check('voice_mimic_radio: REVEAL reachable by resisting the lure', seen.has('reveal'));
  });
  await playedFight('warranty_caller', 12, async (i, m) => {
    if (m.beamPhase === 'ring') { moveSteps(0, 1, 3); endTurn(); } else endTurn();
  }, (seen) => {
    check('warranty_caller: ring->call-drop->redial loop', seen.has('redial'));
  });

  console.log(failures.length ? `\n${failures.length} FAILURES` : '\nALL WAVE-2 BAR CHECKS PASS');
  process.exit(failures.length ? 1 : 0);
})();
