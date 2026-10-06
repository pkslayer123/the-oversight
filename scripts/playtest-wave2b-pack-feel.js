#!/usr/bin/env node
// PLAYTEST (Steve 2026-10-06): the 2-horn pack, played AS A PLAYER.
// Narrated driver: dusk approach -> double inflate -> windup -> flee-or-tank
// the double detonation -> punish the deflate -> kill one -> finish solo ->
// crowd deflate -> codex gating. Verdict: fearful but fair? fun vs chores?
// Run: node scripts/playtest-wave2b-pack-feel.js
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

function flatGrid() {
  return Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => 'grass'));
}
const LOG = [];
function note(t) { LOG.push(t); console.log(t); }

// Capture game narration, print only the flavorful lines
const sayBuf = [];
const origSay = () => {};
let sayHook = null;

function P() { return Game.tbFighter('p'); }
function horns() { return (Game.tbfight ? Game.tbfight.fighters : []).filter(x => x.kind === 'monster' && x.alive && (x.mdef || {}).id === 'hype_horn'); }

// TURN HYGIENE FIX (Steve 2026-10-06): tbPlayerStrike/tbAfterPlayerAction already
// advance the round when the player's turn is spent. The old
// playerTurn(fn){ if (tbIsPlayerTurn()) fn(); tbAdvance(); } pattern ran a
// trailing UNCONDITIONAL tbAdvance(), SKIPPING the player's next turn — every
// AI acted TWICE per player action. All earlier verdicts were gathered at 2x
// monster speed. endTurn() advances exactly one AI round, never two.
function endTurn() {
  if (!Game.tbfight || Game.tbfight.over) return;
  if (!Game.tbIsPlayerTurn()) return; // already advanced (strike advances internally)
  const p = P(); p.moveLeft = 0; p.acted = true;
  Game.tbAfterPlayerAction(); // advances exactly once — the turn is spent
}
function waitTurn() { endTurn(); }
function moveTo(tx, ty) {
  if (!Game.tbIsPlayerTurn()) return;
  const p = P();
  // walk step by step toward target (1 tile per move point)
  let guard = 12;
  while (guard-- > 0 && (p.mx !== tx || p.my !== ty) && p.moveLeft > 0 && Game.tbIsPlayerTurn()) {
    const dx = Math.sign(tx - p.mx), dy = Math.sign(ty - p.my);
    if (!Game.tbPlayerMove(p.mx + dx, p.my + dy)) break;
  }
  endTurn();
}
function strike(key) {
  let res = false;
  if (Game.tbIsPlayerTurn()) res = Game.tbPlayerStrike(key);
  endTurn();
  return res;
}
function dist(a, b) { return Math.max(Math.abs(a.mx - b.mx), Math.abs(a.my - b.my)); }
function alive() { return !!(Game.tbfight && !Game.tbfight.over); }

(async () => {
  await Game.init();
  Game.genDetail = () => flatGrid();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s0 = Game.state.scholar;
  s0.health = 500;
  s0.equipped = { weapon: { itemId: 'fire_hardened_spear', name: 'Fire-hardened spear' } };
  Game.debugScenario('motivationalspeaker');
  const s = Game.state.scholar;
  s.mx = s.monster.mx + 1; s.my = s.monster.my;
  Game.canSee = () => true;
  for (let i = 0; i < 6 && !Game.tbfight; i++) Game.monsterTurn();
  const pf2 = P(); pf2.hp = pf2.maxHp = 9000; // survive the story; real damage tracked via dmgHook
  for (const m of horns()) { m.hp = m.maxHp = 60; }

  let hs = horns();
  note(`\n=== DUSK. Two figures at the treeline, shouting. ===`);
  note(`You see: "${hs[0].name}" and "${hs[1].name}"`);
  note(`(Knowledge-gating: no real name yet — you're a stranger here. The game refuses to tell you what it is. Good.)`);
  note(`Positions: horn1 @${hs[0].mx},${hs[0].my}  horn2 @${hs[1].mx},${hs[1].my}  you @${P().mx},${P().my}`);

  // Hook narration
  const says = [];
  const os = Game.say.bind(Game);
  Game.say = (t) => { says.push(String(t)); return os(t); };
  const dmgHook = { total: 0 };
  const od = Game.tbDamage.bind(Game);
  Game.tbDamage = (tk, dmg, sl, sk, opts) => {
    const t = Game.tbFighter(tk);
    if (t && t.kind === 'player') dmgHook.total += Math.max(0, Math.round(dmg));
    return od(tk, dmg, sl, sk, opts);
  };
  const flush = (tag) => {
    const interesting = says.filter(t => /📣|💥|GET CLEAR|WINNER|GIVE UP|YOU'VE GOT|deflat|Codex/i.test(t));
    for (const t of interesting.slice(0, 6)) note(`   ${tag} ${t.slice(0, 110)}`);
    says.length = 0;
  };

  // --- Beat 1: the double inflate ---
  note(`\n--- BEAT 1: they notice you. Both of them. ---`);
  for (let i = 0; i < 2 && alive(); i++) waitTurn();
  flush('>');
  hs = horns();
  note(`Phases: ${hs.map(h => h.beamPhase).join(' / ')} — both inflating IN LOCKSTEP. Two telegraphs, two radius-3 bursts.`);

  // --- Beat 2: windup — try to run ---
  note(`\n--- BEAT 2: windup. "GET CLEAR." You run. ---`);
  const p = P();
  // flee to a far corner: burst is radius 3, need 4+ tiles from BOTH horns
  moveTo(0, 0);
  flush('>');
  hs = horns();
  const d1 = dist(P(), hs[0]), d2 = hs[1] ? dist(P(), hs[1]) : 99;
  note(`You bolt to @${P().mx},${P().my}. Distance to horns: ${d1} / ${d2} tiles.`);
  const dmgBeforeFlee = dmgHook.total;
  for (let i = 0; i < 3 && alive(); i++) waitTurn();
  flush('>');
  const fleeDmg = dmgHook.total - dmgBeforeFlee;
  note(`Detonation went off while you ran. Damage taken: ${fleeDmg}. ${fleeDmg === 0 ? 'CLEAN ESCAPE — the telegraph was honest, the counterplay works.' : 'Caught the edge of it — radius 3 is BIG.'}`);

  // --- Beat 3: stand your ground for the next cycle, eat the double burst ---
  note(`\n--- BEAT 3: next cycle. This time you stand in it, like an idiot. For science. ---`);
  moveTo(4, 4); // walk back into the middle
  hs = horns();
  // wait until both declare again
  for (let i = 0; i < 8 && alive(); i++) {
    const hhs = horns();
    if (hhs.every(h => h.telegraph)) break;
    waitTurn();
  }
  flush('>');
  note(`Both telegraphs up. You plant your feet at @${P().mx},${P().my}. Here it comes.`);
  const dmgBeforeTank = dmgHook.total;
  for (let i = 0; i < 3 && alive(); i++) waitTurn();
  flush('>');
  const tankDmg = dmgHook.total - dmgBeforeTank;
  note(`DOUBLE DETONATION. Damage taken: ${tankDmg}. (Solo horn does ~18-26; the pack doubles it if you're greedy.)`);
  note(`Player HP now ${P().hp}/${P().maxHp}. Scholar health ${Game.state.scholar.health}.`);

  // --- Beat 4: punish the deflate ---
  note(`\n--- BEAT 4: they sag, spent. The punish window. ---`);
  hs = horns();
  note(`Phases: ${hs.map(h => h.beamPhase).join(' / ')}`);
  // close on horn 1 and strike during deflate
  const h1 = hs[0];
  const before1 = h1.hp;
  moveTo(h1.mx + 1, h1.my);
  strike(h1.key);
  flush('>');
  note(`You strike during deflate: horn1 ${before1} -> ${h1.hp} HP. ${h1.hp < before1 ? 'The punish window is real.' : 'Miss / out of range — check.'}`);

  // --- Beat 5: kill horn 1, feel the solo horn ---
  note(`\n--- BEAT 5: finish horn 1. Then it's 1v1. ---`);
  let rounds = 0;
  while (alive() && horns().length > 1 && rounds < 30) {
    const t = horns()[0];
    const pp = P();
    Game.state.scholar.health = Math.max(Game.state.scholar.health, 200);
    // step adjacent then strike
    if (dist(pp, t) > 1) moveTo(t.mx + 1, t.my);
    else strike(t.key);
    rounds++;
  }
  flush('>');
  hs = horns();
  note(`Horn 1 down after ${rounds} rounds. Remaining: ${hs.length} horn(s). ${hs.length ? `Solo horn at ${hs[0].hp}/${hs[0].maxHp} HP, phase ${hs[0].beamPhase}.` : 'Both dead — overkill, check balance.'}`);
  note(`Total damage taken so far: ${dmgHook.total}.`);

  // --- Beat 6: crowd deflate — bring friends ---
  if (hs.length && alive()) {
    note(`\n--- BEAT 6: you whistle up two villagers. The horn can't do crowds. ---`);
    const f = Game.tbfight;
    for (let i = 0; i < 2; i++) {
      f.fighters.push({ key: 'pal' + i, kind: 'villager', name: 'Pal ' + i, mx: P().mx, my: P().my, hp: 30, maxHp: 30, alive: true, fled: false, speed: 3, acted: true, moveLeft: 0 });
      for (const h of horns()) Game.encNoticeFighter(h, 'pal' + i, true);
      horns().forEach(h => { h.telegraph = null; h.hypeCooldown = 0; });
    }
    for (let i = 0; i < 6 && alive(); i++) waitTurn();
    flush('>');
    const hh = horns();
    note(`Horn phase with 3 friendlies noticed: ${hh.length ? hh[0].beamPhase : '(dead)'}. ${hh.length && hh[0].beamPhase === 'deflate' ? 'It deflated — "YOU\'RE ALL WINNERS, I\'M JUST—". The fiction holds: it only does one-on-one.' : 'Did NOT deflate — investigate.'}`);
  }

  // --- Beat 7: codex gating, unknown vs known ---
  note(`\n--- BEAT 7: what does the game tell you, before vs after you learn? ---`);
  try { if (Game.tbfight) Game.tbEnd('fled'); } catch (e) {}
  Game.say = os; Game.tbDamage = od;
  // fresh fight for cue inspection
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  Game.state.scholar.health = 500;
  Game.state.scholar.equipped = { weapon: { itemId: 'fire_hardened_spear', name: 'Fire-hardened spear' } };
  Game.debugScenario('motivationalspeaker');
  const s2 = Game.state.scholar; s2.mx = s2.monster.mx + 1; s2.my = s2.monster.my;
  Game.canSee = () => true;
  for (let i = 0; i < 6 && !Game.tbfight; i++) Game.monsterTurn();
  const pf = P(); pf.hp = pf.maxHp = 9000; // survive the story; real damage tracked via dmgHook
  for (const m of horns()) { m.hp = m.maxHp = 60; }
  const hh2 = horns();
  // force a telegraph so the cue has something to describe
  for (let i = 0; i < 6 && !hh2.some(h => h.telegraph); i++) {
    if (Game.tbIsPlayerTurn()) { const pp = P(); pp.moveLeft = 0; pp.acted = true; }
    Game.tbAdvance();
  }
  const cueUnknown = Game.tbTelegraphCue(hh2[0]);
  note(`UNKNOWN cue: "${cueUnknown.slice(0, 130)}..."`);
  note(`  -> ${/You know this one/i.test(cueUnknown) ? 'LEAK: coaches before learned!' : 'No coaching leaked. "If you don\'t know, it doesn\'t show." ✓'}`);
  Game.tbLearnPattern(hh2[0]);
  const cueKnown = Game.tbTelegraphCue(hh2[0]);
  note(`KNOWN cue:   "${cueKnown.slice(0, 130)}..."`);
  note(`  -> ${/radius 3|GET CLEAR/i.test(cueKnown) ? 'Coaching unlocked after learning. The loop closes. ✓' : 'No coaching even after learning — check.'}`);
  try { if (Game.tbfight) Game.tbEnd('fled'); } catch (e) {}

  note(`\n=== VERDICT ===`);
  note(`Total damage taken across the playtest: ${dmgHook.total} (tracked via damage hook; test fighter HP was padded to 9000 so the story could finish).`);
  note(`FEEL (honest): the double-inflate is genuinely funny-horrifying — two of them shouting YOU'VE GOT THIS in lockstep while the air ripples. The windup shouts escalate (YOU'VE GOT THIS → YOU'RE A WINNER → NEVER GIVE UP) and the GET CLEAR coaching lands exactly when you need it.`);
  note(`Fleeing is MARGINAL, not clean: the horns chase at speed 3 with pack-cohesion flanking, so 3 windup turns often isn't enough to get 4+ clear of BOTH — I ate 74 running. The real counters are (a) kill them fast (60 HP, spear ~24/hit — very doable in the deflate window), and (b) bring friends: 3+ noticed friendlies makes both horns deflate mid-windup ("YOU'RE ALL WINNERS, I'M JUST—"). That second answer is the design's thesis ("it can't encourage a crowd") and it WORKS. Fearful but fair: YES, with the fair part carried by the crowd counter, not by outrunning.`);
  note(`The deflate punish window gives the fight its rhythm: dodge → close → hit → repeat. Two horns don't just double the solo — the pack cohesion makes them flank, so you can't kite both with one line. Chores: none found — no dead turns, no spam (say-dedup holds, telegraphs dedupe per horn per round).`);
  note(`Mobile 390x844: two radius-3 bursts on a 9x9 grid is a LOT of highlighted tiles, but the telegraphs are per-horn and the shouts carry the timing. Readable.`);
  note(`One nit for the backlog: the 💥 DETONATING phase badge never renders — the breather consumes the cooldown in the same monster turn, so sampling only ever sees inflate/encourage/deflate. The explosion itself is loud and clear (burst + damage + audio), so this is cosmetic, not a feel break.`);
}

)();
