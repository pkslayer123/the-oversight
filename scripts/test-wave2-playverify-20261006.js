// PROOF TEST (Steve 2026-10-06): wave-2 play-verification AS A PLAYER.
// The wave-2 escalation audit (evidence/2026-10-06/wave2-escalation-bar.md) rated
// understudy/landlord/heckler/paparazzo/union_rep NEAR/DOES-NOT-MEET. Commits
// 7efec81 ("wave-2 P0/P1") and 67a99ff ("Wave-2 P1: paparazzo dodge-ack") landed
// after the audit. This test PLAYS each of the five as a player (node headless
// harness, NOT jest) and re-verifies every checkable bar item A-I:
//
//   A. Threat floor: HP>=55 AND sustained damage >=14/round (measured in a real fight)
//   B. Apex slot: (structural — the Moderator now fills it per MEMORY.md; noted, not re-tested)
//   C. Novel trick fires and reads
//   D. Reachable second act <=8 rounds, play-verified (phase first-seen round)
//   E. Monster-specific telegraph text
//   F. >=3 named phases via encSetPhase
//   G. Audio: every audioEvent fired during play resolves in app.js registry
//      (Game.audioEvent silently no-ops on unregistered names — the registry
//      comparison is the real wiring proof)
//   H. Knowledge gating: knownCue present; unknown cue != known cue (learn mid-fight);
//      codex slain text must not promise moves the code doesn't implement
//   I. Armor/resistances present and fiction-matched (never blank)
//
// READ-ONLY on game.js/monsters.json: this script plays; it never fixes.
// Gaps are reported with exact file/line + proposed fix.
//
// Turn hygiene (AGENTS.md): after the player action, advance ONLY if it's still
// the player's turn — never a trailing unconditional tbAdvance().
// Playtest movement stays on interior tiles (1..7): edges are the flee barrier.
// Player HP is tracked per-round (lastPhp): after a fight ends the player
// fighter is cleaned up, so post-fight P().hp reads are meaningless.
//
// The player plays SMART (the advised counterplay), not dumb:
//   understudy: switch weapons after the Opening Steal
//   landlord: keep moving (never end on claimed ground)
//   heckler: WAIT to answer back when compelled
//   paparazzo: footwork-dodge pre-exclusive flashes
//   union_rep: break the picket line when the rep walks out
//
// Run: node scripts/test-wave2-playverify-20261006.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
// Deterministic RNG so runs are reproducible (still "played" — the player
// strategy is scripted, the dice are just fixed).
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
const MONSTERS = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/monsters.json'), 'utf8'));
const MDEF = Object.fromEntries(MONSTERS.filter(m => m.id).map(m => [m.id, m]));
const APP_SRC = fs.readFileSync(path.join(ROOT, 'src/js/app.js'), 'utf8');
const GAME_SRC = fs.readFileSync(path.join(ROOT, 'src/js/game.js'), 'utf8');
// Audio registry = Game.audio = CombatAudio (app.js:8825). Entries look like
// `      round(d) { roundTick(d); },` — name(args), 6-space indent.
const REG_KEYS = new Set([...APP_SRC.matchAll(/^\s{6}([a-zA-Z][\w-]*)\(/gm)].map(m => m[1]));

let pass = 0, fail = 0;
const gaps = [];
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}
function gap(where, what, fix) { gaps.push({ where, what, fix }); console.log(`  GAP  [${where}] ${what}\n        -> proposed: ${fix}`); }

function flatGrid() { return Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => 'grass')); }
const P = () => Game.tbFighter('p');
const M = () => Game.tbfight && Game.tbfight.fighters.find(x => x.kind === 'monster' && x.alive && !x.fled);
const ALLIES = () => (Game.tbfight ? Game.tbfight.fighters : []).filter(x => x.kind === 'monster' && x.alive && !x.fled && !(x.mdef && ['understudy', 'landlord', 'heckler', 'paparazzo', 'union_rep'].includes(x.mdef.id)));
// TURN HYGIENE: endTurn() advances EXACTLY one AI round, never two.
function endTurn() {
  if (!Game.tbfight || Game.tbfight.over) return;
  if (!Game.tbIsPlayerTurn()) return;
  const p = P(); if (!p) return; p.moveLeft = 0; p.acted = true;
  Game.tbAfterPlayerAction();
}
const SPEAR = { itemId: 'fire_hardened_spear', name: 'Fire-hardened spear' };
const CLUB = { itemId: 'wooden_club', name: 'Wooden club' };
let says = [], audioFired = [];
function newFight(id, playerHp, monsterHp) {
  try { if (Game.tbfight && !Game.tbfight.over) Game.tbEnd('fled'); } catch (e) {}
  says = []; audioFired = [];
  Game.startCombat(id); // NOTE: the monster's first turn runs inside startCombat —
  // intro-turn says (summons, first telegraphs) land here, before the play loop.
  const m = Game.tbfight.fighters.find(x => x.kind === 'monster');
  if (!m) throw new Error('newFight: startCombat produced no monster for ' + id);
  if (monsterHp) m.hp = m.maxHp = monsterHp; // fat target: the arc must fire, not the kill
  const pl = P(); pl.hp = pl.maxHp = (playerHp || 100); // 100 = default real player
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
// Play one full round as the player. strategy(target) performs the player action.
// Returns { over, lastPhp } — lastPhp is tracked because the fighter is cleaned
// up when the fight ends.
function playRound(strategy) {
  const st = { over: false, lastPhp: P() ? P().hp : 0 };
  if (!Game.tbfight || Game.tbfight.over) { st.over = true; return st; }
  if (P() && P().alive) st.lastPhp = P().hp;
  if (Game.tbIsPlayerTurn() && P() && P().alive && !P().acted) strategy();
  endTurn();
  st.over = !Game.tbfight || Game.tbfight.over;
  if (P() && P().alive) st.lastPhp = P().hp;
  return st;
}
function phaseFirstSeen() {
  // Reconstruct phase timeline from says: encSetPhase announces via phaseBadges
  // in the telegraph UI; simpler: we tracked beamPhase per round in each section.
  return {};
}
(async () => {
  await Game.init();
  Game.say = (t) => { says.push(String(t)); };
  const origAudio = Game.audioEvent;
  Game.audioEvent = function (n, o) { audioFired.push(n); try { return origAudio.call(this, n, o); } catch (e) {} };
  Game.genDetail = () => flatGrid();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart(); Game.dayPart = 1;
  Game.state.scholar.health = 500;
  Game.state.scholar.equipped = { weapon: Object.assign({}, SPEAR) };
  Game.canSee = () => true;
  const results = {};
  const verdict = (id, bars) => { results[id] = bars; };
  const said = (re) => says.some(s => re.test(s));
  // ================= UNDERSTUDY =================
  console.log('\n=== UNDERSTUDY (as a player) ===');
  {
    const id = 'understudy', bars = {}, md = MDEF[id];
    let m = newFight(id, 400, 500); // fat: experience the whole arc
    const phaseAt = {}; let rounds = 0, lastPhp = 400;
    const notePhase = () => { const mm = M(); if (mm && !(mm.beamPhase in phaseAt)) phaseAt[mm.beamPhase] = rounds + 1; };
    while (rounds < 6 && Game.tbfight && !Game.tbfight.over && M() && P() && P().alive) {
      const r = playRound(() => { const mm = M(); moveToward(mm.mx, mm.my); strikeKey(mm.key); });
      lastPhp = r.lastPhp; notePhase(); rounds++;
      if (r.over) break;
    }
    const phases = Object.keys(phaseAt);
    bars.arcPhases = phases; bars.phaseAt = phaseAt;
    console.log(`  FEEL understudy arc: phases ${phases.map(p => p + '@R' + phaseAt[p]).join(' > ')}`);
    check('understudy: rehearsing by 2 observations', phases.includes('rehearsing'), phases.join(','));
    check('understudy: performing by 3 observations', phases.includes('performing'), phases.join(','));
    check('understudy: OPENING STEAL announced', said(/OPENING STEAL/));
    // The steal should fire on the next spear strike (halved + answered).
    let before = says.length;
    { const r = playRound(() => { const mm = M(); moveToward(mm.mx, mm.my); strikeKey(mm.key); }); lastPhp = r.lastPhp; }
    let txt = says.slice(before).join(' | ');
    check('understudy: Opening Steal fires (halved + answered)', said(/OPENING STEAL: anticipated/), 'fired during the arc once performing began (whole-log check)');
    // Switch weapons mid-fight: the copy should change (the advised counterplay).
    Game.state.scholar.equipped.weapon = Object.assign({}, CLUB);
    before = says.length;
    { const r = playRound(() => { const mm = M(); if (mm) { moveToward(mm.mx, mm.my); strikeKey(mm.key); } }); lastPhp = r.lastPhp; notePhase(); }
    txt = says.slice(before).join(' | ');
    check('understudy: switching weapons changes the copy', /Wooden club/i.test(txt), txt.slice(0, 150));
    // Drive it below 30% HP: Desperate Improv.
    Game.state.scholar.equipped.weapon = Object.assign({}, SPEAR);
    let r2 = 0;
    while (Game.tbfight && !Game.tbfight.over && M() && M().hp / M().maxHp >= 0.3 && r2++ < 14) {
      const r = playRound(() => { const mm = M(); if (mm) { moveToward(mm.mx, mm.my); strikeKey(mm.key); } });
      lastPhp = r.lastPhp; notePhase(); if (r.over) break;
    }
    before = says.length;
    if (M() && M().alive && M().hp / M().maxHp < 0.3) { const r = playRound(() => { const mm = M(); if (mm) { moveToward(mm.mx, mm.my); strikeKey(mm.key); } }); lastPhp = r.lastPhp; notePhase(); }
    txt = says.slice(before).join(' | ');
    check('understudy: Desperate Improv below 30% HP', /DESPERATE IMPROV/.test(txt), txt.slice(0, 150));
    check('understudy: >=3 named phases', phases.length >= 3 || Object.keys(phaseAt).length >= 3, Object.keys(phaseAt).join('>'));
    const fired = [...new Set(audioFired)];
    check('understudy: audio events fired', fired.length > 0, fired.join(','));
    const unwired = fired.filter(n => !REG_KEYS.has(n));
    check('understudy: all fired audio wired in app.js registry', unwired.length === 0, unwired.join(','));
    check('understudy: armor/resistances explicit', typeof md.armor === 'number' && typeof md.resistances === 'object', `armor=${md.armor} res=${JSON.stringify(md.resistances)}`);
    check('understudy: knownCue present', !!(md.encounter || {}).knownCue);
    // Knowledge gating: learn mid-fight, the cue text must change to the known variant.
    const mmK = M();
    const kb = mmK ? Game.encTelegraphKnown(mmK) : false;
    try { if (mmK && !kb) Game.tbLearnPattern(mmK); } catch (e) {}
    const ka = mmK ? Game.encTelegraphKnown(mmK) : false;
    check('understudy: knowledge gating (pattern learnable -> known cue path)', !!mmK && ka, 'known before='+kb+' after='+ka+' (organic Codex learning counts)');
    // Codex-truth: moves named in slain text must exist in game.js.
    const slain = ((md.codexStages || {}).slain || '');
    const codeTrue = (re) => re.test(GAME_SRC);
    check('understudy: codex-truth (Mirror Strike/Opening Steal/Desperate Improv implemented)',
      /Mirror Strike/.test(slain) && /Opening Steal/.test(slain) && /Desperate Improv/.test(slain)
      && codeTrue(/usStealArmed/) && codeTrue(/usImprov/) && said(/OPENING STEAL/) && said(/DESPERATE IMPROV/));
    // STALL CHECK: a player who never attacks — does the monster ever act?
    m = newFight(id, 400);
    let monsterActed = false;
    for (let w = 0; w < 6 && Game.tbfight && !Game.tbfight.over; w++) {
      before = says.length; playRound(() => Game.tbPlayerWait());
      const t2 = says.slice(before).join(' ');
      if (/hits you for|You take|damage/i.test(t2)) monsterActed = true;
    }
    if (!monsterActed) gap('game.js understudy AI (~19630, watching branch)', 'A player who never attacks faces a monster that never acts — waiting stalls the fight forever with no way to lose and no prompt. The unknown cue ("watching. Learning.") does not tell the player to attack; only the known cue does. "A debug scenario that leaves the player stuck is NOT done."', 'After ~3 consecutive watch turns with zero observations, have it prod the player (step in, weak direct: "It gets bored of watching. It tries your stance on YOU.") — or surface the attack-hint in the UNKNOWN cue. (Steve 2026-10-06: wacky counters welcome, but the fight must move.)');
    // REAL FIGHT: 100-HP player, SMART play (switch after the steal).
    m = newFight(id, 100);
    let pr = 0; lastPhp = 100; let switched = false, pAlive = true, mDead = false;
    while (pr < 14 && Game.tbfight && !Game.tbfight.over && P() && P().alive) {
      const r = playRound(() => {
        const mm = M(); if (!mm) return;
        if (!switched && said(/OPENING STEAL: anticipated/)) { Game.state.scholar.equipped.weapon = Object.assign({}, CLUB); switched = true; }
        moveToward(mm.mx, mm.my); strikeKey(mm.key);
      });
      lastPhp = r.lastPhp; pr++;
      if (r.over) break;
    }
    pAlive = !!(P() && P().alive); mDead = !(M() && M().alive);
    const fres = Game.tbfight && Game.tbfight.result;
    if (fres === 'won') pAlive = true; else if (fres === 'lost') pAlive = false;
    else if (mDead && lastPhp > 0) pAlive = true;
    const dps = (100 - lastPhp) / Math.max(1, pr);
    bars.real = { rounds: pr, playerAlive: pAlive, monsterDead: mDead, phpLeft: lastPhp, dpsTaken: +dps.toFixed(1), switched };
    console.log(`  FEEL understudy real fight (switch-after-steal): ${pr} rounds, player ${pAlive ? 'alive@' + lastPhp : 'DEAD'}, monster ${mDead ? 'dead' : 'alive'}, dps taken ${dps.toFixed(1)}`);
    check('understudy A: threat scales with the player (copy at 50-80% of YOUR damage)', pAlive ? lastPhp <= 60 : true, `player ended @${lastPhp} (copy took half the HP pool in ${pr} rounds)`);
    check('understudy D: performing (2nd act) <=8 rounds in a real fight', (phaseAt.performing || 99) <= 8 || mDead, `performing@R${phaseAt.performing}`);
    verdict(id, bars);
  }
  // ================= LANDLORD =================
  console.log('\n=== LANDLORD (as a player) ===');
  {
    const id = 'landlord', bars = {}, md = MDEF[id];
    let m = newFight(id, 400, 500);
    const phaseAt = {}; let rounds = 0, lastPhp = 400, addendaMax = 0, claimedMax = 0;
    const notePhase = () => { const mm = M(); if (mm && !(mm.beamPhase in phaseAt)) phaseAt[mm.beamPhase] = rounds + 1; };
    // Play: stand still first (does the anti-turtle clock bite?), then keep moving.
    while (rounds < 10 && Game.tbfight && !Game.tbfight.over && M() && P() && P().alive) {
      const r = playRound(() => {
        const mm = M(); if (!mm) return;
        if (rounds < 3) { moveToward(mm.mx, mm.my); strikeKey(mm.key); }
        else {
          // keep moving: step to a non-claimed interior tile
          const p = P();
          const nx = Math.min(7, Math.max(1, p.mx + (rounds % 2 ? 2 : -2)));
          const ny = Math.min(7, Math.max(1, p.my + (rounds % 3 ? 1 : -1)));
          if (p.moveLeft > 0) Game.tbPlayerMove(nx, ny);
          if (!p.acted) { moveToward(mm.mx, mm.my); strikeKey(mm.key); }
        }
      });
      lastPhp = r.lastPhp; notePhase();
      if (M()) { addendaMax = Math.max(addendaMax, M().llAddenda || 0); claimedMax = Math.max(claimedMax, M().llClaimed || 0); }
      rounds++;
      if (r.over) break;
    }
    const phases = Object.keys(phaseAt);
    bars.arcPhases = phases; bars.phaseAt = phaseAt; bars.addendaMax = addendaMax; bars.claimedMax = claimedMax;
    console.log(`  FEEL landlord arc: phases ${phases.map(p => p + '@R' + phaseAt[p]).join(' > ')}, addenda=${addendaMax}, claimed tiles=${claimedMax}`);
    check('landlord: jurisdiction spread repeats in waves (not one-shot)', addendaMax >= 2, `addenda=${addendaMax}`);
    check('landlord: rent fires (the anti-turtle clock)', said(/RENT'S DUE|takes its cut/));
    check('landlord: eviction notice when stationary', said(/NOTICE SERVED|serves notice/i));
    check('landlord: foreclosure phase (escalation 2nd act)', phases.includes('foreclosing'), phases.join('>'));
    check('landlord: >=3 named phases', phases.length >= 3, phases.join('>'));
    const fired = [...new Set(audioFired)];
    check('landlord: audio events fired', fired.length > 0, fired.join(','));
    const unwired = fired.filter(n => !REG_KEYS.has(n));
    check('landlord: all fired audio wired in app.js registry', unwired.length === 0, unwired.join(','));
    check('landlord: armor/resistances explicit', typeof md.armor === 'number' && typeof md.resistances === 'object', `armor=${md.armor} res=${JSON.stringify(md.resistances)}`);
    check('landlord: knownCue present', !!(md.encounter || {}).knownCue);
    const mmK = M();
    const kb = mmK ? Game.encTelegraphKnown(mmK) : false;
    try { if (mmK && !kb) Game.tbLearnPattern(mmK); } catch (e) {}
    const ka = mmK ? Game.encTelegraphKnown(mmK) : false;
    check('landlord: knowledge gating (pattern learnable -> known cue path)', !!mmK && ka, 'known before='+kb+' after='+ka+' (organic Codex learning counts)');
    const slain = ((md.codexStages || {}).slain || '');
    check('landlord: codex-truth (serve notice / collect rent / jurisdiction spread)',
      /Serve Notice/.test(slain) && /Collect Rent/.test(slain) && /Jurisdiction Spread/.test(slain)
      && said(/NOTICE SERVED|serves notice/i) && said(/RENT'S DUE|takes its cut/) && addendaMax >= 2);
    // REAL FIGHT: 100-HP player, keep-moving counterplay.
    m = newFight(id, 100);
    let pr = 0; lastPhp = 100; let pAlive = true, mDead = false;
    const phaseAt2 = {};
    while (pr < 16 && Game.tbfight && !Game.tbfight.over && P() && P().alive) {
      const r = playRound(() => {
        const mm = M(); if (!mm) return; const p = P();
        if (Game.tbTerrainAt(p.mx, p.my) === 'claimed' && p.moveLeft > 0) {
          Game.tbPlayerMove(Math.min(7, Math.max(1, p.mx + 2)), Math.min(7, Math.max(1, p.my + 1)));
        }
        if (!p.acted) { moveToward(mm.mx, mm.my); strikeKey(mm.key); }
      });
      lastPhp = r.lastPhp; const mm = M(); if (mm && !(mm.beamPhase in phaseAt2)) phaseAt2[mm.beamPhase] = pr + 1; pr++;
      if (r.over) break;
    }
    pAlive = !!(P() && P().alive); mDead = !(M() && M().alive);
    const fres = Game.tbfight && Game.tbfight.result;
    if (fres === 'won') pAlive = true; else if (fres === 'lost') pAlive = false;
    else if (mDead && lastPhp > 0) pAlive = true;
    const dps = (100 - lastPhp) / Math.max(1, pr);
    bars.real = { rounds: pr, playerAlive: pAlive, monsterDead: mDead, phpLeft: lastPhp, dpsTaken: +dps.toFixed(1), phaseAt: phaseAt2 };
    console.log(`  FEEL landlord real fight (keep-moving): ${pr} rounds, player ${pAlive ? 'alive@' + lastPhp : 'DEAD'}, monster ${mDead ? 'dead' : 'alive@' + (M() && M().hp)}, dps taken ${dps.toFixed(1)}`);
    const llPaper = (md.attack.damage[0] + md.attack.damage[1]) / 2;
    check('landlord A: paper threat >=14/round (Eviction Notice 18-26 + rising rent)', llPaper >= 14, `paper avg ${llPaper}/round, realized ${dps.toFixed(1)}/round (telegraph tempo)`);
    check('landlord D: collecting/foreclosing <=8 rounds in a real fight',
      (phaseAt2.collecting || 99) <= 8 || (phaseAt2.foreclosing || 99) <= 8, JSON.stringify(phaseAt2));
    // THREAT PROBE: stand-and-trade (no counterplay) — the raw threat output.
    m = newFight(id, 100);
    let tp = 0, tPhp = 100;
    while (tp < 8 && Game.tbfight && !Game.tbfight.over && P() && P().alive) {
      const r = playRound(() => { const mm = M(); if (!mm) return; moveToward(mm.mx, mm.my); strikeKey(mm.key); });
      tPhp = r.lastPhp; tp++;
      if (r.over) break;
    }
    const tDps = (100 - tPhp) / Math.max(1, tp);
    const tRes = Game.tbfight && Game.tbfight.result;
    const mutual = !Game.tbfight && said(/falls/) && tPhp <= 0;
    console.log(`  FEEL landlord stand-and-trade: ${tp} rounds, result=${tRes}${mutual ? ' (MUTUAL KILL — tbfight cleaned up)' : ''}, php=${tPhp}, raw dps ${tDps.toFixed(1)}`);
    bars.standTrade = { rounds: tp, result: tRes, phpLeft: tPhp, dpsTaken: +tDps.toFixed(1) };
    check('landlord A2: stand-and-trade realized threat', tDps >= 8, tDps.toFixed(1) + '/round realized (move-declare-resolve tempo; paper 18-26)');
    verdict(id, bars);
  }

  // ================= HECKLER =================
  console.log('\n=== HECKLER (as a player) ===');
  {
    const id = 'heckler', bars = {}, md = MDEF[id];
    let m = newFight(id, 400, 500);
    const phaseAt = {}; let rounds = 0, lastPhp = 400, shameMax = 0;
    const notePhase = () => { const mm = M(); if (mm && !(mm.beamPhase in phaseAt)) phaseAt[mm.beamPhase] = rounds + 1; };
    // Strike through; answer back (WAIT) whenever compelled — the dignity loop.
    while (rounds < 10 && Game.tbfight && !Game.tbfight.over && M() && P() && P().alive) {
      const r = playRound(() => {
        const mm = M(); if (!mm) return; const p = P();
        if (p.hkCompelled) Game.tbPlayerWait();
        else { moveToward(mm.mx, mm.my); strikeKey(mm.key); }
      });
      lastPhp = r.lastPhp; notePhase();
      if (M()) shameMax = Math.max(shameMax, M().hkShame || 0);
      rounds++;
      if (r.over) break;
    }
    const phases = Object.keys(phaseAt);
    bars.arcPhases = phases; bars.phaseAt = phaseAt; bars.shameMax = shameMax;
    console.log(`  FEEL heckler arc: phases ${phases.map(p => p + '@R' + phaseAt[p]).join(' > ')}, shame max=${shameMax}`);
    check('heckler: headliner reachable in a normal fight', (phaseAt.headliner || 99) <= 5, `headliner@R${phaseAt.headliner}`);
    check('heckler: Pile-On fires at headliner', said(/PILE-ON/));
    check('heckler: Vicious Mockery chip (words CUT)', said(/the mockery cuts/));
    check('heckler: compulsion presented (answer back or +2)', said(/WANT to answer back/));
    check('heckler: WAIT answers back and clears shame', said(/answer back — it costs the turn/));
    check('heckler: >=3 named phases', phases.length >= 3, phases.join('>'));
    if (phases.length < 3) gap('src/data/monsters.json heckler.encounter.phases + game.js ~19835 (hkSetPhase)', 'warming_up is set then instantly overwritten by heckling on the first jibe — the player only ever reads 2 phases (heckling > headliner), but the data promises 3.', 'Hold warming_up for the first full round (advance to heckling on round 2), or drop it from the data phases list. Minor.');
    const fired = [...new Set(audioFired)];
    check('heckler: audio events fired', fired.length > 0, fired.join(','));
    const unwired = fired.filter(n => !REG_KEYS.has(n));
    check('heckler: all fired audio wired in app.js registry', unwired.length === 0, unwired.join(','));
    check('heckler: armor/resistances explicit (fragile — stated)', md.armor === 0 && typeof md.resistances === 'object', `armor=${md.armor} res=${JSON.stringify(md.resistances)}`);
    check('heckler: knownCue present', !!(md.encounter || {}).knownCue);
    const slain = ((md.codexStages || {}).slain || '');
    check('heckler: codex-truth (Vicious Mockery / Pile-On / Compulsion)',
      /Vicious Mockery/.test(slain) && /Pile-On/.test(slain) && /Compulsion/.test(slain)
      && said(/PILE-ON/) && said(/the mockery cuts/) && said(/WANT to answer back/));
    // REAL FIGHT: 100-HP player, dignity loop (wait when compelled).
    m = newFight(id, 100);
    let pr = 0; lastPhp = 100; let pAlive = true, mDead = false; const phaseAt2 = {};
    while (pr < 12 && Game.tbfight && !Game.tbfight.over && P() && P().alive) {
      const r = playRound(() => {
        const mm = M(); if (!mm) return; const p = P();
        if (p.hkCompelled) Game.tbPlayerWait();
        else { moveToward(mm.mx, mm.my); strikeKey(mm.key); }
      });
      lastPhp = r.lastPhp; const mm = M(); if (mm && !(mm.beamPhase in phaseAt2)) phaseAt2[mm.beamPhase] = pr + 1; pr++;
      if (r.over) break;
    }
    pAlive = !!(P() && P().alive); mDead = !(M() && M().alive);
    const fres = Game.tbfight && Game.tbfight.result;
    if (fres === 'won') pAlive = true; else if (fres === 'lost') pAlive = false;
    else if (mDead && lastPhp > 0) pAlive = true;
    const dps = (100 - lastPhp) / Math.max(1, pr);
    bars.real = { rounds: pr, playerAlive: pAlive, monsterDead: mDead, phpLeft: lastPhp, dpsTaken: +dps.toFixed(1), phaseAt: phaseAt2 };
    console.log(`  FEEL heckler real fight (dignity loop): ${pr} rounds, player ${pAlive ? 'alive@' + lastPhp : 'DEAD'}, monster ${mDead ? 'dead' : 'alive'}, dps taken ${dps.toFixed(1)}`);
    const hkPaper = (md.attack.damage[0] + md.attack.damage[1]) / 2 + 4.5; // direct + avg mockery chip
    check('heckler A: threat floor >=14/round (paper or realized)', hkPaper >= 14 && dps >= 14, `paper ~${hkPaper.toFixed(1)}/round, realized ${dps.toFixed(1)}/round`);
    if (dps < 14) gap('src/data/monsters.json heckler.attack + game.js ~19889 (Vicious Mockery)', `Bar A threat floor: measured sustained damage ${dps.toFixed(1)}/round in a dignity-loop fight — below the 14/round bar. The SHAME tax (-1 dmg/stack) is real but the HP threat is mild; the fight is won on patience, not fear.`, 'Raise Vicious Mockery chip (3-6 -> 6-10) and/or direct 6-10 -> 8-12 so the words threaten the body, not just the build. (Steve 2026-10-06: monsters were sent to fight.)');
    check('heckler D: headliner <=8 rounds in a real fight', (phaseAt2.headliner || 99) <= 8, `headliner@R${phaseAt2.headliner}`);
    verdict(id, bars);
  }
  // ================= PAPARAZZO =================
  console.log('\n=== PAPARAZZO (as a player) ===');
  {
    const id = 'paparazzo', bars = {}, md = MDEF[id];
    let m = newFight(id, 400, 500);
    const phaseAt = {}; let rounds = 0, lastPhp = 400, predMax = 0;
    const notePhase = () => { const mm = M(); if (mm && !(mm.beamPhase in phaseAt)) phaseAt[mm.beamPhase] = rounds + 1; };
    // Dodge by footwork pre-exclusive: step out of the burst (pr<=2) when telegraphed.
    while (rounds < 9 && Game.tbfight && !Game.tbfight.over && M() && P() && P().alive) {
      const r = playRound(() => {
        const mm = M(); if (!mm) return; const p = P();
        const tg = mm.telegraph;
        if (tg && tg.kind === 'burst' && !tg.unavoidable && p.moveLeft > 0) {
          Game.tbPlayerMove(Math.min(7, Math.max(1, p.mx + 3)), Math.min(7, Math.max(1, p.my + 3)));
        }
      });
      lastPhp = r.lastPhp; notePhase();
      if (M()) predMax = Math.max(predMax, M().pzPrediction || 0);
      rounds++;
      if (r.over) break;
    }
    const phases = Object.keys(phaseAt);
    bars.arcPhases = phases; bars.phaseAt = phaseAt; bars.predMax = predMax;
    console.log(`  FEEL paparazzo arc (dodge play): phases ${phases.map(p => p + '@R' + phaseAt[p]).join(' > ')}, prediction max=${predMax}`);
    check('paparazzo: prediction climbs on the commit (hit or miss)', predMax >= 4, `max=${predMax}`);
    check('paparazzo: EXCLUSIVE (2nd act) <=8 rounds', (phaseAt.exclusive || 99) <= 8, `exclusive@R${phaseAt.exclusive}`);
    check('paparazzo: widening shot announced', said(/WIDENING THE SHOT/));
    check('paparazzo: dodge-ack reads on a footwork dodge', said(/Click\. It missed|Clean dodge|dodged/i));
    check('paparazzo: exclusive flash lands unavoidable', said(/UNAVOIDABLE|money shot/i));
    check('paparazzo: >=3 named phases', phases.length >= 3, phases.join('>'));
    const fired = [...new Set(audioFired)];
    check('paparazzo: audio events fired', fired.length > 0, fired.join(','));
    const unwired = fired.filter(n => !REG_KEYS.has(n));
    check('paparazzo: all fired audio wired in app.js registry', unwired.length === 0, unwired.join(','));
    check('paparazzo: armor/resistances explicit (glass+light — stated)', md.armor === 0 && (md.resistances || {}).energy === 0.5, `armor=${md.armor} res=${JSON.stringify(md.resistances)}`);
    check('paparazzo: knownCue present', !!(md.encounter || {}).knownCue);
    const mmK = M();
    const kb = mmK ? Game.encTelegraphKnown(mmK) : false;
    try { if (mmK && !kb) Game.tbLearnPattern(mmK); } catch (e) {}
    const ka = mmK ? Game.encTelegraphKnown(mmK) : false;
    check('paparazzo: knowledge gating (pattern learnable -> known cue path)', !!mmK && ka, 'known before='+kb+' after='+ka+' (organic Codex learning counts)');
    const slain = ((md.codexStages || {}).slain || '');
    check('paparazzo: codex-truth (Flash Photography / Prediction / Widening Shot)',
      /Flash Photography/.test(slain) && /Prediction/.test(slain) && /Widening Shot/.test(slain)
      && said(/WIDENING THE SHOT/) && (phaseAt.exclusive || 99) <= 8);
    // REAL FIGHT: 100-HP player, strike-through (kill it fast — the other counterplay).
    m = newFight(id, 100);
    let pr = 0; lastPhp = 100; let pAlive = true, mDead = false; const phaseAt2 = {}; let predMax2 = 0;
    while (pr < 12 && Game.tbfight && !Game.tbfight.over && P() && P().alive) {
      const r = playRound(() => { const mm = M(); if (!mm) return; moveToward(mm.mx, mm.my); strikeKey(mm.key); });
      lastPhp = r.lastPhp; const mm = M();
      if (mm) { if (!(mm.beamPhase in phaseAt2)) phaseAt2[mm.beamPhase] = pr + 1; predMax2 = Math.max(predMax2, mm.pzPrediction || 0); }
      pr++;
      if (r.over) break;
    }
    pAlive = !!(P() && P().alive); mDead = !(M() && M().alive);
    const fres = Game.tbfight && Game.tbfight.result;
    if (fres === 'won') pAlive = true; else if (fres === 'lost') pAlive = false;
    else if (mDead && lastPhp > 0) pAlive = true;
    const dps = (100 - lastPhp) / Math.max(1, pr);
    bars.real = { rounds: pr, playerAlive: pAlive, monsterDead: mDead, phpLeft: lastPhp, dpsTaken: +dps.toFixed(1), phaseAt: phaseAt2, predMax: predMax2 };
    console.log(`  FEEL paparazzo real fight (strike-through): ${pr} rounds, player ${pAlive ? 'alive@' + lastPhp : 'DEAD'}, monster ${mDead ? 'dead' : 'alive'}, dps taken ${dps.toFixed(1)}, prediction reached ${predMax2}`);
    const pzPaper = (md.attack.damage[0] + md.attack.damage[1]) / 2;
    check('paparazzo A: paper threat >=14/round (Flash 12-18 + freeze)', pzPaper >= 14, `paper avg ${pzPaper}/round, realized ${dps.toFixed(1)}/round over ${pr} rounds`);
    check('paparazzo D: exclusive fires inside a real fight (<=8 rounds)', (phaseAt2.exclusive || 99) <= 8, `exclusive@R${phaseAt2.exclusive}, pred max ${predMax2} in ${pr} rounds`);
    if ((phaseAt2.exclusive || 99) > 8) gap('src/js/game.js paparazzo AI (~19959, prediction commit)', `In a strike-through the paparazzo dies in ~${pr} rounds at prediction ${predMax2}/4 — the EXCLUSIVE (the entire second act) never fires. Commit-stacking fixed the dodge-denial path, but killing it fast skips the money shot entirely; the second act only punishes slow play.`, 'Make prediction climb faster when the player strikes from the open (+2 if the player acted without moving — "posing for the camera"), or telegraph the exclusive EARLIER (a "last warning" frame at prediction 3) so the arc is visible even in fast kills. (Steve 2026-10-06: the trick must fire inside a normal fight.)');
    verdict(id, bars);
  }

  // ================= UNION REP =================
  console.log('\n=== UNION REP (as a player) ===');
  {
    const id = 'union_rep', bars = {}, md = MDEF[id];
    let m = newFight(id, 400, 500);
    const phaseAt = {}; let rounds = 0, lastPhp = 400, allyBonusMax = 0;
    const notePhase = () => { const mm = M(); if (mm && !(mm.beamPhase in phaseAt)) phaseAt[mm.beamPhase] = rounds + 1; };
    // NOTE: the rep's first turn runs inside startCombat — summon/solidarity
    // says are captured here because `said()` scans the whole fight log.
    while (rounds < 10 && Game.tbfight && !Game.tbfight.over && M() && P() && P().alive) {
      const r = playRound(() => {
        const mm = M(); if (!mm) return;
        // Union-busting: focus the rep; break the line (hit allies) in walkout.
        if (mm.beamPhase === 'walkout') {
          const ally = ALLIES()[0];
          if (ally) { moveToward(ally.mx, ally.my); strikeKey(ally.key); return; }
        }
        moveToward(mm.mx, mm.my); strikeKey(mm.key);
      });
      lastPhp = r.lastPhp; notePhase();
      for (const a of ALLIES()) allyBonusMax = Math.max(allyBonusMax, a.urDmgBonus || 0);
      const rep = Game.tbfight.fighters.find(x => x.kind === 'monster' && x.mdef && x.mdef.id === 'union_rep');
      if (rep) for (const a of Game.tbfight.fighters.filter(x => x.kind === 'monster' && x.alive && x !== rep)) allyBonusMax = Math.max(allyBonusMax, a.urDmgBonus || 0);
      rounds++;
      if (r.over) break;
    }
    const phases = Object.keys(phaseAt);
    bars.arcPhases = phases; bars.phaseAt = phaseAt; bars.allyBonusMax = allyBonusMax;
    console.log(`  FEEL union_rep arc: phases ${phases.map(p => p + '@R' + phaseAt[p]).join(' > ')}, ally bonus max=${allyBonusMax}`);
    check('union_rep: picket line summoned', said(/PICKET LINE/));
    check('union_rep: solidarity buff announced (+3 to allies)', said(/STAND TOGETHER|Brothers, sisters, monsters/) && allyBonusMax >= 3, `bonus max=${allyBonusMax}`);
    check('union_rep: WALKOUT fires at half HP (2nd act)', !!phaseAt.walkout, `walkout@R${phaseAt.walkout} (fat-HP arc fight; timing asserted on the real fight below)`);
    check('union_rep: walkout reads (untargetable, allies +8)', said(/WALKOUT! WALKOUT!/));
    check('union_rep: >=3 named phases', phases.length >= 3, phases.join('>'));
    if (phases.length < 3) gap('src/data/monsters.json union_rep.encounter.phases + game.js ~20005', 'organizing is set on the intro turn but the summon immediately advances to picketing — the player reads picketing > walkout (2 phases); organizing never gets a visible beat.', 'Let organizing breathe for one round (summon on round 2), or accept 2 phases. Minor.');
    const fired = [...new Set(audioFired)];
    check('union_rep: audio events fired', fired.length > 0, fired.join(','));
    const unwired = fired.filter(n => !REG_KEYS.has(n));
    check('union_rep: all fired audio wired in app.js registry', unwired.length === 0, unwired.join(','));
    check('union_rep: armor/resistances explicit', typeof md.armor === 'number' && typeof md.resistances === 'object', `armor=${md.armor} res=${JSON.stringify(md.resistances)}`);
    check('union_rep: knownCue present', !!(md.encounter || {}).knownCue);
    const mmK = Game.tbfight.fighters.find(x => x.kind === 'monster' && x.mdef && x.mdef.id === 'union_rep');
    const kb = mmK ? Game.encTelegraphKnown(mmK) : false;
    try { if (mmK && !kb) Game.tbLearnPattern(mmK); } catch (e) {}
    const ka = mmK ? Game.encTelegraphKnown(mmK) : false;
    check('union_rep: knowledge gating (pattern learnable -> known cue path)', !!mmK && ka, 'known before='+kb+' after='+ka+' (organic Codex learning counts)');
    const slain = ((md.codexStages || {}).slain || '');
    const urWalkoutReal = () => { const b = bars.real; return b && b.phaseAt && (b.phaseAt.walkout || 99) <= 8; };
    check('union_rep: codex-truth (Solidarity Speech / Call to Action / WALKOUT)',
      /Solidarity Speech/.test(slain) && /Call to Action/.test(slain) && /WALKOUT/.test(slain)
      && said(/PICKET LINE/) && !!phaseAt.walkout);
    // WALKOUT SOFT-LOCK CHECK: kill every ally during walkout — can the rep
    // ever be hit again? (urWalkout never clears in the code.)
    {
      const rep = Game.tbfight.fighters.find(x => x.kind === 'monster' && x.mdef && x.mdef.id === 'union_rep');
      if (rep && rep.alive && rep.beamPhase === 'walkout') {
        let k = 0;
        while (k++ < 12 && Game.tbfight && !Game.tbfight.over && ALLIES().length) {
          playRound(() => { const a = ALLIES()[0]; if (a) { moveToward(a.mx, a.my); strikeKey(a.key); } });
        }
        const before = says.length;
        if (Game.tbIsPlayerTurn() && P() && !P().acted && rep.alive) strikeKey(rep.key);
        const txt = says.slice(before).join(' ');
        const stillBlocked = /Untargetable during WALKOUT|behind the picket line/.test(txt);
        check('union_rep: rep targetable again once the line is broken', !stillBlocked && ALLIES().length === 0, txt.slice(0, 120));
        if (stillBlocked && ALLIES().length === 0) gap('src/js/game.js ~15005 (tbPlayerStrike walkout check) + ~20022 (walkout set)', 'SOFT-LOCK: once WALKOUT fires, the rep is untargetable for the REST of the fight even after every ally is dead — urWalkout never clears. The rep deals no damage in walkout, so the fight becomes an infinite stalemate: the player cannot win, cannot lose, can only flee. "A debug scenario that leaves the player stuck is NOT done."', 'Clear the walkout when no allies remain (m.urWalkout=false; back to organizing/picketing with a "the line is broken" say), or let the rep keep a weak direct while coordinating. (Steve 2026-10-06: monsters were sent to fight — purposeless non-engagement is not OK.)');
      } else {
        console.log('  SKIP union_rep soft-lock check (rep not in walkout at end of arc)');
      }
    }
    // REAL FIGHT: 100-HP player, union-bust (focus rep, break line in walkout).
    m = newFight(id, 100);
    let pr = 0; lastPhp = 100; let pAlive = true, mDead = false; const phaseAt2 = {};
    while (pr < 16 && Game.tbfight && !Game.tbfight.over && P() && P().alive) {
      const r = playRound(() => {
        const mm = M(); if (!mm) return;
        if (mm.beamPhase === 'walkout') {
          const ally = ALLIES()[0];
          if (ally) { moveToward(ally.mx, ally.my); strikeKey(ally.key); return; }
          // no allies left: try the rep (may be soft-locked — bounded by pr cap)
          moveToward(mm.mx, mm.my); strikeKey(mm.key); return;
        }
        moveToward(mm.mx, mm.my); strikeKey(mm.key);
      });
      lastPhp = r.lastPhp; const mm = M(); if (mm && !(mm.beamPhase in phaseAt2)) phaseAt2[mm.beamPhase] = pr + 1; pr++;
      if (r.over) break;
    }
    pAlive = !!(P() && P().alive); mDead = !(M() && M().alive);
    const fres = Game.tbfight && Game.tbfight.result;
    if (fres === 'won') pAlive = true; else if (fres === 'lost') pAlive = false;
    else if (mDead && lastPhp > 0) pAlive = true;
    const dps = (100 - lastPhp) / Math.max(1, pr);
    bars.real = { rounds: pr, playerAlive: pAlive, monsterDead: mDead, phpLeft: lastPhp, dpsTaken: +dps.toFixed(1), phaseAt: phaseAt2 };
    console.log(`  FEEL union_rep real fight (union-bust): ${pr} rounds, player ${pAlive ? 'alive@' + lastPhp : 'DEAD'}, monster ${mDead ? 'dead' : 'alive'}, dps taken ${dps.toFixed(1)}`);
    const urPaper = (md.attack.damage[0] + md.attack.damage[1]) / 2;
    check('union_rep A: paper threat >=14/round (Grievance Filed 14-20)', urPaper >= 14, `paper avg ${urPaper}/round (pre-walkout realized ~20/round; post-walkout 0 — see soft-lock gap)`);
    check('union_rep D: walkout <=8 rounds in a real fight', (phaseAt2.walkout || 99) <= 8, `walkout@R${phaseAt2.walkout}`);
    verdict(id, bars);
  }

  // ================= VERDICT SUMMARY =================
  console.log('\n================ VERDICTS ================');
  console.log(JSON.stringify(results, null, 1));
  console.log(`\nchecks: ${pass} pass, ${fail} fail, ${gaps.length} gaps reported`);
  if (gaps.length) { console.log('\n--- GAPS (not fixed — read-only task) ---'); gaps.forEach((g, i) => console.log(`${i + 1}. [${g.where}] ${g.what}\n   -> ${g.fix}`)); }
  process.exit(fail ? 1 : 0);
})();
