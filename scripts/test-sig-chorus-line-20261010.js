#!/usr/bin/env node
// PROOF TEST: chorus_line signature mechanic (sigW3b, 2026-10-10).
// Proves, driving a real headless fight:
//   1. VISIBLE 4/4 BEAT: beats 1-3 narrate the count + facing; the audio
//      cue fires (chorusBeat, downbeat flag); only the downbeat kicks.
//   2. DANCE: dancing on the downbeat round -> untouchable (0 damage),
//      honestly narrated.
//   3. MOVE ON THE BEAT: moving every round -> the kick catches air
//      (quarter damage, narrated).
//   4. FLANK: a downbeat taken outside the frontal arc -> halved kick.
//   5. GRAVEL: throwing gravel stumbles the line — no beat, no kick.
//   6. DEAFNESS: with the deaf status the beat count is hidden but the
//      downbeat kick still lands.
// BEFORE/AFTER: MECHANIC=off skips hook registration -> the gate goes RED.
// Green across 3 seeds: SEED=1,2,3 node scripts/test-sig-chorus-line-20261010.js
const H = require('./sim-harness.js');
const SEED = parseInt(process.env.SEED || '1', 10);
const MECHANIC_OFF = process.env.MECHANIC === 'off';

let pass = 0, fail = 0;
const ok = (name, cond, detail) => {
  if (cond) { pass++; }
  else { fail++; console.log('  FAIL: ' + name + (detail ? ' — ' + detail : '')); }
};

function endTurn(Game) {
  if (!Game.tbfight || Game.tbfight.over) return;
  if (!Game.tbIsPlayerTurn()) return;
  const p = Game.tbFighter('p');
  if (!p) return;
  p.moveLeft = 0; p.acted = true;
  Game.tbAfterPlayerAction();
}
function monsterOf(Game) {
  return Game.tbfight.fighters.find(x => x.kind === 'monster' && x.alive && !x.fled);
}
function endFight(Game) {
  if (Game.tbfight) { Game.tbfight.over = true; Game.tbfight = null; }
  Game.state.scholar.monster = null;
}
function placePlayer(Game, x, y) {
  const p = Game.tbFighter('p');
  p.mx = x; p.my = y;
  Game.state.scholar.mx = x; Game.state.scholar.my = y;
}
// advance until it's the player's turn; run one full monster phase and
// report the player's hp delta + say lines seen during it.
function monsterPhase(Game, said) {
  if (Game.tbIsPlayerTurn()) { Game.tbPlayerWait(); endTurn(Game); }
  const b = Game.tbFighter('p').hp;
  const n0 = said.length;
  let g = 0;
  while (Game.tbfight && !Game.tbfight.over && !Game.tbIsPlayerTurn() && g++ < 50) Game.tbAdvance();
  return { dhp: Game.tbFighter('p').hp - b, lines: said.slice(n0).join(' ') };
}

(async () => {
  const { Game } = await H.loadGame({ seed: SEED });
  await H.setupGame(Game);
  Game.depart();
  console.log('== CHORUS LINE PROOF, SEED ' + SEED + ', MECHANIC ' + (MECHANIC_OFF ? 'OFF' : 'ON') + ' ==');
  const said = [];
  Game.say = (t) => { said.push(String(t)); };
  const audio = [];
  Game.audioEvent = (n, d) => { audio.push({ n, d }); };

  const HB = globalThis.MonsterBehaviorHooks || {};
  const mechanicOn = typeof HB.chorusBeat === 'function' && typeof Game.tbChorusDance === 'function';
  ok('mechanic registered (hook + player actions)', mechanicOn,
    'chorusBeat=' + typeof HB.chorusBeat + ' tbChorusDance=' + typeof Game.tbChorusDance);
  if (!mechanicOn) {
    console.log('MECHANIC off — signature absent as expected; skipping behavior checks.');
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(1);
  }

  const s = Game.state.scholar;

  // ---------- Fight 1: the count, the kick, dance ----------
  s.health = 9000; s.mx = 4; s.my = 4;
  s.inventory = [{ itemId: 'gravel', name: 'Handful of gravel', units: 2 }];
  Game.startCombat('chorus_line');
  let m = monsterOf(Game);
  // stand still, wait through a full 4/4: beats must count, then the kick
  said.length = 0; audio.length = 0;
  let kickDhp = 0, downbeatSeen = false;
  for (let b = 0; b < 4; b++) {
    let g2 = 0;
    while (Game.tbfight && !Game.tbfight.over && !Game.tbIsPlayerTurn() && g2++ < 50) Game.tbAdvance();
    if (!Game.tbfight || Game.tbfight.over) break;
    const bb = Game.tbFighter('p').hp;
    const n1 = said.length;
    Game.tbPlayerWait();
    endTurn(Game); // the monster turn runs here
    const seg = said.slice(n1).join(' ');
    if (/DOWNBEAT/.test(seg)) { downbeatSeen = true; kickDhp = bb - Game.tbFighter('p').hp; }
  }
  const beatLines = said.join(' ');
  ok('beat 1/4 counted', /BEAT 1\/4/.test(beatLines));
  ok('beat 2/4 counted', /BEAT 2\/4/.test(beatLines));
  ok('beat 3/4 counted with downbeat warning', /BEAT 3\/4.*Downbeat next/.test(beatLines));
  ok('facing named in the count', /faces (north|south|east|west)/.test(beatLines));
  ok('audio cue fired per beat', audio.filter(a => a.n === 'chorusBeat').length >= 3,
    audio.map(a => a.n).join(','));
  ok('downbeat audio flagged', audio.some(a => a.n === 'chorusBeat' && a.d && a.d.downbeat === true));
  ok('downbeat kick announced', downbeatSeen);
  ok('standing still: the kick lands full', kickDhp > 0, 'dmg=' + kickDhp);
  // only the downbeat kicks: no kick damage on beats 1-3
  ok('no kick on off-beats (telegraph honesty)', !/kick lands on you/.test(beatLines.split('DOWNBEAT')[0]));

  // dance through the next downbeat: untouchable
  said.length = 0;
  // wait until the next downbeat is one monster turn away, then dance
  let guard = 0;
  while (Game.tbfight && !Game.tbfight.over && guard++ < 30) {
    m = monsterOf(Game);
    if ((m.clBeat % 4) === 3 && Game.tbIsPlayerTurn()) break;
    if (Game.tbIsPlayerTurn()) { Game.tbPlayerWait(); endTurn(Game); }
    else Game.tbAdvance();
  }
  ok('reached the pre-downbeat turn', guard < 30, 'guard=' + guard);
  ok('dance action works', Game.tbChorusDance() === true);
  // end the player turn -> the downbeat monster turn runs synchronously
  let n0 = said.length;
  const hb = Game.tbFighter('p').hp;
  endTurn(Game);
  const drLines = said.slice(n0).join(' ');
  const drDhp = Game.tbFighter('p').hp - hb;
  ok('dancing: untouchable on the downbeat', drDhp === 0, 'dhp=' + drDhp);
  ok('dance narrated honestly', /untouchable/.test(drLines), drLines.slice(0, 160));
  endFight(Game);

  // ---------- Fight 2: move on the beat ----------
  s.health = 9000; s.mx = 4; s.my = 4;
  s.inventory = [];
  Game.startCombat('chorus_line');
  m = monsterOf(Game);
  said.length = 0;
  // move every round (alternate two tiles); when the downbeat comes,
  // the kick should catch air
  let airSeen = false, airDmg = null;
  guard = 0;
  while (Game.tbfight && !Game.tbfight.over && guard++ < 40 && !airSeen) {
    let g2 = 0;
    while (Game.tbfight && !Game.tbfight.over && !Game.tbIsPlayerTurn() && g2++ < 50) Game.tbAdvance();
    if (!Game.tbfight || Game.tbfight.over) break;
    const p = Game.tbFighter('p');
    const tx = p.mx < 7 ? p.mx + 1 : p.mx - 1;
    Game.tbPlayerMove(tx, p.my);
    n0 = said.length;
    const b2 = Game.tbFighter('p').hp;
    endTurn(Game); // the monster turn runs here
    const seg = said.slice(n0).join(' ');
    if (/DOWNBEAT/.test(seg)) {
      airSeen = /moving ON the beat/.test(seg);
      airDmg = b2 - Game.tbFighter('p').hp;
    }
  }
  ok('moving on the beat dodges the kick', airSeen);
  ok('dodged kick is quarter damage', airDmg !== null && airDmg <= 12, 'dmg=' + airDmg);
  endFight(Game);

  // ---------- Fight 3: flank halves the kick ----------
  s.health = 9000; s.mx = 4; s.my = 4;
  Game.startCombat('chorus_line');
  m = monsterOf(Game);
  const dmgAt = (faceDx, faceDy, px, py) => {
    m.clBeat = 3; // the next monster turn is the downbeat
    m.clFacing = { x: faceDx, y: faceDy };
    m.mx = 4; m.my = 4;
    placePlayer(Game, px, py);
    m.clLastPx = px; m.clLastPy = py; // not "moving"
    const p = Game.tbFighter('p');
    p.clDanceToken = 0; m.clSeenDance = 0;
    said.length = 0;
    const b = Game.tbFighter('p').hp;
    const n0 = said.length;
    // run exactly one monster turn (the downbeat), whichever side is up
    if (Game.tbIsPlayerTurn()) endTurn(Game);
    else Game.tbAdvance();
    return { dmg: b - Game.tbFighter('p').hp, lines: said.slice(n0).join(' ') };
  };
  // monster at (4,4); facing south; player north of it = flank
  m.mx = 4; m.my = 4;
  const flank = dmgAt(0, 1, 4, 2);
  ok('flank kick narrated', /flank/.test(flank.lines), flank.lines.slice(0, 120));
  ok('flank kick halved (<=24)', flank.dmg <= 24 && flank.dmg > 0, 'dmg=' + flank.dmg);
  // player south of it = frontal: full kick
  const front = dmgAt(0, 1, 4, 6);
  ok('frontal kick full (> flank)', front.dmg > flank.dmg, 'front=' + front.dmg + ' flank=' + flank.dmg);
  endFight(Game);

  // ---------- Fight 4: gravel breaks the count ----------
  s.health = 9000; s.mx = 4; s.my = 4;
  s.inventory = [{ itemId: 'gravel', name: 'Handful of gravel', units: 2 }];
  Game.startCombat('chorus_line');
  m = monsterOf(Game);
  said.length = 0;
  // wait for the player's turn, then throw gravel
  guard = 0;
  while (Game.tbfight && !Game.tbfight.over && !Game.tbIsPlayerTurn() && guard++ < 20) Game.tbAdvance();
  const gravelBefore = (s.inventory.find(i => (i.itemId || i.id) === 'gravel') || {}).units;
  ok('throw gravel works', Game.tbChorusThrowGravel() === true);
  const beatBefore = m.clBeat;
  n0 = said.length;
  endTurn(Game); // the monster turn runs here — it should stumble, not count
  const stumbleLines = said.slice(n0).join(' ');
  const gravelAfter = (s.inventory.find(i => (i.itemId || i.id) === 'gravel') || {}).units;
  ok('gravel consumed', gravelAfter === gravelBefore - 1, gravelBefore + ' -> ' + gravelAfter);
  ok('the line stumbles: no beat, no kick', m.clBeat === beatBefore, 'beat ' + beatBefore + ' -> ' + m.clBeat);
  ok('stumble narrated', /stumbles/.test(stumbleLines), stumbleLines.slice(0, 140));
  endFight(Game);

  // ---------- Fight 5: deafness hides the count, not the kick ----------
  s.health = 9000; s.mx = 4; s.my = 4;
  s.inventory = [];
  Game.startCombat('chorus_line');
  m = monsterOf(Game);
  Game.applyStatus('scholar', 'deaf', { turns: 20, source: 'test' });
  ok('deaf status applied', Game.hasStatus('scholar', 'deaf'));
  said.length = 0;
  const hpD0 = Game.tbFighter('p').hp;
  guard = 0;
  while (Game.tbfight && !Game.tbfight.over && guard++ < 40) {
    if (Game.tbIsPlayerTurn()) { Game.tbPlayerWait(); endTurn(Game); }
    else Game.tbAdvance();
    if ((monsterOf(Game) || {}).clBeat >= 4) break;
  }
  const deafLines = said.join(' ');
  const deafTook = hpD0 - Game.tbFighter('p').hp;
  ok('deaf: no beat count shown', !/♪ BEAT/.test(deafLines));
  ok('deaf: the kick still lands', deafTook > 0, 'took ' + deafTook);
  // terminate for real
  m = monsterOf(Game);
  if (m) m.hp = 1;
  guard = 0;
  while (Game.tbfight && !Game.tbfight.over && guard++ < 200) {
    if (Game.tbIsPlayerTurn()) {
      const mm = monsterOf(Game);
      if (mm) { placePlayer(Game, mm.mx + 1, mm.my); Game.tbPlayerStrike(mm.key); }
      endTurn(Game);
    } else Game.tbAdvance();
  }
  ok('fight terminates within 200 rounds', !Game.tbfight || Game.tbfight.over, 'guard=' + guard);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('TEST CRASH:', e.message); process.exit(1); });
