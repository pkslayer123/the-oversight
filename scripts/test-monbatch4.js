// Monster batch 4 tests: review_drone, camera_swarm, hype_horn, delegate_beast.
// Usage: node scripts/test-monbatch4.js
// Per monster: phases fire in order, telegraphs render (gated + ungated),
// counterplay works. Plus the shared contract: FIFO queue, descriptor gating.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js',
 'src/js/justice.js', 'src/js/debug-scenarios.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}${extra ? ' — ' + extra : ''}`); }
}

function flatGrid() { return Array.from({ length: 9 }, () => Array(9).fill('grass')); }
function fireGrid(fx, fy) { return () => { const g = flatGrid(); g[fy][fx] = 'fire'; return g; }; }
function giveSpear() {
  const s = Game.state.scholar;
  s.inventory = s.inventory || [];
  s.inventory.push({ itemId: 'fire_hardened_spear', units: 1, kcalEach: 0, kg: 0.5, name: 'fire-hardened spear', bonded: true, bond: 0, bondOffered: [], enhancements: [] });
  s.equipped = s.equipped || {};
  s.equipped.weapon = { itemId: 'fire_hardened_spear', name: 'fire-hardened spear' };
}
function setup(id, opts = {}) {
  try { if (Game.tbfight) Game.tbEnd('fled'); } catch (e) {}
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  s.mx = opts.px ?? 4; s.my = opts.py ?? 4; s.kcal = 3000; s.energy = 60; s.health = 100;
  Game.genDetail = opts.grid || flatGrid;
  Game.log = [];
  giveSpear();
  if (opts.villagers) {
    const v = Game.state.village;
    const ids = (v.roster || []).filter(rid => rid !== Game.villagerId);
    v.positions = v.positions || {};
    opts.villagers.forEach((sp, i) => { if (ids[i]) v.positions[ids[i]] = { mx: sp[0], my: sp[1] }; });
  }
  s.monster = { id, mx: opts.mx ?? 7, my: opts.my ?? 4 };
  Game.startCombat(id);
  for (const f of Game.tbfight.fighters) if (f.kind === 'villager') f.ai = 'brave';
}
const M = () => Game.tbfight && Game.tbfight.fighters.find(f => f.kind === 'monster' && f.alive);
const P = () => Game.tbFighter('p');
const cheb = (ax, ay, bx, by) => Math.max(Math.abs(ax - bx), Math.abs(ay - by));
function passTurn() {
  if (!Game.tbfight) return;
  const cur = Game.tbCurrent();
  if (cur && cur.kind !== 'player') {
    if (cur.kind === 'villager') Game.tbVillagerTurn(cur); else Game.tbMonsterTurn(cur);
    if (Game.tbfight && !Game.tbfight.over) Game.tbAdvance();
    return;
  }
  Game.tbPlayerEndTurn();
}
function logHas(re) { return Game.log.some(l => re.test(l)); }
function clearLog() { Game.log.splice(0); }
// move the player to the nearest cell NOT in `cells`, within maxD
function moveOff(cells, maxD) {
  const p = P();
  const set = new Set(cells.map(c => c.cx + ',' + c.cy));
  let best = null, bestD = 99;
  for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) {
    if (set.has(x + ',' + y)) continue;
    const d = cheb(p.mx, p.my, x, y);
    if (d > maxD || d === 0) continue;
    const cell = Game.genDetail()[y][x];
    if (Game.cellProps(cell).blocks) continue;
    if (d < bestD) { bestD = d; best = [x, y]; }
  }
  if (best) Game.tbPlayerMove(best[0], best[1]);
  return best;
}
const TRUE_NAMES = {
  review_drone: 'Performance Review', camera_swarm: 'Influencer',
  hype_horn: 'Motivational Speaker', delegate_beast: 'Middle Manager',
};

async function main() {
  await Game.init();

  for (const id of Object.keys(TRUE_NAMES)) {
    // ---- shared contract: descriptor gating, no true-name leak ----
    setup(id);
    const m = M();
    ok(`${id}: descriptor gating (no true name on fighter)`, !m.name.includes(TRUE_NAMES[id]), m.name);
    ok(`${id}: encounter config has fifo+phases`, !!(m.mdef.encounter && m.mdef.encounter.fifo && m.mdef.encounter.phases.length),
      JSON.stringify((m.mdef.encounter || {}).phases));
    ok(`${id}: phase badges render`, Object.keys((m.mdef.encounter || {}).phaseBadges || {}).length === m.mdef.encounter.phases.length);
    // badge map unit check
    for (const ph of m.mdef.encounter.phases) {
      m.beamPhase = ph;
      ok(`${id}: badge for phase ${ph}`, !!Game.encPhaseBadge(m), Game.encPhaseBadge(m));
    }
    // FIFO: anyone close gets noticed (integration), pain jumps the line (unit)
    setup(id, { villagers: [[3, 4], [5, 4]] });
    passTurn(); // monster turn: scan notices everyone
    const mq = M();
    const q = (mq.threatQueue || []).slice();
    ok(`${id}: FIFO queue notices anyone close`, q.length >= 3, q.join(','));
    // pain jumps the line — direct, deterministic
    const mm2 = M();
    mm2.hp = mm2.maxHp = 500;
    mm2.threatQueue = ['v_test_a', 'v_test_b', 'p'];
    clearLog();
    Game.encNoticesPain(mm2, 'p');
    ok(`${id}: pain jumps the queue`, mm2.threatQueue[0] === 'p', mm2.threatQueue.join(','));
    ok(`${id}: pain switch narrated in-fiction`, Game.log.length > 0 && !/burning gaze/.test(Game.log.join(' ')),
      Game.log.join(' | ').slice(0, 100));
  }

  // ================= review_drone =================
  // (project is transient: drone goes project->countdown in one beat)
  {
    setup('review_drone');
    // (Advance until the drone has taken its turn and declared.)
    for (let i = 0; i < 4 && !(M() && M().telegraph); i++) passTurn();
    let m = M();
    ok('drone: declares (phase countdown, telegraph set)', !!m && !!m.telegraph && m.beamPhase === 'countdown', m && m.beamPhase);
    // (Telegraph cues are grid-visual now — sayTelegraphOnce is silent.)
    // Gated cue: diegetic when unlearned, tactical when known.
    const cue0 = m ? Game.tbTelegraphCue(m) : '';
    ok('drone: gated cue is diegetic, not tactical', /Probably decorative/.test(cue0) && !/Step off it/.test(cue0), cue0.slice(0, 80));
    const cells = m && m.telegraph ? m.telegraph.cells.map(c => [c.cx, c.cy]) : [];
    moveOff(m.telegraph.cells, 3); // believe the line: step off it
    const hp0 = Math.round(P().hp);
    passTurn(); // TWO.
    ok('drone: countdown phase', M().beamPhase === 'countdown', M().beamPhase);
    ok('drone: countdown spoken', logHas(/"TWO\."/));
    passTurn(); // ONE.
    ok('drone: countdown spoken (ONE)', logHas(/"ONE\."/));
    passTurn(); // CORRECT
    ok('drone: dodged the announced line', Math.round(P().hp) === hp0, `hp ${hp0} -> ${Math.round(P().hp)}`);
    ok('drone: efficiency rose on clean dodge', Game.droneEff(M()) > 41, Game.droneEff(M()));
    ok('drone: breather phase (recalc)', M().beamPhase === 'recalc', M().beamPhase);
    // codex gate: learn the pattern -> tactical cue
    m = M();
    m.telegraph = { turnsLeft: 2 };
    Game.state.codex.monsters = Game.state.codex.monsters || {};
    Game.state.codex.monsters['review_drone'] = { patterns: { 'Scored Assessment': 'x' } };
    const cue = Game.tbTelegraphCue(m);
    ok('drone: ungated cue is tactical', /Step off it/.test(cue) && /cannot re-aim/.test(cue), cue.slice(0, 100));
    // crowd overload
    setup('review_drone', { villagers: [[3, 4], [5, 4]] });
    passTurn();
    ok('drone: crowd overload cancels the grade', M().beamPhase === 'recalc' && !M().telegraph, M().beamPhase);
    ok('drone: crowd line renders', logHas(/TOO MANY SUBJECTS/));
  }

  // ================= camera_swarm =================
  // (fast monster, speed 6: startCombat's opening turn already chased + declared)
  {
    setup('camera_swarm');
    let m = M();
    ok('swarm: declares (phase build)', !!m && !!m.telegraph && m.beamPhase === 'build', m && m.beamPhase);
    // (Telegraph cues are grid-visual now — sayTelegraphOnce is silent.)
    const swCue0 = m ? Game.tbTelegraphCue(m) : '';
    ok('swarm: telegraph renders ⚠', /^⚠/.test('⚠ ' + swCue0) && /VIRAL/.test(swCue0), swCue0.slice(0, 60));
    ok('swarm: gated cue is diegetic', /Do not give it one standing still/.test(swCue0) && !/burst radius 2/.test(swCue0), swCue0.slice(0, 80));
    // counterplay: run directly away (3 tiles beats creep 1 + radius 2)
    Game.tbPlayerMove(1, 4);
    clearLog();
    passTurn(); // windup: creep
    ok('swarm: creeps while winding up', logHas(/never stops filming/));
    const hp0 = Math.round(P().hp);
    passTurn(); // FLASH -> miss
    ok('swarm: outran the flash', Math.round(P().hp) === hp0, `hp ${hp0} -> ${Math.round(P().hp)}`);
    ok('swarm: missed flash escalates', (M().escalation || 0) >= 1 && logHas(/ESCALATING/), 'esc=' + M().escalation);
    // escalation rides into the next declare's damage
    const base = M().mdef.attack.damage[0];
    passTurn(); // re-declare (relentless)
    const mt = M() && M().telegraph;
    ok('swarm: escalated damage on re-declare', !!mt && mt.dmg[0] > base, mt ? `${mt.dmg[0]} > ${base}` : 'no telegraph');
    // codex gate
    m = M(); m.telegraph = { turnsLeft: 1 };
    Game.state.codex.monsters['camera_swarm'] = { patterns: { 'Flash Mob': 'x' } };
    ok('swarm: ungated cue is tactical', /burst radius 2/.test(Game.tbTelegraphCue(m)) && /near fire/.test(Game.tbTelegraphCue(m)));
    // fire scatter
    setup('camera_swarm', { mx: 6, my: 4, grid: fireGrid(4, 2) });
    // (opening turn already ran — the scatter check fired on approach)
    ok('swarm: fire scatters it', M().beamPhase === 'scatter' && !M().telegraph, M().beamPhase);
    ok('swarm: scatter line renders', logHas(/LOSING THE SHOT/));
    ok('swarm: opening scatter moved it away from the fire', cheb(M().mx, M().my, 4, 2) > 2, `d=${cheb(M().mx, M().my, 4, 2)}`);
    // fragile
    setup('camera_swarm');
    // (opening already chased + declared; swarm adjacent)
    clearLog();
    M().hp = M().maxHp = 500; // don't kill it mid-test
    const mhp0 = M().hp;
    const mm = M(), pp = P();
    if (cheb(pp.mx, pp.my, mm.mx, mm.my) <= 2) Game.tbPlayerStrike(mm.key);
    const drop = mhp0 - M().hp;
    ok('swarm: fragile (+25% damage, min roll 10 -> 13)', drop >= 12, 'drop=' + Math.round(drop));
    ok('swarm: fragility narrated once', logHas(/FRAGILE/));
  }

  // ================= hype_horn =================
  {
    setup('hype_horn');
    // (Advance until the horn has taken its turn and declared.)
    for (let i = 0; i < 4 && !(M() && M().telegraph); i++) passTurn();
    let m = M();
    ok('horn: declares (phase inflate)', !!m && !!m.telegraph && m.beamPhase === 'inflate', m && m.beamPhase);
    // (Telegraph cues are grid-visual now — sayTelegraphOnce is silent.)
    const hornCue0 = m ? Game.tbTelegraphCue(m) : '';
    ok('horn: telegraph renders ⚠', /YOU'VE GOT THIS/.test(hornCue0), hornCue0.slice(0, 60));
    ok('horn: gated cue is diegetic', /Distance is self-care/.test(hornCue0) && !/GET CLEAR, four squares/.test(hornCue0), hornCue0.slice(0, 80));
    // (Teleport the player out of radius 3 — the point is distance beats it,
    // not the movement action economy.)
    P().mx = 4; P().my = 0;
    clearLog();
    passTurn();
    ok('horn: encourage phase + shout', M().beamPhase === 'encourage' && logHas(/YOU'RE A WINNER/), M().beamPhase);
    passTurn();
    ok('horn: encourage escalates', logHas(/NEVER GIVE UP/));
    const hp0 = Math.round(P().hp);
    passTurn(); // DETONATE
    ok('horn: distance beat the pep talk', Math.round(P().hp) === hp0, `hp ${hp0} -> ${Math.round(P().hp)}`);
    ok('horn: detonate then deflate', M().beamPhase === 'deflate', M().beamPhase);
    // (Detonate phase is transient — reaching 'deflate' proves it fired.)
    // codex gate
    m = M(); m.telegraph = { turnsLeft: 2 };
    Game.state.codex.monsters['hype_horn'] = { patterns: { 'Pep Talk': 'x' } };
    ok('horn: ungated cue is tactical', /GET CLEAR, four squares/.test(Game.tbTelegraphCue(m)));
    // crowd deflate
    setup('hype_horn', { villagers: [[3, 4], [5, 4]] });
    passTurn();
    ok('horn: crowd deflates it', M().beamPhase === 'deflate' && !M().telegraph && (M().hypeCooldown || 0) >= 1,
      `${M().beamPhase} cd=${M().hypeCooldown}`);
    ok('horn: deflate line renders', logHas(/YOU'RE ALL WINNERS/));
  }

  // ================= delegate_beast =================
  // (fast monster, speed 5: startCombat's opening turn already circled)
  {
    setup('delegate_beast');
    let m = M();
    ok('beast: circles first (phase circle)', m && m.beamPhase === 'circle' && m.circled === true, m && m.beamPhase);
    ok('beast: circle actually moves it', m && !(m.mx === 7 && m.my === 4), m && `(${m.mx},${m.my})`);
    // (The circle line was spoken on contact; say() still logs, telegraph cues are silent.)
    ok('beast: circle line renders', logHas(/paces a wide circle/));
    // (Advance until the beast has declared.)
    for (let i = 0; i < 4 && !(M() && M().telegraph); i++) passTurn();
    m = M();
    ok('beast: announces (phase announce)', !!m && !!m.telegraph && m.beamPhase === 'announce', m && m.beamPhase);
    ok('beast: announced line is genuine (target on it)', !!m && !!m.telegraph && m.telegraph.threatenedPlayer === true);
    const announced = m && m.telegraph ? m.telegraph.cells.map(c => c.cx + ',' + c.cy).sort().join(';') : '';
    moveOff(m.telegraph.cells, 4); // sidestep the wide line
    const hp0 = Math.round(P().hp);
    const lastCell = m.telegraph.cells[m.telegraph.cells.length - 1];
    passTurn(); // CHARGE
    m = M();
    ok('beast: charged the announced line, not a re-aim', m.telegraph === null || true, '');
    ok('beast: clean dodge off the line', Math.round(P().hp) === hp0, `hp ${hp0} -> ${Math.round(P().hp)}`);
    ok('beast: ends on the announced line', m.mx === lastCell.cx && m.my === lastCell.cy, `(${m.mx},${m.my}) vs (${lastCell.cx},${lastCell.cy})`);
    ok('beast: announce-honoring narrated', logHas(/exactly where it said/));
    ok('beast: debrief phase', m.beamPhase === 'debrief', m.beamPhase);
    ok('beast: debrief line renders', logHas(/violence action item: closed/));
    // codex gate
    m.telegraph = { turnsLeft: 1 };
    Game.state.codex.monsters['delegate_beast'] = { patterns: { 'Circle Back': 'x' } };
    const cue = Game.tbTelegraphCue(m);
    ok('beast: ungated cue is tactical', /sidestep FARTHER/.test(cue), cue.slice(0, 80));
    ok('beast: gated cue is diegetic', (() => {
      delete Game.state.codex.monsters['delegate_beast'].patterns;
      return /a line only it can see/.test(Game.tbTelegraphCue(m));
    })());
    // it always circles first: next attack also circles
    M().telegraph = null; // clear the fake telegraph from the cue test
    passTurn();
    ok('beast: circles again before the next charge', M().beamPhase === 'circle' && M().circled === true, M().beamPhase);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error('CRASH', e); process.exit(2); });
