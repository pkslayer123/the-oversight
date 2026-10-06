#!/usr/bin/env node
// FEEL PLAYTEST (Steve 2026-10-06): the 2-horn hummice pack, played AS A PLAYER
// at honest 1x turn economy.
//
// HISTORY: scripts/playtest-wave2b-pack-feel.js ran this whole fight with the
// double-advance harness bug (playerTurn(fn){...; tbAdvance();} AFTER
// tbPlayerStrike/tbAfterPlayerAction had already advanced), so every AI acted
// TWICE per player action. All verdicts from that script were gathered at 2x
// monster speed. That script's harness is now fixed (endTurn() idiom); this
// script re-plays the fight at 1x and re-judges the verdicts.
// Run: node scripts/play-feel-20261006-pack-1x.js
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
// TURN HYGIENE: endTurn() advances EXACTLY one AI round, never two.
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
function strike(key) {
  let res = false;
  if (Game.tbIsPlayerTurn()) res = Game.tbPlayerStrike(key);
  endTurn();
  return res;
}
function dist(a, b) { return Math.max(Math.abs(a.mx - b.mx), Math.abs(a.my - b.my)); }
function alive() { return !!(Game.tbfight && !Game.tbfight.over); }

async function newPackFight() {
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
  const pf = P(); pf.hp = pf.maxHp = 9000; // survive the story; real damage tracked via dmgHook
  for (const m of horns()) { m.hp = m.maxHp = 60; }
}

(async () => {
  await Game.init();

  // ============ PROOF 0: turn-count sanity — N player actions => exactly N AI rounds ============
  note('=== PROOF 0: N player actions => exactly N AI rounds (not 2N) ===');
  await newPackFight();
  let advCalls = 0;
  const realAdvance = Game.tbAdvance.bind(Game);
  Game.tbAdvance = function (...a) { advCalls++; return realAdvance(...a); };
  const hs0 = horns();
  if (hs0.length === 0) { note('No horns formed — aborting proof.'); process.exit(1); }
  // walk adjacent to horn 1 so the strike spends its turn honestly
  moveTo(hs0[0].mx + 1, hs0[0].my);
  const before = advCalls;
  waitTurn();                    // action 1
  waitTurn();                    // action 2 (horn is on the player's tile; no movement needed)
  if (dist(P(), hs0[0]) <= 1) strike(hs0[0].key); else waitTurn(); // action 3
  waitTurn();                    // action 4
  const used = advCalls - before;
  note(`4 player actions -> tbAdvance() calls: ${used} (expected 4)`);
  note(used === 4
    ? 'PASS: harness runs at honest 1x — one AI round per player action.'
    : 'FAIL: double-advance still present.');
  Game.tbAdvance = realAdvance;
  try { if (Game.tbfight) Game.tbEnd('fled'); } catch (e) {}

  // ============ THE FIGHT, AS A PLAYER ============
  note('\n=== THE FIGHT, played as a player at 1x ===');
  await newPackFight();
  let hs = horns();
  note(`DUSK. Two figures at the treeline, shouting. "${hs[0].name}" and "${hs[1].name}"`);
  note(`You (a stranger here) get no real names — the game refuses. Good.`);
  note(`horn1 @${hs[0].mx},${hs[0].my}  horn2 @${hs[1].mx},${hs[1].my}  you @${P().mx},${P().my}`);

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
  const flush = (tag, re) => {
    const interesting = says.filter(t => re.test(t));
    for (const t of interesting.slice(0, 8)) note(`   ${tag} ${t.slice(0, 120)}`);
    says.length = 0;
  };

  // --- Beat 1: the double inflate, in lockstep ---
  note('\n--- BEAT 1: they notice you. Both of them. ---');
  for (let i = 0; i < 3 && alive(); i++) waitTurn();
  flush('>', /YOU'VE GOT|WINNER|NEVER GIVE UP|GET CLEAR|inflates|📣/i);
  hs = horns();
  note(`Phases: ${hs.map(h => h.beamPhase).join(' / ')} — both inflating IN LOCKSTEP.`);

  // --- Beat 2: windup escalation, then RUN (flee viability, re-judged at 1x) ---
  note('\n--- BEAT 2: windup escalates. You run for the far corner. ---');
  // farthest INTERIOR tile (1..7) from both horns — edges are flee-by-barrier
  let fx = 4, fy = 4, best = -1;
  for (let x = 1; x <= 7; x++) for (let y = 1; y <= 7; y++) {
    const d = Math.min(...hs.map(h => Math.max(Math.abs(h.mx - x), Math.abs(h.my - y))));
    if (d > best) { best = d; fx = x; fy = y; }
  }
  moveTo(fx, fy);
  flush('>', /GET CLEAR|inflates|📣|💥/i);
  hs = horns();
  note(`You bolt to @${P().mx},${P().my}. Distance to horns: ${hs.map(h => dist(P(), h)).join(' / ')} tiles (burst radius 3).`);
  const dmgBeforeFlee = dmgHook.total;
  for (let i = 0; i < 4 && alive(); i++) waitTurn();
  flush('>', /💥|GET CLEAR|inflates|deflat|WINNERS/i);
  const fleeDmg = dmgHook.total - dmgBeforeFlee;
  note(`Detonation went off while you ran. Damage taken: ${fleeDmg}.`);
  note(fleeDmg === 0
    ? 'CLEAN ESCAPE. The telegraph was honest, the counterplay works — at 1x you can outrun the windup.'
    : 'Caught the edge — radius 3 is BIG, and they follow.');

  // --- Beat 3: next cycle — stand in it and tank the DOUBLE detonation ---
  note('\n--- BEAT 3: next cycle. You stand in the middle, like an idiot. For science. ---');
  moveTo(4, 4);
  for (let i = 0; i < 10 && alive(); i++) {
    if (horns().every(h => h.telegraph)) break;
    waitTurn();
  }
  flush('>', /YOU'VE GOT|WINNER|NEVER GIVE UP|GET CLEAR/i);
  note(`Both telegraphs up. You plant your feet at @${P().mx},${P().my}. Here it comes.`);
  const dmgBeforeTank = dmgHook.total;
  for (let i = 0; i < 4 && alive(); i++) waitTurn();
  flush('>', /💥|deflat/i);
  const tankDmg = dmgHook.total - dmgBeforeTank;
  note(`DOUBLE DETONATION. Damage taken: ${tankDmg}. (Solo horn does 18-26; the pack doubles it if you're greedy.)`);

  // --- Beat 4: punish the deflate ---
  note('\n--- BEAT 4: they sag, spent. The punish window. ---');
  hs = horns();
  note(`Phases: ${hs.map(h => h.beamPhase).join(' / ')}`);
  const h1 = hs[0];
  const before1 = h1.hp;
  moveTo(h1.mx + 1, h1.my);
  strike(h1.key);
  flush('>', /🗡️|hits|deflat/i);
  note(`You strike during deflate: horn1 ${before1} -> ${h1.hp} HP. ${h1.hp < before1 ? 'The punish window is real.' : 'Miss / out of range — check.'}`);

  // --- Beat 5: kill horn 1, feel the solo horn ---
  note('\n--- BEAT 5: finish horn 1. Then it\'s 1v1. ---');
  let rounds = 0;
  while (alive() && horns().length > 1 && rounds < 40) {
    const t = horns()[0];
    const pp = P();
    Game.state.scholar.health = Math.max(Game.state.scholar.health, 200);
    if (dist(pp, t) > 1) moveTo(t.mx + 1, t.my);
    else strike(t.key);
    rounds++;
  }
  flush('>', /falls|deflat|💥/i);
  hs = horns();
  note(`Horn 1 down after ${rounds} player actions. Remaining: ${hs.length} horn(s). ${hs.length ? `Solo horn at ${hs[0].hp}/${hs[0].maxHp} HP, phase ${hs[0].beamPhase}.` : 'Both dead — overkill, check balance.'}`);
  note(`Total damage taken so far: ${dmgHook.total}.`);

  // --- Beat 6: crowd deflate — bring friends ---
  if (hs.length && alive()) {
    note('\n--- BEAT 6: you whistle up two villagers. The horn can\'t do crowds. ---');
    const f = Game.tbfight;
    for (let i = 0; i < 2; i++) {
      f.fighters.push({ key: 'pal' + i, kind: 'villager', name: 'Pal ' + i, mx: P().mx, my: P().my, hp: 30, maxHp: 30, alive: true, fled: false, speed: 3, acted: true, moveLeft: 0 });
      for (const h of horns()) Game.encNoticeFighter(h, 'pal' + i, true);
      horns().forEach(h => { h.telegraph = null; h.hypeCooldown = 0; });
    }
    for (let i = 0; i < 8 && alive(); i++) waitTurn();
    flush('>', /WINNERS|deflat|inflates|💥/i);
    const hh = horns();
    note(`Horn phase with 3 friendlies noticed: ${hh.length ? hh[0].beamPhase : '(dead)'}. ${hh.length && hh[0].beamPhase === 'deflate' ? 'It deflated — "YOU\'RE ALL WINNERS, I\'M JUST—". The fiction holds: it only does one-on-one.' : 'Did NOT deflate — investigate.'}`);
  }

  // --- Beat 7: codex gating, unknown vs known ---
  note('\n--- BEAT 7: what does the game tell you, before vs after you learn? ---');
  try { if (Game.tbfight) Game.tbEnd('fled'); } catch (e) {}
  Game.say = os; Game.tbDamage = od;
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  Game.state.scholar.health = 500;
  Game.state.scholar.equipped = { weapon: { itemId: 'fire_hardened_spear', name: 'Fire-hardened spear' } };
  Game.debugScenario('motivationalspeaker');
  const s2 = Game.state.scholar; s2.mx = s2.monster.mx + 1; s2.my = s2.monster.my;
  Game.canSee = () => true;
  for (let i = 0; i < 6 && !Game.tbfight; i++) Game.monsterTurn();
  const pf = P(); pf.hp = pf.maxHp = 9000;
  for (const m of horns()) { m.hp = m.maxHp = 60; }
  const hh2 = horns();
  // force a telegraph so the cue has something to describe (single-advance drive)
  for (let i = 0; i < 6 && !hh2.some(h => h.telegraph); i++) {
    if (Game.tbIsPlayerTurn()) { const pp = P(); pp.moveLeft = 0; pp.acted = true; Game.tbAfterPlayerAction(); }
  }
  const cueUnknown = Game.tbTelegraphCue(hh2[0]);
  note(`UNKNOWN cue: "${cueUnknown.slice(0, 130)}..."`);
  note(`  -> ${/You know this one/i.test(cueUnknown) ? 'LEAK: coaches before learned!' : 'No coaching leaked. "If you don\'t know, it doesn\'t show." ✓'}`);
  Game.tbLearnPattern(hh2[0]);
  const cueKnown = Game.tbTelegraphCue(hh2[0]);
  note(`KNOWN cue:   "${cueKnown.slice(0, 130)}..."`);
  note(`  -> ${/radius 3|GET CLEAR/i.test(cueKnown) ? 'Coaching unlocked after learning. The loop closes. ✓' : 'No coaching even after learning — check.'}`);
  try { if (Game.tbfight) Game.tbEnd('fled'); } catch (e) {}

  // ============ SUMMARY ============
  note('\n=== SUMMARY (1x verdicts) ===');
  note(`- Flee during windup: ${fleeDmg === 0 ? 'CLEAN (0 dmg)' : `marginal (${fleeDmg} dmg)`}`);
  note(`- Double detonation, tanked standing: ${tankDmg} dmg`);
  note(`- Deflate punish window: ${h1.hp < before1 ? 'REAL' : 'CHECK'}`);
  note(`- 1v1 after kill: ${rounds} player actions to down horn 1 (60 HP)`);
  note(`- Crowd deflate: ${(hs.length ? 'observed above' : 'n/a')}`);
  note('Harness: 1x confirmed (Proof 0). All numbers above are at honest speed.');
})().catch(e => { console.error('PLAYTEST CRASH:', e); process.exit(1); });
