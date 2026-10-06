#!/usr/bin/env node
// scripts/test-unionrep-bar.js
// PROOF TEST — union_rep bar gaps closed (Steve 2026-10-06).
// Bar A–I gaps from evidence/2026-10-06/wave2-escalation-bar.md:
//   (1) NO armor/resistances — now armor 4 + psychic 0.5 (solidarity-as-armor)
//   (2) NO knownCue coaching — now in encounter.knownCue (fires via tbTelegraphCue knownTail)
//   (3) P2-10 hygiene: stale tbBatch4Cue branches for DELETED monsters removed
//   (4) audio verified: fired names resolve in registry, synth bodies are real
//   (5) WALKOUT second act play-verified: fires <=8 rounds, untargetable reads, allies +8 lands
// Node harness only — NEVER jest. Turn hygiene: advance only if still player's turn.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
let failures = 0;
function check(name, ok, detail) {
  console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`);
  if (!ok) failures++;
}

console.log('\n=== UNION_REP BAR PROOF ===\n');

// ---------- 1. DATA: armor / resistances / knownCue ----------
console.log('-- data (monsters.json) --');
const md = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/monsters.json'), 'utf8'));
const mlist = Array.isArray(md) ? md : md.monsters;
const ur = mlist.find(m => m.id === 'union_rep');
check('union_rep entry exists', !!ur);
check('armor present (never blank)', ur && typeof ur.armor === 'number', `armor=${ur && ur.armor}`);
check('resistances non-blank', ur && ur.resistances && Object.keys(ur.resistances).length > 0,
  JSON.stringify(ur && ur.resistances));
check('encounter.knownCue present', !!(ur && ur.encounter && ur.encounter.knownCue),
  (ur && ur.encounter && ur.encounter.knownCue || '').slice(0, 70) + '…');

// ---------- 2. HYGIENE: dead tbBatch4Cue branches gone ----------
console.log('-- hygiene (tbBatch4Cue) --');
const gameSrc = fs.readFileSync(path.join(ROOT, 'src/js/game.js'), 'utf8');
const b4m = gameSrc.match(/tbBatch4Cue\(m\) \{[\s\S]*?\n    \},/);
check('tbBatch4Cue found for scan', !!b4m);
if (b4m) {
  const body = b4m[0].replace(/\/\/[^\n]*/g, ''); // strip comments — our own doc notes name the dead
  for (const dead of ['camera_swarm', 'hype_horn', 'delegate_beast']) {
    check(`no dead branch for ${dead}`, !new RegExp(`mid === '${dead}'`).test(body));
  }
  check('guard only allows review_drone', /if \(mid !== 'review_drone'\) return null;/.test(body));
}

// ---------- 3. AUDIO: fired names resolve, synths are real ----------
console.log('-- audio (app.js registry + synth bodies) --');
const appSrc = fs.readFileSync(path.join(ROOT, 'src/js/app.js'), 'utf8');
const urStart = gameSrc.indexOf('// ---- THE UNION REP');
const urEnd = gameSrc.indexOf('// ----', urStart + 20);
const urBlock = gameSrc.slice(urStart, urEnd);
const firedNames = [...new Set([...urBlock.matchAll(/audioEvent\('([a-zA-Z0-9_]+)'/g)].map(x => x[1]))];
check('found fired audio names in union_rep block', firedNames.length > 0, firedNames.join(', '));
for (const n of firedNames) {
  const resolves = new RegExp(`\\b${n}\\(\\) \\{ ${n}\\(\\)`).test(appSrc);
  check(`audio '${n}' resolves in Game.audio registry`, resolves);
  const fnm = appSrc.match(new RegExp(`function ${n}\\(\\) \\{([\\s\\S]*?)\\n    \\}`));
  const body = fnm ? fnm[1] : '';
  const real = body.length > 300 && body.includes('createOscillator') && body.includes('sfxBus');
  check(`synth '${n}' is real (not a silent stub)`, real, `body ${body.length} chars`);
}

// ---------- 4+5. PLAYTEST ----------
console.log('-- playtest (node harness) --');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/progression.js', 'src/js/encounters.js', 'src/js/food.js',
 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js',
 'src/js/justice.js', 'src/js/debug-scenarios.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

async function main() {
await Game.init(); // full data load (background_survivors etc.) via stubbed fetch
Game.data.monsters = mlist; // keep the file we asserted on (same content)
Game.data.items = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/items.json'), 'utf8'));

const sayLog = [];
const origSay = Game.say.bind(Game);
Game.say = (t) => { sayLog.push(String(t)); return origSay(t); };

const audioFired = [];
Game.audio = {};
for (const n of ['unionBullhorn', 'unionWalkout', 'unionPicket']) Game.audio[n] = () => { audioFired.push(n); };

function grantSpear() {
  const s = Game.state.scholar;
  const idef = (Game.data.items || []).find(i => i.id === 'fire_hardened_spear') || {};
  s.inventory = s.inventory || [];
  s.inventory.push({ itemId: 'fire_hardened_spear', units: 1, kcalEach: 0, kg: 0.5, name: idef.name || 'fire_hardened_spear', bonded: true, bond: 0, bondOffered: [], enhancements: [] });
  s.equipped = s.equipped || {};
  s.equipped.weapon = { itemId: 'fire_hardened_spear', name: idef.name || 'fire_hardened_spear' };
}
function fighters() { return (Game.tbfight ? Game.tbfight.fighters : []); }
function monsters() { return fighters().filter(x => (x.kind === 'monster' || x.kind === 'hostile') && x.alive); }
function primary(id) { return monsters().find(m => ((m.mdef || {}).id) === id) || null; }
function endTurn() {
  if (!Game.tbfight || Game.tbfight.over) return;
  if (!Game.tbIsPlayerTurn()) return;
  const p = Game.tbFighter('p'); if (!p) return;
  p.moveLeft = 0; p.acted = true;
  Game.tbAfterPlayerAction(); // turn hygiene: this IS the advance, once
}
function startFight(id) {
  sayLog.length = 0; audioFired.length = 0;
  Game.debugScenario('day1');
  const s = Game.state.scholar;
  s.mx = 4; s.my = 4;
  s.monster = { id, mx: 6, my: 4 };
  grantSpear();
  Game.startCombat(id);
  const p = Game.tbFighter('p'); if (p) { p.hp = p.maxHp = 99999; }
  return !!Game.tbfight;
}
// Player turn: strike the rep if in range and not walkout; else close distance (interior tiles 1..7).
function strikeRepTurn(rep) {
  let guard = 0;
  while (Game.tbIsPlayerTurn() && guard++ < 12) {
    const p = Game.tbFighter('p'); if (!p) return;
    const r = primary('union_rep'); if (!r) return;
    if (r.urWalkout) return; // stop hitting — walkout reached
    const d = Math.max(Math.abs(r.mx - p.mx), Math.abs(r.my - p.my));
    if (d <= 2) {
      const ok = Game.tbPlayerStrike(r.key);
      if (!Game.tbIsPlayerTurn()) return; // strike ended the turn — hygiene: do NOT advance again
      if (!ok) { endTurn(); return; }
    } else {
      if (p.moveLeft <= 0) { endTurn(); return; }
      const nx = Math.min(7, Math.max(1, p.mx + Math.sign(r.mx - p.mx)));
      const ny = Math.min(7, Math.max(1, p.my + Math.sign(r.my - p.my)));
      if (!Game.tbPlayerMove(nx, ny)) { endTurn(); return; }
    }
  }
}

// ---------- COMBAT A: WALKOUT ----------
console.log('  combat A: drive to WALKOUT');
check('combat started', startFight('union_rep'));
const rep0 = primary('union_rep');
check('rep in fight', !!rep0, rep0 && `hp ${rep0.hp}/${rep0.maxHp}`);
// wrap tbDamage to measure ally hits on the player pre/post walkout
const hitsPre = [], hitsPost = [];
const origTbDamage = Game.tbDamage.bind(Game);
function picketKey() { const pk = monsters().find(m => String(m.name || '').includes('(picket)')); return pk && pk.key; }
Game.tbDamage = (targetKey, dmg, sourceLabel, sourceKey, opts) => {
  // measure the FINAL (post-bonus) damage via player HP delta, attributed per-call
  let hpBefore = -1;
  try {
    const pk = picketKey();
    const p = Game.tbFighter('p');
    if (targetKey === 'p' && pk && p && (sourceKey === pk || String(sourceLabel || '').includes('(picket)'))) hpBefore = p.hp;
  } catch (e) {}
  const ret = origTbDamage(targetKey, dmg, sourceLabel, sourceKey, opts);
  try {
    if (hpBefore >= 0) {
      const p = Game.tbFighter('p');
      const dealt = hpBefore - (p ? p.hp : hpBefore);
      const r = primary('union_rep');
      (r && r.beamPhase === 'walkout' ? hitsPost : hitsPre).push(dealt);
    }
  } catch (e) {}
  return ret;
};
// PHASE 1: pass — let the picket act, collect pre-walkout baseline hits
for (let r = 0; r < 5; r++) {
  if (!Game.tbfight || Game.tbfight.over) break;
  if (Game.tbIsPlayerTurn()) endTurn();
  else { try { Game.tbAdvance && Game.tbAdvance(); } catch (e) { break; } }
}
console.log(`    (phase 1 done: pre-walkout picket hits n=${hitsPre.length})`);
let walkoutFightRound = -1, walkoutTotalRound = -1, fightRounds = 0, totalRounds = 5;
// PHASE 2: strike the rep down to half HP
for (let r = 0; r < 14; r++) {
  fightRounds++; totalRounds++;
  if (!Game.tbfight || Game.tbfight.over) break;
  const rep = primary('union_rep');
  if (!rep) break;
  if (rep.beamPhase === 'walkout') { walkoutFightRound = fightRounds; walkoutTotalRound = totalRounds; break; }
  if (Game.tbIsPlayerTurn()) strikeRepTurn(rep);
  else { try { Game.tbAdvance && Game.tbAdvance(); } catch (e) { break; } }
  const rep2 = primary('union_rep');
  if (rep2 && rep2.beamPhase === 'walkout' && walkoutFightRound < 0) { walkoutFightRound = fightRounds; walkoutTotalRound = totalRounds; }
}
// PHASE 3: pass — collect post-walkout hits
for (let r = 0; r < 6; r++) {
  if (!Game.tbfight || Game.tbfight.over) break;
  const rep3 = primary('union_rep');
  if (rep3 && rep3.beamPhase !== 'walkout') break;
  if (Game.tbIsPlayerTurn()) endTurn();
  else { try { Game.tbAdvance && Game.tbAdvance(); } catch (e) { break; } }
}
console.log(`    (phase 3 done: post-walkout picket hits n=${hitsPost.length})`);
check('WALKOUT fired', walkoutFightRound > 0, walkoutFightRound > 0 ? `fight-round ${walkoutFightRound} (total ${walkoutTotalRound})` : 'never fired');
check('WALKOUT reachable (<=8 fighting rounds)', walkoutFightRound > 0 && walkoutFightRound <= 8, `fight-round ${walkoutFightRound}`);
const rep = primary('union_rep');
check('rep in walkout phase', !!(rep && rep.beamPhase === 'walkout'), rep && rep.beamPhase);
check('rep flagged urWalkout', !!(rep && rep.urWalkout));
const picket = monsters().find(m => String(m.name || '').includes('(picket)'));
check('picket ally summoned', !!picket, picket && picket.name);
check('ally urDmgBonus +8 (3 solidarity + 5 walkout)', !!(picket && picket.urDmgBonus === 8),
  picket && `urDmgBonus=${picket.urDmgBonus}`);
const mean = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0;
console.log(`    (live fire: pre-walkout picket hits n=${hitsPre.length} mean=${mean(hitsPre).toFixed(1)}, post n=${hitsPost.length} mean=${mean(hitsPost).toFixed(1)} — species-dependent, informational)`);
// DETERMINISTIC PROBE: the real tbDamage path with the rep forced through
// phases — proves the +8 actually lands on ally damage, not just the flag.
const pk2 = monsters().find(m => String(m.name || '').includes('(picket)'));
function probe(base) {
  const p = Game.tbFighter('p'); const h0 = p.hp;
  origTbDamage('p', base, pk2.name, pk2.key);
  return h0 - Game.tbFighter('p').hp;
}
const dealtWalkout = probe(10); // rep currently in walkout
rep.beamPhase = 'picketing';
const dealtPre = probe(10);     // rep still organizing
rep.beamPhase = 'walkout';
check('allies +8 lands (walkout, real tbDamage)', dealtWalkout === 18, `base 10 → ${dealtWalkout}`);
check('allies +3 pre-walkout (solidarity, real tbDamage)', dealtPre === 13, `base 10 → ${dealtPre}`);
// untargetable reads
const sayBefore = sayLog.length;
const strikeOk = Game.tbPlayerStrike(rep.key);
const untargetLines = sayLog.slice(sayBefore).join(' ');
check('rep UNTARGETABLE during walkout (strike returns false)', strikeOk === false);
check('untargetable reads in fiction', /Untargetable|untargetable|behind the picket/i.test(untargetLines),
  untargetLines.slice(0, 90));
// walkout say text present
check('WALKOUT announcement read', /WALKOUT/.test(sayLog.join(' ')));
// audio fired live
for (const n of ['unionBullhorn', 'unionWalkout', 'unionPicket']) {
  check(`audio '${n}' fired live in combat`, audioFired.includes(n));
}
Game.tbDamage = origTbDamage;

// ---------- COMBAT B: knownCue gating ----------
console.log('  combat B: knownCue knowledge-gating');
function waitTelegraph(maxR) {
  for (let r = 0; r < maxR; r++) {
    if (!Game.tbfight || Game.tbfight.over) return null;
    const pm = primary('union_rep');
    if (pm && pm.telegraph) return pm;
    if (Game.tbIsPlayerTurn()) endTurn();
    else { try { Game.tbAdvance && Game.tbAdvance(); } catch (e) { break; } }
  }
  return null;
}
check('combat B1 (unknown) started', startFight('union_rep'));
const pm1 = waitTelegraph(20);
const cue1 = pm1 ? Game.tbTelegraphCue(pm1) : '';
check('telegraph declared (unknown)', !!pm1);
check('unknown cue hides coaching', !/union-bust/i.test(cue1), cue1.slice(0, 80));
check('combat B2 (learned) started', startFight('union_rep'));
// learn the pattern (mirrors tbLearnPattern)
Game.state.codex.monsters = Game.state.codex.monsters || {};
const c = Game.state.codex.monsters['union_rep'] || (Game.state.codex.monsters['union_rep'] = {});
c.patterns = c.patterns || {};
c.patterns['Grievance Filed'] = 'proof-learned';
const pm2 = waitTelegraph(20);
const cue2 = pm2 ? Game.tbTelegraphCue(pm2) : '';
check('telegraph declared (learned)', !!pm2);
check('knownCue coaching surfaces after learning', /union-bust/i.test(cue2), cue2.slice(-140));

console.log(`\n=== ${failures ? failures + ' FAILURES' : 'ALL PASS'} ===\n`);
process.exit(failures ? 1 : 0);
}

main().catch(e => { console.error('HARNESS ERROR:', e); process.exit(2); });
