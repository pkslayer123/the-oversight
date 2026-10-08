#!/usr/bin/env node
// PROOF: repair of the two stale-tree regressions swept in by df67d2e
// ("Archive 407 proof test scripts + brawler honesty fixes", Steve 2026-10-07),
// which reverted honest Berserker Rage copy and stripped the liarConfront
// audio call sites from src/js/truth.js.
//
// Part A — Berserker Rage honesty:
//   BEFORE (pristine HEAD): abilities.json claimed "+100% damage, but you
//   attack the nearest thing (friend or foe)" while the engine
//   (abilityActions.js 'rage.unleash_rage') sets ONLY rageActive {rounds:3,
//   dmgMult:2} — no friendly-fire targeting exists anywhere.
//   AFTER: data matches engine. The action's own effect text never lied.
// Part B — liarConfront audio wiring:
//   BEFORE: 0 audioEvent('liarConfront') call sites in truth.js (df67d2e
//   deleted all 4); the app.js audio handler still registered the event, so
//   confrontations were silent.
//   AFTER: 4 call sites restored; confrontLie + confrontTheft fire
//   tension + outcome events behaviorally.
//
// Usage: node scripts/test-brawler-honesty-restore-20261008.js
// (SEED env override; deterministic default)
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const SEED = parseInt(process.env.SEED || '7', 10);
Math.random = mulberry32(SEED);
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
// Full production module list in index.html order (AGENTS.md: never a short list).
const order = execSync("grep -o 'src/js/[^\"'\"'\"']*\\.js' index.html | head -80", { cwd: ROOT }).toString().split('\n')
  .filter(s => s && !/app\.js|sprites\.js|tile-scenes\.js|move-anim\.js|drama\.js/.test(s));
global.window = global;
global.document = { getElementById: () => null, createElement: () => ({ textContent: '', innerHTML: '', style: {}, setAttribute() {}, appendChild() {} }), head: { appendChild() {} }, body: {} };
order.forEach(f => { try { eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); } catch (e) { console.log(`LOAD FAIL ${f}: ${e.message}`); } });
delete global.window; delete global.document;
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; }
  else { fail++; console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}
function note(t) { console.log(t); }

(async () => {
  // ============ PART A: Berserker Rage honesty ============
  note('--- A. Berserker Rage copy honesty ---');
  const headAbilities = JSON.parse(execSync('git show HEAD:src/data/abilities.json', { cwd: ROOT }).toString());
  const headRage = headAbilities.find(a => a.id === 'rage');
  check('BEFORE: HEAD description claimed friend-or-foe', /friend or foe/i.test(headRage.description),
    'HEAD text: ' + JSON.stringify(headRage.description));

  const fixed = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/abilities.json'), 'utf8'));
  const rage = fixed.find(a => a.id === 'rage');
  check('AFTER: description makes no friendly-fire claim', !/friend or foe/i.test(rage.description),
    'now: ' + JSON.stringify(rage.description));
  check('AFTER: flavor makes no friendly-fire claim', !/friend/i.test(rage.flavor),
    'now: ' + JSON.stringify(rage.flavor));
  check('AFTER: description still promises +100% / 3 rounds', /\+100%/.test(rage.description) && /3 rounds/.test(rage.description));
  const unleash = (rage.actions || []).find(a => a.id === 'unleash_rage');
  check('action effect text agrees with ability description (no data self-contradiction)',
    unleash && /\+100% damage for 3 rounds/i.test(unleash.effect) && !/friend or foe/i.test(unleash.effect),
    unleash && JSON.stringify(unleash.effect));

  // Behavioral: engine sets ONLY rageActive; say-line is honest.
  // unleash_rage is a combat-context action — start a real fight first.
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  Game.startCombat('bulldozer');
  check('fight started (combat context)', !!Game.inCombat || !!(Game.tbfight && !Game.tbfight.over));
  const says = [];
  const osay = Game.say.bind(Game);
  Game.say = (t) => { says.push(String(t)); return osay(t); };
  const s = Game.state.scholar;
  s.abilities = s.abilities || [];
  if (!s.abilities.find(a => a.id === 'rage')) s.abilities.push({ id: 'rage', name: 'Berserker Rage', level: 1, xp: 0 });
  delete s.frenzy; delete s.rageTargeting;
  const r = Game.useAbility('rage', 'unleash_rage', null);
  check('unleash_rage executes', r !== false);
  check('engine sets rageActive {rounds:3, dmgMult:2}',
    s.rageActive && s.rageActive.rounds === 3 && s.rageActive.dmgMult === 2,
    JSON.stringify(s.rageActive));
  check('engine sets NO friendly-fire/targeting flag', s.frenzy === undefined && s.rageTargeting === undefined);
  check('say-line promises nothing about friends/foes', says.every(t => !/friend or foe/i.test(t)),
    JSON.stringify(says.slice(-1)));
  Game.say = osay;
  if (Game.tbfight) Game.tbfight.over = true; // end the rage fight before the truth section

  // ============ PART B: liarConfront audio wiring ============
  note('--- B. liarConfront audio call sites ---');
  const headTruth = execSync('git show HEAD:src/js/truth.js', { cwd: ROOT }).toString();
  const fixedTruth = fs.readFileSync(path.join(ROOT, 'src/js/truth.js'), 'utf8');
  const nHead = (headTruth.match(/audioEvent\('liarConfront'/g) || []).length;
  const nFixed = (fixedTruth.match(/audioEvent\('liarConfront'/g) || []).length;
  check('BEFORE: HEAD truth.js had 0 liarConfront call sites', nHead === 0, `found ${nHead}`);
  check('AFTER: 4 liarConfront call sites restored', nFixed === 4, `found ${nFixed}`);

  // Behavioral: confrontLie fires tension event.
  const v = Game.state.village;
  const roster = (v.roster || []).filter(id => id !== Game.villagerId);
  const A = roster[0];
  const vpA = Game.vpOf(A);
  if (vpA.personality) vpA.personality.temperament = 'warm';
  vpA.formerOccupation = 'ER nurse';
  vpA.lies = { occupation: { told: 'paramedic', truth: 'ER nurse', motive: 'hiding', field: 'occupation' } };
  v.trust = v.trust || {};
  v.trust[A] = 10;
  Game.trackClaim(A, 'occupation', 'paramedic');
  Game.trackClaim(A, 'occupation', 'er nurse');
  const doubts = Game.getDoubts(A).filter(d => d.kind === 'contradiction' && !d.resolved);
  check('contradiction doubt created', doubts.length > 0);
  const events = [];
  Game.audioEvent = (name, data) => { events.push({ name, data }); };
  const st = Game.startConvo(A);
  check('convo starts', !!st);
  const turn = Game.convoTurn(A, 'confront:' + doubts[0].id);
  check('confrontation turn produces output', turn && turn.line && turn.line.length > 10,
    JSON.stringify(turn && turn.line).slice(0, 80));
  const tension = events.filter(e => e.name === 'liarConfront' && e.data && e.data.phase === 'tension');
  check('confrontLie fired liarConfront tension audio', tension.length >= 1, `events: ${JSON.stringify(events)}`);
  const outcomes = events.filter(e => e.name === 'liarConfront' && e.data && e.data.outcome);
  check('confrontLie fired liarConfront outcome audio', outcomes.length >= 1 && typeof outcomes[0].data.outcome === 'string',
    `outcomes: ${JSON.stringify(outcomes)}`);

  // Behavioral: confrontTheft fires tension + outcome on every path.
  const T = roster[1];
  const dId = 'theft-test-' + SEED;
  (Game.state.codex.doubts = Game.state.codex.doubts || []).push({
    id: dId, kind: 'theft', vid: T, resolved: false, evidence: ['saw them near the cache'],
    theft: { label: 'your buried jerky', day: 3, place: 'the cache' },
  });
  events.length = 0;
  const tr = Game.confrontTheft(T, dId);
  check('confrontTheft runs', tr && tr.ok === true && ['confessed', 'deflected', 'attacked'].includes(tr.outcome),
    JSON.stringify(tr));
  const tTension = events.filter(e => e.name === 'liarConfront' && e.data && e.data.phase === 'tension');
  const tOutcome = events.filter(e => e.name === 'liarConfront' && e.data && e.data.outcome === tr.outcome);
  check('confrontTheft fired tension audio', tTension.length === 1);
  check('confrontTheft fired outcome audio matching result', tOutcome.length === 1,
    `events: ${JSON.stringify(events)}`);

  note(`\nRESULT: ${pass} ok, ${fail} FAIL (seed ${SEED})`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR:', e); process.exit(2); });
