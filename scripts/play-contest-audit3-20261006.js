// Contest playtest audit 3 (Steve 2026-10-06): PLAY contests as a player.
// Read-only audit — do NOT edit src. This script only DRIVES the game.
// Picks contests no prior run has played: drop (grabbed multi-take),
// box (choice->participate), cookfight (watch multi-take), why_eat show,
// natural fire->resolve flow (moot), eligibility/fairness probe.
// Usage: node scripts/play-contest-audit3-20261006.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/contests.js', 'src/js/villager-agency.js', 'src/js/ledger.js',
 'src/js/betrayal.js', 'src/js/membership.js'
].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let said = [];
const _origSay = { say: null, sysSay: null };
function hookSay() {
  said = [];
  if (!_origSay.say) { _origSay.say = Game.say.bind(Game); _origSay.sysSay = Game.sysSay.bind(Game); }
  Game.say = (t) => { said.push(String(t)); return _origSay.say(t); };
  Game.sysSay = (t) => { said.push('[SYS] ' + String(t)); return _origSay.sysSay(t); };
}
function rig(seq) {
  const o = Math.random; let i = 0;
  Math.random = () => seq[i++ % seq.length];
  return () => { Math.random = o; };
}
function fresh(day) {
  hookSay();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  s.day = day || 15;
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
  return s;
}
function byId(id) { return Game.contestPool().find(c => c.id === id); }
function setLevel(id, lvl) {
  Game.state.codex.contests[id] = { seen: lvl >= 2 ? 4 : 1, wins: 0, level: lvl };
}
function vids(n) {
  return (Game.state.village.roster || []).filter(id => id !== Game.villagerId).slice(0, n);
}
// Play through the active contest. Records phase text lengths for the
// mobile one-screen check and every choice taken.
const phaseReport = [];
function playThrough(choiceIdxs, rngSeq) {
  const unrig = rig(rngSeq || [0.99]);
  let steps = 0, result = null;
  while (Game.state.activeContest && steps < 16) {
    const ac = Game.state.activeContest;
    const phase = ac.phases[ac.phaseIdx || 0];
    if (!phase || !phase.choices || !phase.choices.length) break;
    phaseReport.push({ contest: ac.contestId, phase: ac.phaseIdx || 0,
      textLen: String(phase.text || '').length,
      choices: phase.choices.length,
      text: String(phase.text || '').slice(0, 400) });
    const ci = choiceIdxs[Math.min(steps, choiceIdxs.length - 1)];
    const idx = Math.min(ci, phase.choices.length - 1);
    console.log(`>>> ${ac.contestId} p${ac.phaseIdx}: CHOOSE [${phase.choices[idx].label}] (${phase.choices[idx].sub || ''})`);
    result = Game.contestChoose(idx);
    steps++;
    if (result && result.done) break;
  }
  unrig();
  return result;
}
function banner(t) { console.log('\n' + '='.repeat(70) + '\n' + t + '\n' + '='.repeat(70)); }
function section(t) { console.log('\n--- ' + t + ' ---'); }
function dumpSaid(cap) {
  console.log(cap || '--- full narration ---');
  said.forEach(l => console.log('  ' + String(l).split('\n').join('\n  ')));
}

// Structural check: every contest in the pool — all phases have choices,
// all nexts resolve, terminal phase reachable (stuck-state sweep).
function structuralSweep() {
  const bad = [];
  for (const c of Game.contestPool()) {
    let phases = null;
    try { phases = Game.contestPlayable(c); } catch (e) { bad.push(c.id + ': playable THREW ' + e.message); continue; }
    if (!phases || !phases.length) { bad.push(c.id + ': no phases (generic fallback needed)'); continue; }
    phases.forEach((ph, pi) => {
      const ch = ph.choices || [];
      if (!ch.length) { bad.push(`${c.id} p${pi}: NO CHOICES (stuck state)`); return; }
      ch.forEach((c2, ci) => {
        const n = c2.next;
        const ok = ['WIN', 'LOSE', 'DIE', 'REFUSE', 'VERDICT'].includes(n) || (typeof n === 'number' && n >= 0 && n < phases.length);
        if (!ok) bad.push(`${c.id} p${pi} c${ci}: bad next ${JSON.stringify(n)}`);
        if (typeof n === 'number' && n <= pi && phases.length > 1 && pi === 0) { /* choice-phase shift path ok */ }
      });
    });
    // givesChoice prepend path: verify the SHIFT keeps every numeric next in-bounds
    try {
      const shifted = phases.map(p => Object.assign({}, p, {
        choices: (p.choices || []).map(ch => Object.assign({}, ch, {
          next: (typeof ch.next === 'number') ? ch.next + 1 : ch.next } ))}));
      shifted.unshift({ text: 'choice', choices: [
        { label: 'Participate', next: 1 }, { label: 'Refuse', next: 'REFUSE' }] });
      shifted.forEach((ph, pi) => {
        (ph.choices || []).forEach((c2, ci) => {
          const n = c2.next;
          const ok = ['WIN', 'LOSE', 'DIE', 'REFUSE', 'VERDICT'].includes(n) || (typeof n === 'number' && n >= 0 && n < shifted.length);
          if (!ok) bad.push(`${c.id} shifted p${pi} c${ci}: bad next ${JSON.stringify(n)}`);
          if (typeof n === 'number' && n === pi && shifted.length > 2) bad.push(`${c.id} shifted p${pi} c${ci}: next points at SELF (infinite modal)`);
        });
      });
    } catch (e) { bad.push(c.id + ': shift-path THREW ' + e.message); }
  }
  return bad;
}

(async () => {
  await Game.init();

  // ============ STRUCTURAL SWEEP: all 34 pool ids ============
  banner('STRUCTURAL SWEEP — all pool contests: phases, choices, nexts, choice-shift path');
  {
    fresh(15);
    const pool = Game.contestPool();
    console.log(`pool size: ${pool.length}`);
    const bad = structuralSweep();
    console.log(`structural issues: ${bad.length}`);
    bad.slice(0, 15).forEach(b => console.log('  !! ' + b));
  }

  // ============ 1. THE DROP — grabbed, multi-take, no opting out ============
  banner('PLAY 1: THE DROP — grabbed (no choice), multi-take (you + 2 villagers)');
  {
    const s = fresh(15);
    const others = vids(2);
    const names = others.map(id => Game.displayName(id));
    console.log('others taken: ' + names.join(', '));
    const unrig = rig([0.99]);
    Game.contestInterruption(Object.assign({}, byId('drop'), { givesChoice: false }), ['player', ...others]);
    unrig();
    const ac = Game.state.activeContest;
    console.log(`participants=${ac.participants.length} others=${(ac.others || []).length}`);
    console.log(`interruption announces unavoidability: ${/grabbed/i.test(said.join(' '))}`);
    // endurance template: check phase texts print fully
    dumpSaid('--- narration ---');
    // play: ridge line (smart) -> keep moving -> commit to the beacon
    const res = playThrough([0, 0, 0], [0.5, 0.5, 0.5, 0.5]);
    console.log(`outcome=${res && res.outcome} hp=${s.health} kcal=${s.kcal} trauma=${s.trauma}`);
    console.log(`others still on roster: ${others.map(id => (Game.state.village.roster || []).includes(id) + ':' + Game.displayName(id)).join(' ')}`);
  }

  // ============ 2. THE BOX — choice offered, participate ============
  banner('PLAY 2: THE BOX — the System offers a choice; you PARTICIPATE');
  {
    const s = fresh(15);
    const unrig = rig([0.99]);
    Game.contestInterruption(Object.assign({}, byId('box'), { givesChoice: true }), 'player');
    unrig();
    const ac = Game.state.activeContest;
    console.log(`phase0 label=${ac.phases[0].choices.map(c => c.label).join('/')} phase0next=${ac.phases[0].choices.map(c => JSON.stringify(c.next)).join('/')}`);
    console.log(`phase0 is choice phase: ${ac.phase === 'choice'}`);
    dumpSaid('--- narration (choice beat) ---');
    // Participate (choice 0) -> play the puzzle phases
    const res = playThrough([0, 0, 0, 0], [0.99, 0.99, 0.99, 0.99]);
    console.log(`outcome=${res && res.outcome} hp=${s.health} trauma=${s.trauma}`);
    section('prize line (knowledge-gated check)');
    said.filter(l => /System presses|Prize/i.test(l)).forEach(l => console.log('  PRIZE> ' + l.split('\n').join(' ')));
    section('codex after win');
    console.log('  knowledge: ' + JSON.stringify(Game.contestKnowledge('box')));
  }

  // ============ 3. COOKFIGHT — watch mode, multi-take, villager fear ============
  banner('PLAY 3: COOKFIGHT — WATCH MODE. Two villagers taken, you are spared.');
  {
    const s = fresh(15);
    const ids = vids(2);
    const names = ids.map(id => Game.displayName(id));
    console.log('taken: ' + names.join(', '));
    const unrig = rig([0.99, 0.99]);
    Game.contestInterruption(Object.assign({}, byId('cookfight'), { givesChoice: false }), ids);
    unrig();
    const ac = Game.state.activeContest;
    console.log(`watching=${ac.phase === 'watching'} participants=${ac.participants.length}`);
    dumpSaid('--- narration (watch beats) ---');
    // cheer -> bet 200 on first -> shout real warning -> go to them
    const res = playThrough([0, 1, 0, 0], [0.99, 0.99, 0.99, 0.99, 0.99]);
    console.log(`verdict done=${res && res.done} outcome=${res && res.outcome} kcal=${s.kcal} trauma=${s.trauma}`);
    section('roster after verdict');
    ids.forEach(id => console.log(`  ${Game.displayName(id)}: onRoster=${(Game.state.village.roster || []).includes(id)}`));
  }

  // ============ 3b. COOKFIGHT — watch mode, rigged DEATH on camera ============
  banner('PLAY 3b: COOKFIGHT WATCH — rigged death. Fear check: does a watched death land?');
  {
    const s = fresh(15);
    const ids = vids(2);
    const unrig = rig([0.99]);
    Game.contestInterruption(Object.assign({}, byId('cookfight'), { givesChoice: false }), ids);
    unrig();
    // cheer -> hold breath -> go to them; verdict die roll rigged low (medium base 0.03)
    const res = playThrough([0, 1, 0], [0.01, 0.01, 0.99, 0.99]);
    console.log(`verdict done=${res && res.done} outcome=${res && res.outcome}`);
    section('death-on-camera text');
    said.filter(l => /Death Reel|is gone|gone\. The village/i.test(l)).forEach(l => console.log('  DEATH> ' + l.split('\n').join(' ').slice(0, 300)));
    ids.forEach(id => console.log(`  ${Game.displayName(id)}: onRoster=${(Game.state.village.roster || []).includes(id)}`));
    console.log(`player trauma=${s.trauma} (watched-death cost)`);
  }

  // ============ 4. SHOW: WHY DO THEY EAT? — pull-away gossip ============
  banner('PLAY 4: SHOW — WHY DO THEY EAT? villager pull-away');
  {
    fresh(16);
    const unrig = rig([0.5]); // 0.7 pull chance -> pulled
    const show = Game.fireShow(Game.showPool().find(x => x.id === 'why_eat'));
    unrig();
    dumpSaid('--- show narration ---');
    console.log(`show id=${show.id}`);
  }

  // ============ 5. NATURAL FLOW: fire MOOT day 15 -> resolve day 16 ============
  banner('PLAY 5: NATURAL FLOW — fire MOOT (announcement + countdown), resolve next day');
  {
    const s = fresh(15);
    const unrig = rig([0.99, 0.5]); // whim off; player preferred
    Game.fireContest(byId('moot'));
    unrig();
    console.log(`pendingContest=${!!Game.state.pendingContest} firesDay=${Game.state.pendingContest && Game.state.pendingContest.firesDay}`);
    dumpSaid('--- fire announcement ---');
    s.day = 16;
    const unrig2 = rig([0.99]);
    Game.resolveContest();
    unrig2();
    console.log(`interrupted into: ${Game.state.activeContest && Game.state.activeContest.contestId} phase=${Game.state.activeContest && Game.state.activeContest.phase}`);
    // moot, blind: answer honestly through the trial
    const res = playThrough([0, 0, 0], [0.99, 0.99, 0.99]);
    console.log(`outcome=${res && res.outcome} hp=${s.health} trauma=${s.trauma}`);
  }

  // ============ 6. JUDGE-SELECTION FAIRNESS PROBE ============
  banner('PROBE: judge selection — who CAN be taken, and does the System prefer the player?');
  {
    const s = fresh(15);
    const { eligible, reason } = Game.contestEligible();
    console.log(`eligible=${eligible.length} reason=${reason}`);
    eligible.slice(0, 6).forEach(e => console.log(`  ${e.id === 'player' ? 'YOU' : e.name}: nota=[${(e.notability || []).join('; ')}]`));
    // whim probe: 20 fires with whim ON (0.05 < 0.1)
    let playerFirst = 0, n = 20;
    for (let i = 0; i < n; i++) {
      const u = rig([0.05, 0.01 * (i % 7)]);
      Game.fireContest(byId('lottery'));
      u();
      if (Game.state.pendingContest && Game.state.pendingContest.participant === 'player') playerFirst++;
      Game.state.pendingContest = null;
    }
    console.log(`whim-forced fires: player first-pick ${playerFirst}/${n} (System still prefers YOU under its whim)`);
    // no-whim probe: player always preferred
    let np = 0;
    for (let i = 0; i < 5; i++) {
      const u = rig([0.99]);
      Game.fireContest(byId('lottery'));
      u();
      if (Game.state.pendingContest && Game.state.pendingContest.participant === 'player') np++;
      Game.state.pendingContest = null;
    }
    console.log(`no-whim fires: player first-pick ${np}/5`);
  }

  // ============ KNOWLEDGE-GATING SPOT SWEEP (played contests) ============
  banner('KNOWLEDGE-GATING SPOT SWEEP — level-0 intros/beats of played contests');
  {
    fresh(15);
    ['drop', 'box', 'cookfight', 'moot'].forEach(id => {
      const c = byId(id);
      let phases = null;
      try { phases = Game.contestPlayable(c); } catch (e) {}
      const intro = phases && phases[0] ? String(phases[0].text) : '';
      let beats = null;
      try { beats = Game._contestWatchBeat(c, 'Mara'); } catch (e) {}
      console.log(`${id}: intro 📚 leak=${/📚/.test(intro)} | watch-beat 📚 leak=${beats ? /📚/.test(beats.join(' ')) : 'N/A'} | beats=${beats ? beats.length : 0}`);
      if (beats && beats.length !== 3) console.log(`  !! beats=${beats.length} (expected 3)`);
    });
  }

  // ============ WATCH-BEAT COVERAGE SWEEP (sibling content check) ============
  banner('WATCH-BEAT COVERAGE — which pool ids fall back to generic beats?');
  {
    fresh(15);
    const generic = [];
    for (const c of Game.contestPool()) {
      let beats = null;
      try { beats = Game._contestWatchBeat(c, 'Mara'); } catch (e) {}
      // generic fallback signature: the "it's going badly. Or well" beat
      if (beats && /going badly\. Or well/.test(beats[1])) generic.push(c.id);
    }
    console.log(`generic-fallback watch beats (${generic.length}): ${generic.join(', ')}`);
  }

  // ============ MOBILE ONE-SCREEN REPORT ============
  banner('MOBILE ONE-SCREEN — max phase text per contest played (chars; >700 watch, >1000 likely scroll)');
  {
    const byContest = {};
    phaseReport.forEach(r => {
      byContest[r.contest] = byContest[r.contest] || { max: 0, maxChoices: 0, n: 0 };
      byContest[r.contest].max = Math.max(byContest[r.contest].max, r.textLen);
      byContest[r.contest].maxChoices = Math.max(byContest[r.contest].maxChoices, r.choices);
      byContest[r.contest].n++;
    });
    Object.entries(byContest).forEach(([id, v]) =>
      console.log(`  ${id}: maxTextLen=${v.max} maxChoices=${v.maxChoices} phasesShown=${v.n}`));
    phaseReport.filter(r => r.textLen > 700).forEach(r =>
      console.log(`  LONG[${r.contest} p${r.phase}] ${r.textLen}ch: ${r.text.slice(0, 120)}...`));
  }

  console.log('\n' + '='.repeat(70) + '\nAUDIT-3 HARNESS COMPLETE\n' + '='.repeat(70));
  process.exit(0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
