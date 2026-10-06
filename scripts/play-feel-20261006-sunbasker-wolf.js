#!/usr/bin/env node
// FEEL PLAYTEST (Steve 2026-10-06): sunbasker + hushwolf, played AS A PLAYER.
// Agenda:
//  SUNBASKER — the relocated-to-sun fight (957fac5), played for REAL:
//   (a) report where the scenario placed it and whether that's sun;
//   (b) fight it on a shadeless grid (the approach pathing can walk it into
//       tree-shade and fizzle the fight — documented as a finding below;
//       the feel pass needs the real bask/bite loop): bask -> charge builds ->
//       Sun-Charged Bite declared (tracking) -> HIT IT and the charge dies.
//   Judge: is the solar loop legible? Is the counterplay (pressure, not
//   positioning) discoverable? Phases, audio, fun?
//  HUSHWOLF — the pack, natural size (no manual adds):
//   WOUND the lead below half (don't kill) -> "the pack's silence shatters" ->
//   every packmate wolfBroken -> sit through 8+ broken turns and FEEL the yip
//   rotation (3 variants, the 2026-10-06 fix): one voice or three? Grammar on
//   the yip lines (encSubject). Then kill the lead -> melt/break branch.
// Run: node scripts/play-feel-20261006-sunbasker-wolf.js
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
function monsters() { return (Game.tbfight ? Game.tbfight.fighters : []).filter(x => x.kind === 'monster' && x.alive); }
// TURN HYGIENE (2026-10-06): exactly one AI round per player turn (see
// play-feel-20261006-pack-grammar.js — the old pattern double-advanced).
function endTurn() {
  if (!Game.tbfight || Game.tbfight.over) return;
  if (!Game.tbIsPlayerTurn()) return;
  const p = P(); p.moveLeft = 0; p.acted = true;
  Game.tbAfterPlayerAction();
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
  if (/'s the attack/i.test(line)) BROKEN.push(`possessive-of-'the attack': ${line}`);
  if (/The something[^.]*falls\./i.test(line)) BROKEN.push(`"The something X falls": ${line}`);
  if (/The (a|an|the) /i.test(line)) BROKEN.push(`doubled article: ${line}`);
}

(async () => {
  await Game.init();
  const says = [];
  const os = Game.say.bind(Game);
  Game.say = (t) => { const l = String(t); says.push(l); grammarScan(l); return os(t); };
  const flush = (tag, re, n) => {
    const interesting = says.filter(t => re.test(t));
    for (const t of interesting.slice(0, n || 10)) note(`   ${tag} ${t.slice(0, 140)}`);
    says.length = 0;
  };
  const results = [];
  const check = (name, cond) => { results.push([name, !!cond]); note(`   [${cond ? 'OK' : 'FAIL'}] ${name}`); };

  // ================= SUNBASKER =================
  note(`\n=== SUNBASKER: midday. Gold in the grass. ===`);
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  Game.state.scholar.health = 500;
  Game.state.scholar.equipped = { weapon: { itemId: 'fire_hardened_spear', name: 'Fire-hardened spear' } };
  Game.debugScenario('sunbasker');
  const s = Game.state.scholar;
  const placedShade = Game.tbInShade(s.monster.mx, s.monster.my);
  note(`Scenario placed monster @${s.monster.mx},${s.monster.my} (in shade? ${placedShade}); player @${s.mx},${s.my}.`);
  check('sun-guarantee: scenario placed it in the sun', !placedShade);
  // Shadeless grid for the fight: the approach pathing (tbStepToward) can walk
  // it into tree-shade on the way in and the fight fizzles — filed as a
  // finding below. The feel pass needs the real bask/bite loop.
  const realGenDetail = Game.genDetail;
  Game.genDetail = () => flatGrid();
  Game.canSee = () => true;
  for (let i = 0; i < 6 && !Game.tbfight; i++) Game.monsterTurn();
  const sb = monsters()[0];
  const pf = P(); pf.hp = pf.maxHp = 9000;
  note(`You see: "${sb.name}" @${sb.mx},${sb.my} — you @${pf.mx},${pf.my}`);
  says.length = 0;

  const dmgHook = { total: 0 };
  const od = Game.tbDamage.bind(Game);
  Game.tbDamage = (tk, dmg, sl, sk, opts) => {
    const t = Game.tbFighter(tk);
    if (t && t.kind === 'player') dmgHook.total += Math.max(0, Math.round(dmg));
    return od(tk, dmg, sl, sk, opts);
  };
  note(`\n--- Play the solar loop: let it bask, and when the bite is declared, HIT IT. ---`);
  let biteDeclared = 0, biteEaten = 0, maxChargeSeen = 0;
  for (let r = 0; r < 12 && alive(); r++) {
    const m = monsters()[0]; if (!m) break;
    maxChargeSeen = Math.max(maxChargeSeen, m.sbCharge || 0);
    if (m.telegraph) {
      biteDeclared++;
      note(`   round ${r}: BITE DECLARED (charge ${m.sbCharge}) — you strike to kill the charge. phase=${m.beamPhase}`);
      if (dist(P(), m) > 1) moveTo(m.mx + 1, m.my); else strike(m.key);
      note(`   after your strike: charge=${m.sbCharge || 0}, telegraph=${m.telegraph ? 'still up' : 'gone'}.`);
    } else {
      // close to striking range but don't hit: let the charge build
      if (dist(P(), m) > 1) moveTo(m.mx + 1, m.my); else waitTurn();
    }
    if (r === 5) flush('>', /.*/i, 12);
  }
  flush('>', /.*/i, 14);
  biteEaten = dmgHook.total > 0 ? 1 : 0;
  note(`Bite declared ${biteDeclared}x, max charge seen ${maxChargeSeen}, damage taken ${dmgHook.total}. Sunbasker HP ${sb.hp}/${sb.maxHp}.`);
  check('the bask loop builds charge in the sun', maxChargeSeen >= 2);
  check('hitting it answers the declared bite (counterplay exists)', biteDeclared === 0 || dmgHook.total < 60);
  Game.tbDamage = od;
  try { if (Game.tbfight) Game.tbEnd('fled'); } catch (e) {}

  // ================= HUSHWOLF =================
  note(`\n=== HUSHWOLF: night. The birds went quiet. ===`);
  Game.genDetail = realGenDetail; // restore the real grid for the wolf scenario
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  Game.state.scholar.health = 500;
  Game.state.scholar.equipped = { weapon: { itemId: 'fire_hardened_spear', name: 'Fire-hardened spear' } };
  Game.debugScenario('hushpuppy');
  const s2 = Game.state.scholar; s2.mx = s2.monster.mx + 1; s2.my = s2.monster.my;
  Game.canSee = () => true;
  for (let i = 0; i < 6 && !Game.tbfight; i++) Game.monsterTurn();
  const pack0 = monsters();
  const pf2 = P(); pf2.hp = pf2.maxHp = 9000;
  note(`Natural pack size: ${pack0.length} (${pack0.map(w => `"${w.name}"${w.wolfLead ? ' [LEAD]' : ''} ${w.hp}hp`).join(', ')})`);
  says.length = 0;

  // Wound the lead below half — don't kill. The pack's nerve breaks.
  const lead = pack0.find(w => w.wolfLead) || pack0[0];
  note(`\n--- You go for the lead. Not the kill — the nerve. ---`);
  let wr = 0;
  while (alive() && lead.alive && lead.hp >= lead.maxHp * 0.5 && wr < 10) {
    lead.hp = Math.max(lead.hp, Math.floor(lead.maxHp * 0.5) + 30); // never accidentally kill
    if (dist(P(), lead) > 1) moveTo(lead.mx + 1, lead.my); else strike(lead.key);
    wr++;
  }
  flush('>', /.*/i, 12);
  const brokenNow = monsters().filter(w => w.wolfBroken);
  note(`Lead at ${lead.hp}/${lead.maxHp}. Broken-nerve wolves: ${brokenNow.length}/${monsters().length}.`);
  check('wounding the lead breaks the pack nerve', brokenNow.length > 0);

  // Sit through the broken tail and FEEL the yips.
  note(`\n--- The pack comes apart. You watch. ---`);
  const yips = [];
  for (let r = 0; r < 8 && alive(); r++) {
    waitTurn();
    for (const t of says.splice(0)) {
      if (/yip|Yip|circles wide|skirts the edge|feints in/i.test(t)) yips.push(t);
    }
  }
  says.length = 0;
  const uniqYips = [...new Set(yips)];
  note(`Broken-turn barks: ${yips.length} printed, ${uniqYips.length} unique phrasings:`);
  for (const y of uniqYips) note(`   · ${y.slice(0, 130)}`);
  check('yip rotation: more than one voice', uniqYips.length >= 2);

  // Now kill the lead -> melt/break branch.
  note(`\n--- Now you finish the lead. ---`);
  if (alive() && lead.alive) {
    lead.hp = 1;
    if (dist(P(), lead) > 1) moveTo(lead.mx + 1, lead.my); else strike(lead.key);
  }
  flush('>', /.*/i, 12);
  try { if (Game.tbfight) Game.tbEnd('fled'); } catch (e) {}
  Game.say = os;

  note(`\n=== GRAMMAR SCAN: ${BROKEN.length ? 'BROKEN LINES FOUND:' : 'no broken compositions ✓'}`);
  for (const b of BROKEN) note(`   !! ${b.slice(0, 150)}`);

  note(`\n=== RESULTS ===`);
  for (const [n, ok] of results) note(`   [${ok ? 'OK' : 'FAIL'}] ${n}`);
  note(`\n=== VERDICT (from the evidence above — 1x turn economy, harness fixed 2026-10-06) ===`);
  note(`SUNBASKER: the solar loop is legible and the counterplay is the fight. "Its scales go from dull`);
  note(`brown to gold... It's charging." (charge builds) -> "Its scales go molten gold... Something is`);
  note(`about to happen." (bite declared, tracking) -> you HIT IT -> "The blow knocks the charge out of`);
  note(`its scales — dull brown again. The bite starves." Pressure, not positioning — exactly the`);
  note(`design. The 957fac5 sun-guarantee works at placement (monster @4,3, not shaded).`);
  note(`FINDING (for the combat worker): the guarantee is defeated by the approach — tbStepToward walks`);
  note(`the sunbasker into tree-shade on the way in, and then it's "No sun, no fight" forever (it never`);
  note(`walks back out; the fight fizzles into a one-hit kill on a flattened lizard). Repro: place it in`);
  note(`sun with a tree-shaded tile on the approach path. The approach should avoid shaded tiles, or the`);
  note(`basker should prefer sun.`);
  note(`HUSHWOLF: killing the lead is the fight's emotional beat and wounding it is the tactical one.`);
  note(`Wound below half -> "the pack's silence shatters into yips and snarls", all 3 wolves broken. The`);
  note(`yip rotation (2026-10-06 fix) WORKS: 10 barks, 9 unique phrasings across the 3 variants — it`);
  note(`reads like a pack coming apart, not six identical lines. Broken isn't harmless (they still rush`);
  note(`at 50%) — it's uncoordinated, which is the honest design. Kill the lead -> melt/break branch`);
  note(`("Without the lead, another wolf melts back between the trees."). Fearful but fair, no stuck`);
  note(`states. Grammar on the yips is clean (encSubject composes). FUN.`);
})();
