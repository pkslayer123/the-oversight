#!/usr/bin/env node
// PROOF TEST (Steve 2026-10-06): knowledge-leak fix pass — the 7 REAL leaks
// from evidence/2026-10-06/knowledge-gating-audit2-20261006.md (committed in
// 2d39317).
//
// Steve's law: "If you don't know, it doesn't show." Each check asserts the
// invariant: GATED content (attack true names, exact numbers, mechanics
// coaching) must NEVER appear in a say while the codex doesn't know the
// pattern. known-state is sampled AT SAY TIME, so the invariant holds
// regardless of when learning happens.
//
// BEFORE (current worktree, patch NOT applied): the leak checks FAIL —
//   each demonstrates one live leak on a fresh/unknowing codex.
// AFTER (knowledge-leak-fixes-20261006.patch applied): all green — beats show
//   dread variants while unknowing, coached variants once learned; the
//   performing beat grants tbLearnPattern at the transition (teach-moment,
//   like the heckler headliner), so its coaching is earned, not leaked.
//
// Leaks covered:
//   1a. understudy rehearsing beat: "(It copies at 50% — it learns fast.)"
//   1b. understudy performing beat: "OPENING STEAL: your next ..." + exact
//       observation count + "(It copies at 80% ...)"
//   1c. understudy steal resolution: "(OPENING STEAL: anticipated — half
//       damage. Switch weapons.)"
//   1d. understudy improv beat: "(DESPERATE IMPROV: it chains ...)"
//   1e. understudy improv hit line: raw "DESPERATE IMPROV" attack name
//   2.  union_rep picket summon: wave-1 TRUE name in narration
//   3.  union_rep walkout: "(Allies +8 damage. The rep is UNTARGETABLE ...)"
//   4.  paparazzo exclusive: "(PREDICTION 4: the flash is now UNBLOCKABLE ...)"
//   5.  paparazzo flash resolve (hit + miss): "(Prediction N/4 — ...)"
//   6.  paparazzo still beat: "(Prediction climbing double.)"
//   7.  landlord foreclosure: "(Its healing climbs too — end this.)"
//
// Run: node scripts/test-knowledge-leak-fixes-20261006.js
// (plain node, NOT jest — never run concurrent jest on the hot tree)
// To validate the AFTER state without touching the dirty worktree:
//   GAMEJS=/tmp/game-new.js node scripts/test-knowledge-leak-fixes-20261006.js
// (GAMEJS pattern borrowed from test-landlord-lease.js)
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
const PRE = ['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js'];
const POST = ['src/js/progression.js', 'src/js/encounters.js', 'src/js/food.js',
 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js',
 'src/js/justice.js', 'src/js/debug-scenarios.js'];
const GAMEJS = process.env.GAMEJS || 'src/js/game.js';
const gameJsPath = path.isAbsolute(GAMEJS) ? GAMEJS : path.join(ROOT, GAMEJS);
PRE.forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
eval(fs.readFileSync(gameJsPath, 'utf8'));
POST.forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;
const S = globalThis.Scattering;

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}
function flatGrid() { return Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => 'grass')); }
const P = () => Game.tbFighter('p');
const M = (id) => Game.tbfight && Game.tbfight.fighters.find(x => x.kind === 'monster' && (!id || (x.mdef && x.mdef.id === id)));
// TURN HYGIENE (AGENTS.md): advance ONLY if still the player's turn.
function endTurn() {
  if (!Game.tbfight || Game.tbfight.over) return;
  if (!Game.tbIsPlayerTurn()) return;
  const p = P(); p.moveLeft = 0; p.acted = true;
  Game.tbAfterPlayerAction();
}
function endFight() { try { if (Game.tbfight && !Game.tbfight.over) Game.tbEnd('fled'); } catch (e) {} }

// say log with known-state sampled AT SAY TIME for the section's monster.
let curMid = null, curAtk = null;
let sayLog = [];
function setSection(mid, atk) { curMid = mid; curAtk = atk; sayLog = []; }
const saw = (re) => sayLog.some(s => re.test(s.text));
// The invariant: gated content must not appear while unknowing.
function gated(name, sigRe) {
  const bad = sayLog.filter(s => sigRe.test(s.text) && !s.known);
  check(name + ' — no ungated coaching', bad.length === 0,
    bad.length ? `LEAK while unknowing: "${bad[0].text.slice(0, 100)}"` : '');
}
const SPEAR = { itemId: 'fire_hardened_spear', name: 'Fire-hardened spear' };
function placeNextTo(pl, m) {
  let px = m.mx + 1; if (px > 7) px = m.mx - 1;
  pl.mx = Math.min(7, Math.max(1, px)); pl.my = Math.min(7, Math.max(1, m.my));
  Game.state.scholar.mx = pl.mx; Game.state.scholar.my = pl.my;
}

(async () => {
  await Game.init();
  // SHIM (2026-10-06): sibling churn broke newGame — S.state.newState() no
  // longer creates village.rosterChars, which newGame writes. Re-add the
  // field here so the harness can drive combat; NOT a game fix.
  const origNewState = S.state.newState;
  S.state.newState = function () {
    const s = origNewState();
    s.village = s.village || {};
    if (!s.village.rosterChars) s.village.rosterChars = {};
    return s;
  };
  Game.say = (t) => { sayLog.push({ text: String(t), known: curMid ? Game.tbPatternKnown(curMid, curAtk) : null }); };
  Game.genDetail = () => flatGrid();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart(); Game.dayPart = 1;
  Game.state.scholar.health = 500;
  Game.state.scholar.equipped = { weapon: Object.assign({}, SPEAR) };
  Game.canSee = () => true;
  const realLearn = Game.tbLearnPattern;

  // ================= 1a/1b/1c UNDERSTUDY: natural drive, learning held off ====
  // (tbLearnPattern suppressed so every beat is tested with known=false —
  // the beats must gate themselves; §1b's grant is tested separately below.)
  console.log('\n[1a/1b/1c] understudy rehearsing / performing / steal (unknowing)');
  setSection('understudy', 'Your Move');
  Game.state.codex.monsters = {};
  Game.tbLearnPattern = function () {};
  Game.startCombat('understudy');
  let m = M('understudy'); m.hp = m.maxHp = 500;
  let pl = P(); pl.hp = pl.maxHp = 9999;
  for (let r = 0; r < 14 && Game.tbfight && !Game.tbfight.over; r++) {
    const mm = M('understudy');
    if (!mm || !mm.alive) break;
    placeNextTo(pl, mm);
    if (Game.tbIsPlayerTurn() && !pl.acted) Game.tbPlayerStrike(mm.key);
    endTurn();
    if (saw(/It knew that one was coming/)) break; // steal fired; got them all
  }
  Game.tbLearnPattern = realLearn;
  check('rehearsing beat fired', saw(/It is doing the thing you do before you do it/));
  gated('rehearsing beat', /\(It copies at 50%/);
  check('performing beat fired', saw(/I've got it now/));
  gated('performing beat (exact count + OPENING STEAL)', /OPENING STEAL: your next|\(It copies at 80%/);
  check('steal resolution fired', saw(/It knew that one was coming/));
  gated('steal resolution', /OPENING STEAL: anticipated/);
  endFight();

  // ================= 1b-grant: performing beat teaches (teach-moment) =========
  console.log('\n[1b-grant] understudy performing beat grants the pattern');
  setSection('understudy', 'Your Move');
  Game.state.codex.monsters = {};
  Game.startCombat('understudy');
  m = M('understudy'); m.hp = m.maxHp = 500;
  pl = P(); pl.hp = pl.maxHp = 9999;
  pl.mx = 4; pl.my = 4; m.mx = 5; m.my = 4;
  Game.state.scholar.mx = 4; Game.state.scholar.my = 4;
  m.usSeen = { 'Fire-hardened spear': { count: 3, dmg: 25 } };
  m.beamPhase = 'watching'; m.telegraph = null; m.usStealArmed = null;
  endTurn(); // performing transition fires here; no telegraph pending to resolve
  check('performing beat fired', saw(/I've got it now/));
  check('performing beat grants tbLearnPattern (teach-moment)',
    Game.tbPatternKnown('understudy', 'Your Move') === true,
    'codex still unknowing right after the beat');
  endFight();

  // ================= 1d/1e UNDERSTUDY: forced improv, unknowing ================
  console.log('\n[1d/1e] understudy improv beat + hit (unknowing)');
  setSection('understudy', 'Your Move');
  Game.state.codex.monsters = {};
  Game.tbLearnPattern = function () {};
  Game.startCombat('understudy');
  m = M('understudy'); m.hp = m.maxHp = 500;
  pl = P(); pl.hp = pl.maxHp = 9999;
  pl.mx = 4; pl.my = 4; m.mx = 5; m.my = 4;
  Game.state.scholar.mx = 4; Game.state.scholar.my = 4;
  m.usSeen = { 'Fire-hardened spear': { count: 3, dmg: 25 }, 'Sharp stick': { count: 2, dmg: 10 } };
  m.usPerformed = true; m.hp = 1; m.telegraph = null; m.beamPhase = 'performing'; m.usStealArmed = null;
  endTurn(); // improv phase beat
  check('improv beat fired', saw(/No no no/));
  gated('improv beat', /DESPERATE IMPROV: it chains/);
  for (let r = 0; r < 8 && Game.tbfight && !Game.tbfight.over && m.alive; r++) {
    endTurn(); // improv telegraph declares then resolves
    if (saw(/finds you\. Badly\. Frantically\./)) break;
  }
  Game.tbLearnPattern = realLearn;
  check('improv hit fired', saw(/finds you\. Badly\. Frantically\./));
  gated('improv hit (attack true name)', /'s DESPERATE IMPROV — your/);
  endFight();

  // ================= 2 UNION_REP picket: no true names ========================
  console.log('\n[2] union_rep picket summon (true-name check)');
  setSection('union_rep', 'Grievance Filed');
  Game.state.codex.monsters = {};
  Game.startCombat('union_rep');
  m = M('union_rep'); m.hp = m.maxHp = 300;
  pl = P(); pl.hp = pl.maxHp = 9999;
  pl.mx = 4; pl.my = 4; m.mx = 6; m.my = 4;
  Game.state.scholar.mx = 4; Game.state.scholar.my = 4;
  endTurn(); // organizing + picket summon
  const picketSay = sayLog.find(s => s.text.indexOf('"PICKET LINE!"') === 0);
  check('picket summon fired', !!picketSay);
  const w1Names = (Game.data.monsters || []).filter(x => (x.wave || 1) === 1 && x.id !== 'bulldozer').map(x => x.name);
  const leakedName = picketSay && w1Names.find(n => picketSay.text.includes(n));
  check('picket say shows no wave-1 true name', !!picketSay && !leakedName,
    leakedName ? `LEAK: true name "${leakedName}" in narration` : 'picket say missing');
  endFight();

  // ================= 3 UNION_REP walkout (turn 1, unknowing) ===================
  console.log('\n[3] union_rep walkout (unknowing)');
  setSection('union_rep', 'Grievance Filed');
  Game.state.codex.monsters = {};
  Game.startCombat('union_rep');
  m = M('union_rep'); m.hp = m.maxHp = 300; m.hp = Math.floor(m.maxHp / 2); // walkout on turn 1
  pl = P(); pl.hp = pl.maxHp = 9999;
  pl.mx = 4; pl.my = 4; m.mx = 6; m.my = 4;
  Game.state.scholar.mx = 4; Game.state.scholar.my = 4;
  endTurn();
  check('walkout beat fired', saw(/WALKOUT! WALKOUT/));
  gated('walkout beat (+8 / UNTARGETABLE)', /Allies \+8 damage|UNTARGETABLE while coordinating/);
  endFight();

  // ================= 4/5/6 PAPARAZZO (learning held off) ======================
  console.log('\n[4/5/6] paparazzo still / flash / exclusive (unknowing)');
  setSection('paparazzo', 'Flash Photography');
  Game.state.codex.monsters = {};
  Game.tbLearnPattern = function () {};
  Game.startCombat('paparazzo');
  m = M('paparazzo'); m.hp = m.maxHp = 500;
  pl = P(); pl.hp = pl.maxHp = 9999;
  pl.mx = 4; pl.my = 4; m.mx = 6; m.my = 4; // mid-range; player never moves
  Game.state.scholar.mx = 4; Game.state.scholar.my = 4;
  for (let r = 0; r < 8 && Game.tbfight && !Game.tbfight.over; r++) {
    endTurn();
    if (saw(/The money shot/)) break;
  }
  check('still beat fired', saw(/Hold still\. Yes\. Just like that\./));
  gated('still beat (double-climb mechanic)', /\(Prediction climbing double\.\)/);
  check('flash resolve fired', saw(/FLASH\. The world goes white/));
  gated('flash resolve (prediction parenthetical)', /\(Prediction \d+\/4 — it learns your dodge\.\)/);
  check('exclusive beat fired', saw(/The money shot/));
  gated('exclusive beat (PREDICTION 4 / UNBLOCKABLE)', /PREDICTION 4/);
  endFight();

  // ---- 5b paparazzo flash MISS variant ----
  console.log('\n[5b] paparazzo flash miss variant (unknowing)');
  setSection('paparazzo', 'Flash Photography');
  Game.state.codex.monsters = {};
  Game.tbLearnPattern = function () {};
  Game.startCombat('paparazzo');
  m = M('paparazzo'); m.hp = m.maxHp = 500;
  pl = P(); pl.hp = pl.maxHp = 9999;
  pl.mx = 1; pl.my = 4; m.mx = 5; m.my = 4;
  Game.state.scholar.mx = 1; Game.state.scholar.my = 4;
  endTurn(); // declare (cells centered on player)
  pl.mx = 7; pl.my = 4; Game.state.scholar.mx = 7; Game.state.scholar.my = 4; // clear of the cells
  endTurn(); // resolve -> miss variant
  Game.tbLearnPattern = realLearn;
  check('flash miss variant fired', saw(/Click\. It missed/));
  gated('flash miss (prediction parenthetical)', /\(Prediction \d+\/4 anyway/);
  endFight();

  // ================= 7 LANDLORD foreclosure (unknowing) ========================
  console.log('\n[7] landlord foreclosure (unknowing)');
  setSection('landlord', 'Eviction Notice');
  Game.state.codex.monsters = {};
  Game.startCombat('landlord');
  m = M('landlord'); m.hp = m.maxHp = 300;
  pl = P(); pl.hp = pl.maxHp = 9999;
  pl.mx = 2; pl.my = 4; m.mx = 6; m.my = 4;
  Game.state.scholar.mx = 2; Game.state.scholar.my = 4;
  m.beamPhase = 'claiming'; // skip the phase setup that resets ll* counters
  m.llClaimed = 2; m.llAddendaAt = 0; m.llSinceWave = 0; m.llAddenda = 1;
  endTurn(); // addenda wave 2 -> FORECLOSURE
  check('foreclosure beat fired', saw(/FORECLOSURE PROCEEDINGS/));
  gated('foreclosure beat (healing coaching)', /\(Its healing climbs too/);
  endFight();

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS FAIL', e); process.exit(1); });
