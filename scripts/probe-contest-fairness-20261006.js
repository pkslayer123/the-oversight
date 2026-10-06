// Contest fairness + others-fates + watch-beat quotes probe (Steve 2026-10-06).
// Read-only. Fixes the audit3 probe artifact (villagers need grid positions
// to be contest-eligible) and captures verdict/others-fate narration.
// Usage: node scripts/probe-contest-fairness-20261006.js
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
const _orig = { say: null, sysSay: null };
function hookSay() {
  said = [];
  if (!_orig.say) { _orig.say = Game.say.bind(Game); _orig.sysSay = Game.sysSay.bind(Game); }
  Game.say = (t) => { said.push(String(t)); return _orig.say(t); };
  Game.sysSay = (t) => { said.push('[SYS] ' + String(t)); return _orig.sysSay(t); };
}
function rig(seq) { const o = Math.random; let i = 0; Math.random = () => seq[i++ % seq.length]; return () => { Math.random = o; }; }
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
// replicate debug-scenarios.js placeVillagers: grid positions = contest-eligible
function placeVillagers(n) {
  const v = Game.state.village;
  v.positions = v.positions || {};
  const ids = (v.roster || []).filter(id => id !== Game.villagerId).slice(0, n);
  const spots = [[2, 2], [6, 6], [3, 5], [5, 3], [1, 6]];
  ids.forEach((rid, i) => {
    try { Game.npcSetNode(rid, Game.map.px, Game.map.py); } catch (e) {}
    v.positions[rid] = { mx: spots[i][0], my: spots[i][1] };
  });
  return ids;
}
function playThrough(choiceIdxs, rngSeq) {
  const unrig = rig(rngSeq || [0.99]);
  let steps = 0, result = null;
  while (Game.state.activeContest && steps < 16) {
    const ac = Game.state.activeContest;
    const phase = ac.phases[ac.phaseIdx || 0];
    if (!phase || !phase.choices || !phase.choices.length) break;
    const ci = choiceIdxs[Math.min(steps, choiceIdxs.length - 1)];
    const idx = Math.min(ci, phase.choices.length - 1);
    result = Game.contestChoose(idx);
    steps++;
    if (result && result.done) break;
  }
  unrig();
  return result;
}
function banner(t) { console.log('\n' + '='.repeat(70) + '\n' + t + '\n' + '='.repeat(70)); }

(async () => {
  await Game.init();

  banner('FAIRNESS — eligibility with villagers placed + notability notes');
  {
    fresh(15);
    const ids = placeVillagers(5);
    Game.addNotability(ids[0], 'wave2Kill');
    Game.addNotability(ids[1], 'showmanship');
    Game.addNotability(ids[1], 'showmanship');
    Game.addNotability('player', 'contestWin');
    const { eligible, reason } = Game.contestEligible();
    console.log(`eligible=${eligible.length} (expect 6: you + 5) reason=${reason}`);
    eligible.forEach(e => console.log(`  ${e.id === 'player' ? 'YOU' : e.name}: [${(e.notability || []).join('; ')}]`));
    const hasW2 = eligible.some(e => e.id === ids[0] && (e.notability || []).includes('slew a wave-2 beast'));
    const hasShow = eligible.some(e => e.id === ids[1] && /audience favorite \(2×\)/.test((e.notability || []).join('')));
    const hasWin = eligible.some(e => e.id === 'player' && /won 1 contest/.test((e.notability || []).join('')));
    console.log(`notability surfaces: wave2Kill=${hasW2} showmanship2x=${hasShow} playerContestWin=${hasWin}`);
  }

  banner('FAIRNESS — first-pick rates, 6 eligible');
  {
    fresh(15);
    placeVillagers(5);
    let pf = 0, n = 20;
    for (let i = 0; i < n; i++) {
      const u = rig([0.05, 0.01 * (i % 7)]); // whim on
      Game.fireContest(byId('lottery'));
      u();
      if (Game.state.pendingContest && Game.state.pendingContest.participant === 'player') pf++;
      Game.state.pendingContest = null;
    }
    console.log(`whim-on fires: player first-pick ${pf}/${n} (design: ~90% no-whim->you, whim picks uniform)`);
    pf = 0;
    for (let i = 0; i < 10; i++) {
      const u = rig([0.99]);
      Game.fireContest(byId('lottery'));
      u();
      if (Game.state.pendingContest && Game.state.pendingContest.participant === 'player') pf++;
      Game.state.pendingContest = null;
    }
    console.log(`whim-off fires: player first-pick ${pf}/10 (design: always you)`);
    // multi-take count: lottery participants=5, 6 eligible -> 5 taken
    const u2 = rig([0.99]);
    Game.fireContest(byId('lottery'));
    u2();
    console.log(`lottery multi-take: participants=${(Game.state.pendingContest.participants || []).length} (expect 5)`);
    console.log(`taken line: ${Game._cxTakenLine(Game.state.pendingContest.participants)}`);
    Game.state.pendingContest = null;
  }

  banner('OTHERS-FATES — drop with others; rig one villager death');
  {
    const s = fresh(15);
    const ids = placeVillagers(5);
    const others = ids.slice(0, 2);
    const u = rig([0.99]);
    Game.contestInterruption(Object.assign({}, byId('drop'), { givesChoice: false }), ['player', ...others]);
    u();
    const before = said.length;
    // smart-ish play -> player wins; rig others' fates: [die, win]
    const res = playThrough([1, 1, 1], [0.99, 0.99, 0.99, 0.99, 0.01, 0.99, 0.99, 0.99]);
    console.log(`player outcome=${res && res.outcome}`);
    console.log('--- others-fates narration ---');
    said.slice(before).forEach(l => {
      const t = String(l).split('\n').join(' ');
      if (/Giovanni|Aisha|Marco|Hugo|Lucas|Mario|Emma|Lena|fate|verdict|taken|won|died|survived|own|theirs/i.test(t) && !/LEARNED|old life|knap|weave|Haven\. Twelve|slouched|limp|tattooed|braid|calloused|60s|40s|30s|treeline — that's|Journal|heading out|DAY 1/i.test(t))
        console.log('  ' + t.slice(0, 280));
    });
    others.forEach(id => console.log(`  ${Game.displayName(id)}: onRoster=${(Game.state.village.roster || []).includes(id)}`));
  }

  banner('WATCH BEATS — cookfight beats 1-2 (verbatim)');
  {
    fresh(15);
    const c = byId('cookfight');
    const beats = Game._contestWatchBeat(c, 'Marco and Hugo');
    beats.forEach((b, i) => console.log(`\n[beat ${i}]\n` + b));
  }

  banner('DROP template phases — choice labels (verbatim)');
  {
    fresh(15);
    const phases = Game.contestPlayable(byId('drop'));
    phases.forEach((p, i) => {
      console.log(`\n[p${i}] ${(p.text || '').split('\n').slice(3).join(' ').slice(0, 200)}`);
      (p.choices || []).forEach(c => console.log(`   - ${c.label} (${c.sub})`));
    });
  }

  console.log('\n' + '='.repeat(70) + '\nPROBE COMPLETE\n' + '='.repeat(70));
  process.exit(0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
