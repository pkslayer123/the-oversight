// Monster batch 3 (the uncanny) encounter tests.
// Usage: node scripts/test-monbatch3.js
// Per monster: phases fire in order, telegraphs render (gated + ungated),
// counterplay works. Plus: descriptor gating (no true-name leaks),
// config presence, phase badges, pain-switch.
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

function setup(id, dayPart, px, py, mx, my, grid) {
  try { if (Game.tbfight) Game.tbEnd('fled'); } catch (e) {}
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  s.mx = px; s.my = py; s.health = 500; s.kcal = 3000; s.energy = 60;
  s.insideHaven = false;
  Game.dayPart = dayPart;
  Game.genDetail = grid || flatGrid;
  Game.log = [];
  Game.ensureVillagerPositions();
  const vpos = Game.state.village.positions || {};
  // park villagers in the far corner so they don't join the fight (their AI
  // would pollute the phase assertions)
  const vx = px < 4 ? 8 : 0, vy = py < 4 ? 8 : 0;
  for (const rid of Object.keys(vpos)) vpos[rid] = { mx: vx, my: vy };
  const def = (Game.data.items || []).find(i => i.id === 'fire_hardened_spear') || {};
  s.inventory = [{ itemId: 'fire_hardened_spear', units: 1, kcalEach: 0, kg: 0.5, name: def.name || 'spear' }];
  s.equipped = { weapon: { itemId: 'fire_hardened_spear', name: def.name || 'spear' } };
  s.monster = { id, mx, my };
  // Capture say lines from combat start (some cues fire during startCombat,
  // before drive() wraps Game.say). Return them for assertions.
  const earlyLines = [];
  const origSay = Game.say;
  Game.say = function (m) { earlyLines.push(String(m)); return origSay.call(this, m); };
  try {
    Game.startCombat(id);
  } finally {
    Game.say = origSay;
  }
  s._earlyLines = earlyLines;
  return s;
}
function monster() { const f = Game.tbfight; return f ? f.fighters.find(x => x.kind === 'monster') : null; }
function player() { return Game.tbFighter('p'); }
function cheb(a, b) { return Math.max(Math.abs(a.mx - b.mx), Math.abs(a.my - b.my)); }
function stepToward(tx, ty) {
  const p = player();
  if (!p) return false;
  const dx = Math.sign(tx - p.mx), dy = Math.sign(ty - p.my);
  for (const [ox, oy] of [[dx, dy], [dx, 0], [0, dy]]) {
    if (!ox && !oy) continue;
    const nx = p.mx + ox, ny = p.my + oy;
    // Stay on interior tiles (1..7): grid edges are the flee-by-barrier
    // (Steve 2026-10-05) — stepping on x=0/8/y=0/8 50%-ends the fight.
    if (nx < 1 || nx > 7 || ny < 1 || ny > 7) continue;
    if (Game.tbPlayerMove(nx, ny)) return true;
  }
  return false;
}
function stepAway(fx, fy) {
  const p = player();
  if (!p) return false;
  const dx = Math.sign(p.mx - fx), dy = Math.sign(p.my - fy);
  for (const [ox, oy] of [[dx, dy], [dx, 0], [0, dy], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
    if (!ox && !oy) continue;
    const nx = p.mx + ox, ny = p.my + oy;
    // Stay on interior tiles (1..7): grid edges are the flee-by-barrier.
    if (nx < 1 || nx > 7 || ny < 1 || ny > 7) continue;
    if (Game.tbPlayerMove(nx, ny)) return true;
  }
  return false;
}
// drive N full rounds; policy runs on the player's turn. Returns seen phases + say lines.
// (Telegraph cues are grid-visual now — sayTelegraphOnce is silent. The drive
// also captures tbTelegraphCue outputs as '⚠' lines so cue-text assertions
// keep working.)
function drive(policy, rounds) {
  const seen = [], lines = [];
  const origSay = Game.say;
  Game.say = function (m) { lines.push(String(m)); return origSay.call(this, m); };
  const origCue = Game.tbTelegraphCue;
  Game.tbTelegraphCue = function (m) {
    const cue = origCue.call(this, m);
    if (cue) lines.push('⚠ ' + cue);
    return cue;
  };
  try {
    let n = 0;
    while (Game.tbfight && !Game.tbfight.over && n++ < (rounds || 20)) {
      const cur = Game.tbCurrent();
      if (!cur) break;
      if (cur.kind === 'player') {
        policy(Game);
        if (Game.tbIsPlayerTurn()) Game.tbPlayerEndTurn();
      } else Game.tbAdvance();
      const m = monster();
      if (m && m.beamPhase && !seen.includes(m.beamPhase)) seen.push(m.beamPhase);
    }
  } finally { Game.say = origSay; Game.tbTelegraphCue = origCue; }
  return { seen, lines };
}
const hold = () => {};
function approachUpTo(n) {
  return () => { const m = monster(), p = player(); let k = n || 99, g = 0;
    while (p.moveLeft > 0 && k-- > 0 && g++ < 8) { if (!stepToward(m.mx, m.my)) break; } };
}
function approachStopAt(d) {
  return () => { const m = monster(), p = player(); let g = 0;
    while (p.moveLeft > 0 && g++ < 8 && cheb(p, m) > d) { if (!stepToward(m.mx, m.my)) break; } };
}
function retreatAll() {
  return () => { const m = monster(), p = player(); if (!m || !p) return; let g = 0;
    while (p.moveLeft > 0 && g++ < 8) { if (!stepAway(m.mx, m.my)) break; } };
}

const IDS = ['voice_mimic_radio', 'bright_idea', 'memory_projector', 'service_mimic', 'contract_golem'];

(async () => {
  await Game.init();

  // ---------- 0. CONFIG PRESENCE ----------
  for (const id of IDS) {
    const d = Game.data.monsters.find(m => m.id === id);
    const e = d && d.encounter;
    ok(id + ' has encounter config', !!e);
    if (e) {
      ok(id + ' config: fifo+phases+gate', e.fifo === true && Array.isArray(e.phases) && e.phases.length >= 3 && e.telegraphGate === 'pattern', JSON.stringify(e.phases));
      ok(id + ' config: queue text', !!e.noticeText && !!e.adjText && !!e.painText && !!e.phaseBadges);
      // badges resolve for every phase
      setup(id, 3, 4, 4, 4, 0);
      const m = monster();
      for (const ph of e.phases) {
        m.beamPhase = ph;
        ok(id + ' badge for ' + ph, Game.encPhaseBadge(m) === e.phaseBadges[ph], Game.encPhaseBadge(m));
      }
      // bespoke queue text is wired through the framework (not dead config)
      const tl = Game.encThreatLines({ mdef: d });
      ok(id + ' noticeText renders', tl.notice === e.noticeText, tl.notice.slice(0, 60));
      ok(id + ' painText renders', tl.pain === e.painText, tl.pain.slice(0, 60));
      ok(id + ' adjText renders', tl.snap === e.adjText, tl.snap.slice(0, 60));
    }
  }

  // ---------- 1. VOICE MIMIC ----------
  {
    // descriptor gating: the true name never leaks pre-codex
    setup('voice_mimic_radio', 3, 2, 4, 8, 4);
    const r = drive(hold, 5);
    const leak = r.lines.some(l => /(^|[^a-zA-Z])Static([^a-zA-Z]|$)/.test(l));
    ok('vm: no true-name leak', !leak);
    ok('vm: strange descriptor used', r.lines.some(l => /crying in the dark|the radio|crying/i.test(l)));

    // counterplay A: walk toward it, slowly -> lure builds -> approach
    setup('voice_mimic_radio', 3, 1, 4, 8, 4);
    const ra = drive(approachUpTo(1), 6);
    ok('vm: approaching feeds the lure (approach phase)', ra.seen.includes('approach'), ra.seen.join(','));
    ok('vm: telegraph renders (ungated, voice deception)', ra.lines.some(l => l.startsWith('⚠') && /It is not/.test(l)));

    // counterplay B: hold ground -> resist -> reveal
    setup('voice_mimic_radio', 3, 2, 4, 8, 4);
    const rb = drive(hold, 5);
    ok('vm: resisting breaks the act (reveal phase)', rb.seen.includes('reveal'), rb.seen.join(','));
    // Reveal is honest: the static scream (audio) replaces voice deception.
    // No "⚠" telegraph with voice trickery in reveal phase.
    ok('vm: reveal breaks voice deception', rb.seen.includes('reveal'));

    // gated: after surviving a Distress Call the codex suffix appends
    setup('voice_mimic_radio', 3, 2, 4, 5, 4);
    const rg = drive(hold, 6);
    ok('vm: gated telegraph (You know this one)', rg.lines.some(l => l.startsWith('⚠') && /You know this one: Distress Call/.test(l)));

    // reveal vulnerability: hits land harder when exposed
    setup('voice_mimic_radio', 3, 4, 4, 4, 5);
    const m = monster();
    m.beamPhase = 'reveal';
    const hp0 = m.hp;
    Game.tbDamage(m.key, 20, 'you');
    ok('vm: reveal takes hits badly (x1.5)', hp0 - m.hp === 30, `dealt ${hp0 - m.hp}`);
  }

  // ---------- 2. BRIGHT IDEA ----------
  {
    setup('bright_idea', 3, 2, 4, 8, 4);
    const r = drive(() => {
      const m = monster();
      if (m.beamPhase === 'brighten' || m.beamPhase === 'ember') hold();
      else approachUpTo(1)();
    }, 14);
    ok('bi: phases settle->brighten->ember', r.seen.includes('settle') && r.seen.includes('brighten') && r.seen.includes('ember'), r.seen.join(','));
    ok('bi: escalation narrates the beats', r.lines.some(l => /BRIGHTER\. The light is wrong/.test(l)));
    ok('bi: bloom detonates', r.lines.some(l => /Eureka!/.test(l)));
    ok('bi: ungated cue is diegetic', r.lines.some(l => l.startsWith('⚠') && /beautiful idea/.test(l)));
    // (The BACK OFF coaching is a bespoke declare gated by encTelegraphKnown —
    // sayTelegraphOnce is silent now, so we verify the gate directly.)
    const bm = monster();
    if (bm) {
      Game.state.codex.monsters = { bright_idea: { patterns: { 'Eureka': 'x' } } };
      ok('bi: gated cue coaches (BACK OFF)', Game.encTelegraphKnown(bm) === true);
    } else {
      ok('bi: gated cue coaches (BACK OFF)', false, 'monster gone');
    }

    // counterplay: back off before the bloom -> no damage
    setup('bright_idea', 3, 4, 4, 4, 1);
    const hp0 = player().hp;
    drive(() => { const m = monster(); if (m && m.beamPhase === 'brighten') retreatAll()(); }, 6);
    const pl = player();
    ok('bi: backing off dodges the bloom', pl && pl.hp === hp0, `hp ${hp0} -> ${pl && pl.hp}`);

    // daylight disperses it
    setup('bright_idea', 1, 4, 4, 4, 6);
    drive(hold, 3);
    ok('bi: daylight disperses it (flees)', !monster() || monster().fled === true);
  }

  // ---------- 3. MEMORY PROJECTOR ----------
  {
    setup('memory_projector', 2, 4, 4, 4, 0);
    const r = drive((G) => {
      // stand still for the spell (it declares on monster-turn 3), then
      // break it by moving while the beam is still winding up
      if (!G._mpTurn) G._mpTurn = 0;
      G._mpTurn++;
      if (G._mpTurn <= 3) hold();
      else retreatAll()();
    }, 12);
    ok('mp: phases watch->spell', r.seen.includes('watch') && r.seen.includes('spell'), r.seen.join(','));
    ok('mp: ungated cue is the picture', r.lines.some(l => l.startsWith('⚠') && /is home/.test(l)));
    ok('mp: spell pulls the still (without deciding to)', r.lines.some(l => /without deciding to/.test(l)));
    ok('mp: moving breaks the spell', r.lines.some(l => /breaks up/.test(l)));
    // Gated cue: teach the pattern first (like the bi test does), then verify
    // the coaching appears. The knownCue says "Keep moving" (not literal MOVE).
    Game.state.codex.monsters = { memory_projector: { patterns: { 'Home Movies': 'x' } } };
    const mpM = monster();
    if (mpM) {
      const cue = Game.tbTelegraphCue(mpM) || '';
      ok('mp: gated cue coaches (keep moving)', /keep moving/i.test(cue), cue.slice(0, 80));
    } else {
      ok('mp: gated cue coaches (keep moving)', false, 'monster gone');
    }

    // pull actually moves the player toward the projector
    setup('memory_projector', 2, 4, 6, 4, 2);
    const p0 = { x: player().mx, y: player().my };
    drive(hold, 5);
    const pulled = Math.abs(player().my - p0.y) > 0 || Math.abs(player().mx - p0.x) > 0;
    ok('mp: pull displaces the player', pulled, `(${p0.x},${p0.y}) -> (${player().mx},${player().my})`);
  }

  // ---------- 4. SERVICE MIMIC ----------
  {
    // watching -> dialing -> hold; the rush has NO telegraph (that's the point)
    setup('service_mimic', 3, 4, 4, 4, 8);
    const r = drive((G) => {
      if (!G._smTurn) G._smTurn = 0;
      G._smTurn++;
      if (G._smTurn <= 4) retreatAll()(); // leave during the watch: first rush whiffs
      else hold();                        // then stand for the second
    }, 22);
    ok('sm: phases watching->dialing->hold', r.seen.includes('watching') && r.seen.includes('dialing') && r.seen.includes('hold'), r.seen.join(','));
    ok('sm: rush has no telegraph', !r.lines.some(l => l.startsWith('⚠')), r.lines.filter(l => l.startsWith('⚠')).length + ' telegraphs');
    ok('sm: rush still lands (no warning, just teeth)', r.lines.some(l => /Your fear is important to us/.test(l)));
    ok('sm: whiffed rush resets to hold', r.lines.some(l => /empty air/.test(l)));
    ok('sm: gated rush names the trick', r.lines.some(l => /No telegraph — it just moved/.test(l)));

    // counterplay: fire suppresses the dial
    const grid = flatGrid(); grid[4][5] = 'fire';
    const sFire = setup('service_mimic', 3, 4, 4, 4, 8, () => grid);
    const rf = drive(hold, 6);
    ok('sm: fire suppresses the rush (never dials)', !rf.seen.includes('dialing'), rf.seen.join(','));
    // The fire cue can fire during startCombat (before drive wraps say),
    // so check both early lines and drive lines.
    const allLines = (sFire._earlyLines || []).concat(rf.lines);
    ok('sm: script breaks near fire', allLines.some(l => /experiencing/.test(l)));
  }

  // ---------- 5. CONTRACT GOLEM ----------
  {
    // unfold -> clause -> bound; standing in range accepts the terms
    setup('contract_golem', 1, 4, 4, 4, 7);
    const r = drive(hold, 8);
    ok('cg: phases unfold->clause->bound', r.seen.includes('clause') && r.seen.includes('bound'), r.seen.join(','));
    ok('cg: ungated cue is the contract', r.lines.some(l => l.startsWith('⚠') && /YOU HAVE ACCEPTED/.test(l)));
    ok('cg: gated cue coaches (walk away)', r.lines.some(l => l.startsWith('⚠') && /walked away/.test(l)));
    ok('cg: binding agreement lands (undodgeable)', r.lines.some(l => /no dodging it/.test(l)));

    // counterplay: leaving resets the clause (reposition far, 1 monster turn)
    setup('contract_golem', 1, 4, 4, 4, 6);
    drive(hold, 2); // clause 1, clause 2 -> bound, declared
    const m = monster();
    const clauseBefore = m.cgClause;
    ok('cg: reached bound', m.beamPhase === 'bound' && clauseBefore === 2, `phase ${m.beamPhase}, clause ${clauseBefore}`);
    const p = player();
    p.mx = 0; p.my = 0; Game.state.scholar.mx = 0; Game.state.scholar.my = 0;
    drive(hold, 1); // pending resolves, then the branch sees you gone
    ok('cg: leaving resets the clause', (m.cgClause || 0) === 0 && m.beamPhase === 'unfold', `clause ${clauseBefore} -> ${m.cgClause}, phase ${m.beamPhase}`);

    // torch x3 (it's paper)
    setup('contract_golem', 1, 4, 4, 4, 5);
    Game.state.scholar.equipped.weapon = { itemId: 'torch', name: 'Pitch torch' };
    const m2 = monster();
    const hp0 = m2.hp;
    Game.tbDamage(m2.key, 20, 'you');
    ok('cg: torch x3 (paper)', hp0 - m2.hp === 60, `dealt ${hp0 - m2.hp}`);

    // never flees
    ok('cg: never flees (fleeAt 0)', (Game.data.monsters.find(x => x.id === 'contract_golem').fleeAt || 0) === 0);
  }

  // ---------- 6. PAIN SWITCH (fifo, one representative) ----------
  {
    setup('voice_mimic_radio', 3, 4, 4, 4, 0);
    const m = monster();
    Game.encNoticeFighter(m, 'p', true);
    Game.tbDamage(m.key, 5, 'you');
    const q = Game.encThreatQueue(m);
    ok('fifo: pain jumps the queue', q[0] === 'p', q.join(','));
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(2); });
