// Contest FEEL tests (Steve 2026-10-05)
// (c) no double 📺 prefix | (a) bespoke death lines | (b) Gauntlet closer
// wounds-based odds | (d) contest knowledge compounding.
// Usage: node scripts/test-contest-feel.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/party.js',
 'src/js/carexplore.js', 'src/js/contests.js', 'src/js/debug-scenarios.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log('  FAIL: ' + name + (extra ? ' | ' + extra : '')); }
}

// Capture everything said
const said = [];
const _say = Game.say.bind(Game);
Game.say = function(t) { said.push(t); _say(t); };
function clearSaid() { said.length = 0; }
function saidHas(substr) { return said.some(l => l.includes(substr)); }

const realRandom = Math.random;
function stubRandom(v) { Math.random = () => v; }
function restoreRandom() { Math.random = realRandom; }

function freshPlayer() {
  Game.state.over = false;
  Game.state.scholar.health = 100;
  Game.state.scholar.kcal = 2000;
  Game.state.scholar.trauma = 0;
  Game.state.activeContest = null;
  Game.state.pendingContest = null;
}

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  Game.state.scholar.day = 15;
  Game.state.systemArrived = true;

  const pool = Game.contestPool();
  console.log(`Contest pool: ${pool.length} contests\n`);

  // ============ (c) DOUBLE 📺 PREFIX ============
  console.log('--- (c) double 📺 prefix ---');
  for (const c of pool) {
    clearSaid();
    let phases = null;
    try { phases = Game.contestPlayable(c); } catch (e) { phases = null; }
    if (!phases || !phases.length) { check(`${c.id}: phases exist`, false); continue; }
    Game._cxPhaseSay(phases[0].text);
    const bad = said.some(l => l.includes('📺 📺'));
    check(`${c.id}: no double 📺 prefix`, !bad, said[said.length - 1] ? said[said.length - 1].slice(0, 60) : 'nothing said');
    const last = said[said.length - 1] || '';
    check(`${c.id}: single prefix intact`, /📺 SYSTEM: "📺 [^📺]/.test(last), last.slice(0, 60));
  }
  // contestChoose advancement path
  freshPlayer();
  clearSaid();
  const pit = pool.find(c => c.id === 'pit');
  Game.state.activeContest = { contestId: 'pit', participant: 'player', phase: 'intro', phaseIdx: 0, phases: Game.contestPlayable(pit), wounds: 0 };
  stubRandom(0.5);
  try { Game.contestChoose(0); } finally { restoreRandom(); }
  check('contestChoose advance: no double 📺', !said.some(l => l.includes('📺 📺')));
  // contestInterruption grabbed path (force no-choice via stubbed random)
  freshPlayer();
  clearSaid();
  stubRandom(0.99);
  try { Game.contestInterruption(Object.assign({}, pit, { givesChoice: false }), 'player'); } finally { restoreRandom(); }
  check('contestInterruption: no double 📺', !said.some(l => l.includes('📺 📺')));
  check('contestInterruption: wounds initialized', Game.state.activeContest && Game.state.activeContest.wounds === 0);
  freshPlayer();

  // ============ (a) BESPOKE DEATH LINES ============
  console.log('--- (a) bespoke death lines ---');
  const lines = new Set();
  for (const c of pool) {
    const line = Game._contestDeathLine(c, 'test cause', 'You');
    check(`${c.id}: death line substantive`, typeof line === 'string' && line.length > 40, (line || '').slice(0, 50));
    check(`${c.id}: no placeholder text`, !/TODO|FIXME|lorem|placeholder/i.test(line || ''));
    lines.add(line);
  }
  check('all 18 death lines unique', lines.size === pool.length, `${lines.size}/${pool.length} unique`);
  const villagerLine = Game._contestDeathLine(pit, 'x', 'Mira');
  check('death line works with villager name', villagerLine.includes('Mira'), villagerLine.slice(0, 60));
  const catFallback = Game._contestDeathLine({ id: 'nope', cat: 'blood', name: 'X' }, 'x', 'You');
  check('category fallback for unknown contest', /cameras|Death Reel/i.test(catFallback), catFallback.slice(0, 60));
  // Integration: die in the Pit, bespoke line is said
  freshPlayer();
  clearSaid();
  Game.state.activeContest = { contestId: 'pit', participant: 'player', phase: 'intro', phaseIdx: 2, phases: Game.contestPlayable(pit), wounds: 0 };
  stubRandom(0); // dmg rolls min, die roll (0 < 0.12) triggers on choice 0
  let res = null;
  try { res = Game.contestChoose(0); } finally { restoreRandom(); }
  check('pit death resolves', res && res.done && res.outcome === 'died');
  check('pit bespoke death line said', saidHas('fed the Pit'), said.slice(-4).join(' / ').slice(0, 120));
  check('death reel kicker kept', saidHas("The Death Reel will be tasteful. It won't be."));
  freshPlayer();

  // ============ (b) GAUNTLET CLOSER ============
  console.log('--- (b) gauntlet closer ---');
  const o0 = Game._contestCloserOdds('stand', 0);
  const o40 = Game._contestCloserOdds('stand', 40);
  const or40 = Game._contestCloserOdds('run', 40);
  check('stand base odds 8%', Math.abs(o0 - 0.08) < 1e-9, String(o0));
  check('odds escalate with wounds', o40 > o0, `${o0} -> ${o40}`);
  check('stand riskier than run at same wounds', o40 > or40, `stand ${o40} vs run ${or40}`);
  check('stand capped at 45%', Game._contestCloserOdds('stand', 10000) === 0.45);
  check('run capped at 30%', Game._contestCloserOdds('run', 10000) === 0.30);
  // No flat die left on the closer (except the explicit coin-flip bargain)
  const gauntlet = Game._contestGauntlet(pool.find(c => c.id === 'gauntlet'));
  // No flat die left on the closer (except the explicit coin-flip bargain).
  // Waves 1-2 keep their own flat risks — only the closer was reworked.
  const closerPhase = gauntlet[gauntlet.length - 1];
  let flatDie = 0, woundDie = 0;
  for (const ch of (closerPhase.choices || [])) {
    if (ch.do && ch.do.dieWounds) woundDie++;
    if (ch.do && ch.do.die && !ch.do.dieWounds) {
      if (ch.do.die === 0.5 && /coin flip/.test(ch.sub)) continue; // the explicit bargain
      flatDie++;
    }
  }
  check('closer uses dieWounds not flat rolls', woundDie === 2 && flatDie === 0, `woundDie=${woundDie} flatDie=${flatDie}`);
  check('telegraph in wave-one text', /CLOSER SMELLS BLOOD/.test(gauntlet[0].text));
  // Wounds accumulate through contestChoose
  freshPlayer();
  const gac = { contestId: 'gauntlet', participant: 'player', phase: 'intro', phaseIdx: 0, phases: Game._contestGauntlet(pool.find(c => c.id === 'gauntlet')), wounds: 0 };
  Game.state.activeContest = gac;
  stubRandom(0.5); // 'Kill it fast' dmg [10,20] -> 10 + floor(0.5*11) = 15
  try { Game.contestChoose(0); } finally { restoreRandom(); }
  check('wounds accumulate from damage', gac.wounds === 15, `wounds=${gac.wounds}`);
  // dieWounds integration: 40 wounds -> stand odds 32%. random=0.31 dies, 0.33 lives
  freshPlayer();
  clearSaid();
  const gac2 = { contestId: 'gauntlet', participant: 'player', phase: 'intro', phaseIdx: 2, phases: Game._contestGauntlet(pool.find(c => c.id === 'gauntlet')), wounds: 40 };
  Game.state.activeContest = gac2;
  stubRandom(0.31);
  let r2 = null;
  try { r2 = Game.contestChoose(0); } finally { restoreRandom(); }
  check('40 wounds + bad luck: closer kills', r2 && r2.outcome === 'died', JSON.stringify(r2));
  check('gauntlet bespoke death line said', saidHas('almost cleared the Gauntlet'), said.slice(-4).join(' / ').slice(0, 100));
  freshPlayer();
  clearSaid();
  const gac3 = { contestId: 'gauntlet', participant: 'player', phase: 'intro', phaseIdx: 2, phases: Game._contestGauntlet(pool.find(c => c.id === 'gauntlet')), wounds: 40 };
  Game.state.activeContest = gac3;
  stubRandom(0.33);
  let r3 = null;
  try { r3 = Game.contestChoose(0); } finally { restoreRandom(); }
  check('40 wounds + good luck: closer survived', r3 && r3.done && r3.outcome === 'won', JSON.stringify(r3));
  freshPlayer();
  // Render: wound readout + odds in subs
  const gac4 = { contestId: 'gauntlet', participant: 'player', wounds: 40 };
  const rendered = Game._contestRenderPhase(gac4, Game._contestGauntlet(pool.find(c => c.id === 'gauntlet'))[2], 2);
  check('render shows wound count', /Damage taken so far: 40/.test(rendered.text), rendered.text.slice(-80));
  check('render shows odds in choice sub', /death odds ~32%/.test(rendered.choices[0].sub), rendered.choices[0].sub);
  check('render shows condition line', /limping, bleeding, loud/.test(rendered.text));
  const rendered0 = Game._contestRenderPhase(gac4, Game._contestGauntlet(pool.find(c => c.id === 'gauntlet'))[0], 0);
  check('render leaves wave-one untouched', rendered0.text.indexOf('Damage taken so far') === -1);

  // ============ (d) CONTEST KNOWLEDGE ============
  console.log('--- (d) contest knowledge ---');
  Game.state.codex = Game.state.codex || {};
  Game.state.codex.contests = {};
  let k = Game.contestLearn('pit', 'lost');
  check('participating teaches double (seen=2)', k.seen === 2 && k.level === 1, JSON.stringify(k));
  k = Game.contestLearn('pit', 'won');
  check('second exposure reaches level 2', k.seen === 4 && k.level === 2 && k.wins === 1, JSON.stringify(k));
  k = Game.contestLearn('pit', 'won');
  check('third exposure reaches veteran (level 3)', k.seen === 6 && k.level === 3, JSON.stringify(k));
  k = Game.contestLearn('hide', 'watched');
  check('watching teaches single (seen=1)', k.seen === 1 && k.level === 1, JSON.stringify(k));
  Game.contestLearn('pit', 'refused');
  check('refusal still teaches', Game.contestKnowledge('pit').seen === 7);
  // Coaching appears at level 2, not before
  Game.state.codex.contests = {};
  Game.contestLearn('duel', 'lost'); // level 1
  const intro1 = Game._cxIntro(pool.find(c => c.id === 'duel'));
  check('no coaching at level 1', !/What you know/.test(intro1));
  Game.contestLearn('duel', 'won'); // level 2
  const intro2 = Game._cxIntro(pool.find(c => c.id === 'duel'));
  check('coaching shown at level 2', /What you know:.*drone calls it fast/.test(intro2), intro2.slice(-120));
  // Veteran damage reduction
  Game.state.codex.contests = {};
  Game.contestLearn('pit', 'won'); Game.contestLearn('pit', 'won'); Game.contestLearn('pit', 'lost'); // seen 6 -> level 3
  freshPlayer();
  clearSaid();
  Game.state.activeContest = { contestId: 'pit', participant: 'player', phase: 'intro', phaseIdx: 1, phases: Game.contestPlayable(pit), wounds: 0 };
  // 'Charge it' dmg [12,25], die 0.08. random=0.08: dmg 12+1=13, no death (0.08 !< 0.08),
  // veteran cut = min(12, max(1, round(13*0.25)=3)) = 3 -> 10 damage.
  stubRandom(0.08);
  try { Game.contestChoose(1); } finally { restoreRandom(); }
  check('veteran reads the hit (damage reduced)', Game.state.scholar.health === 90, `health=${Game.state.scholar.health}`);
  check('veteran note said', saidHas('You read it coming. (-3)'));
  // Knowledge wired into a full playthrough (lose path)
  Game.state.codex.contests = {};
  freshPlayer();
  clearSaid();
  Game.state.activeContest = { contestId: 'pit', participant: 'player', phase: 'intro', phaseIdx: 0, phases: Game.contestPlayable(pit), wounds: 0 };
  stubRandom(0.99); // max damage rolls but die rolls fail (0.99 > all die chances here)
  try {
    Game.contestChoose(2); // Nothing
    if (Game.state.activeContest) Game.contestChoose(2); // Throw sand
    if (Game.state.activeContest) Game.contestChoose(2); // Play dead -> LOSE
  } finally { restoreRandom(); }
  check('full playthrough resolves', !Game.state.activeContest);
  check('playthrough taught pit knowledge', (Game.contestKnowledge('pit').seen || 0) >= 2, JSON.stringify(Game.contestKnowledge('pit')));

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR:', e); process.exit(2); });
