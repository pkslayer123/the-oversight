// Leadership competition: contenders push back on delegation.
// Engine-level playtest for the socialite rotation: heat builds on orders,
// a contender challenges at heat 3, and the player can yield, stand, ask
// support, or ignore (they take the domain). Also covers the "nothing is
// neutral" lens: ordering people around moves rep differently for
// contenders vs regulars, and generosity is read as buying loyalty by
// the ambitious.
// Usage: node scripts/test-leadership-challenge.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/conversation.js',
 'src/js/party.js', 'src/js/truth.js', 'src/js/journal.js'
].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}${extra ? ' — ' + extra : ''}`); }
}
// stub Math.random around a single action (worldgen loops hang on constant draws)
function withRand(fn, val) {
  const real = Math.random;
  Math.random = () => val;
  try { return fn(); } finally { Math.random = real; }
}
function vpOf(id) {
  return (Game.data.villagers || []).find(x => x.id === id)
    || (Game.data.background_survivors || []).find(x => x.id === id) || null;
}
function makeContender(id) {
  const vp = vpOf(id);
  vp.personality = vp.personality || {};
  vp.personality.temperament = 'bold';
  vp.goal = 'lead';
}
function seedGame() {
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const v = Game.state.village;
  const roster = (v.roster || []).filter(id => id !== Game.villagerId);
  // positions: everyone close enough to witness (range 3)
  const pos = {};
  roster.forEach((id, i) => { pos[id] = { mx: 1 + (i % 3), my: i % 2 }; });
  pos[Game.villagerId] = { mx: 0, my: 0 };
  v.positions = pos;
  Game.state.scholar.mx = 0; Game.state.scholar.my = 0;
  v.trust = v.trust || {};
  for (const id of roster) v.trust[id] = 60; // obedience always passes
  const C = roster[0];          // contender
  const R = roster[1];          // regular witness
  const T = roster[2];          // the person being ordered around
  makeContender(C);
  // clean lens seeds: steady temperaments so no prickly/cautious resents-charity
  // or power-grab readings leak into the witness slots; groups cleared so
  // rep ripples don't muddy per-person lens assertions.
  for (const id of [R, T]) {
    const vp = vpOf(id);
    vp.personality = vp.personality || {};
    vp.personality.temperament = 'steady';
    vp.goal = 'feed';
  }
  v.groups = [];
  return { v, C, R, T };
}

(async () => {
  await Game.init();

  // === 1. HEAT -> CHALLENGE at 3 ===
  {
    const { v, C, T } = seedGame();
    const said = [];
    const realSay = Game.say.bind(Game);
    Game.say = (m) => { said.push(String(m)); return realSay(m); };
    const trustBefore = v.trust[C];
    v.heat = v.heat || {};
    v.heat[C] = 2;
    withRand(() => Game.assignTask(T, 'forage'), 0.1); // contender roll: 0.1 < 0.4 fires
    Game.say = realSay;
    ok('1: challenge created at heat 3', !!(v.challenge && v.challenge.cid === C));
    ok('1: challenge names the contested task', v.challenge && v.challenge.task === 'forage');
    ok('1: contender heat ticks up', (v.heat[C] || 0) >= 3);
    ok('1: trust with contender dips', (v.trust[C] || 10) < trustBefore);
    ok('1: confrontation line spoken', said.some(s => /who's actually running things/i.test(s)));
  }

  // === 2. YIELD path (engine method; UI delegates to it) ===
  {
    const { v, C } = seedGame();
    v.challenge = { cid: C, task: 'forage', age: 0 };
    v.heat = v.heat || {};
    v.heat[C] = 5;
    const before = (v.trust[C] || 10);
    const said = [];
    const realSay = Game.say.bind(Game);
    Game.say = (m) => { said.push(String(m)); return realSay(m); };
    const r = Game.yieldChallenge(C);
    Game.say = realSay;
    ok('2: yield returns ok + result line', r && r.ok && /let them lead/i.test(r.result));
    ok('2: taskLeads records the contender', (v.taskLeads || {}).forage === C);
    ok('2: challenge cleared', v.challenge === null);
    ok('2: heat reset', (v.heat[C] || 0) === 0);
    // BREAK-IT (social r10 2026-10-10): the old assertion pinned the flat +10
    // (no progressive scaling, ||10 resurrection) — the bug. Yielding is a
    // real act, but gains scale like every other gain: progressive pipeline.
    ok('2: contender trust scales progressively (no flat +10)', (v.trust[C] || 0) === Math.min(100, before + Game.trustGainProgressive(C, 10)));
    ok('2: yield announced diegetically', said.some(s => /Good call/i.test(s)));
  }

  // === 3. STAND path ===
  {
    const { v, C } = seedGame();
    v.challenge = { cid: C, task: 'forage', age: 0 };
    v.heat = v.heat || {};
    v.heat[C] = 5;
    const before = (v.trust[C] || 10);
    const said = [];
    const realSay = Game.say.bind(Game);
    Game.say = (m) => { said.push(String(m)); return realSay(m); };
    const r = Game.standGround(C);
    Game.say = realSay;
    ok('3: stand returns ok', r && r.ok && /held your ground/i.test(r.result));
    ok('3: challenge cleared but no taskLeads', v.challenge === null && !((v.taskLeads || {}).forage));
    ok('3: trust -5', (v.trust[C] || 0) === Math.max(0, before - 5));
    ok('3: heat reset (can challenge again later)', (v.heat[C] || 0) === 0);
    ok('3: cold shoulder line spoken', said.some(s => /Your funeral/i.test(s)));
  }

  // === 4. IGNORE path: challenge ages, they TAKE the domain ===
  {
    const { v, C } = seedGame();
    v.challenge = { cid: C, task: 'forage', age: 7 };
    const said = [];
    const realSay = Game.say.bind(Game);
    Game.say = (m) => { said.push(String(m)); return realSay(m); };
    Game.resolveAssignments(); // ages the challenge to 8
    Game.say = realSay;
    ok('4: ignored challenge clears', v.challenge === null);
    ok('4: contender takes the domain as task lead', (v.taskLeads || {}).forage === C);
    ok('4: takeover announced', said.some(s => /stopped asking/i.test(s)));
  }

  // === 5. TASK LEADS actually work the domain ===
  {
    const { v, C } = seedGame();
    v.taskLeads = { forage: C };
    let ran = 0;
    const real = Game.resolveOneAssignment.bind(Game);
    Game.resolveOneAssignment = (vid, a) => { ran++; return real(vid, a); };
    try { Game.resolveAssignments(); } finally { Game.resolveOneAssignment = real; }
    ok('5: task lead works their domain each part', ran >= 1);
  }

  // === 6. askSupport: coalition against the contender ===
  {
    const { v, C, R } = seedGame();
    v.heat = v.heat || {};
    v.heat[C] = 3;
    const trustBefore = v.trust[R];
    const r = Game.askSupport(R);
    ok('6: askSupport succeeds at trust 60', r && r.ok);
    ok('6: contender heat drops by 2', (v.heat[C] || 0) === 1);
    ok('6: ally recorded', (v.allies || {})[R] === C);
    // BREAK-IT (social r10 2026-10-10): the old assertion expected the flat
    // +5 plus the coalition observe's trust drift — the drift was killed by
    // r2's noTrust (words move rep, not trust), and the +5 scales
    // progressively like every other gain (measured 60 -> 62 here).
    ok('6: supporter trust up (progressive)', (v.trust[R] || 0) === trustBefore + Game.trustGainProgressive(R, 5));
    const { v: v2, R: R2 } = seedGame();
    v2.trust[R2] = 10;
    ok('6: low trust refuses', Game.askSupport(R2) === null);
  }

  // === 7. NOTHING IS NEUTRAL: ordering around is read as a power grab by contenders ===
  {
    const { v, C, R, T } = seedGame();
    const repC0 = { ...Game.repOf(C) }, repR0 = { ...Game.repOf(R) };
    Game.observe('order', { target: T });
    const dC = Game.repOf(C), dR = Game.repOf(R);
    const dropC = (repC0.honest || 0) - (dC.honest || 0);
    const dropR = (repR0.honest || 0) - (dR.honest || 0);
    ok('7: contender reads order as power grab (honest dips)',
      dropC >= 3, `honest drop ${dropC}`);
    ok('7: regular witness does not (honest barely moves)',
      dropR <= 1, `honest drop ${dropR}`);
    ok('7: contender takes it harder than the regular', dropC - dropR >= 2);
    ok('7: ordering still reads as competent', (dR.competent || 0) > (repR0.competent || 0));
  }

  // === 8. NOTHING IS NEUTRAL: generosity is read as buying loyalty by the ambitious ===
  {
    const { v, C, R, T } = seedGame();
    const repC0 = { ...Game.repOf(C) }, repR0 = { ...Game.repOf(R) }, repT0 = { ...Game.repOf(T) };
    Game.observe('give_food', { target: T });
    const dC = Game.repOf(C), dR = Game.repOf(R), dT = Game.repOf(T);
    ok('8: recipient is grateful (generous +10: 6 base + 4 lens)',
      (dT.generous || 0) - (repT0.generous || 0) === 10,
      `generous ${repT0.generous} -> ${dT.generous}`);
    ok('8: contender sees buying loyalty (honest round(-6*0.8) = -5)',
      (dC.honest || 0) - (repC0.honest || 0) === -5,
      `honest ${repC0.honest} -> ${dC.honest}`);
    ok('8: regular witness reads it straight (generous round(6*0.8) = +5)',
      (dR.generous || 0) - (repR0.generous || 0) === 5,
      `generous ${repR0.generous} -> ${dR.generous}`);
  }

  // === 9. Temper gate: steady/cautious types never friction, bold always can ===
  {
    const { v, C, T } = seedGame();
    vpOf(C).personality.temperament = 'steady'; // goal still 'lead'
    v.heat = v.heat || {};
    v.heat[C] = 0;
    for (let i = 0; i < 20; i++) withRand(() => Game.assignTask(T, 'forage'), 0.05);
    ok('9: steady contender never builds heat (temper gate)',
      (v.heat[C] || 0) === 0, `heat=${v.heat[C]}`);
  }

  // === 10. Heat accrues at ~40%/order over many orders (stochastic, loose) ===
  // P(challenge within 10 orders) ~ 0.83 per trial; 7+/12 flakes ~1 in 1000.
  {
    let challenges = 0;
    const trials = 12;
    for (let tI = 0; tI < trials; tI++) {
      const { v, C, T } = seedGame();
      for (let i = 0; i < 10 && !v.challenge; i++) Game.assignTask(T, 'forage');
      if (v.challenge) challenges++;
    }
    ok('10: sustained delegating provokes a challenge (7+ of 12)', challenges >= 7, `challenges=${challenges}/12`);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
