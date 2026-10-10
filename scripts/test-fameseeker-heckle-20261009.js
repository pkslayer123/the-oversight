#!/usr/bin/env node
// FAME-SEEKER BREAK-IT (2026-10-09): the heckle-farming attack.
//
// HOSTILE PLAYER PLAN: every villager show pull, choose "Heckle". The choice
// promises "the cameras notice" (+1 showmanship notability for the player —
// fame that feeds FUTURE casting via notabilityWeight) and the copy says
// "X will remember this". The victim takes -2 on their deterministic show
// score, pushed toward shame (and shame gossip travels the village).
//
// THE BREAK (pre-fix): heckling was a FREE FAME BUTTON — no cost, no memory,
// no rep shift, no trust shift against the player. The comment in
// contestChoose even claimed "the village remembers the cruelty" but the
// code only set ac.heckle = true. The copy lied, the comment lied.
//
// THE FIX: the heckle lands on camera in front of the victim — a SEEN action,
// not gossip — so the victim remembers it (memory entry), their rep of the
// player drops, and trust drops. Infamy stays famous (showmanship still
// lands); the village just has opinions now.
//
// ALSO COVERED:
//   B. SOFTLOCK: ratings-summons "Do the stunt" on an empty tank — the
//      reqKcal gate must refuse honestly (blocked, no advance, no prize).
//   C. HONESTY: cheer choice numbers — 0.05 -> +2 score, favor +1 lands.
//   D. Refuse-summons: costless but -2 favor and +showmanship — the design.
//
// Harness: mulberry32, SEED env override (default 20261009), full src/js
// module list in index.html order minus DOM-only files and drama.js, window
// stubbed for eval then deleted, Math.random seeded BEFORE eval.
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
global.document = { getElementById: () => null, createElement: () => ({ textContent: '', innerHTML: '', style: {}, setAttribute() {}, appendChild() {} }), head: { appendChild() {} }, body: {} };
order.forEach(f => { try { eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); } catch (e) { console.log(`LOAD FAIL ${f}: ${e.message}`); } });
delete global.window; delete global.document;
const Game = globalThis.Scattering.Game;

const fails = [];
function check(name, actual, expected) {
  const ok = actual === expected;
  console.log(`  ${ok ? 'PASS' : 'FAIL'} ${name}: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
  if (!ok) fails.push(name);
}
function checkTrue(name, cond) {
  console.log(`  ${cond ? 'PASS' : 'FAIL'} ${name}`);
  if (!cond) fails.push(name);
}

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  s.day = 20; // past the day-14 show gate
  const v = Game.state.village;
  const pid = (v.roster || []).find(id => id !== Game.villagerId);
  if (!pid) { console.log('SKIP: no villagers'); process.exit(2); }
  const pname = Game.displayName(pid);
  console.log(`victim: ${pname} (${pid})`);

  // Silence noisy sysSay but capture it for honesty checks.
  const said = [];
  const origSay = Game.sysSay.bind(Game);
  Game.sysSay = (t) => { said.push(String(t)); };

  // ---------- A. EXPLOIT: heckle farming ----------
  console.log('A. heckle farming (one villager show pull, player heckles)');
  const show = { id: 'why_eat', name: 'WHY DO THEY EAT?', desc: 'food bafflement' };
  const scoreClean = Game.showResolveVillager(pid, show, {}).score;
  const scoreHeckled = Game.showResolveVillager(pid, show, { heckle: true }).score;
  check('heckle dings victim score by exactly 2', scoreClean - scoreHeckled, 2);

  const fameBefore = ((Game.state.notability || {}).player || {}).showmanship || 0;
  const trustBefore = (v.trust || {})[pid];
  const repBefore = JSON.stringify(Game.repOf(pid));
  const memBefore = JSON.stringify((v.memory || {})[pid] || []);

  const phases = Game.showWatchPhases(show, pid);
  const ac = { kind: 'show', showId: 'why_eat', showName: 'WHY DO THEY EAT?', participant: pid, phase: 'intro', phaseIdx: 0, phases, variant: null, wounds: 0 };
  Game.state.activeContest = ac;
  const heckIdx = phases[0].choices.findIndex(c => /heckle/i.test(c.label));
  checkTrue('heckle choice exists', heckIdx >= 0);
  const r = Game.contestChoose(heckIdx);
  checkTrue('heckle choice resolves (not null)', !!r);
  check('heckle sets ac.heckle', ac.heckle, true);

  const fameAfter = ((Game.state.notability || {}).player || {}).showmanship || 0;
  check('player gains showmanship fame from heckling', fameAfter - fameBefore, 1);

  // The break (pre-fix): nothing records the cruelty.
  const trustAfter = (v.trust || {})[pid];
  const repAfter = JSON.stringify(Game.repOf(pid));
  const memAfter = JSON.stringify((v.memory || {})[pid] || []);
  const saidText = said.join('\n');
  checkTrue('victim trust of player DROPPED (seen cruelty)', (trustAfter === undefined ? 10 : trustAfter) < (trustBefore === undefined ? 10 : trustBefore));
  checkTrue('victim rep of player changed', repAfter !== repBefore);
  checkTrue('victim remembers the heckle', /heckled/.test(memAfter) && memAfter !== memBefore);
  checkTrue('consequence said out loud (copy is honest)', /remember/i.test(saidText));

  // ---------- B. SOFTLOCK: stunt on empty tank ----------
  console.log('B. ratings summons stunt with 50 kcal (reqKcal 200)');
  said.length = 0;
  s.kcal = 50;
  const sph = Game.ratingsSummonsPhases();
  const sac = { kind: 'summons', showId: '__summons', showName: 'Ratings Summons', participant: 'player', phase: 'intro', phaseIdx: 0, phases: sph, variant: null, wounds: 0 };
  Game.state.activeContest = sac;
  const stuntIdx = sph[0].choices.findIndex(c => /stunt/i.test(c.label));
  const sr = Game.contestChoose(stuntIdx);
  checkTrue('stunt blocked on empty tank', !!(sr && sr.blocked));
  check('phase did not advance', sac.phaseIdx, 0);
  check('activeContest not resolved', Game.state.activeContest === sac, true);
  const fameB = ((Game.state.notability || {}).player || {}).showmanship || 0;
  check('no fame granted on blocked stunt', fameB, fameAfter);
  checkTrue('refusal said out loud', /body for that|kcal/i.test(said.join('\n')));

  // ---------- C. HONESTY: cheer numbers ----------
  console.log('C. cheer choice honesty');
  s.kcal = 2000;
  const aph = Game.showWatchPhases(show, pid);
  const aac = { kind: 'show', showId: 'why_eat', showName: 'WHY DO THEY EAT?', participant: pid, phase: 'intro', phaseIdx: 0, phases: aph, variant: null, wounds: 0 };
  Game.state.activeContest = aac;
  const cheerIdx = aph[0].choices.findIndex(c => /cheer/i.test(c.label));
  const favorBefore = (Game.apState().fanClubs || {}).showbiz || 0;
  // Baselines re-read HERE: test A's contestChoose auto-resolved the
  // villager's show (terminal SHOW_VILLAGER resolves inside contestChoose),
  // so victim notability and the favor pool moved since scoreClean.
  const scoreClean2 = Game.showResolveVillager(pid, show, {}).score;
  const scoreWithCheer = Game.showResolveVillager(pid, show, { cheer: 0.05 }).score;
  const predOutcome = scoreWithCheer >= 7 ? 'fans' : (scoreWithCheer <= 3 ? 'shame' : 'both');
  const outcomeFavor = predOutcome === 'fans' ? 2 : predOutcome === 'both' ? 3 : 1;
  Game.contestChoose(cheerIdx);
  check('ac.cheer becomes 0.05', aac.cheer, 0.05);
  check('cheer adds +2 to victim score', scoreWithCheer - scoreClean2, 2);
  const favorAfter = (Game.apState().fanClubs || {}).showbiz || 0;
  check('cheer favor = +1 fanLane + show-resolution favor (' + predOutcome + ')', favorAfter - favorBefore, 1 + outcomeFavor);

  // ---------- D. Refuse summons: costless, -2 favor, +showmanship ----------
  console.log('D. refuse the ratings summons');
  const kcalBefore = s.kcal, traumaBefore = s.trauma || 0;
  const fameD0 = ((Game.state.notability || {}).player || {}).showmanship || 0;
  const favorD0 = (Game.apState().fanClubs || {}).showbiz || 0;
  const rph = Game.ratingsSummonsPhases();
  const rac = { kind: 'summons', showId: '__summons', showName: 'Ratings Summons', participant: 'player', phase: 'intro', phaseIdx: 0, phases: rph, variant: null, wounds: 0 };
  Game.state.activeContest = rac;
  const refIdx = rph[0].choices.findIndex(c => /refuse/i.test(c.label));
  Game.contestChoose(refIdx);
  check('refusal costs no kcal', s.kcal, kcalBefore);
  check('refusal costs no trauma', s.trauma || 0, traumaBefore);
  const fameD1 = ((Game.state.notability || {}).player || {}).showmanship || 0;
  check('refusal grants showmanship (the no is the content)', fameD1 - fameD0, 1);
  const favorD1 = (Game.apState().fanClubs || {}).showbiz || 0;
  check('refusal costs -2 showbiz favor', favorD1 - favorD0, -2);

  Game.sysSay = origSay;
  console.log(fails.length ? `\n${fails.length} FAILURES: ${fails.join('; ')}` : '\nALL GREEN');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
