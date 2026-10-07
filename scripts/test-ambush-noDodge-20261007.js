#!/usr/bin/env node
// AMBUSH noDodgeNext REMOVAL PROOF — 2026-10-07 (Steve 2026-10-05).
//
// The vestigial `noDodgeNext` flag was set when AMBUSH's ready-strike landed
// (abilityActions.js) but READ NOWHERE: the dodge system (game.js tbDamage)
// is player-side only (t.kind === 'player') — monsters never dodge player
// strikes, so "target can't dodge" was a promise with no mechanism.
// Decision: REMOVAL, not a new monster-dodge system (out of backlog scope).
//   - abilityActions.js: `s.noDodgeNext = true` + comment removed;
//     `ambushReady = { mult: 2.0 }` (noDodge field dropped); both say lines
//     rewritten honest ("they never see it coming").
//   - abilities.json set_ambush effect: honest text, no "can't dodge".
//   - game.js `delete s.noDodgeNext` left alone (harmless cleanup).
//
// Proves:
//   (a) 2x damage still applies (deterministic unit on _applyAbilityActionMods,
//       the exact hook tbPlayerStrike calls; plus real useAbility + real strike
//       integration: flag set by the card, consumed on the strike, honest text)
//   (b) grep-based: no `noDodgeNext` SET sites remain in committed src
//       (only the allowed `delete` cleanup in game.js startCombat)
//   (c) grep-based: no user-facing text in the player-strike path
//       (abilityActions.js + abilities.json) promises target-can't-dodge.
//
// Tests the COMMITTED tree: modules are eval'd from `git archive HEAD`
// (the dirty worktree / shared index are not trusted on this hot tree).
// Exit non-zero on any deviation. SEED env override (default 7); run on 2 seeds.
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const REPO = process.env.NODODGE_REPO || path.resolve(__dirname, '..');
const ROOT = process.env.NODODGE_EXTRACT || '/tmp/nododge-extract';

function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const SEED = parseInt(process.env.SEED || '7', 10);
Math.random = mulberry32(SEED);

function note(t) { console.log(t); }
let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; note(`  ok   ${name}`); }
  else { fail++; note(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}

// ---- extract the committed tree (never the dirty worktree) ----
const headSha = cp.execSync('git rev-parse HEAD', { cwd: REPO, encoding: 'utf8' }).trim();
note(`testing commit ${headSha}  seed=${SEED}`);
fs.rmSync(ROOT, { recursive: true, force: true });
fs.mkdirSync(ROOT, { recursive: true });
cp.execSync(`git archive ${headSha} src index.html | tar -x -C ${ROOT}`, { cwd: REPO, stdio: 'inherit' });

global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
const order = [...fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').matchAll(/src\/js\/[^\"']*\.js/g)]
  .map(m => m[0]).filter((v, i, a) => a.indexOf(v) === i)
  .filter(s => !/app\.js|sprites\.js|tile-scenes\.js|move-anim\.js/.test(s));
// AGENTS.md: window stub for eval phase, DELETED before playing (else combat goes async and stalls).
global.window = global;
global.document = {
  getElementById: () => null,
  createElement: () => ({ textContent: '', innerHTML: '', style: {}, setAttribute() {}, appendChild() {} }),
  head: { appendChild() {} }, body: {},
};
order.forEach(f => { eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); });
delete global.window; delete global.document;
const Game = globalThis.Scattering.Game;

const says = [];
const osay = Game.say.bind(Game);
Game.say = (t) => { says.push(String(t)); return osay(t); };
function clearSays() { says.splice(0); }
function said() { return says.join(' '); }
function grant(id, level) {
  const s = Game.state.scholar;
  s.abilities = s.abilities || [];
  let e = s.abilities.find(a => a.id === id);
  if (!e) { e = { id, name: id, desc: '', level: level || 1, xp: 0 }; s.abilities.push(e); }
  else e.level = level || e.level || 1;
  return e;
}
function endTurn() {
  if (!Game.tbfight || Game.tbfight.over) return;
  if (!Game.tbIsPlayerTurn()) return;
  const p = Game.tbFighter('p'); if (p) { p.moveLeft = 0; p.acted = true; }
  Game.tbAfterPlayerAction();
}
function ensureFight(monId) {
  if (Game.inCombat()) { try { Game.tbfight.over = true; } catch (e) {} }
  for (const k of ['tradeOpen', 'settleDebtBonus', 'debtSettled', 'braceActive', 'shakeOffUsed',
    'haymakerReady', 'rageActive', 'fightRead', 'loomActive', 'fightDamageTaken',
    'ambushReady', 'noDodgeNext', 'aimBonus', 'deadAimShot', 'ignoreArmorNext']) delete Game.state.scholar[k];
  const s = Game.state.scholar;
  s.health = 100; s.kcal = 2600; s.hydration = 80; s.energy = 100; s.water = [];
  s.trauma = 0; s.mx = 4; s.my = 4;
  Game.startCombat(monId || 'gallowdeer');
  const mk = Game.tbfight.fighters.find(f => f.kind === 'monster').key;
  const mo = Game.tbFighter(mk);
  mo.hp = 500; mo.maxHp = 500;
  const pp0 = Game.tbFighter('p');
  pp0.hp = 100; pp0.maxHp = Math.max(pp0.maxHp || 100, 100); pp0.alive = true;
  return mk;
}
function strikeFor(mkey) {
  if (!Game.inCombat()) return null;
  const m = Game.tbFighter(mkey);
  if (!m || !m.alive) return null;
  const pp = Game.tbFighter('p');
  pp.mx = Math.min(7, Math.max(1, m.mx + 1)); pp.my = Math.min(7, Math.max(1, m.my));
  if (pp.mx === m.mx && pp.my === m.my) pp.mx = Math.max(1, m.mx - 1);
  const hp0 = m.hp;
  Game.tbPlayerStrike(mkey);
  const m2 = Game.tbFighter(mkey);
  return hp0 - (m2 ? m2.hp : 0);
}

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  const s = Game.state.scholar;
  try { Game.location = 'haven'; } catch (e) {}
  s.health = 100; s.kcal = 2600; s.hydration = 80; s.energy = 100; s.water = [];
  s.trauma = 0; s.mx = 4; s.my = 4;
  Game.state.weather = 'clear';
  clearSays();
  grant('ambush', 2);

  // ============ A1. unit: 2x still applies, flag consumed, nothing set ============
  note('\n=== A1. _applyAbilityActionMods: 2x applies, no dodge flag ===');
  s.ambushReady = { mult: 2.0 }; // exactly what the fixed set_ambush impl sets
  clearSays();
  const out = Game._applyAbilityActionMods(40, null, null);
  check('2x damage still applies (40 -> 80)', out === 80, 'got ' + out);
  check('ambushReady consumed', !('ambushReady' in s));
  check('noDodgeNext never set on scholar', s.noDodgeNext === undefined, 'got ' + s.noDodgeNext);
  check('say line keeps fiction, no dodge promise', /never saw it coming/.test(said()) && !/dodg/i.test(said()), said());

  // ============ A2. impl integration: real useAbility('ambush','set_ambush') ============
  note('\n=== A2. useAbility ambush.set_ambush: honest flag + honest text ===');
  ensureFight('gallowdeer');
  clearSays();
  const ok = Game.useAbility('ambush', 'set_ambush');
  check('useAbility returns true', ok === true, 'got ' + ok);
  check('ambushReady = { mult: 2.0 } exactly (no noDodge field)',
    s.ambushReady && s.ambushReady.mult === 2.0 && !('noDodge' in s.ambushReady),
    JSON.stringify(s.ambushReady));
  check('noDodgeNext not set by the impl', s.noDodgeNext === undefined, 'got ' + s.noDodgeNext);
  check('ready say text has no dodge promise', !/dodg/i.test(said()), said());

  // ============ A3. e2e: the readied ambush lands on a real strike ============
  note('\n=== A3. end-to-end: readied ambush fires on tbPlayerStrike ===');
  const mkey = ensureFight('gallowdeer');
  clearSays();
  Game.useAbility('ambush', 'set_ambush');
  endTurn(); // spend the ready turn, monster acts, fresh player turn (round 2: no round-1 mults)
  clearSays();
  const dealt = strikeFor(mkey);
  check('strike dealt damage', dealt !== null && dealt > 0, 'dealt=' + dealt);
  check('AMBUSH damage line fired, honest', /AMBUSH: they never saw it coming/.test(said()) && !/dodg/i.test(said()), said());
  check('ambushReady consumed by the strike', !('ambushReady' in s));
  check('noDodgeNext still absent after strike', s.noDodgeNext === undefined, 'got ' + s.noDodgeNext);

  // ============ B. grep-based: no noDodgeNext SET sites in committed src ============
  note('\n=== B. no noDodgeNext set sites remain (committed tree) ===');
  const grepOut = cp.execSync(`git grep -n "noDodgeNext" ${headSha} -- src/ || true`, { cwd: REPO, encoding: 'utf8' }).trim();
  const lines = grepOut ? grepOut.split('\n') : [];
  const setSites = lines.filter(l => /noDodgeNext\s*=/.test(l));
  const deleteSites = lines.filter(l => /delete\s+\S*noDodgeNext/.test(l));
  check('zero noDodgeNext assignments in src', setSites.length === 0, setSites.join(' | '));
  check('only the allowed startCombat cleanup remains',
    deleteSites.length === 1 && /game\.js/.test(deleteSites[0]), lines.join(' | '));

  // ============ C. grep-based: strike-path text makes no can't-dodge promise ============
  note('\n=== C. no target-can\'t-dodge promises in the player-strike path ===');
  const aaSrc = cp.execSync(`git show ${headSha}:src/js/abilityActions.js`, { cwd: REPO, encoding: 'utf8' });
  const abJson = cp.execSync(`git show ${headSha}:src/data/abilities.json`, { cwd: REPO, encoding: 'utf8' });
  const dodgePromise = /can't dodge|cannot dodge|won't dodge|can't be dodged/ig;
  const aaHits = [...aaSrc.matchAll(dodgePromise)].map(m => m[0]);
  const abHits = [...abJson.matchAll(dodgePromise)].map(m => m[0]);
  check('abilityActions.js: no can\'t-dodge promises', aaHits.length === 0, aaHits.join(' | '));
  check('abilities.json: no can\'t-dodge promises', abHits.length === 0, abHits.join(' | '));
  const abData = JSON.parse(abJson);
  const amb = abData.abilities.find(a => a.id === 'ambush');
  const se = amb && amb.actions.find(x => x.id === 'set_ambush');
  check('set_ambush card text is the honest rewrite',
    se && se.effect === 'Spend turn preparing. Next attack is 2x damage \u2014 they never see it coming.',
    se && se.effect);

  note(`\n${pass} passed, ${fail} failed (seed=${SEED})`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
