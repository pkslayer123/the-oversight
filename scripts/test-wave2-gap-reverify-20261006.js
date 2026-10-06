// WAVE-2 GAP RE-VERIFICATION (Steve 2026-10-06) — read-only verification task.
// Re-plays the 6 open gaps from evidence/2026-10-06/wave2-playverify-20261006.md
// against the CURRENT worktree (uncommitted sibling fixes included).
// Verdicts (FIXED / PARTIAL / STILL OPEN) come from PLAYED passes as a player,
// not from static reads. Deterministic RNG (seed 20261006). Turn hygiene:
// endTurn = exactly one AI round per player turn; movement on interior tiles
// 1..7 only. Plain node, NOT jest. No concurrent test processes.
// Run: node scripts/test-wave2-gap-reverify-20261006.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
(function seed(seed) {
  let s = seed >>> 0;
  Math.random = function () {
    s |= 0; s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
})(20261006);

global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/progression.js', 'src/js/encounters.js', 'src/js/food.js',
 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js',
 'src/js/justice.js', 'src/js/debug-scenarios.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;
const APP_SRC = fs.readFileSync(path.join(ROOT, 'src/js/app.js'), 'utf8');
const REG_KEYS = new Set([...APP_SRC.matchAll(/^\s{6}([a-zA-Z][\w-]*)\(/gm)].map(m => m[1]));

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}
function note(name, detail) { console.log(`  NOTE ${name}${detail ? ' — ' + detail : ''}`); }

const P = () => Game.tbFighter('p');
// TURN HYGIENE: advance exactly one AI round, never two.
function endTurn() {
  if (!Game.tbfight || Game.tbfight.over) return;
  if (!Game.tbIsPlayerTurn()) return;
  const p = P(); if (!p) return; p.moveLeft = 0; p.acted = true;
  Game.tbAfterPlayerAction();
}
const SPEAR = { itemId: 'fire_hardened_spear', name: 'Fire-hardened spear' };
let says = [], audioFired = [];
function newFight(id, playerHp, monsterHp) {
  try { if (Game.tbfight && !Game.tbfight.over) Game.tbEnd('fled'); } catch (e) {}
  says = [];
  Game.startCombat(id);
  const m = Game.tbfight.fighters.find(x => x.kind === 'monster');
  if (!m) throw new Error('newFight: no monster for ' + id);
  if (monsterHp) m.hp = m.maxHp = monsterHp;
  const pl = P(); pl.hp = pl.maxHp = (playerHp || 100);
  pl.mx = Math.min(7, Math.max(1, m.mx - 3)); pl.my = Math.min(7, Math.max(1, m.my));
  Game.state.scholar.mx = pl.mx; Game.state.scholar.my = pl.my;
  Game.state.scholar.equipped.weapon = Object.assign({}, SPEAR);
  return m;
}
function moveToward(tx, ty) {
  const p = P(); if (!p) return;
  let guard = 0;
  while (Game.tbIsPlayerTurn() && !p.acted && p.moveLeft > 0 && guard++ < 8 &&
    Math.max(Math.abs(p.mx - tx), Math.abs(p.my - ty)) > 2) {
    const nx = Math.min(7, Math.max(1, p.mx + Math.sign(tx - p.mx)));
    const ny = Math.min(7, Math.max(1, p.my + Math.sign(ty - p.my)));
    if (!Game.tbPlayerMove(nx, ny)) break;
  }
}
function strikeKey(key) {
  if (Game.tbIsPlayerTurn() && P() && !P().acted) return Game.tbPlayerStrike(key);
  return null;
}
function playRound(strategy) {
  const st = { over: false, lastPhp: P() ? P().hp : 0, result: null };
  const f0 = Game.tbfight; // tbEnd nulls Game.tbfight in a finally — read result off the object
  if (!f0 || f0.over) { st.over = true; st.result = f0 && f0.result; return st; }
  if (P() && P().alive) st.lastPhp = P().hp;
  if (Game.tbIsPlayerTurn() && P() && P().alive && !P().acted) strategy();
  endTurn();
  st.over = !Game.tbfight || Game.tbfight.over || f0.over;
  st.result = f0.over ? f0.result : null;
  if (P() && P().alive) st.lastPhp = P().hp;
  return st;
}
const ALLIES_OF = (m) => Game.tbfight ? Game.tbfight.fighters.filter(x => x.kind === 'monster' && x.alive && !x.fled && x.key !== m.key) : [];

(async () => {
  await Game.init();
  Game.genDetail = () => Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => 'grass'));
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart(); Game.dayPart = 1;
  Game.state.scholar.health = 500;
  Game.state.scholar.equipped = { weapon: Object.assign({}, SPEAR) };
  Game.canSee = () => true;
  Game.say = (t) => { says.push(String(t)); };
  const origAudio = Game.audioEvent;
  Game.audioEvent = function (name, d) { audioFired.push(name); return origAudio.call(this, name, d); };

  console.log('== GAP 1 (P0) + GAP 6. union_rep: walkout soft-lock + organizing beat ==');
  console.log('   Play: wait for WALKOUT, try to strike the rep (expect refusal),');
  console.log('   break the picket line for real, then finish the rep.');
  {
    const audioMark = audioFired.length;
    const m = newFight('union_rep', 300, 160);
    m.hp = 60; // under half of 160: the next rep turn must WALKOUT
    const phases = new Set();
    let sawWalkout = false, refused = false, sawBreak = false, struckAfterBreak = false;
    let repHpAtBreak = null, finalResult = null, allyDmgDealt = false, gr1 = 0;
    for (let r = 0; r < 40; r++) {
      gr1 = r + 1;
      const st = playRound(() => {
        if (m.urWalkout && !m.urLineBroken) {
          // During the walkout: the rep should refuse clean shots...
          moveToward(m.mx, m.my);
          const res = strikeKey(m.key);
          if (res === false && says.join('\n').includes("can't get a clean shot")) refused = true;
          // ...so break the line the honest way: kill the picket.
          const a = ALLIES_OF(m)[0];
          if (a && Game.tbIsPlayerTurn() && P() && !P().acted) {
            const ahp = a.hp;
            moveToward(a.mx, a.my);
            strikeKey(a.key);
            if (a.hp < ahp) allyDmgDealt = true;
          }
        } else if (!m.urWalkout) {
          // Before the walkout: wait. After the break: strike the rep.
          if (m.urLineBroken) { moveToward(m.mx, m.my); strikeKey(m.key); }
        }
      });
      phases.add(m.beamPhase);
      if (m.beamPhase === 'walkout' || m.urWalkout) sawWalkout = true;
      if (says.join('\n').includes('LINE is broken') && repHpAtBreak === null) { sawBreak = true; repHpAtBreak = m.hp; }
      if (sawBreak && m.hp < repHpAtBreak) struckAfterBreak = true;
      if (st.over) { finalResult = st.result; break; }
    }
    check('walkout fired at half HP', sawWalkout);
    check('rep untargetable during walkout (clean-shot refusal)', refused);
    check('picket ally strikable during walkout', allyDmgDealt);
    check('the line breaks when the picket is dead', sawBreak, says.slice(-4).join(' | '));
    check('urWalkout cleared + urLineBroken set', m.urWalkout === false && m.urLineBroken === true);
    check('rep strikable after the break', struckAfterBreak, `rep hp at break ${repHpAtBreak} -> ${m.hp}`);
    check('fight finishable: player WON', finalResult === 'won', `result=${finalResult}`);
    check('GAP 6: organizing got a visible beat (clipboard)', says.join('\n').includes('clipboard'));
    check('GAP 6: organizing phase observed', phases.has('organizing'), [...phases].join(','));
    const newAudio = audioFired.slice(audioMark);
    check('all fired audio resolves in registry', newAudio.every(n => REG_KEYS.has(n)), newAudio.filter(n => !REG_KEYS.has(n)).join(','));
    note('phases seen', [...phases].join(' -> '));
    note('arc evidence', `rounds:${gr1} walkout:${sawWalkout} refused:${refused} break:${sawBreak} repHp ${repHpAtBreak}->${m.hp} result:${finalResult}`);
  }

  console.log('== GAP 2 + GAP 5. heckler: threat floor + warming_up beat ==');
  console.log('   Play: strike-play (the threat case), measure realized damage/round,');
  console.log('   watch the phase timeline and the Vicious Mockery chip.');
  {
    const audioMark = audioFired.length;
    const m = newFight('heckler', 400, 400);
    const phases = new Set(); const phaseFirst = {}; const chips = [];
    phases.add(m.beamPhase); phaseFirst[m.beamPhase] = 0; // intro turn ran inside startCombat
    const hp0 = P().hp; let rounds = 0, lastPhp = hp0, parsed = 0;
    for (let r = 0; r < 20; r++) {
      const st = playRound(() => { moveToward(m.mx, m.my); strikeKey(m.key); });
      rounds++;
      if (!(m.beamPhase in phaseFirst)) phaseFirst[m.beamPhase] = rounds;
      phases.add(m.beamPhase);
      for (let i = parsed; i < says.length; i++) {
        const mm = says[i].match(/The words find the soft places\. \((\d+) psychic/);
        if (mm) chips.push(+mm[1]);
      }
      parsed = says.length;
      lastPhp = st.lastPhp;
      if (st.over) break;
    }
    const realized = (hp0 - lastPhp) / rounds;
    check('GAP 5: warming_up narrated (knuckles/cat beat)', /cracks its knuckles|cat watches a dropped glass/.test(says.join('\n')));
    // The intro turn runs inside startCombat; the warm-up narration always
    // fires there, before any heckling/headliner content. (The phase chip
    // itself flips to heckling on the first jibe, which is RNG-timed — the
    // beat the player reads is the narration.)
    const log = says.join('\n');
    const warmIdx = log.search(/cracks its knuckles|cat watches a dropped glass/);
    const headIdx = log.search(/LIVE ONE/);
    check('GAP 5: warming_up beat reads BEFORE the headliner in the play log',
      warmIdx >= 0 && headIdx > warmIdx, `warm@${warmIdx} headliner@${headIdx}`);
    check('GAP 5: heckling + headliner phases observed in play',
      phases.has('heckling') && phases.has('headliner'), [...phases].join(','));
    note('GAP 5: phase timeline', Object.entries(phaseFirst).map(([k, v]) => `${k}@R${v}`).join(' '));
    check('Vicious Mockery chip fires in play', chips.length > 0, `chips=[${chips.join(',')}]`);
    check('chip values 6-10', chips.length > 0 && chips.every(c => c >= 6 && c <= 10));
    check('hecklerTaunt fired (deepened synth at pile-on)', audioFired.slice(audioMark).includes('hecklerTaunt'));
    note('GAP 2: realized threat', `${realized.toFixed(1)} dmg/round over ${rounds} rounds (hp ${hp0}->${lastPhp}); bar was 14/round, prior realized 2.3/round`);
    const newAudio = audioFired.slice(audioMark);
    check('all fired audio resolves in registry', newAudio.every(n => REG_KEYS.has(n)), newAudio.filter(n => !REG_KEYS.has(n)).join(','));
  }

  console.log('== GAP 3. paparazzo: exclusive reachability ==');
  console.log('   Play A: strike-through (the original gap case — chase and kill fast).');
  {
    const audioMark = audioFired.length;
    const m = newFight('paparazzo', 400, 120);
    let predMax = 0, excl = false, exclRound = -1, killRound = -1, finalResult = null;
    for (let r = 0; r < 10; r++) {
      const st = playRound(() => { moveToward(m.mx, m.my); strikeKey(m.key); });
      predMax = Math.max(predMax, m.pzPrediction || 0);
      if (m.beamPhase === 'exclusive' && exclRound < 0) exclRound = r + 1;
      if (m.beamPhase === 'exclusive') excl = true;
      if (st.over) { killRound = r + 1; finalResult = st.result; break; }
    }
    note('Play A (strike-through, 120hp)', `kill at R${killRound} (result ${finalResult}), max prediction ${predMax}/4, exclusive fired: ${excl}@R${exclRound}`);
    check('Play A observation recorded', killRound > 0);
    const newAudio = audioFired.slice(audioMark);
    check('all fired audio resolves in registry', newAudio.every(n => REG_KEYS.has(n)), newAudio.filter(n => !REG_KEYS.has(n)).join(','));
  }
  console.log('   Play A2: strike-through at DATA-RANGE hp (80) — the original 3-round kill.');
  {
    const m = newFight('paparazzo', 400, 80);
    let predMax = 0, excl = false, exclRound = -1, killRound = -1, finalResult = null;
    for (let r = 0; r < 10; r++) {
      const st = playRound(() => { moveToward(m.mx, m.my); strikeKey(m.key); });
      predMax = Math.max(predMax, m.pzPrediction || 0);
      if (m.beamPhase === 'exclusive' && exclRound < 0) exclRound = r + 1;
      if (m.beamPhase === 'exclusive') excl = true;
      if (st.over) { killRound = r + 1; finalResult = st.result; break; }
    }
    note('Play A2 (strike-through, 80hp)', `kill at R${killRound} (result ${finalResult}), max prediction ${predMax}/4, exclusive fired: ${excl}@R${exclRound}`);
  }
  console.log('   Play B: stationary player (the sibling fix — still subject feeds prediction double).');
  {
    const audioMark = audioFired.length;
    const m = newFight('paparazzo', 400, 400);
    // Harness-artifact compensation: newFight repositions the player AFTER
    // startCombat's intro turn, so the intro's pzLast snapshot is stale. In
    // real play the player doesn't teleport between intro and R1 — re-sync it.
    m.pzLastPx = P().mx; m.pzLastPy = P().my;
    let exclRound = -1, predAtExcl = -1;
    const predByRound = [];
    for (let r = 0; r < 12; r++) {
      const st = playRound(() => {}); // plant feet: no movement at all
      predByRound.push(`R${r + 1}:${m.pzPrediction || 0}`);
      if (m.beamPhase === 'exclusive' && exclRound < 0) { exclRound = r + 1; predAtExcl = m.pzPrediction; }
      if (st.over) break;
    }
    check('exclusive fires vs a stationary player', exclRound > 0, `exclusive@R${exclRound}`);
    check('exclusive at prediction 4 (codex-true)', predAtExcl === 4, `pred=${predAtExcl}`);
    check('still-player coaching said', says.join('\n').includes('Hold still. Yes. Just like that.'));
    check('unavoidable cue warns (UNAVOIDABLE/UNBLOCKABLE)', /UNAVOIDABLE|UNBLOCKABLE/.test(says.join('\n')));
    note('Play B prediction climb', predByRound.join(' '));
    const newAudio = audioFired.slice(audioMark);
    check('all fired audio resolves in registry', newAudio.every(n => REG_KEYS.has(n)), newAudio.filter(n => !REG_KEYS.has(n)).join(','));
  }

  console.log('== GAP 4. understudy: passive-player stall ==');
  console.log('   Play: never attack, 8 rounds. The gap asked for a prod after ~3');
  console.log('   watching turns with zero observations.');
  {
    const audioMark = audioFired.length;
    const m = newFight('understudy', 300, 400);
    const hp0 = P().hp; const phases = new Set();
    let rounds = 0, lastPhp = hp0, over = false;
    for (let r = 0; r < 8; r++) {
      const st = playRound(() => {}); // passive: never strikes
      rounds++;
      phases.add(m.beamPhase);
      lastPhp = st.lastPhp;
      if (st.over) { over = true; break; }
    }
    const prodSaid = /make you MOVE|bored of watching|shove|impatient|nothing to learn/i.test(says.join('\n'));
    const obsCount = Object.keys(m.usSeen || {}).length;
    note('passive 8 rounds', `player hp ${hp0}->${lastPhp}, observations ${obsCount}, phases {${[...phases].join(',')}}, fight over: ${over}`);
    check('no prod exists in the say log (fix NOT present)', !prodSaid);
    check('monster never acted (player HP untouched)', lastPhp === hp0, `hp ${hp0}->${lastPhp}`);
    check('zero observations recorded', obsCount === 0);
    check('stall persists: fight unresolved after 8 passive rounds', !over);
    const newAudio = audioFired.slice(audioMark);
    check('all fired audio resolves in registry', newAudio.every(n => REG_KEYS.has(n)), newAudio.filter(n => !REG_KEYS.has(n)).join(','));
  }

  const unregistered = [...new Set(audioFired)].filter(n => !REG_KEYS.has(n));
  console.log(`\n${pass} pass, ${fail} fail${unregistered.length ? ' — UNREGISTERED AUDIO: ' + unregistered.join(',') : ''}`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
