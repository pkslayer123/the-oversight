#!/usr/bin/env node
// Wave 2 Group B follow-up: the 2-horn PACK (Steve 2026-10-06)
// Background: hype_horn data said behavior "pack" but had no numeric `pack`
// field -> spawned solo. Fixed with a 1-line monsters.json change ("pack": 2).
// This test verifies the fix END-TO-END: the debug scenario fight must spawn
// 2 horns, both must cycle inflate -> encourage -> detonate -> deflate with
// distinct telegraphs, telegraph cues stay codex-gated per horn, crowd
// deflate works in the pack context, and (group B leftover) the torch x3
// paper vulnerability on contract_golem still holds.
// Run: node scripts/test-wave2b-pack.js
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

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) pass++;
  else { fail++; console.log(`FAIL ${name}${extra ? ' | ' + extra : ''}`); }
}
function flatGrid() {
  return Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => 'grass'));
}
function startFight(scen) {
  try { if (Game.tbfight) Game.tbEnd('fled'); } catch (e) {}
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s0 = Game.state.scholar;
  s0.health = 500;
  s0.equipped = { weapon: { itemId: 'fire_hardened_spear', name: 'Fire-hardened spear' } };
  for (const rid of Object.keys(Game.state.village.positions || {})) {
    Game.state.village.positions[rid] = { mx: 0, my: 0 };
  }
  Game.debugScenario(scen);
  const s = Game.state.scholar;
  s.mx = s.monster.mx + 1; s.my = s.monster.my;
  Game.canSee = () => true;
  for (let i = 0; i < 6 && !Game.tbfight; i++) Game.monsterTurn();
  const horns = Game.tbfight ? Game.tbfight.fighters.filter(x => x.kind === 'monster') : [];
  for (const m of horns) { m.hp = m.maxHp = 300; }
  return Game.tbfight;
}
function horns() { return Game.tbfight.fighters.filter(x => x.kind === 'monster' && (x.mdef || {}).id === 'hype_horn'); }
function P() { return Game.tbFighter('p'); }
function monsterActs() {
  const f = Game.tbfight;
  if (!f || f.over) return 'over';
  if (Game.tbIsPlayerTurn()) { const p = P(); p.moveLeft = 0; p.acted = true; }
  Game.tbAdvance();
  return f.over ? 'over' : 'ok';
}
function playerWaits() {
  const p = P();
  if (!p || !Game.tbIsPlayerTurn()) return false;
  p.moveLeft = 0; p.acted = true;
  Game.tbAfterPlayerAction();
  return true;
}

(async () => {
  await Game.init();
  Game.genDetail = () => flatGrid();

  // ================= 2-HORN PACK SPAWN =================
  console.log('--- horn pack spawn ---');
  startFight('motivationalspeaker');
  let hs = horns();
  ok('pack: fight starts', !!Game.tbfight);
  ok('pack: TWO horns spawn (pack:2 fix)', hs.length === 2, `got ${hs.length}`);
  if (hs.length === 2) {
    const names = hs.map(h => h.name).sort();
    // Knowledge-gating: fresh game -> the name is the UNKNOWN descriptor,
    // not "Motivational Speaker". Either way the two horns must be numbered.
    ok('pack: horns are numbered distinctly (1 / 2)',
      names[0] !== names[1] && / 1$/.test(names[0]) && / 2$/.test(names[1]),
      names.join(' / '));
    ok('pack: name hidden until known ("if you don\'t know, it doesn\'t show")',
      /a shape in the dusk/i.test(names[0]), names[0].slice(0, 60));
    ok('pack: distinct tiles (pack reads as a pack immediately)',
      hs[0].mx !== hs[1].mx || hs[0].my !== hs[1].my,
      `(${hs[0].mx},${hs[0].my}) vs (${hs[1].mx},${hs[1].my})`);
    ok('pack: pack cohesion flags (mdef.pack > 1)', (hs[0].mdef.pack || 0) === 2);
  }

  // ================= PHASE CYCLE IN PACK CONTEXT =================
  console.log('--- horn phase cycle (pack) ---');
  startFight('motivationalspeaker');
  hs = horns();
  // Hook detonation: the 'detonate' phase is set transiently inside the
  // monster's turn (breather consumes it the same turn), so sample it via
  // audio + damage instead of the phase badge.
  let detonateAudio = 0;
  const origAudio = Game.audioEvent.bind(Game);
  Game.audioEvent = (n, d) => { if (n === 'hypeDetonate') detonateAudio++; return origAudio(n, d); };
  // Hook damage: accumulate what the pack's detonations do to the player.
  let detonateDmg = 0;
  const origDmg = Game.tbDamage.bind(Game);
  Game.tbDamage = (tk, dmg, sl, sk, opts) => {
    const t = Game.tbFighter(tk);
    if (t && t.kind === 'player' && /pep talk|attack/i.test(String(sl))) detonateDmg += Math.max(0, Math.round(dmg));
    return origDmg(tk, dmg, sl, sk, opts);
  };
  const phasesSeen = new Map(hs.map(h => [h.key, new Set()]));
  const telegraphsPerHorn = new Map(hs.map(h => [h.key, 0]));
  let burstRadiusOk = true, burstCellsOk = true;
  function samplePhases() {
    for (const h of horns()) {
      phasesSeen.get(h.key).add(h.beamPhase);
      if (h.telegraph) {
        telegraphsPerHorn.set(h.key, telegraphsPerHorn.get(h.key) + 1);
        if ((h.telegraph.pattern || {}).type !== 'burst' || (h.telegraph.pattern || {}).radius !== 3) burstRadiusOk = false;
        if (!(h.telegraph.cells || []).length) burstCellsOk = false;
      }
    }
  }
  for (let i = 0; i < 40; i++) {
    if (Game.tbfight.over) break;
    const s = Game.state.scholar; s.health = Math.max(s.health, 400);
    const p = P(); if (p) p.hp = p.maxHp = Math.max(p.hp, 400);
    samplePhases();
    monsterActs();
    samplePhases(); // catch transient badges (inflate declare, detonate)
    playerWaits();
    if ([...phasesSeen.values()].every(sx => ['inflate', 'encourage', 'deflate'].every(x => sx.has(x)))
        && detonateAudio >= 2 && detonateDmg > 0) break;
  }
  Game.audioEvent = origAudio;
  Game.tbDamage = origDmg;
  const allPhases = [...phasesSeen.values()].map(sx => [...sx].join(','));
  console.log('    phases horn1:', allPhases[0] || '(none)');
  console.log('    phases horn2:', allPhases[1] || '(none)');
  ok('pack: BOTH horns cycle inflate->encourage->deflate',
    [...phasesSeen.values()].every(sx => ['inflate', 'encourage', 'deflate'].every(x => sx.has(x))),
    allPhases.join(' // '));
  ok('pack: detonate FIRES for both (audio + damage land)',
    detonateAudio >= 2 && detonateDmg > 0,
    `hypeDetonate x${detonateAudio}, player took ${detonateDmg}`);
  ok('pack: each horn declares its own telegraph',
    [...telegraphsPerHorn.values()].every(n => n > 0),
    JSON.stringify([...telegraphsPerHorn.values()]));
  ok('pack: telegraphs are burst radius 3 with cells', burstRadiusOk && burstCellsOk,
    `radiusOk=${burstRadiusOk} cellsOk=${burstCellsOk}`);

  // ================= DETONATION HURTS (pack) =================
  console.log('--- detonation damage (pack) ---');
  startFight('motivationalspeaker');
  hs = horns();
  // Force a detonation near the player: pin player at a fixed tile, let horns declare
  const p0 = P();
  p0.mx = 4; p0.my = 4; p0.hp = p0.maxHp = 500;
  let hpBefore = p0.hp;
  let detonated = 0;
  for (let i = 0; i < 40 && detonated < 1 && !Game.tbfight.over; i++) {
    monsterActs(); playerWaits();
    if (p0.hp < hpBefore) { detonated++; hpBefore = p0.hp; }
    p0.hp = Math.max(p0.hp, 300); // stay up, feel the damage
  }
  ok('pack: a detonation lands damage on the player', detonated > 0, `detonations=${detonated}`);

  // ================= CODEX GATING (per horn) =================
  console.log('--- codex gating (pack) ---');
  startFight('motivationalspeaker');
  hs = horns();
  ok('pack: horns fight still in FIFO (telegraphGate pattern)', hs.every(h => Game.encUsesFifo(h)), '');
  // Unknown: no pattern knowledge yet (fresh fight, new game)
  const h1 = hs[0];
  const knownBefore = Game.encTelegraphKnown(h1);
  const cueBefore = Game.tbTelegraphCue(h1);
  ok('pack: cue hides pattern coaching when unknown',
    !/You know this one/i.test(cueBefore), cueBefore.slice(0, 90));
  // Learn the pattern, cue should now coach
  Game.tbLearnPattern(h1);
  ok('pack: pattern knowledge recorded', !!Game.tbPatternKnown('hype_horn', (h1.mdef.attack || {}).name));
  const cueAfter = Game.tbTelegraphCue(h1);
  ok('pack: cue coaches AFTER pattern learned',
    /You know this one/i.test(cueAfter) || /radius 3/i.test(cueAfter), cueAfter.slice(0, 90));
  // Second horn shares the codex entry (same species) — knowledge is species-wide
  const h2 = hs[1];
  ok('pack: knowledge is species-wide (horn 2 also coached)',
    Game.encTelegraphKnown(h2), '');

  // ================= CROWD DEFLATE (pack context) =================
  console.log('--- crowd deflate (pack) ---');
  startFight('motivationalspeaker');
  hs = horns();
  // Simulate a crowd: add 3 live player-side fighters (limit is 2).
  // They must be NOTICED into each horn's threat queue — the deflate check
  // counts noticed live targets, not raw fighter list.
  const f = Game.tbfight;
  for (let i = 0; i < 3; i++) {
    f.fighters.push({ key: 'crowd' + i, kind: 'villager', name: 'Crowd ' + i, mx: 1, my: 1, hp: 30, maxHp: 30, alive: true, fled: false, speed: 3, acted: true, moveLeft: 0 });
  }
  for (const h of hs) {
    for (let i = 0; i < 3; i++) Game.encNoticeFighter(h, 'crowd' + i, true);
    h.beamPhase = undefined; // reset to stalk so declare path runs
    h.telegraph = null;
    h.hypeCooldown = 0;
  }
  const deflated = new Set();
  for (let i = 0; i < 12; i++) {
    if (Game.tbfight.over) break;
    monsterActs(); playerWaits();
    for (const h of horns()) if (h.beamPhase === 'deflate') deflated.add(h.key);
    if (deflated.size === 2) break;
  }
  ok('pack: BOTH horns deflate in a crowd (>2 live targets)',
    deflated.size === 2, `deflated=${deflated.size}`);

  // ================= TORCH x3 VS CONTRACT GOLEM (group B leftover) =================
  console.log('--- torch x3 vs contract golem ---');
  try { if (Game.tbfight) Game.tbEnd('fled'); } catch (e) {}
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const gs0 = Game.state.scholar;
  gs0.health = 500;
  Game.debugScenario('termsconditions');
  // NOTE: the scenario equips fire_hardened_spear — set the torch AFTER it.
  Game.state.scholar.equipped = { weapon: { itemId: 'torch', name: 'Torch' } };
  const gs = Game.state.scholar;
  gs.mx = gs.monster.mx + 1; gs.my = gs.monster.my;
  Game.canSee = () => true;
  for (let i = 0; i < 6 && !Game.tbfight; i++) Game.monsterTurn();
  const gm = Game.tbfight && Game.tbfight.fighters.find(x => x.kind === 'monster');
  ok('golem: fight starts', !!Game.tbfight);
  if (gm) {
    gm.hp = gm.maxHp = 120;
    Game.tbDamage(gm.key, 10, 'you');
    const torchDmg = 120 - gm.hp;
    ok('golem: torch deals ~x3 (paper)', torchDmg >= 28 && torchDmg <= 32, `dealt ${torchDmg}`);
    // Control: spear does base damage
    gm.hp = 120;
    Game.state.scholar.equipped = { weapon: { itemId: 'fire_hardened_spear', name: 'Fire-hardened spear' } };
    Game.tbDamage(gm.key, 10, 'you');
    const spearDmg = 120 - gm.hp;
    ok('golem: spear deals ~x1 (control)', spearDmg >= 8 && spearDmg <= 12, `dealt ${spearDmg}`);
  }

  // ================= AUDIO (pack) =================
  console.log('--- audio hooks (pack) ---');
  let audioOk = true;
  try {
    Game.audio = { hypeInflate(){}, hypeEncourage(){}, hypeDetonate(){}, hypeDeflate(){} };
    Game.audioEvent('hypeInflate'); Game.audioEvent('hypeEncourage', { n: 2 });
    Game.audioEvent('hypeDetonate'); Game.audioEvent('hypeDeflate');
  } catch (e) { audioOk = false; }
  ok('pack: audio events callable', audioOk);

  try { if (Game.tbfight) Game.tbEnd('fled'); } catch (e) {}
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
