// Contest playtest driver — plays 6 scenarios as a player via Game.contestChoose.
// New scratch file for playtest-54 (does not modify repo sources).
const fs = require('fs');
const path = require('path');
const ROOT = '/home/hatch/workspace/the-scattering';
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
const { execSync } = require('child_process');
const order = execSync("grep -o 'src/js/[^\"'']*\\.js' index.html | head -60", { cwd: ROOT }).toString().split('\n').filter(s => s && !/app\.js|sprites\.js|tile-scenes\.js|move-anim\.js/.test(s));
global.window = global;
order.forEach(f => { eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); });
delete global.window;
const Game = globalThis.Scattering.Game;

const said = [];
Game.say = function(t) { said.push('[say] ' + String(t)); };
Game.sysSay = function(t) { said.push('[sys] ' + String(t)); };

const realRandom = Math.random;
function scriptedRandom(seq) { // consume seq then fall back to real
  const q = seq.slice();
  Math.random = () => (q.length ? q.shift() : realRandom());
}
function restoreRandom() { Math.random = realRandom; }

function tryCall(label, fn) {
  try { return { ok: true, val: fn() }; }
  catch (e) { return { ok: false, err: e && e.stack ? e.stack.split('\n').slice(0,3).join(' | ') : String(e) }; }
}
function newSay() { const s = said.splice(0); return s; }
function checkText(lines) {
  const bad = lines.filter(l => /undefined|NaN/.test(l) && !/undefined behavior/.test(l));
  return bad;
}

function describeActive() {
  const ac = Game.state.activeContest;
  if (!ac) return 'activeContest=null';
  const i = ac.phaseIdx || 0;
  const ph = ac.phases && ac.phases[i];
  const labels = ph && ph.choices ? ph.choices.map(c => c.label) : [];
  return `id=${ac.contestId} participant=${ac.participant} phase=${ac.phase} idx=${i} nPhases=${ac.phases ? ac.phases.length : '?'} choices=[${labels.join(' | ')}]`;
}

// Drive current activeContest to completion. pick(idx, labels, phaseIdx) -> choice index.
function driveToEnd(pick, cap) {
  cap = cap || 25;
  const transcript = [];
  let steps = 0;
  while (Game.state.activeContest && steps < cap) {
    const ac = Game.state.activeContest;
    const i = ac.phaseIdx || 0;
    const ph = ac.phases && ac.phases[i];
    if (!ph || !ph.choices || !ph.choices.length) {
      transcript.push(`STUCK: no phase/choices at idx ${i}`);
      break;
    }
    const labels = ph.choices.map(c => `${c.label}${c.sub ? ' (' + c.sub + ')' : ''}`);
    transcript.push(`P${i}: ${(ph.text || '').slice(0, 160).replace(/\n/g, ' / ')}`);
    transcript.push(`  choices: ${labels.join(' | ')}`);
    const ci = pick(i, ph.choices.map(c => c.label), ph);
    transcript.push(`  -> choose [${ci}] ${ph.choices[ci] ? ph.choices[ci].label : '???'}`);
    const r = tryCall('contestChoose', () => Game.contestChoose(ci));
    if (!r.ok) { transcript.push('  EXCEPTION: ' + r.err); break; }
    const out = newSay();
    transcript.push(`  said(${out.length}): ${out.slice(-3).join(' || ').slice(0, 400)}`);
    if (r.val && r.val.done) transcript.push(`  terminal: outcome=${r.val.outcome}`);
    steps++;
  }
  if (Game.state.activeContest && steps >= cap) transcript.push('SOFTLOCK? still active after ' + cap + ' steps');
  return { transcript, steps, done: !Game.state.activeContest };
}

async function main() {
  const R = {};
  await Game.init();

  // ---------- contestPit: choice path -> participate ----------
  {
    newSay();
    scriptedRandom([0.5, 0.1]); // whim=false (0.5>=0.1), givesChoice=true (0.1<0.3)
    const sc = tryCall('debugScenario contestPit', () => Game.debugScenario('contestPit'));
    const setup = newSay();
    const rc = tryCall('resolveContest', () => Game.resolveContest());
    restoreRandom();
    R.pit_participate = { scenarioOk: sc.ok, setup, resolveOk: rc.ok, resolveErr: rc.err,
      afterResolve: describeActive(), health: Game.state.scholar.health };
    const d = driveToEnd(() => 0);
    R.pit_participate.played = d.transcript;
    R.pit_participate.steps = d.steps;
    R.pit_participate.over = !!Game.state.over;
    R.pit_participate.badText = checkText(said.splice(0));
  }

  // ---------- contestPit: choice path -> refuse ----------
  {
    newSay();
    scriptedRandom([0.5, 0.1]);
    const sc = tryCall('debugScenario contestPit', () => Game.debugScenario('contestPit'));
    const setup = newSay();
    const rc = tryCall('resolveContest', () => Game.resolveContest());
    restoreRandom();
    R.pit_refuse = { scenarioOk: sc.ok, setup, resolveOk: rc.ok, afterResolve: describeActive() };
    const ac = Game.state.activeContest;
    // phase 0 is the choice phase: choices Participate(0) / Refuse(1)
    const d = driveToEnd((i, labels) => (i === 0 ? 1 : 0));
    R.pit_refuse.played = d.transcript;
    R.pit_refuse.over = !!Game.state.over;
    R.pit_refuse.badText = checkText(said.splice(0));
  }

  // ---------- contestPit: grabbed path ----------
  {
    newSay();
    scriptedRandom([0.5, 0.9]); // whim=false, givesChoice=false (0.9>=0.3)
    Game.debugScenario('contestPit');
    const setup = newSay();
    Game.resolveContest();
    restoreRandom();
    R.pit_grabbed = { setup, afterResolve: describeActive() };
    const d = driveToEnd(() => 0);
    R.pit_grabbed.played = d.transcript;
    R.pit_grabbed.over = !!Game.state.over;
    R.pit_grabbed.badText = checkText(said.splice(0));
  }

  // ---------- contestHide: grabbed, aggressive ----------
  {
    newSay();
    scriptedRandom([0.5, 0.9]);
    Game.debugScenario('contestHide');
    const setup = newSay();
    Game.resolveContest();
    restoreRandom();
    R.hide = { setup, afterResolve: describeActive() };
    // try up to 3 runs since die odds are real; record each
    const runs = [];
    for (let a = 0; a < 3; a++) {
      const d = driveToEnd(() => 0);
      runs.push({ steps: d.steps, done: d.done, transcript: d.transcript, health: Game.state.scholar.health, over: !!Game.state.over });
      if (Game.state.over) break;
      if (!Game.state.activeContest) break;
    }
    R.hide.runs = runs;
    R.hide.badText = checkText(said.splice(0));
  }

  // ---------- contestForage: grabbed, then concede-ish ----------
  {
    newSay();
    scriptedRandom([0.5, 0.9]);
    Game.debugScenario('contestForage');
    const setup = newSay();
    Game.resolveContest();
    restoreRandom();
    R.forage = { setup, afterResolve: describeActive() };
    const d = driveToEnd((i, labels) => {
      // pick middle choice (usually the balanced one), else first
      return Math.min(1, labels.length - 1);
    });
    R.forage.played = d.transcript;
    R.forage.over = !!Game.state.over;
    R.forage.badText = checkText(said.splice(0));
  }

  // ---------- contestWatch ----------
  {
    newSay();
    Game.state.scholar && (Game.state.scholar.kcal = 1500); // enable bet path
    Game.debugScenario('contestWatch');
    const setup = newSay();
    R.watch = { setup, afterResolve: describeActive() };
    // play: cheer -> bet (if present) -> go to them (comfort)
    const d = driveToEnd((i, labels) => {
      if (i === 0) return 0; // Cheer them on
      if (i === 1) {
        const b = labels.findIndex(l => /Bet 200/.test(l));
        return b >= 0 ? b : 0;
      }
      return 0; // Go to them
    });
    R.watch.played = d.transcript;
    R.watch.kcalAfter = Game.state.scholar.kcal;
    R.watch.over = !!Game.state.over;
    R.watch.badText = checkText(said.splice(0));
    // run again choosing silent/study/space to exercise other branches
    newSay();
    Game.debugScenario('contestWatch');
    const d2 = driveToEnd((i, labels) => {
      if (i === 0) return Math.min(2, labels.length - 1); // Study the pattern
      if (i === 1) return 1; // Hold your breath / quiet
      return 1; // Give them space
    });
    R.watch2 = { played: d2.transcript, over: !!Game.state.over, badText: checkText(said.splice(0)) };
  }

  // ---------- showWhyEat ----------
  {
    newSay();
    Game.debugScenario('showWhyEat');
    R.whyeat = { text: newSay(), badText: [] };
    R.whyeat.badText = checkText(R.whyeat.text);
  }

  // ---------- contestEligible ----------
  {
    newSay();
    Game.debugScenario('contestEligible');
    R.elig = { text: newSay() };
    // honesty checks: day gate
    const day = Game.state.scholar.day;
    const e1 = Game.contestEligible();
    Game.state.scholar.day = 10;
    const e2 = Game.contestEligible();
    Game.state.scholar.day = day;
    R.elig.day15 = { n: e1.eligible.length, reason: e1.reason, entries: e1.eligible.map(x => ({ id: x.id, name: x.name, notability: x.notability })) };
    R.elig.day10 = { n: e2.eligible.length, reason: e2.reason };
    // dead player check
    const h = Game.state.scholar.health;
    Game.state.scholar.health = 0;
    const e3 = Game.contestEligible();
    Game.state.scholar.health = h;
    R.elig.deadPlayer = { playerIn: e3.eligible.some(x => x.id === 'player') };
    R.elig.badText = checkText(said.splice(0));
  }

  fs.writeFileSync('/tmp/contests-play.json', JSON.stringify(R, null, 1));
  console.log('WROTE /tmp/contests-play.json');
}

main().catch(e => { console.error('FATAL', e && e.stack || e); process.exit(1); });
