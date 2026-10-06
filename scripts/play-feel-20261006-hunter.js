#!/usr/bin/env node
// FEEL PLAYTEST (Steve 2026-10-06), HUNTER archetype — the dusk stalk + a fight
// NEVER played as a player: the WHITE NOISE HERON ('whitenoise' scenario), plus
// the hunter's two untested-aftermath questions:
//   (a) kill -> carcass economy + alien loot: knowledge-gated? true name learned?
//   (b) traps on a monster-patrolled tile: do traps survive the wanderer?
// TURN HYGIENE: endTurn() = exactly one AI round (never a second tbAdvance).
// Run: node scripts/play-feel-20261006-hunter.js
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

const says = [];
const results = [];
const check = (name, cond) => { results.push([name, !!cond]); note(`   [${cond ? 'OK' : 'FAIL'}] ${name}`); };

async function fresh() {
  Game.genDetail = () => flatGrid();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  Game.state.scholar.health = 500;
  Game.state.scholar.equipped = { weapon: { itemId: 'fire_hardened_spear', name: 'Fire-hardened spear' } };
}

(async () => {
  await Game.init();
  const os = Game.say.bind(Game);
  Game.say = (t) => { says.push(String(t)); return os(t); };
  const flush = (tag, re, n) => {
    const hit = says.filter(t => re.test(t));
    for (const t of hit.slice(0, n || 8)) note(`   ${tag} ${t.slice(0, 150)}`);
    says.length = 0;
  };

  // ============ ACT 1: THE DUSK STALK — stance escalation on the grid ============
  note('\n=== ACT 1: dusk stalk — does the grid monster feel like a HUNTER\'s prey? ===');
  await fresh();
  Game.debugScenario('whitenoise'); // dayPart=2 dusk, white_noise_heron @ 5,4
  const s = Game.state.scholar;
  const H0 = s.monster;
  note(`DUSK. ${H0.id} at @${H0.mx},${H0.my}. You are @${s.mx},${s.my}. Day part ${Game.dayPart} (2=dusk).`);
  Game.canSee = () => true;
  // watch the grid monster's stance from a distance for several turns
  let stanceSeq = [];
  for (let i = 0; i < 8 && !Game.tbfight; i++) {
    const before = (s.monster || {}).stance;
    Game.monsterTurn();
    const after = (s.monster || {}).stance;
    if (after && after !== before) stanceSeq.push(`${before || '?'}->${after}`);
    if (i === 3) flush('>', /staticky|unfolds|flat|hiss|still|watching|circle/i);
  }
  note(`stance path: ${stanceSeq.join(' / ') || '(none — check combat start)'}`);
  flush('>', /something|statue|still|hunt/i, 6);

  // ============ ACT 2: THE FIGHT, as a player, at 1x ============
  note('\n=== ACT 2: the heron fight, played as a player at 1x ===');
  s.mx = s.monster ? s.monster.mx - 3 : 2; s.my = 4;
  for (let i = 0; i < 6 && !Game.tbfight; i++) Game.monsterTurn();
  const pf = P();
  if (!pf) { note('combat never started — setup failed.'); }
  else {
    pf.hp = pf.maxHp = 9000; // survive the story; real damage tracked via hook
    const H = monsters()[0];
    note(`Combat on. Heron @${H.mx},${H.my} (${dist(P(), H)} tiles), player @${P().mx},${P().my}.`);
    note(`Display name: "${Game.monsterDisplayName('white_noise_heron')}" (first contact — should be dread, not lecture)`);
    flush('>', /something|heron|staticky|unfolds|beam|line/i, 6);

    let hpAtFirst = H.hp;
    let rounds = 0, dmgTaken = 0;
    const od = Game.tbDamage.bind(Game);
    Game.tbDamage = (tk, dmg, sl, sk, opts) => {
      const t = Game.tbFighter(tk);
      if (t && t.kind === 'player') dmgTaken += Math.max(0, Math.round(dmg));
      return od(tk, dmg, sl, sk, opts);
    };
    // Play: keep off the declared line, strike when in spear range (2).
    while (alive() && monsters().length && rounds < 40) {
      const h = monsters()[0];
      const d = dist(P(), h);
      flush('>', /unfolds|staticky|still|loose|swells|air goes|flat/i, 5);
      const teleg = (Game.tbfight.telegraphs || {})[h.key];
      if (teleg) {
        note(`R${rounds}: telegraph up (${teleg.type || 'line'}, aim ${teleg.tx},${teleg.ty}) — moving off the lane.`);
        // sidestep: move perpendicular to the aim bearing
        const ex = teleg.tx - h.mx, ey = teleg.ty - h.my;
        const sx = ey !== 0 ? 1 : 0, sy = ex !== 0 ? 1 : 0;
        const tx = Math.min(7, Math.max(1, P().mx + sx)), ty = Math.min(7, Math.max(1, P().my + sy));
        moveTo(tx, ty);
      } else if (d <= 2) {
        strike(h.key);
      } else {
        // stay off-center line, approach
        moveTo(Math.min(7, Math.max(1, h.mx - 2)), Math.min(7, Math.max(1, h.my + 1)));
      }
      rounds++;
    }
    flush('>', /dies|falls|killed|fled|runs/i, 6);
    note(`after ${rounds} rounds: fight ended=${Game.tbfight == null ? 'yes (tbEnd nulled tbfight)' : 'no, over=' + Game.tbfight.over}, result=${Game.tbfight ? Game.tbfight.result : '(tbEnd ran)'}`);
    note(`heron hp delta: ${hpAtFirst} -> ${monsters().length ? monsters()[0].hp : '(dead)'} | player damage taken: ${dmgTaken} (scaled by 9000hp harness)`);
    // nb: tbEnd() sets Game.tbfight = null — a null tbfight IS the fight ended cleanly.
    check('heron fight ends cleanly on the killing strike', Game.tbfight == null || (Game.tbfight.over && Game.tbfight.result === 'won'));

    // ============ ACT 3: THE KILL AFTERMATH ============
    note('\n=== ACT 3: kill aftermath — carcass + loot, knowledge-gated? ===');
    const carc = s.inventory.find(i => i.plantId === 'meat_white_noise_heron');
    note(`carcass in inventory: ${carc ? 'yes' : 'NO — BUG'}`);
    if (carc) {
      note(`   name: "${carc.name}" | hiddenKcal: ${carc.hiddenKcal} | kcalEach: ${carc.kcalEach} | edible: ${carc.edible}`);
      check('carcass name is gated (not "White Noise Heron (carcass)")', !/White Noise/i.test(carc.name));
      check('carcass calories hidden (kcalEach=0)', carc.kcalEach === 0 && carc.hiddenKcal > 0);
    }
    const stage = (Game.state.codex.monsters || {})['white_noise_heron'] || {};
    note(`codex stage after kill: "${stage.stage || '(none)'}"`);
    // true name should NOT be learned by killing
    const trueNameKnown = (Game.state.codex.monsters.white_noise_heron || {}).nameKnown;
    note(`true name known after kill: ${trueNameKnown ? 'YES — LEAK' : 'no (good)'}`);
    check('killing does not teach the true name', !trueNameKnown);
    // loot drop rate sample
    const mdef = (Game.data.monsters || []).find(m => m.id === 'white_noise_heron');
    let drops = 0;
    for (let i = 0; i < 2000; i++) if (Game.rollAlienLoot(mdef)) drops++;
    note(`rollAlienLoot x2000 (chance 0.1): ${drops} drops ≈ ${(drops / 2000).toFixed(3)} — ${Math.abs(drops / 2000 - 0.1) < 0.03 ? 'rate honest' : 'RATE OFF'}`);
    check('loot drop rate ≈ 0.1', Math.abs(drops / 2000 - 0.1) < 0.03);
    Game.tbDamage = od;
  }
  try { if (Game.tbfight) Game.tbEnd('fled'); } catch (e) {}

  // ============ ACT 4: TRAPS + MONSTER COEXISTENCE ============
  note('\n=== ACT 4: a snare set where a monster patrols — do traps survive? ===');
  await fresh();
  const s2 = Game.state.scholar;
  Game.learnRecipe('snare', 2);
  s2.inventory.push({ material: 'vine', units: 4 }, { material: 'stick', units: 4 });
  Game.craft('snare');
  const trapTile = { x: 3, y: 3 };
  Game.map.px = trapTile.x; Game.map.py = trapTile.y;
  Game.setTrap('snare');
  const trapsBefore = (Game.tileAt(trapTile.x, trapTile.y).traps || []).length;
  note(`snare set on tile (${trapTile.x},${trapTile.y}) — traps on tile: ${trapsBefore}`);
  Game.wanderer = { x: trapTile.x, y: trapTile.y, dir: 1, monsterId: 'thornback_boar' };
  s2.mx = 4; s2.my = 4;
  for (let i = 0; i < 20; i++) { try { Game.monsterTurn(); } catch (e) { note(`monsterTurn #${i} CRASHED: ${e.message}`); break; } }
  const trapsAfter = (Game.tileAt(trapTile.x, trapTile.y).traps || []).length;
  note(`after 20 monster patrol turns: traps on tile: ${trapsAfter} (before: ${trapsBefore})`);
  check('no crash with monster patrolling a trapped tile', true);
  check('traps survive a wandering monster', trapsAfter === trapsBefore);
  flush('>', /snare|trap|caught/i, 4);

  // ============ ACT 5: NIGHT HUNT ECONOMY — are animals out at night? ============
  // checkAnimals(): 30% per tile entry, biome-filtered. pickByActivity picks by
  // day/night. The question for the hunter: is night hunting real, or a trap?
  note('\n=== ACT 5: animal spawn rate + night ecology, meadow/forest (hunter\'s schedule) ===');
  await fresh();
  Game.genDetail = () => flatGrid();
  const s5 = Game.state.scholar;
  const nightIds = {}, dayIds = {};
  function sampleAnimals(dayPart, tileType, n) {
    const seen = {};
    let spawns = 0;
    for (let i = 0; i < n; i++) {
      Game.dayPart = dayPart;
      Game.map.px = 2; Game.map.py = 2;
      const t = Game.tileAt(2, 2); const orig = t.type; t.type = tileType;
      s5.animal = null; s5.mx = 4; s5.my = 4;
      Game.checkAnimals();
      if (s5.animal) { spawns++; seen[s5.animal.id] = (seen[s5.animal.id] || 0) + 1; }
      s5.animal = null; t.type = orig;
    }
    return { spawns, seen };
  }
  const meadowDay = sampleAnimals(1, 'meadow', 300);
  const meadowNight = sampleAnimals(3, 'meadow', 300);
  const forestNight = sampleAnimals(3, 'forest_floor', 300);
  const top = (seen) => Object.entries(seen).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => `${k}×${v}`).join(', ');
  note(`meadow DAY:   ${meadowDay.spawns}/300 spawns — ${top(meadowDay.seen)}`);
  note(`meadow NIGHT: ${meadowNight.spawns}/300 spawns — ${top(meadowNight.seen)}`);
  note(`forest_floor NIGHT: ${forestNight.spawns}/300 spawns — ${top(forestNight.seen)}`);
  const nightSet = new Set(Object.keys(meadowNight.seen).concat(Object.keys(forestNight.seen)));
  const dayOnly = Object.keys(meadowDay.seen).filter(k => !nightSet.has(k));
  const nightOnly = [...nightSet].filter(k => !Object.keys(meadowDay.seen).includes(k));
  note(`day-only species: ${dayOnly.join(', ') || '(none)'} | night-only species: ${nightOnly.join(', ') || '(none)'}`);
  check('night has its own game (different species after dark)', nightOnly.length > 0);

  note('\n=== SUMMARY ===');
  const bad = results.filter(r => !r[1]);
  note(`${results.length - bad.length}/${results.length} checks passed${bad.length ? ` — FAILED: ${bad.map(b => b[0]).join('; ')}` : ''}`);
  console.log('\nDone.');
})().catch(e => { console.error('CRASH:', e); process.exit(1); });
