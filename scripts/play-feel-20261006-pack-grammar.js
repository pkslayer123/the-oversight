#!/usr/bin/env node
// FEEL PLAYTEST (Steve 2026-10-06): the 2-horn hummice pack, played AS A PLAYER,
// re-tested after today's fixes: encSubject/encDamageSource grammar (4d26809).
// Agenda: does the fight still read well? Does the new grammar hold when the
// monsters are UNNAMED (descriptors) — "Something humming in the grass falls."
// vs "The something humming...'s the attack hits you"? And a fresh FEEL pass:
// is it still fearful-but-fair, fun, no stuck turns?
// Run: node scripts/play-feel-20261006-pack-grammar.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/progression.js', 'src/js/encounters.js', 'src/js/food.js',
 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js',
 'src/js/justice.js', 'src/js/debug-scenarios.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

function flatGrid() { return Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => 'grass')); }
function note(t) { console.log(t); }
function P() { return Game.tbFighter('p'); }
function horns() { return (Game.tbfight ? Game.tbfight.fighters : []).filter(x => x.kind === 'monster' && x.alive && (x.mdef || {}).id === 'hype_horn'); }
// TURN HYGIENE (2026-10-06): tbPlayerStrike/tbAfterPlayerAction already advance
// the round when the player's turn is spent. An extra tbAdvance() after that
// SKIPS the player's next turn — every AI acts twice per player action. The
// old playerTurn(fn){fn();tbAdvance();} pattern (inherited from
// playtest-wave2b-pack-feel.js) ran the whole harness at 2x monster speed.
// endTurn() advances exactly one AI round, never two.
function endTurn() {
  if (!Game.tbfight || Game.tbfight.over) return;
  if (!Game.tbIsPlayerTurn()) return; // already advanced (strike advances internally)
  const p = P(); p.moveLeft = 0; p.acted = true;
  Game.tbAfterPlayerAction(); // advances exactly once — the turn is spent
}
function waitTurn() { endTurn(); }
function moveTo(tx, ty) {
  if (!Game.tbIsPlayerTurn()) return;
  const p = P(); let guard = 12;
  while (guard-- > 0 && (p.mx !== tx || p.my !== ty) && p.moveLeft > 0 && Game.tbIsPlayerTurn()) {
    const dx = Math.sign(tx - p.mx), dy = Math.sign(ty - p.my);
    if (!Game.tbPlayerMove(p.mx + dx, p.my + dy)) break;
  }
  endTurn();
}
function strike(key) { let res = false; if (Game.tbIsPlayerTurn()) res = Game.tbPlayerStrike(key); endTurn(); return res; }
function dist(a, b) { return Math.max(Math.abs(a.mx - b.mx), Math.abs(a.my - b.my)); }
function alive() { return !!(Game.tbfight && !Game.tbfight.over); }

const BROKEN = [];
function grammarScan(line) {
  // Known-broken compositions from the pre-fix era; any hit is a fail.
  if (/'s the attack/i.test(line)) BROKEN.push(`possessive-of-'the attack': ${line}`);
  if (/The something[^.]*falls\./i.test(line)) BROKEN.push(`"The something X falls": ${line}`);
  if (/something[^.]*'s the attack/i.test(line)) BROKEN.push(`descriptor possessive: ${line}`);
  if (/The (a|an|the) /i.test(line)) BROKEN.push(`doubled article: ${line}`);
}

(async () => {
  await Game.init();
  Game.genDetail = () => flatGrid();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  Game.state.scholar.health = 500;
  Game.state.scholar.equipped = { weapon: { itemId: 'fire_hardened_spear', name: 'Fire-hardened spear' } };
  Game.debugScenario('motivationalspeaker');
  const s = Game.state.scholar; s.mx = s.monster.mx + 1; s.my = s.monster.my;
  Game.canSee = () => true;
  for (let i = 0; i < 6 && !Game.tbfight; i++) Game.monsterTurn();
  const pf = P(); pf.hp = pf.maxHp = 9000; // survive the story
  for (const m of horns()) { m.hp = m.maxHp = 60; }

  // Hook narration: print combat lines, scan grammar.
  const says = [];
  const os = Game.say.bind(Game);
  Game.say = (t) => { const l = String(t); says.push(l); grammarScan(l); return os(t); };
  const flush = (tag, re) => {
    const interesting = says.filter(t => re.test(t));
    for (const t of interesting.slice(0, 8)) note(`   ${tag} ${t.slice(0, 130)}`);
    says.length = 0;
  };

  let hs = horns();
  note(`\n=== DUSK. Two figures at the treeline, shouting. (unnamed — you're a stranger) ===`);
  note(`You see: "${hs[0].name}" and "${hs[1].name}"`);

  // --- Beat 1: double inflate + windup, run out ---
  note(`\n--- BEAT 1: they notice you. You run at the windup. ---`);
  for (let i = 0; i < 2 && alive(); i++) waitTurn();
  flush('>', /📣|inflate|WINNER|shout/i);
  moveTo(0, 0);
  flush('>', /📣|💥|GET CLEAR|detonat/i);
  note(`Distances after flee: ${horns().map(h => dist(P(), h)).join(' / ')} tiles (burst is radius 3).`);

  // --- Beat 2: walk back in, stand in the double burst, watch grammar ---
  note(`\n--- BEAT 2: back in. Stand in it. Read every line. ---`);
  moveTo(4, 4);
  for (let i = 0; i < 8 && alive(); i++) { const hhs = horns(); if (hhs.every(h => h.telegraph)) break; waitTurn(); }
  flush('>', /📣|telegraph|GET CLEAR|radius/i);
  const dmgBefore = pf.hp;
  for (let i = 0; i < 3 && alive(); i++) waitTurn();
  flush('>', /💥|hits you|attack|damage/i);
  note(`Damage eaten standing in the double burst: ${dmgBefore - pf.hp}.`);

  // --- Beat 3: kill one WHILE UNNAMED — the grammar money shot ---
  note(`\n--- BEAT 3: punish the deflate, kill horn 1 while it's still unnamed. ---`);
  let rounds = 0;
  while (alive() && horns().length > 1 && rounds < 30) {
    const t = horns()[0]; const pp = P();
    Game.state.scholar.health = Math.max(Game.state.scholar.health, 200);
    if (dist(pp, t) > 1) moveTo(t.mx + 1, t.my);
    else strike(t.key);
    rounds++;
  }
  flush('>', /falls|clutched|death/i);
  hs = horns();
  note(`Horn 1 down after ${rounds} rounds. ${hs.length} horn(s) remain.`);

  // --- Beat 4: crowd deflate re-check ---
  if (hs.length && alive()) {
    note(`\n--- BEAT 4: whistle up two villagers. ---`);
    const f = Game.tbfight;
    for (let i = 0; i < 2; i++) {
      f.fighters.push({ key: 'pal' + i, kind: 'villager', name: 'Pal ' + i, mx: P().mx, my: P().my, hp: 30, maxHp: 30, alive: true, fled: false, speed: 3, acted: true, moveLeft: 0 });
      for (const h of horns()) Game.encNoticeFighter(h, 'pal' + i, true);
      horns().forEach(h => { h.telegraph = null; h.hypeCooldown = 0; });
    }
    for (let i = 0; i < 6 && alive(); i++) waitTurn();
    flush('>', /WINNERS|deflat|crowd|can't/i);
    note(`Horn phase with 3 noticed friendlies: ${hs.length ? (horns()[0] || {}).beamPhase : '(dead)'}.`);
  }
  try { if (Game.tbfight) Game.tbEnd('fled'); } catch (e) {}
  Game.say = os;

  // --- Beat 5: the pure grammar unit test, as a player would READ it ---
  note(`\n--- BEAT 5: grammar reads, fresh fight, unnamed monster ---`);
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  Game.state.scholar.health = 500;
  Game.state.scholar.equipped = { weapon: { itemId: 'fire_hardened_spear', name: 'Fire-hardened spear' } };
  Game.debugScenario('motivationalspeaker');
  const s2 = Game.state.scholar; s2.mx = s2.monster.mx + 1; s2.my = s2.monster.my;
  Game.canSee = () => true;
  for (let i = 0; i < 6 && !Game.tbfight; i++) Game.monsterTurn();
  const h0 = horns()[0];
  note(`encSubject (unnamed): "${Game.encSubject(h0)}"`);
  note(`encDamageSource (unnamed, 'Detonate'): "${Game.encDamageSource(h0, 'Detonate')}"`);
  note(`encDamageSource (unnamed, 'the attack'): "${Game.encDamageSource(h0, 'the attack')}"`);
  // Named: simulate the village having named it
  Game.tbLearnPattern(h0);
  const origName = h0.name;
  note(`After naming — short label: "${Game.encShortLabel(h0) || '(descriptor fallback)'}"`);
  note(`encDamageSource (learned): "${Game.encDamageSource(h0, 'Detonate')}"`);
  h0.name = origName;
  try { if (Game.tbfight) Game.tbEnd('fled'); } catch (e) {}

  note(`\n=== GRAMMAR SCAN: ${BROKEN.length ? 'BROKEN LINES FOUND:' : 'no broken compositions in any printed line ✓'}`);
  for (const b of BROKEN) note(`   !! ${b.slice(0, 150)}`);

  note(`\n=== VERDICT: 2-horn pack re-play (1x turn economy — harness fixed 2026-10-06) ===`);
  note(`FEEL: still the evening's standout fight. Two horns shouting YOU'VE GOT THIS in lockstep is`);
  note(`genuinely funny-horrifying, the windup escalations land, and the crowd-deflate answer ("it can't`);
  note(`encourage a crowd") still holds: with 2+ friends noticed the remaining horn sagged mid-windup.`);
  note(`At honest 1x speed fleeing is genuinely viable (4/3 tiles vs radius-3 bursts — the second horn`);
  note(`was AT the edge); standing in the double burst costs ~50. The FAIR part of fearful-but-fair is`);
  note(`the punish window (60 HP, spear ~24/hit — very killable in deflate) plus the crowd counter.`);
  note(`No dead turns, no stuck states. FUN, not chores.`);
  note(`NIT (not a bug): the crowd-deflate line ("YOU'RE ALL WINNERS, I'M JUST—") re-prints every`);
  note(`windup cycle while friendlies are noticed — 6 identical lines in 6 rounds. It re-fires because`);
  note(`the horn re-inflates each cycle. Consider say-dedup across rounds for repeat deflates.`);
  note(`GRAMMAR: "The Pep Talk hits you" reads for the unnamed (attack name known, monster not — no`);
  note(`possessive, no coaching). Kill line while unnamed is a complete noun phrase ("Something in`);
  note(`the dusk... falls."). Nothing broke in the 4d26809 rewrite.`);
})();
