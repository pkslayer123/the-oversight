#!/usr/bin/env node
// FEEL PLAYTEST (Steve 2026-10-06): glasswing + sunbasker, played AS A PLAYER.
// Agenda:
//  GLASSWING — (a) the trap, dodged: feel the 3-turn shadow warning, move
//    away, watch it hit empty dirt and climb. (b) the trap, eaten: stand
//    still, take the dive, punish the 2-turn grounded window — is the kill
//    real? (c) the in-combat dive (startCombat direct — the airborne path):
//    circle → shadow closes in → DIVE → aftermath. The new gwDiveShadow()
//    contract should read at every phase.
//  SUNBASKER — (a) pressure: strike every turn, the charge never builds —
//    is the loop legible? (b) neglect: let it bask to charge 2, take the
//    full Sun-Charged Bite — does it hurt enough to teach? The new
//    sbHeatKeys() halo should mirror the charge. Flatten check included.
// Judge: playable + enjoyable? Distinct telegraphs? Phases visible?
// Run: node scripts/play-feel-20261006-wingbask.js
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
function MON() { return (Game.tbfight ? Game.tbfight.fighters : []).find(x => x.kind === 'monster' && x.alive); }
// TURN HYGIENE (2026-10-06): exactly one AI round per player turn.
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
function strike(key) {
  let res = false;
  if (Game.tbIsPlayerTurn()) res = Game.tbPlayerStrike(key);
  endTurn();
  return res;
}
// capture audio events (synths are browser-side; here we verify dispatch)
const audioFired = [];
Game.audio = {
  glasswingCircle() { audioFired.push('circle'); },
  glasswingShadowClose(d) { audioFired.push('shadowClose' + (d && d.turns)); },
  glasswingDive() { audioFired.push('dive'); },
  glasswingClimb() { audioFired.push('climb'); },
  glasswingLand() { audioFired.push('land'); },
  baskCharge(d) { audioFired.push('bask' + (d && d.charge)); },
  baskBreak() { audioFired.push('baskBreak'); },
  baskFlatten() { audioFired.push('flatten'); },
  heartbeat() {},
};
function bad(a) { const id = (a && a.id) || a; return id !== 'fear_aura' && id !== 'pocket_sand'; }
function newRun() {
  try { if (Game.tbfight) Game.tbEnd('fled'); } catch (e) {}
  Game.genDetail = () => flatGrid();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  s.health = 500;
  s.equipped = { weapon: { itemId: 'fire_hardened_spear', name: 'Fire-hardened spear' } };
  s.abilities = (s.abilities || []).filter(bad);
  s.backgroundAbilities = (s.backgroundAbilities || []).filter(bad);
  s.stats = s.stats || {}; s.stats.agi = 5;
  if (s.passives) delete s.passives.footwork;
  Game.dayPart = 1;
  audioFired.length = 0;
  return s;
}
function trapRun() {
  const s = newRun();
  Game.debugScenario('glasswing');
  const g = Game.state.scholar;
  stripAb(g);
  g.mx = g.monster.mx + 1; g.my = g.monster.my; // within 5
  Game.monsterTurn(); // trap set
  return g;
}
function stripAb(g) {
  g.abilities = (g.abilities || []).filter(bad);
  g.backgroundAbilities = (g.backgroundAbilities || []).filter(bad);
  g.stats = g.stats || {}; g.stats.agi = 5;
  if (g.passives) delete g.passives.footwork;
}
function shadowCells() { return Game.glasswingTrapCells(); }
function diveShadow() { return Game.gwDiveShadow(); }
function heat() { return Game.sbHeatKeys(); }

(async () => {
  await Game.init();
  Game.canSee = () => true;

  note('=== GLASSWING (a): the trap, DODGED ===');
  {
    const s = trapRun();
    const trap = shadowCells();
    const hpBefore = s.health;
    note(`trap on (${trap.tile.x},${trap.tile.y}), turns=${trap.turns}, splash=${trap.splash.length} cells`);
    Game.gwTrapTick(); // shadow: faint
    note('audio so far: ' + audioFired.join(','));
    // player reads the shadow and MOVES AWAY on tick 2 (interior tiles only)
    s.mx = 1; s.my = 1;
    Game.gwTrapTick(); // shadow: darker
    Game.gwTrapTick(); // turn 3 → miss
    note(`after dodge: hp=${s.health} (was ${hpBefore}), combat=${!!Game.tbfight}, trap=${!!s.gwTrap}`);
    note('audio: ' + audioFired.join(','));
    note('FEEL: ' + (s.health === hpBefore && !Game.tbfight
      ? 'clean dodge — the 3-turn warning is enough, the miss reads, it climbs away. The trick is fair.'
      : 'PROBLEM: dodge failed'));
  }

  note('\n=== GLASSWING (b): the trap, EATEN — punish the grounded window ===');
  {
    const s = trapRun();
    Game.gwTrapTick(); Game.gwTrapTick();
    const hpBefore = s.health;
    Game.gwTrapTick(); // turn 3 → direct hit
    const taken = hpBefore - s.health;
    const gm = MON();
    note(`dive hit for ${taken}. combat=${!!Game.tbfight}, phase=${gm && gm.beamPhase}, monster hp=${gm && gm.hp}/${gm && gm.maxHp}`);
    note('audio: ' + audioFired.join(','));
    // punish: strike in the grounded window (player acts, monster thrashes)
    let rounds = 0;
    while (Game.tbfight && !Game.tbfight.over && MON() && rounds < 6) {
      rounds++;
      const m = MON();
      note(`round ${rounds}: phase=${m.beamPhase} gwGrounded=${m.gwGrounded} mhp=${m.hp}`);
      if (Game.tbIsPlayerTurn()) {
        // close in if needed, then strike
        const p = P();
        if (Math.max(Math.abs(p.mx - m.mx), Math.abs(p.my - m.my)) > 1) moveTo(m.mx - 1, m.my);
        else strike(m.key);
      } else endTurn();
      if (!MON()) break;
    }
    const tf = Game.tbfight;
    note(`fight over=${!tf || tf.over}, monster alive=${!!MON()}, rounds=${rounds}`);
    note('FEEL: ' + (!MON() ? 'kill in the grounded window is REAL — the dive has a price.' : 'it escaped — the window closed'));
  }

  note('\n=== GLASSWING (c): the in-combat dive (airborne path) ===');
  {
    newRun();
    Game.debugScenario('glasswing');
    const g = Game.state.scholar; stripAb(g);
    // start combat with the player inside dive range: the speed-5 darter
    // OPENS with the dive declared — the honest airborne path.
    // Monster 3 tiles east: the fall-path streak reads on the grid.
    g.mx = 4; g.my = 4; g.monster.mx = 7; g.monster.my = 4;
    Game.startCombat('glasswing');
    let gm = MON();
    gm.hp = gm.maxHp = 200;
    P().hp = P().maxHp = 500;
    const p = P();
    note(`opens: phase=${gm.beamPhase} telegraph=${!!gm.telegraph} (monster opens at speed 5)`);
    let sh = diveShadow();
    note(`dive shadow: ${JSON.stringify(sh)}`);
    if (sh && sh.phase === 'dive') {
      note(`DIVE SHADOW: target=(${sh.tile.x},${sh.tile.y}) = player tile (${p.mx},${p.my}), ` +
        `turnsLeft=${sh.turnsLeft}, streak=${sh.streak.length} cells ${JSON.stringify(sh.streak)}`);
      note('FEEL: the shadow sits on YOUR tile with the fall-path streak — move or eat it. Nothing else reads like this.');
    }
    // DODGE it: step off the locked tile (interior tiles)
    const tx = sh && sh.tile ? sh.tile.x : p.mx, ty = sh && sh.tile ? sh.tile.y : p.my;
    moveTo(tx === 7 ? 6 : tx + 1, ty === 7 ? 6 : ty + 1);
    note(`dodged to (${P().mx},${P().my}).`);
    const hpB = P().hp;
    endTurn(); // resolve → miss → grounded
    gm = MON();
    note(`resolve: player took ${hpB - P().hp}, phase=${gm && gm.beamPhase} gwGrounded=${gm && gm.gwGrounded}`);
    note('FEEL: ' + (gm && gm.beamPhase === 'grounded' && P().hp === hpB
      ? 'the in-combat dive is dodgeable by moving, and the crash opens the punish window. The loop is complete: soar → shadow → DIVE → aftermath.'
      : 'PROBLEM in the dive loop'));
    try { Game.tbEnd('fled'); } catch (e) {}
  }

  note('\n=== SUNBASKER (a): pressure — strike every turn ===');
  {
    newRun();
    Game.debugScenario('sunbasker');
    const g = Game.state.scholar; stripAb(g);
    g.mx = g.monster.mx - 3; g.my = g.monster.my;
    for (let i = 0; i < 6 && !Game.tbfight; i++) Game.monsterTurn();
    let m = MON(); m.hp = m.maxHp = 300;
    P().hp = P().maxHp = 500;
    for (let r = 1; r <= 5 && !Game.tbfight.over; r++) {
      m = MON(); if (!m) break;
      const h = heat();
      note(`round ${r}: charge=${m.sbCharge} phase=${m.beamPhase} halo=${h ? `charge${h.charge} ring${h.ring.length}` : 'none'} mhp=${m.hp} declared=${!!m.telegraph}`);
      if (Game.tbIsPlayerTurn()) {
        const p = P();
        if (Math.max(Math.abs(p.mx - m.mx), Math.abs(p.my - m.my)) > 1) moveTo(m.mx - 1, m.my);
        else strike(m.key);
      } else endTurn();
    }
    m = MON();
    // pressure works iff the bite was NEVER declared (charge never hit 2)
    const everDeclared = Game.log.some(l => /Sun-Charged Bite incoming/i.test(l));
    note(`after 5 pressure rounds: monster charge=${m && m.sbCharge}, alive=${!!m}, player hp=${P().hp}, bite ever declared=${everDeclared}`);
    note('audio: ' + audioFired.join(','));
    note('FEEL: ' + (!everDeclared ? 'pressure works — the charge never builds, the bite never comes. The loop is legible: hit it or else.' : 'charge built despite pressure — PROBLEM'));
    try { Game.tbEnd('fled'); } catch (e) {}
  }

  note('\n=== SUNBASKER (b): neglect — let it bask, eat the full bite ===');
  {
    newRun();
    Game.debugScenario('sunbasker');
    const g = Game.state.scholar; stripAb(g);
    g.mx = g.monster.mx - 3; g.my = g.monster.my;
    for (let i = 0; i < 6 && !Game.tbfight; i++) Game.monsterTurn();
    let m = MON(); m.hp = m.maxHp = 300;
    P().hp = P().maxHp = 500;
    // stand off at distance: wait while it basks (move adjacent but don't strike)
    const p0 = P();
    moveTo(m.mx - 1, m.my);
    let declared = false;
    for (let r = 1; r <= 4 && !Game.tbfight.over; r++) {
      m = MON(); if (!m) break;
      const h = heat();
      note(`round ${r}: charge=${m.sbCharge} phase=${m.beamPhase} halo=${h ? `charge${h.charge}` : 'none'} telegraph=${!!m.telegraph}`);
      if (m.telegraph && !declared) {
        declared = true;
        note(`bite declared at charge ${m.sbCharge}. cue: "${m.telegraph.cueText}"`);
        const hpB = P().hp;
        waitTurn(); // resolve
        m = MON();
        const dealt = hpB - P().hp;
        note(`full bite dealt ${dealt} (player was ${hpB}, charge spent → ${m && m.sbCharge})`);
        note('FEEL: ' + (dealt >= 16 ? 'the full bite HURTS — neglect is punished, the lesson lands.' : 'bite felt weak for full charge'));
        break;
      }
      waitTurn();
    }
    if (!declared) note('PROBLEM: bite never declared');
    note('audio: ' + audioFired.join(','));
    try { Game.tbEnd('fled'); } catch (e) {}
  }

  note('\n=== SUNBASKER (c): shade flattens — no sun, no fight ===');
  {
    const s = newRun();
    Game.debugScenario('sunbasker');
    const g = Game.state.scholar; stripAb(g);
    // force shade: tree next to the monster
    const m0 = g.monster;
    Game.genDetail = () => { const gr = flatGrid(); gr[m0.my][m0.mx + 1] = 'tree'; return gr; };
    g.mx = m0.mx - 3; g.my = m0.my;
    for (let i = 0; i < 6 && !Game.tbfight; i++) Game.monsterTurn();
    const m = MON();
    endTurn();
    const m2 = MON();
    note(`in shade: sbFlat=${m2 && m2.sbFlat}, halo=${JSON.stringify(heat())}`);
    note('audio: ' + audioFired.join(','));
    note('FEEL: ' + (m2 && m2.sbFlat && !heat() ? 'flatten reads — no glow, no fight. Shade is the answer.' : 'PROBLEM'));
    Game.genDetail = () => flatGrid();
    try { Game.tbEnd('fled'); } catch (e) {}
  }

  note('\nDONE — see FEEL lines above.');
  process.exit(0);
})();
