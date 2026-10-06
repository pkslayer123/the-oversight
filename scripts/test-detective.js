// Detective archetype tests: case detective surface, juror copy, gossip cross-reference.
// Usage: node scripts/test-detective.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/party-formal.js', 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js',
 'src/js/justice.js', 'src/js/food.js', 'src/js/betrayal.js', 'src/js/corpses.js', 'src/js/lifeseed.js',
 'src/js/progression.js', 'src/js/ledger.js', 'src/js/villager-agency.js', 'src/js/codex-people.js',
 'src/js/membership.js', 'src/js/hierarchy.js', 'src/js/debug-scenarios.js',
].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;
const said = [];
Game.say = function (m) { said.push(String(m)); };

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}`); }
}

(async () => {
  await Game.init();

  // --- 1. openCase seeds the cover story + inconsistencies (direct open, like scenarios) ---
  Game.debugScenario('day1');
  const v = Game.state.village;
  const roster = (v.roster || []).filter(id => id !== Game.villagerId);
  const plot = Game.armPlot(roster[0], [roster[1], roster[2]], roster[3], { reasons: ['debt'], score: 65 });
  const c = Game.openCase(plot, 'ambush');
  ok('openCase seeds coverStory', typeof c.coverStory === 'string' && c.coverStory.length > 10);
  ok('openCase seeds 2 inconsistencies', (c.inconsistencies || []).length === 2);
  ok('inconsistencies mention accused', c.inconsistencies.every(i => i.claims && Object.keys(i.claims).length > 0));

  // --- 2. seedCoverStory is idempotent (no clobber of found flags) ---
  c.inconsistencies[0].found = true;
  const storyBefore = c.coverStory;
  Game.seedCoverStory(c, true);
  ok('re-seed keeps found flags', c.inconsistencies[0].found === true);
  ok('re-seed keeps cover story', c.coverStory === storyBefore);

  // --- 3. pressAccomplice finds the planted inconsistency ---
  const acc0 = c.accused[0];
  said.length = 0;
  const pr = Game.pressAccomplice(c.id, acc0);
  ok('press finds inconsistency', pr === true && c.inconsistencies.some(i => i.found));
  ok('press says the seam out loud', said.join(' ').includes('Somebody\'s lying'));

  // --- 4. nameWitnesses is role-aware ---
  plot.witnesses = [roster[4], roster[5]];
  said.length = 0;
  Game.nameWitnesses(c.id);
  const asJuror = said.join(' ');
  ok('juror copy does not say "you"', !/saw you walk|No one saw you/.test(asJuror));
  ok('juror copy names the target', asJuror.includes(Game.disp(c.target)) || /saw .* walk out with them/.test(asJuror));
  // now as the target (fresh case where player is target)
  const plot2 = Game.armPlot(roster[0], [roster[1], roster[2]], Game.villagerId, { reasons: ['debt'], score: 65 });
  plot2.witnesses = [roster[4]];
  const c2 = Game.openCase(plot2, 'ambush');
  said.length = 0;
  Game.nameWitnesses(c2.id);
  const asTarget = said.join(' ');
  ok('target copy says "you"', /saw you walk out together/.test(asTarget));

  // --- 5. mootJuror scenario: juror role, known case, witnesses, tools surface ---
  Game.debugScenario('mootJuror');
  const bs = Game.betrayalState();
  const mc = bs.cases[bs.cases.length - 1];
  ok('scenario case is known to player', mc.knownToPlayer === true);
  ok('scenario role is juror', mc.playerRole === 'juror');
  ok('scenario case has cover story', typeof mc.coverStory === 'string');
  ok('scenario seeded witnesses', Array.isArray((bs.plots.find(p => p.id === mc.plotId) || {}).witnesses));
  const bystander = (Game.state.village.roster || []).find(id => id !== Game.villagerId && !mc.accused.includes(id));
  Game.startConvo(bystander);
  const ch = Game.betrayalChoices(bystander) || [];
  const ids = ch.map(x => x.id);
  ok('juror sees site tool', ids.some(i => i.indexOf('betrayal:site:') === 0));
  ok('juror sees witnesses tool', ids.some(i => i.indexOf('betrayal:witnesses:') === 0));
  ok('juror sees moot tool', ids.some(i => i.indexOf('betrayal:moot:') === 0));
  const witChoice = ch.find(i => i.id.indexOf('betrayal:witnesses:') === 0);
  ok('witness label says "them" for juror', witChoice && /them leave/.test(witChoice.label));
  // press/approach are face-to-face tools: talk to the accused, then to the weakest
  Game.startConvo(mc.accused[0]);
  const chA = (Game.betrayalChoices(mc.accused[0]) || []).map(x => x.id);
  ok('juror sees press tool (talking to the accused)', chA.some(i => i.indexOf('betrayal:press:') === 0));
  if (mc.weakest) {
    Game.startConvo(mc.weakest);
    const chW = (Game.betrayalChoices(mc.weakest) || []).map(x => x.id);
    ok('juror sees approach tool (talking to the weakest)', chW.some(i => i.indexOf('betrayal:approach:') === 0));
  } else { ok('juror sees approach tool (talking to the weakest)', false); }

  // --- 6. gossip cross-reference: interviewed liars get talked about ---
  Game.debugScenario('liars');
  const v2 = Game.state.village;
  const r2 = (v2.roster || []).filter(id => id !== Game.villagerId);
  const liars = r2.slice(0, 5);
  liars.forEach(id => { v2.trust[id] = 40; });
  for (const rid of liars) { Game.startConvo(rid); Game.convoAskTopic(rid, 'past'); }
  const others = r2.slice(5, 9);
  others.forEach(id => { v2.trust[id] = 40; });
  // direct: npcGossipAbout with claims heard should frequently reveal lies
  let reveals = 0, trials = 0;
  for (const teller of others) {
    for (const target of liars) {
      for (let k = 0; k < 5; k++) {
        trials++;
        const g = Game.npcGossipAbout(teller, target);
        if (g && g.contradictsLie) reveals++;
      }
    }
  }
  console.log(`  gossip reveals: ${reveals}/${trials}`);
  ok('gossip reveals lies about interviewed villagers', reveals >= 8);
  // conversation path: ask:gossip should surface at least one contradiction sometimes
  let convReveals = 0;
  for (const teller of others) {
    for (let k = 0; k < 6; k++) {
      Game.startConvo(teller);
      Game.convoAskTopic(teller, 'gossip');
    }
  }
  const gd = (Game.state.codex.doubts || []).filter(d => d.kind === 'gossip');
  console.log(`  gossip doubts via convo path: ${gd.length}`);
  ok('convo gossip path plants gossip doubts', gd.length >= 1);

  // --- 7. confrontDoubt still resolves after these changes ---
  const d0 = (Game.state.codex.doubts || []).find(d => !d.resolved);
  if (d0) {
    const r = Game.confrontDoubt(d0.vid, d0.id);
    ok('confrontation resolves or deepens', r && (r.outcome === 'confessed' || r.outcome === 'deflected' || r.outcome === 'hostile' || r.ok));
  } else { ok('confrontation resolves or deepens (no doubts to test)', true); }

  // --- 8. confrontation line pools: depth, no placeholders, no immediate repeats ---
  const pools = Game.truthLinePools;
  ok('truthLinePools exists', !!pools && typeof pools === 'object');
  const minSizes = {
    deflectClumsy: 5, deflectSmooth: 5, attacks: 5, clears: 4,
    motiveShame: 3, motiveHiding: 3, motiveProtection: 3,
    motiveManipulation: 3, motivePathological: 3,
    slipOccupation: 3, slipOrigin: 2, slipGoal: 2,
  };
  for (const [key, min] of Object.entries(minSizes)) {
    ok(`pool ${key} has >= ${min} lines`, Array.isArray(pools[key]) && pools[key].length >= min);
  }
  // all lines are non-empty strings; render leaves no raw placeholders
  const tvid = (Game.state.village.roster || []).find(id => id !== Game.villagerId);
  let renderedClean = true, nonEmpty = true;
  for (const [key, pool] of Object.entries(pools)) {
    for (const raw of pool) {
      if (typeof raw !== 'string' || !raw.length) { nonEmpty = false; break; }
    }
    for (let i = 0; i < 20; i++) {
      const out = Game.drawTruthLine(key, tvid, { truth: 'plumber', told: 'midwife', atruth: 'a plumber', atold: 'a midwife', what: 'buried food', first: 'Alex', teller: 'Sam Rivera', lieWord: 'a midwife', truthWord: 'a plumber', truthCap: 'A plumber' });
      if (/\{[a-z]+\}/.test(out)) { renderedClean = false; break; }
    }
    if (!renderedClean) break;
  }
  ok('pool lines are non-empty strings', nonEmpty);
  ok('rendered lines have no raw {placeholders}', renderedClean);
  // no immediate repeats for one villager across 200 draws
  for (const key of ['deflectClumsy', 'attacks', 'clears', 'motiveShame']) {
    const vp = Game.vpOf(tvid);
    vp.truthLineLast = {};
    let prev = null, repeated = false;
    for (let i = 0; i < 200; i++) {
      const out = Game.drawTruthLine(key, tvid);
      if (out === prev) { repeated = true; break; }
      prev = out;
    }
    ok(`no immediate repeat in ${key}`, !repeated);
  }
  // variety: drawing exhausts the pool (not stuck on one line)
  const seen = new Set();
  Game.vpOf(tvid).truthLineLast = {};
  for (let i = 0; i < 60; i++) seen.add(Game.drawTruthLine('deflectClumsy', tvid));
  ok('deflectClumsy serves its whole pool', seen.size === pools.deflectClumsy.length);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
