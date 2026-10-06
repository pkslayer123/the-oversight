// Contest FEAR audit (Steve 2026-10-06): play the contest system as a player.
// V: verify blocked items 1&2 landed end-to-end (eligibility panel contract;
//    fireShow pull-away in the live dawn flow).
// Q: qualification -> selection -> interruption (grabbed / choice-refuse /
//    watch / watched-death / player-death paths).
// F: fear audit across the whole pool (playable structure, knowledge gating,
//    specific death lines, budget cap, no stacking, unavoidable).
// N: play the 4 new contests (riddle, confession, honey, secrets) end to end
//    with full transcripts for the fun/fear verdict.
// Usage: node scripts/play-contest-fear.js
const fs = require('fs');
const path = require('path');
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
function hookSay(quiet) {
  said = [];
  const orig = Game.say.bind(Game), origSys = Game.sysSay.bind(Game);
  Game.say = (t) => { said.push(String(t)); if (!quiet) console.log('  ' + String(t).split('\n').join('\n  ')); return orig(t); };
  Game.sysSay = (t) => { said.push('[SYS] ' + String(t)); if (!quiet) console.log('  ' + String(t).split('\n').join('\n  ')); return origSys(t); };
}
function log() { return said.join('\n'); }

function fresh() {
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  hookSay(true);
  const s = Game.state.scholar;
  s.day = 15;
  Game.state.systemArrived = true;
  s.health = 100; s.kcal = 3000; s.trauma = 0;
  Game.state.over = false;
  Game.log = [];
  Game.state.showBudget = null;
  Game.state.pendingContest = null;
  Game.state.activeContest = null;
  Game.state.contestsSeen = {};
  Game.state.notability = {};
  Game.state.codex = Game.state.codex || {};
  Game.state.codex.contests = {};
  const v = Game.state.village;
  v.positions = v.positions || {};
  const ids = (v.roster || []).filter(rid => rid !== Game.villagerId);
  ids.slice(0, 3).forEach((rid, i) => { v.positions[rid] = { mx: 2 + i * 2, my: 2 }; });
  return { s, vids: ids.slice(0, 3) };
}
function pool() { return Game.contestPool(); }
function byId(id) { return pool().find(c => c.id === id); }
function playThrough(choiceIdxs, rngSeq) {
  const unrig = rig(rngSeq || [0.99]);
  let steps = 0, result = null;
  while (Game.state.activeContest && steps < 12) {
    const ac = Game.state.activeContest;
    const ci = choiceIdxs[Math.min(steps, choiceIdxs.length - 1)];
    result = Game.contestChoose(ci);
    steps++;
  }
  unrig();
  return result;
}

(async () => {
  await Game.init();

  // ================= V. VERIFY ITEMS 1 & 2 =================
  console.log('===== V. blocked items 1&2 =====');
  {
    // V1: eligibility panel contract — app.js oversightPanel wired + data shape
    fresh();
    Game.state.scholar.day = 13;
    const e13 = Game.contestEligible();
    ok('V1a day<14: nobody eligible', e13.eligible.length === 0);
    ok('V1b day<14: reason names day 14', /14/.test(e13.reason || ''));
    Game.state.scholar.day = 15;
    const e15 = Game.contestEligible();
    ok('V1c day 15: eligible list non-empty', e15.eligible.length > 0, `${e15.eligible.length} eligible`);
    const keys = new Set();
    e15.eligible.forEach(e => Object.keys(e).forEach(k => keys.add(k)));
    ok('V1d eligible entries carry only id/name/notability/notes',
      [...keys].every(k => ['id', 'name', 'notability', 'notes'].includes(k)), [...keys].join(','));
    const appSrc = fs.readFileSync(path.join(ROOT, 'src/js/app.js'), 'utf8');
    ok('V1e app.js oversightPanel exists', /function oversightPanel\(\)/.test(appSrc));
    ok('V1f oversightPanel calls Game.contestEligible()', /oversightPanel[\s\S]{0,600}?Game\.contestEligible\(\)/.test(appSrc));
    ok('V1g panel rendered inside a screen (codexScreen)', /codexScreen[\s\S]{0,4000}?\$\{oversightPanel\(\)\}/.test(appSrc) || /\$\{oversightPanel\(\)\}/.test(appSrc));
    // fame is a deed: showmanship notability surfaces in the panel
    Game.addNotability('player', 'wave2Kill');
    Game.addNotability('player', 'showmanship');
    const eFame = Game.contestEligible();
    const pnote = (eFame.eligible.find(e => e.id === 'player') || {}).notability || [];
    ok('V1h deeds surface as notes (wave2Kill)', pnote.some(n => /wave-2/.test(n)), JSON.stringify(pnote));
    ok('V1i showmanship surfaces as audience favorite', pnote.some(n => /audience favorite/.test(n)), JSON.stringify(pnote));
  }
  {
    // V2: fireShow in the live dawn flow — contestTick returns a show event,
    // the dawn branch routes non-contest ids to fireShow (game.js ~12976).
    fresh();
    const unrig = rig([0.1, 0.8, 0.5, 0.5]); // pass 30% gate; show (not contest); pick idx; pull villager
    const event = Game.contestTick();
    ok('V2a contestTick fired an event', !!(event && event.id), event && event.id);
    ok('V2b event is a SHOW (id not in contest pool -> dawn routes to fireShow)',
      event && !pool().some(c => c.id === event.id), event && event.id);
    ok('V2c weekly budget consumed', Game.state.showBudget && Game.state.showBudget.used === 1);
    const gameSrc = fs.readFileSync(path.join(ROOT, 'src/js/game.js'), 'utf8');
    ok('V2d game.js dawn branch calls this.fireShow(event)',
      /this\.contestPool\(\)\.find\(c => c\.id === event\.id\)[\s\S]{0,400}?\}\s*else\s*\{[\s\S]{0,400}?this\.fireShow\(event\)/.test(gameSrc));
    Game.fireShow(event);
    unrig();
    const L = log();
    ok('V2e fireShow announces TONIGHT', /📺 TONIGHT:/.test(L));
    ok('V2f fireShow pulls a villager for a silly reason', /The cameras want .*\. No reason/.test(L));
    ok('V2g pull-away promises return', /will be back by morning/.test(L));
    const pulledNota = Object.entries(Game.state.notability || {}).some(([vid, d]) => vid !== 'player' && d.showmanship);
    ok('V2h pulled villager gains showmanship notability', pulledNota);
  }

  // ================= Q. QUALIFICATION -> SELECTION -> SEQUENCE =================
  console.log('===== Q. qualification/selection/sequence =====');
  {
    // Q1+Q2: fireContest -> pendingContest -> resolveContest interruption
    fresh();
    const unrig = rig([0.5, 0.99]); // whim off; grabbed path (no choice roll)
    Game.fireContest(byId('pit'));
    const pc = Game.state.pendingContest;
    ok('Q1 fireContest sets pendingContest', !!pc && pc.contestId === 'pit');
    ok('Q2 player preferred as participant', pc && pc.participant === 'player', pc && pc.participant);
    ok('Q3 countdown is 1 day', pc && pc.firesDay === 16, pc && pc.firesDay);
    Game.state.scholar.day = 16;
    Game.resolveContest();
    unrig();
    const ac = Game.state.activeContest;
    ok('Q4 resolveContest opens the modal interruption', !!ac && ac.contestId === 'pit');
    ok('Q5 grabbed path has 3 playable phases', ac && ac.phase === 'intro' && ac.phases.length === 3, ac && `${ac.phase}/${ac.phases && ac.phases.length}`);
  }
  {
    // Q6: grabbed pit playthrough to WIN — damage is real
    fresh();
    hookSay(true);
    const unrig0 = rig([0.99]);
    Game.contestInterruption(Object.assign({}, byId('pit'), { givesChoice: false }), 'player');
    unrig0();
    const hp0 = Game.state.scholar.health;
    const res = playThrough([0, 0, 0], [0.99]);
    ok('Q6 pit grabbed playthrough completes', res && res.done === true, JSON.stringify(res));
    ok('Q7 outcome won', res && res.outcome === 'won');
    ok('Q8 modal cleared (no stuck screen)', Game.state.activeContest === null);
    ok('Q9 damage was real (fear has teeth)', Game.state.scholar.health < hp0, `${hp0} -> ${Game.state.scholar.health}`);
    ok('Q10 prize granted', (Game.state.scholar.inventory || []).length > 0);
    ok('Q10b prize announced by name, not raw id', !/Prize: [a-z]+_[a-z_]+!/.test(log()));
    ok('Q11 knowledge recorded', (Game.state.codex.contests.pit || {}).seen > 0);
  }
  {
    // Q12: choice path -> REFUSE is a sequence, not a skip
    fresh();
    hookSay(true);
    Game.contestInterruption(Object.assign({}, byId('pit'), { givesChoice: true }), 'player');
    ok('Q12 choice phase offered', Game.state.activeContest && Game.state.activeContest.phase === 'choice');
    const res = playThrough([1], [0.99]); // Refuse
    ok('Q13 refuse resolves as a sequence', res && res.done && res.outcome === 'refused');
    ok('Q14 refusal is content, not a skip', /Refusal is\.\.\. content/.test(log()));
    ok('Q15 refusal clears the modal', Game.state.activeContest === null);
  }
  {
    // Q15b: choice-phase SHIFT regression (Steve 2026-10-06) — Participate
    // must advance through the real phases, not loop phase 0 forever.
    fresh();
    hookSay(true);
    Game.contestInterruption(Object.assign({}, byId('maw'), { givesChoice: true }), 'player');
    ok('Q15b choice phase offered (maw)', Game.state.activeContest && Game.state.activeContest.phase === 'choice');
    const unrig = rig([0.99]);
    const res = playThrough([0, 0, 0, 0, 0, 0], [0.99]); // Participate, then phase choices
    unrig();
    ok('Q15c participate path resolves (no phase-0 loop)', res && res.done === true, JSON.stringify(res && res.outcome));
    ok('Q15d modal cleared after participate path', Game.state.activeContest === null);
  }
  {
    const { vids } = fresh();
    hookSay(true);
    const vid = vids[0];
    Game.contestInterruption(Object.assign({}, byId('pit'), { givesChoice: false }), vid);
    ok('Q16 watch mode opens', Game.state.activeContest && Game.state.activeContest.phase === 'watching');
    const res = playThrough([0, 0, 0], [0.99]); // no death (0.99), no win (0.99 >= 0.4)
    ok('Q17 watch playthrough completes', res && res.done === true);
    ok('Q18 player alive after watching', !Game.state.over && Game.state.scholar.health > 0);
    ok('Q19 watched villager survives a loss', (Game.state.village.roster || []).includes(vid));
    ok('Q20 modal cleared', Game.state.activeContest === null);
  }
  {
    // Q21: watched DEATH — a villager can die on camera (fear)
    const { vids } = fresh();
    hookSay(true);
    const vid = vids[0];
    const vname = Game.displayName(vid);
    Game.contestInterruption(Object.assign({}, byId('pit'), { givesChoice: false }), vid);
    const res = playThrough([0, 0, 0], [0.0]); // verdict: die (0.0 < 0.10)
    ok('Q21 watched villager can die on camera', res && res.done && res.outcome === 'died', JSON.stringify(res));
    ok('Q22 dead villager leaves the roster', !(Game.state.village.roster || []).includes(vid));
    ok('Q23 player survives watching a death', !Game.state.over);
    ok('Q24 death uses the contest-specific line', /fed the Pit/.test(log()));
    ok('Q25 watching death costs trauma', Game.state.scholar.trauma > 0, `trauma=${Game.state.scholar.trauma}`);
  }
  {
    // Q26: player death — specific death line, game over
    fresh();
    hookSay(true);
    const unrig0 = rig([0.99]);
    Game.contestInterruption(Object.assign({}, byId('pit'), { givesChoice: false }), 'player');
    unrig0();
    Game.contestChoose(2); // 'Nothing' — no die
    const unrig1 = rig([0.0]); // charge it: die 0.08 -> dies
    const res = Game.contestChoose(1);
    unrig1();
    ok('Q26 player can die in the pit', res && res.done && res.outcome === 'died');
    ok('Q27 death ends the run', Game.state.over === true);
    ok('Q28 bespoke death line, not generic', /fed the Pit/.test(log()) && !/did not come home/.test(log()));
  }

  // ================= F. FEAR AUDIT ACROSS THE POOL =================
  console.log('===== F. fear audit =====');
  {
    const validNext = (phases, n) =>
      n === 'WIN' || n === 'LOSE' || n === 'DIE' || n === 'REFUSE' || n === 'VERDICT' ||
      (Number.isInteger(n) && n >= 0 && n < phases.length);
    let structFails = [];
    for (const c of pool()) {
      fresh(); hookSay(true);
      let phases;
      try { phases = Game.contestPlayable(c); } catch (e) { structFails.push(`${c.id}: playable threw`); continue; }
      if (!phases || phases.length < 2) { structFails.push(`${c.id}: <2 phases`); continue; }
      phases.forEach((p, i) => {
        if (!p.text || !(p.choices || []).length) structFails.push(`${c.id}: phase ${i} empty`);
        (p.choices || []).forEach((ch, j) => {
          if (!ch.label) structFails.push(`${c.id}: phase ${i} choice ${j} unlabeled`);
          if (!validNext(phases, ch.next)) structFails.push(`${c.id}: phase ${i} choice ${j} bad next ${ch.next}`);
        });
      });
      if (!c.arena) structFails.push(`${c.id}: no arena visual`);
    }
    ok('F1 every contest is structurally playable', structFails.length === 0, structFails.slice(0, 4).join(' | '));
    const ids = pool().map(c => c.id);
    ok('F2 contest ids unique', new Set(ids).size === ids.length, `${ids.length} contests`);
  }
  {
    // knowledge gating: coaching hidden until level 2, death lines specific
    let gateFails = [], deathFails = [], riskFails = [];
    const riskLine = { low: 'expects entertainment', medium: 'been hurt', high: 'People die', extreme: 'Almost nobody' };
    for (const c of pool()) {
      fresh(); hookSay(true);
      const intro0 = Game._cxIntro(c);
      if (/What you know/.test(intro0)) gateFails.push(`${c.id}: coaching leaks at level 0`);
      Game.contestLearn(c.id, 'won'); Game.contestLearn(c.id, 'won'); Game.contestLearn(c.id, 'won');
      const intro2 = Game._cxIntro(c);
      if (!/What you know/.test(intro2)) gateFails.push(`${c.id}: no coaching at level 3`);
      const dl = Game._contestDeathLine(c, 'test', 'You');
      if (/did not come home/.test(dl) || dl.length < 40) deathFails.push(c.id);
      if (!intro0.includes(riskLine[c.risk])) riskFails.push(`${c.id} (${c.risk})`);
    }
    ok('F3 coaching gated: hidden L0, shown L2+', gateFails.length === 0, gateFails.slice(0, 3).join(' | '));
    ok('F4 every contest has a specific death line', deathFails.length === 0, deathFails.join(','));
    ok('F5 every intro carries its risk line', riskFails.length === 0, riskFails.slice(0, 3).join(' | '));
  }
  {
    // scheduler discipline: budget cap, no stacking, unavoidable
    fresh();
    Game.state.showBudget = { week: Math.floor(15 / 7), used: 2 };
    ok('F6 2/week budget cap enforced', Game.contestTick() === null);
    fresh();
    Game.state.pendingContest = { contestId: 'pit', participant: 'player', firesDay: 99 };
    ok('F7 no stacking while a contest is pending', Game.contestTick() === null);
    fresh();
    Game.state.activeContest = { contestId: 'pit', phase: 'intro', phaseIdx: 0, phases: [] };
    ok('F8 no new fire while an interruption is unresolved', Game.contestTick() === null);
    fresh();
    Game.state.scholar.day = 10;
    ok('F9 pre-day-14 silence', Game.contestTick() === null);
  }
  {
    // shows: pool depth + pull-away
    fresh();
    const shows = Game.showPool();
    ok('F10 show pool is deep (20+)', shows.length >= 20, `${shows.length} shows`);
    const bad = shows.filter(s => !s.id || !s.name || !s.desc);
    ok('F11 every show has id/name/desc', bad.length === 0);
    const unrig = rig([0.5]);
    const s = Game.pickShow();
    Game.fireShow(s);
    unrig();
    ok('F12 fireShow returns the show', !!(s && s.id));
    ok('F13 every fireShow is an announcement + pull-away or watch-together',
      /📺 TONIGHT:/.test(log()));
  }

  // ================= N. PLAY THE NEW CONTESTS =================
  console.log('===== N. new contests, full transcripts =====');
  const newIds = ['riddle', 'confession', 'honey', 'secrets'];
  const paths = {
    riddle: [0, 0, 1],      // answer, kid-truth, ask IT a riddle -> WIN
    confession: [2, 0, 0],  // watch village, press details, name culprit -> WIN (fracture)
    honey: [0, 1, 2],       // smoke, cut deep, leave offering -> WIN (unity)
    secrets: [0, 1, 0],     // draw, bluff, show hand -> WIN (fracture)
  };
  for (const id of newIds) {
    fresh();
    console.log(`\n----- ${id.toUpperCase()} -----`);
    hookSay(false); // print transcript
    const unrig0 = rig([0.99]);
    Game.contestInterruption(Object.assign({}, byId(id), { givesChoice: false }), 'player');
    unrig0();
    const res = playThrough(paths[id], [0.99]);
    console.log(`  => outcome: ${res && res.outcome}, hp=${Game.state.scholar.health}, trauma=${Game.state.scholar.trauma}`);
    ok(`N-${id} completes without a stuck modal`, res && res.done === true && Game.state.activeContest === null);
  }
  // knowledge-gated beats on the new contests: L2 intro shows coaching
  for (const id of newIds) {
    fresh(); hookSay(true);
    Game.contestLearn(id, 'won'); Game.contestLearn(id, 'won'); Game.contestLearn(id, 'won');
    ok(`N-${id} coaching unlocks at L2+`, /What you know/.test(Game._cxIntro(byId(id))));
  }
  // riddle/confession gated phase text differs by knowledge
  {
    fresh(); hookSay(true);
    const p0 = Game._contestRiddle(byId('riddle'))[2].text;
    Game.contestLearn('riddle', 'won'); Game.contestLearn('riddle', 'won'); Game.contestLearn('riddle', 'won');
    const p2 = Game._contestRiddle(byId('riddle'))[2].text;
    ok('N-riddle final phase is knowledge-gated', p0 !== p2 && /you've paid for the lesson/.test(p2));
  }
  {
    fresh(); hookSay(true);
    const p0 = Game._contestConfession(byId('confession'))[1].text;
    Game.contestLearn('confession', 'won'); Game.contestLearn('confession', 'won'); Game.contestLearn('confession', 'won');
    const p2 = Game._contestConfession(byId('confession'))[1].text;
    ok('N-confession interrogation is knowledge-gated', p0 !== p2 && /false confession/.test(p2));
  }
  // social costs land: confession WIN fractures, honey offering unites, secrets WIN fractures
  {
    fresh(); hookSay(true);
    const unrig0 = rig([0.99]);
    Game.contestInterruption(Object.assign({}, byId('confession'), { givesChoice: false }), 'player');
    unrig0();
    playThrough([2, 0, 0], [0.99]);
    const l1 = Game.leadership();
    ok('N-confession win fractures the village', (l1.fracture || 0) > 0, `fracture=${l1.fracture}`);
  }
  {
    fresh(); hookSay(true);
    const unrig0 = rig([0.99]);
    Game.contestInterruption(Object.assign({}, byId('honey'), { givesChoice: false }), 'player');
    unrig0();
    playThrough([0, 1, 2], [0.99]);
    const l1 = Game.leadership();
    ok('N-honey offering unites the village', (l1.unity || 0) > 0, `unity=${l1.unity}`);
  }

  console.log(`\n===== RESULT: ${pass} pass, ${fail} fail =====`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('SCRIPT ERROR', e); process.exit(2); });
