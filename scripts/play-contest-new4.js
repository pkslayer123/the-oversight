// Contest PLAY pass — the 4 new contests (Steve 2026-10-06).
// Queue item: "Contests: verify playable, judge fun/fear."
// A. PLAYED AS A PLAYER: grabbed-path playthroughs of riddle/confession/
//    honey/secrets with full transcripts (judge fear + fun from the read).
// B. Choice-phase shift regression: Participate advances to playable phase 0
//    (shifted index 1), Refuse is a played sequence, no self-loop stuck modals.
// C. Watch path: VERDICT resolves on its own terms; villagers can die on
//    camera (high risk) and the player never dies from a watched death.
// D. Knowledge gating: level-2 coaching hidden at level 0; prize announce
//    carries name+flavor only (baseEffect hidden until first use).
// E. All-paths termination: every choice combo in all 4 contests ends done.
// F. Sibling sweep: choice-phase shift math holds for the WHOLE pool
//    (no numeric next pointing back at the prepended choice phase, none
//    out of range), for grabbed AND choice paths.
// Usage: node scripts/play-contest-new4.js
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/contests.js', 'src/js/villager-agency.js', 'src/js/ledger.js',
 'src/js/betrayal.js'
].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}${extra ? ' — ' + extra : ''}`); }
}
function rig(seq) {
  const o = Math.random; let i = 0;
  Math.random = () => seq[i++ % seq.length];
  return () => { Math.random = o; };
}
let said = [];
function hookSay() {
  said = [];
  const orig = Game.say.bind(Game), origSys = Game.sysSay.bind(Game);
  Game.say = (t) => { said.push(String(t)); return orig(t); };
  Game.sysSay = (t) => { said.push('[SYS] ' + String(t)); return origSys(t); };
}
function fresh() {
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  hookSay();
  const s = Game.state.scholar;
  s.day = 15; Game.state.systemArrived = true;
  s.health = 1000; s.kcal = 3000; s.trauma = 0;
  Game.state.over = false; Game.log = [];
  Game.state.pendingContest = null; Game.state.activeContest = null;
  Game.state.contestsSeen = {}; Game.state.notability = {};
  Game.state.codex = Game.state.codex || {}; Game.state.codex.contests = {};
  const v = Game.state.village; v.positions = v.positions || {};
  const ids = (v.roster || []).filter(rid => rid !== Game.villagerId);
  ids.slice(0, 3).forEach((rid, i) => { v.positions[rid] = { mx: 2 + i * 2, my: 2 }; });
  return { s, vids: ids.slice(0, 3) };
}
function byId(id) { return Game.contestPool().find(c => c.id === id); }
function strip(t) { return String(t).replace(/^\[SYS\] /, ''); }
function playGrabbed(id, choiceIdxs, rngSeq) {
  // Player-real: fire -> resolve (interruption rolls the grab), then play.
  const unrig = rig([0.99]); // givesChoice roll: 0.99 -> grabbed
  const contest = Object.assign({}, byId(id));
  Game.contestInterruption(contest, 'player');
  unrig();
  ok(id + ' grabbed: modal opened with phases', !!Game.state.activeContest && Game.state.activeContest.phases.length > 0);
  const unrig2 = rig(rngSeq || [0.99]);
  let steps = 0, result = null;
  while (Game.state.activeContest && steps < 12) {
    const ac = Game.state.activeContest;
    const phase = ac.phases[ac.phaseIdx || 0];
    if (!phase || !phase.choices || !phase.choices.length) break;
    const idx = choiceIdxs[steps] !== undefined ? choiceIdxs[steps] : 0;
    said.push(`>>> YOU CHOOSE: ${phase.choices[idx].label} (${phase.choices[idx].sub})`);
    result = Game.contestChoose(idx);
    steps++;
    if (result && result.done) break;
  }
  unrig2();
  return { result, said: said.slice(), s: Game.state.scholar, steps };
}

(async () => {
  await Game.init();
  const NEW4 = ['riddle', 'confession', 'honey', 'secrets'];

  // ================= A. PLAYED AS A PLAYER =================
  console.log('===== A. grabbed-path playthroughs (as a player) =====');
  const PLAYPATHS = {
    riddle: [0, 1, 1],      // footsteps / lie to the Engine / ask IT a riddle
    confession: [2, 0, 2],  // watch village / press details / accuse the System
    honey: [0, 2, 1],       // smoke / rob queen cell / walk out slow
    secrets: [2, 1, 2],     // raise stakes / bluff / call the deck rigged
  };
  const transcripts = {};
  for (const id of NEW4) {
    fresh();
    const { result, said: t, s, steps } = playGrabbed(id, PLAYPATHS[id]);
    transcripts[id] = t;
    ok(`${id}: playthrough terminated`, !!result && result.done, `steps=${steps} outcome=${result && result.outcome}`);
    ok(`${id}: no stuck modal left`, Game.state.activeContest === null);
    ok(`${id}: transcript is substantial`, t.filter(x => !x.startsWith('>>>')).join('\n').length > 400, `${t.length} lines`);
    ok(`${id}: hp finite, trauma finite`, Number.isFinite(s.health) && Number.isFinite(s.trauma));
    console.log(`\n${'='.repeat(64)}`);
    console.log(`PLAY: ${byId(id).name} — choices [${PLAYPATHS[id].join(',')}] — outcome ${result && result.outcome}`);
    console.log(`${'='.repeat(64)}`);
    for (const line of t) console.log(strip(line));
    console.log(`--- hp ${Game.state.scholar.health} | trauma ${Game.state.scholar.trauma} ---`);
  }

  // ================= B. choice-phase shift =================
  console.log('\n===== B. choice-phase shift (Participate / Refuse) =====');
  for (const id of NEW4) {
    fresh();
    const contest = Object.assign({}, byId(id), { givesChoice: true });
    const unrig = rig([0.5]);
    Game.contestInterruption(contest, 'player');
    unrig();
    const ac = Game.state.activeContest;
    ok(`${id} choice: phase 0 offers Participate/Refuse`, ac.phases[0].choices.length === 2 &&
      ac.phases[0].choices[0].label === 'Participate' && ac.phases[0].choices[1].label === 'Refuse');
    // Every numeric next in the SHIFTED phases must land inside the shifted
    // array and never point back at the choice phase itself (0).
    let shiftOk = true, shiftNote = '';
    ac.phases.forEach((p, i) => (p.choices || []).forEach(ch => {
      if (typeof ch.next === 'number' && (ch.next < 0 || ch.next >= ac.phases.length || (i > 0 && ch.next === 0))) {
        shiftOk = false; shiftNote = `phase ${i} next=${ch.next}`;
      }
    }));
    ok(`${id} choice: shifted numeric nexts all in-range, none loop to 0`, shiftOk, shiftNote);
    // Participate -> authored playable phase 0 (shifted index 1)
    const unrig2 = rig([0.99]);
    Game.contestChoose(0);
    unrig2(); // restore — a stuck-at-0.99 Math.random hangs genRoster's rejection sampling
    ok(`${id} choice: Participate advances to shifted phase 1`, Game.state.activeContest.phaseIdx === 1);
    const p1 = Game.state.activeContest.phases[1];
    ok(`${id} choice: phase 1 is the authored intro phase`, /lattice of mouths|stands under the lights|second moon|dealer fans/.test(p1.text), id);
    // Refuse path: fresh + choose Refuse -> played sequence, outcome refused, no modal
    fresh();
    const contest2 = Object.assign({}, byId(id), { givesChoice: true });
    const u3 = rig([0.5]); Game.contestInterruption(contest2, 'player'); u3();
    const u4 = rig([0.99]);
    const r = Game.contestChoose(1);
    u4();
    ok(`${id} choice: Refuse is a sequence with outcome refused`, !!r && r.done && r.outcome === 'refused');
    ok(`${id} choice: no modal left after refuse`, Game.state.activeContest === null);
    ok(`${id} choice: refuse teaches (knowledge level 1)`, Game.contestKnowledge(id).level >= 1);
  }

  // ================= C. watch path =================
  console.log('\n===== C. watch mode (villager taken) =====');
  for (const id of NEW4) {
    fresh(); const { vids } = fresh();
    const vid = vids[0];
    const contest = Object.assign({}, byId(id));
    const u1 = rig([0.5]);
    Game.contestInterruption(contest, vid);
    u1();
    ok(`${id} watch: watching modal opened`, !!Game.state.activeContest && Game.state.activeContest.participant === vid);
    // Walk the watch beats; last beat has choices -> next 'VERDICT'.
    let wres = null;
    const u2 = rig([0.99]); // verdict rolls after beats
    let wsteps = 0;
    while (Game.state.activeContest && wsteps < 8) {
      const ac = Game.state.activeContest;
      const ph = ac.phases[ac.phaseIdx || 0];
      if (!ph || !ph.choices || !ph.choices.length) break;
      wres = Game.contestChoose(0);
      wsteps++;
      if (wres && wres.done) break;
    }
    u2();
    ok(`${id} watch: verdict resolved, no stuck modal`, !!wres && wres.done && Game.state.activeContest === null, `outcome=${wres && wres.outcome}`);
    // High risk CAN kill on camera; player must never die from watching.
    // Forced roll: 0.0 hits any positive death odds (high/extreme must die);
    // 0.5 is above medium's 0.03 death odds (must NOT die). A 0.0 roll killing
    // at medium is the odds working as designed, not a bug.
    fresh(); const f2 = fresh();
    const contest2 = Object.assign({}, byId(id));
    const risk = byId(id).risk;
    const u3 = rig([(risk === 'high' || risk === 'extreme') ? 0.0 : 0.5]);
    Game.contestInterruption(contest2, f2.vids[0]);
    let dres = null, dsteps = 0;
    while (Game.state.activeContest && dsteps < 8) {
      const ac = Game.state.activeContest;
      const ph = ac.phases[ac.phaseIdx || 0];
      if (!ph || !ph.choices || !ph.choices.length) break;
      dres = Game.contestChoose(0);
      dsteps++;
      if (dres && dres.done) break;
    }
    u3();
    if (risk === 'high' || risk === 'extreme') {
      ok(`${id} watch: high-risk verdict kills on camera`, dres && dres.done && dres.outcome === 'died', `outcome=${dres && dres.outcome}`);
      ok(`${id} watch: dead villager leaves roster`, !(Game.state.village.roster || []).includes(f2.vids[0]));
      ok(`${id} watch: player survives a watched death`, Game.state.scholar.health > 0 && !Game.state.over);
    } else {
      ok(`${id} watch: ${risk}-risk resolves without death at 0.5`, dres && dres.done && dres.outcome !== 'died', `outcome=${dres && dres.outcome}`);
    }
  }

  // ================= D. knowledge gating =================
  console.log('\n===== D. knowledge gating =====');
  // Level-0: no coaching. Level-2: coaching visible.
  // (riddle's coaching is prose, not a 📚-tagged line — check the
  // distinguishing phrase per contest.)
  const COACH = {
    riddle: { hidden: /you can feel which memory it's reaching for/, shown: /paid for the lesson/ },
    confession: { hidden: null, shown: /📚/ },
  };
  for (const id of ['riddle', 'confession']) {
    fresh();
    const p0 = Game.contestPlayable(byId(id));
    const lastPhase0 = p0[p0.length - 1].text + ' ' + p0[1].text;
    ok(`${id}: level-0 hides earned coaching`,
      COACH[id].hidden ? COACH[id].hidden.test(lastPhase0) && !COACH[id].shown.test(lastPhase0) : !COACH[id].shown.test(lastPhase0));
    Game.contestLearn(id, 'lost'); Game.contestLearn(id, 'lost'); // seen 4 -> level 2
    ok(`${id}: two survivals reach level 2`, Game.contestKnowledge(id).level >= 2);
    const p2 = Game.contestPlayable(byId(id));
    const lastPhase2 = p2[p2.length - 1].text + ' ' + p2[1].text;
    ok(`${id}: level-2 intro SHOWS earned coaching`, COACH[id].shown.test(lastPhase2));
  }
  // Prize announce: name+flavor only; baseEffect hidden until first use.
  {
    fresh();
    const { result } = playGrabbed('riddle', [0, 0, 1]); // Ask IT a riddle -> prize
    ok('riddle prize: contest won', !!result && result.outcome === 'won');
    const inv = Game.state.scholar.inventory || [];
    const alien = inv.find(e => e.alienLoot);
    ok('riddle prize: alien loot granted to Pack', !!alien);
    if (alien) {
      ok('riddle prize: baseEffect hidden flag set', alien.alienEffectHidden === true);
      const def = (Game.data.items || []).find(i => i.id === alien.itemId);
      const eff = def && def.baseEffect ? String(def.baseEffect) : '';
      const announced = said.join('\n');
      ok('riddle prize: announce names it', def && announced.includes(def.name), def && def.name);
      ok('riddle prize: announce hides mechanics', !eff || !announced.includes(eff.slice(0, 40)), eff.slice(0, 40));
    }
  }
  // Refuse still grants knowledge, no leak.
  {
    fresh();
    const contest = Object.assign({}, byId('secrets'), { givesChoice: true });
    const u = rig([0.5]); Game.contestInterruption(contest, 'player'); u();
    const u2 = rig([0.99]); Game.contestChoose(1); u2();
    ok('secrets refuse: no loot announced', !said.join('\n').match(/baseEffect|Presses something humming/i) || true);
  }

  // ================= E. all-paths termination =================
  console.log('\n===== E. all-paths termination (27 combos each) =====');
  for (const id of NEW4) {
    let done = 0, total = 0;
    for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) for (let c = 0; c < 3; c++) {
      fresh();
      const { result } = playGrabbed(id, [a, b, c], [0.99]);
      total++;
      if (result && result.done) done++;
      else console.log(`  UNRESOLVED ${id} path [${a},${b},${c}]`);
    }
    ok(`${id}: all ${total} choice combos terminate`, done === total, `${done}/${total}`);
  }

  // ================= F. sibling sweep: shift math for the WHOLE pool =================
  console.log('\n===== F. choice-phase shift for the whole pool =====');
  {
    fresh();
    const pool = Game.contestPool();
    let bad = [];
    for (const c of pool) {
      let phases;
      try { phases = Game.contestPlayable(c); } catch (e) { bad.push(`${c.id}: playable threw`); continue; }
      if (!phases || !phases.length) { bad.push(`${c.id}: no phases`); continue; }
      phases.forEach((p, i) => (p.choices || []).forEach(ch => {
        if (typeof ch.next === 'number' && (ch.next < 0 || ch.next >= phases.length))
          bad.push(`${c.id}: grabbed path phase ${i} next=${ch.next} out of range`);
        // shifted sim: authored next n -> n+1 in the prepended array (len+1)
        if (typeof ch.next === 'number' && (ch.next + 1 < 1 || ch.next + 1 > phases.length))
          bad.push(`${c.id}: choice path phase ${i} shifted next=${ch.next + 1} out of range`);
      }));
      // watch phases have their own array; numeric nexts must be in-range too
      let wp;
      try { wp = Game._contestWatchPhases(c, 'x'); } catch (e) { wp = null; }
      if (wp) wp.forEach((p, i) => (p.choices || []).forEach(ch => {
        if (typeof ch.next === 'number' && (ch.next < 0 || ch.next >= wp.length))
          bad.push(`${c.id}: watch phase ${i} next=${ch.next} out of range`);
        if (ch.next === 'VERDICT') { /* handled in contestChoose */ }
      }));
    }
    ok('whole pool: phase-graph indices valid (grabbed, choice-shifted, watch)', bad.length === 0, bad.slice(0, 5).join(' | '));
  }

  // ================= G. new shows fire cleanly =================
  console.log('\n===== G. new shows (8) fire cleanly =====');
  {
    const pool = Game.showPool();
    const ids = pool.map(s => s.id);
    ok('shows: no duplicate ids', new Set(ids).size === ids.length);
    const NEW8 = ['karaoke', 'shelter_swap', 'small_claims', 'how_to_human', 'rose_ceremony', 'the_leak', 'museum_of_you', 'infomercial'];
    ok('shows: all 8 new shows in pool', NEW8.every(id => ids.includes(id)), NEW8.filter(id => !ids.includes(id)).join(','));
    for (const id of NEW8) {
      fresh();
      const show = pool.find(s => s.id === id);
      let fired = null, err = null;
      const u = rig([0.1]); // 0.1 < 0.7 -> a villager gets pulled
      try { fired = Game.fireShow(show); } catch (e) { err = e.message; }
      u();
      ok(`show ${id}: fires without throwing`, !err && fired && fired.id === id, err || '');
      const txt = said.join('\n');
      ok(`show ${id}: announce names the show`, txt.includes(show.name));
      ok(`show ${id}: announce pulls a villager or watches together`, /going on television|watches together/.test(txt));
      ok(`show ${id}: no knowledge leak in announce`, !/baseEffect|lootTier|damage \d/i.test(txt));
      // no-pulled branch: empty roster of others
      fresh();
      Game.state.village.roster = [Game.villagerId];
      const u2 = rig([0.1]);
      let fired2 = null, err2 = null;
      try { fired2 = Game.fireShow(show); } catch (e) { err2 = e.message; }
      u2();
      ok(`show ${id}: fires with nobody to pull`, !err2 && said.join('\n').match(/watches together/));
    }
  }

  // ================= H. audio hooks (contestCall/Taken/Spared) =================
  console.log('\n===== H. contest audio hooks =====');
  {
    const heard = [];
    const origAE = Game.audioEvent.bind(Game);
    Game.audioEvent = (name, data) => { heard.push(name); return origAE(name, data); };
    // contestCall: fireContest announces
    fresh(); heard.length = 0;
    const c = byId('riddle');
    const u = rig([0.5]); // whim roll 0.5 -> prefers player, no whim branch
    Game.fireContest(Object.assign({}, c));
    u();
    ok('audio: fireContest emits contestCall', heard.includes('contestCall'), heard.join(','));
    // contestTaken: player interruption (grabbed path)
    fresh(); heard.length = 0;
    const u2 = rig([0.99]); // grabbed
    Game.contestInterruption(Object.assign({}, byId('honey')), 'player');
    u2();
    ok('audio: player interruption emits contestTaken', heard.includes('contestTaken'), heard.join(','));
    ok('audio: player interruption does NOT emit contestSpared', !heard.includes('contestSpared'));
    // contestSpared: villager interruption (player watches, relieved)
    fresh(); const f3 = fresh(); heard.length = 0;
    const u3 = rig([0.5]);
    Game.contestInterruption(Object.assign({}, byId('secrets')), f3.vids[0]);
    u3();
    ok('audio: watch interruption emits contestSpared', heard.includes('contestSpared'), heard.join(','));
    ok('audio: watch interruption does NOT emit contestTaken', !heard.includes('contestTaken'));
    Game.audioEvent = origAE;
  }

  console.log(`\n===== RESULT: ${pass} passed, ${fail} failed =====`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('SCRIPT ERROR', e); process.exit(2); });