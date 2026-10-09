#!/usr/bin/env node
// VILLAGER GRIT PROOF (Steve 2026-10-09): "Villagers should vary. No more
// inputting percentages like 60% of own needs."
// - farmer out-produces programmer at day 1
// - same person produces more at day 30 than day 3 (stranger ramp)
// - grit drives day-to-day variance
// - exile fires on sustained freeloading (player included), warnings first
// - a single bad week does NOT trigger exile
// - STRESS: elderly/infirm NOT exiled (per-person expectations); haven workers
//   recognized; mentorship grows knowledge; mentored death = trust hit;
//   young healthy freeloader IS exiled
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const SEED = parseInt(process.env.SEED || '20261009', 10);
Math.random = mulberry32(SEED);
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
const order = execSync("grep -o 'src/js/[^\"'\"'\"']*\\.js' index.html | head -80", { cwd: ROOT }).toString().split('\n')
  .filter(s => s && !/app\.js|sprites\.js|tile-scenes\.js|move-anim\.js|drama\.js/.test(s));
global.window = global;
order.forEach(f => { try { eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); } catch (e) { console.log(`LOAD FAIL ${f}: ${e.message}`); } });
delete global.window;
const Game = globalThis.Scattering.Game;
Game.say = function () {}; Game.sysSay = function () {}; Game.audioEvent = function () {};
if (Game.drama === undefined) Game.drama = function () {};

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL [seed ${SEED}] ${name}${detail ? ' — ' + detail : ''}`); }
}

(async () => {
  await Game.init();
  Game.state = Game.state || {};
  Game.state.scholar = Game.state.scholar || { day: 1 };
  Game.state.village = Game.state.village || {};
  const mk = (occ, age, temp) => ({
    id: 't_' + Math.random().toString(36).slice(2, 8),
    name: 'Test Person', formerOccupation: occ, age,
    personality: { temperament: temp || 'steady', sharing: 'fair' },
    kcalPerDay: 2000,
  });

  // --- 1. occupation skill: farmer out-produces programmer at day 1 ---
  const farmer = mk('farmer', 40, 'steady');
  const prog = mk('programmer', 40, 'steady');
  check('farmer skill > programmer skill',
    Game.occupationFoodSkill('farmer') > Game.occupationFoodSkill('programmer'),
    `${Game.occupationFoodSkill('farmer')} vs ${Game.occupationFoodSkill('programmer')}`);
  check('farmer base > programmer base',
    Game.villagerFoodBase(farmer) > Game.villagerFoodBase(prog),
    `${Game.villagerFoodBase(farmer)} vs ${Game.villagerFoodBase(prog)}`);

  // --- 2. age capacity: old carpenter < young carpenter ---
  const old = mk('carpenter', 68, 'steady');
  const young = mk('carpenter', 30, 'steady');
  check('age curve: 68yo < 30yo', Game.ageCapacity(68) < Game.ageCapacity(30),
    `${Game.ageCapacity(68)} vs ${Game.ageCapacity(30)}`);

  // --- 3. stranger ramp: same person, day 3 < day 30 ---
  const v = { roster: [], health: {}, taught: {}, trust: {} };
  Game.state.scholar.day = 3;
  const p3 = Game.villagerExpectedDaily(farmer, 'x', v);
  Game.state.scholar.day = 30;
  const p30 = Game.villagerExpectedDaily(farmer, 'x', v);
  check('stranger ramp: day30 > day3', p30 > p3, `${Math.round(p3)} vs ${Math.round(p30)}`);
  // the real long ramp is knowledge, not stranger: 8 plants ≈ 1.8×
  Game.state.scholar.day = 30;
  v.taught = { x: new Array(8).fill('p') };
  const p30k = Game.villagerExpectedDaily(farmer, 'x', v);
  check('knowledge ramp: 8 plants ≈ 1.8× day-30 base', p30k > p30 * 1.7, `${Math.round(p30)} vs ${Math.round(p30k)}`);
  v.taught = {};

  // --- 4. grit variance: same villager, different days, different haul ---
  Game.state.scholar.day = 30;
  const rolls = [];
  for (let i = 0; i < 20; i++) rolls.push(Game.villagerDayProduction(farmer, 'x', v));
  const lo = Math.min(...rolls), hi = Math.max(...rolls);
  check('grit drives day-to-day variance', hi > lo * 1.15, `range ${Math.round(lo)}-${Math.round(hi)}`);
  // steady is tighter than anxious
  const anx = mk('farmer', 40, 'anxious');
  const sr = []; for (let i = 0; i < 40; i++) sr.push(Game.gritRoll('steady'));
  const ar = []; for (let i = 0; i < 40; i++) ar.push(Game.gritRoll('anxious'));
  const spread = a => Math.max(...a) - Math.min(...a);
  check('anxious swings wider than steady', spread(ar) > spread(sr),
    `steady ${spread(sr).toFixed(2)} vs anxious ${spread(ar).toFixed(2)}`);

  // --- 5. knowledge multiplier retained ---
  v.taught = { x: new Array(8).fill('p') };
  const kf = Game.villagerKnowledgeFactor('x', v);
  check('knowledgeFactor 8 plants = 1.8', kf === 1.8, `got ${kf}`);
  v.taught = {};

  // --- 6. exile pipeline: sustained freeloader gets warned then voted out ---
  await Game.init();
  Game.say = function () {}; Game.sysSay = function () {};
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const vv = Game.state.village;
  // find a young healthy villager to be the slacker
  const slackId = vv.roster.find(id => id !== Game.villagerId);
  const slack = Game.getPerson(slackId);
  slack.age = 30; slack.formerOccupation = 'programmer';
  vv.health = vv.health || {}; vv.health[slackId] = 100;
  let said = [];
  Game.say = function (m) { said.push(String(m)); };
  // simulate 16 days of freeloading: no production, heavy takes
  for (let d = 1; d <= 16; d++) {
    Game.state.scholar.day = d;
    vv.contribLog = vv.contribLog || {};
    vv.contribLog[slackId] = { produced: 50, expected: 1500, day: d };
    vv.takes = vv.takes || {}; vv.gives = vv.gives || {};
    vv.takes[slackId] = (vv.takes[slackId] || 0) + 800; // eating, not giving
    Game.freeloaderTick(vv);
  }
  const fl = (vv.freeload || {})[slackId] || {};
  check('freeloader warned (stage>=2)', fl.stage >= 2, `stage ${fl.stage}`);
  const warned = said.some(m => /pull weight|isn't pulling weight/i.test(m));
  check('warning narrated honestly', warned, `said ${said.length} lines`);
  check('freeloader vote happened (stage 3)', fl.stage >= 3, `stage ${fl.stage}`);
  const gone = !(vv.roster || []).includes(slackId);
  check('young healthy freeloader exiled', gone || fl.voted, `roster has them: ${!gone}`);

  // --- 7. single bad week does NOT trigger exile ---
  await Game.init();
  Game.say = function () {}; Game.sysSay = function () {};
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const vv2 = Game.state.village;
  const vid2 = vv2.roster.find(id => id !== Game.villagerId);
  for (let d = 1; d <= 7; d++) {
    Game.state.scholar.day = d;
    vv2.contribLog = vv2.contribLog || {};
    vv2.contribLog[vid2] = { produced: 50, expected: 1500, day: d };
    vv2.takes = vv2.takes || {};
    vv2.takes[vid2] = (vv2.takes[vid2] || 0) + 800;
    Game.freeloaderTick(vv2);
  }
  const fl2 = (vv2.freeload || {})[vid2] || {};
  const still = (vv2.roster || []).includes(vid2);
  check('bad week: not exiled', still, `stage ${fl2.stage}`);
  check('bad week: no vote', (fl2.stage || 0) < 3, `stage ${fl2.stage}`);

  // --- 8. STRESS: elderly low-output is NOT a freeloader ---
  await Game.init();
  Game.say = function () {}; Game.sysSay = function () {};
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const vv3 = Game.state.village;
  const oldId = vv3.roster.find(id => id !== Game.villagerId);
  const oldP = Game.getPerson(oldId);
  oldP.age = 72; oldP.formerOccupation = 'librarian';
  vv3.health = vv3.health || {}; vv3.health[oldId] = 90;
  for (let d = 1; d <= 16; d++) {
    Game.state.scholar.day = d;
    const exp = Game.villagerExpectedDaily(oldP, oldId, vv3);
    vv3.contribLog = vv3.contribLog || {};
    // produces modestly, AT capacity (effort ~0.9), takes little
    vv3.contribLog[oldId] = { produced: Math.round(exp * 0.9), expected: Math.round(exp), day: d };
    vv3.takes = vv3.takes || {};
    vv3.takes[oldId] = (vv3.takes[oldId] || 0) + 300;
    Game.freeloaderTick(vv3);
  }
  const fl3 = (vv3.freeload || {})[oldId] || {};
  check('elderly at capacity: never flagged', (fl3.stage || 0) === 0, `stage ${fl3.stage}`);
  check('elderly still rostered', (vv3.roster || []).includes(oldId));

  // --- 9. STRESS: haven worker recognized ---
  const hvId = vv3.roster.find(id => id !== Game.villagerId && id !== oldId);
  vv3.assignments = vv3.assignments || {};
  vv3.assignments[hvId] = { task: 'cook', assignedDay: 1, via: 'test' };
  const credit = Game.havenRoleCredit(hvId, vv3);
  check('haven cook credit > 0', credit > 0, `credit ${credit}`);
  // a haven cook producing nothing in the wild is not a freeloader
  const hvP = Game.getPerson(hvId);
  for (let d = 17; d <= 28; d++) {
    Game.state.scholar.day = d;
    const exp = Game.villagerExpectedDaily(hvP, hvId, vv3);
    vv3.contribLog = vv3.contribLog || {};
    vv3.contribLog[hvId] = { produced: credit, expected: Math.round(exp), day: d };
    vv3.takes = vv3.takes || {};
    vv3.takes[hvId] = (vv3.takes[hvId] || 0) + 400;
    Game.freeloaderTick(vv3);
  }
  const fl4 = (vv3.freeload || {})[hvId] || {};
  check('haven worker: not flagged as freeloader', (fl4.stage || 0) < 3, `stage ${fl4.stage}`);

  // --- 10. STRESS: mentorship grows knowledge; death = trust hit ---
  await Game.init();
  Game.say = function () {}; Game.sysSay = function () {};
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const vv4 = Game.state.village;
  // player knows some plants
  Game.state.codex.plants = Game.state.codex.plants || {};
  const pids = (Game.data.plants || []).slice(0, 5).map(p => p.id);
  for (const pid of pids) Game.state.codex.plants[pid] = { level: 1 };
  const menteeId = vv4.roster.find(id => id !== Game.villagerId);
  vv4.party = [Game.villagerId, menteeId];
  vv4.taught = vv4.taught || {}; vv4.taught[menteeId] = [];
  for (let d = 1; d <= 6; d++) {
    Game.state.scholar.day = d;
    Game.mentorTick(vv4);
  }
  const learned = ((vv4.taught || {})[menteeId] || []).length;
  check('mentored villager learns plants', learned > 0, `learned ${learned}`);
  const mrec = ((vv4.mentored || {})[menteeId]) || {};
  check('mentor xp accumulates', (mrec.xp || 0) >= 6, `xp ${mrec.xp}`);
  // death on your watch = trust hit
  const trustBefore = ((vv4.trust || {})[vv4.roster[0]] || 15);
  Game.removeVillager(menteeId, 'killed');
  const trustAfter = ((vv4.trust || {})[vv4.roster[0]] ?? 15);
  check('mentored death: village trust hit', trustAfter < trustBefore,
    `${trustBefore} -> ${trustAfter}`);

  // --- 11. player freeloading triggers the pipeline too ---
  await Game.init();
  Game.say = function () {}; Game.sysSay = function () {};
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const vv5 = Game.state.village;
  const pid5 = Game.villagerId;
  let voted = false;
  const origVote = Game.freeloadVote.bind(Game);
  Game.freeloadVote = function (vid) { if (vid === pid5) voted = true; return origVote(vid); };
  for (let d = 1; d <= 20; d++) {
    Game.state.scholar.day = d;
    vv5.contribLog = vv5.contribLog || {};
    vv5.contribLog[pid5] = { produced: 0, expected: 1500, day: d };
    vv5.takes = vv5.takes || {};
    vv5.takes[pid5] = (vv5.takes[pid5] || 0) + 800;
    Game.freeloaderTick(vv5);
  }
  check('player freeloading reaches vote', voted, 'no vote fired');

  console.log(`\n${pass} passed, ${fail} failed (seed=${SEED})`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS FAIL', e.stack.split('\n').slice(0,6).join('\n')); process.exit(2); });
