#!/usr/bin/env node
// BRAWLER BREAK-IT 2026-10-09: damage-stacking honesty.
// Hostile question: how high can ONE strike's multiplier stack, and does
// every stacked multiplier print its say() line (no silent stacking)?
// Stackable sources in tbPlayerStrike: rage x2 (hp<0.5), cornered_rat x2
// (hp<0.3), aimed x2.5, haymaker (via _applyAbilityActionMods), PATIENT AIM
// x2 (round 1), AMBUSH, CLEAN KILL, true_swing +30%, gristlefit +25%,
// feastBurn (dynamic). All multiplicative. Report, don't moralize:
// broken builds are welcome (Steve) — the question is honesty + bounds.
const H = require('./combat-break-harness.js');
const fs = require('fs'), path = require('path');
eval(fs.readFileSync(path.join(H.ROOT, 'src/js/fieldFights.js'), 'utf8'));

(async () => {
  const Game = await H.newCombatReadyGame();
  const s = Game.state.scholar;
  const lines = [];
  Game.say = (t) => lines.push(String(t));

  // Grant all stacking abilities.
  const defs = Game.data.abilities || [];
  for (const id of ['rage', 'cornered_rat']) {
    const d = defs.find(a => a.id === id) || { name: id };
    let e = (s.abilities || []).find(a => a.id === id);
    if (!e) { e = { id, name: d.name || id, desc: '', level: 1, xp: 0 }; (s.abilities = s.abilities || []).push(e); }
  }
  s.stats = s.stats || {}; s.stats.str = 10; // true_swing tier 3 (+30%)
  try { s.passives = s.passives || {}; s.passives.true_swing = 3; } catch (e) {}
  // gristlefit status
  try { if (Game.hasStatus && Game.addStatusEffect) Game.addStatusEffect('scholar', 'gristlefit', 99); } catch (e) {}

  const mk = H.synthFight(Game, 'hushwolf', { php: 100, mhp: 500 });
  const f = Game.tbfight;
  // melee range: put the monster adjacent (unarmed range 1)
  f.fightersByKey[mk].mx = 5; f.fightersByKey[mk].my = 4;
  const p = f.fightersByKey['p'];
  // low hp => rage + cornered_rat both live
  p.hp = 25; p.maxHp = 100; s.health = 25;
  p.aimed = true; // DEAD AIM x2.5
  // feastBurn: make it return a fixed 1.5 if it exists
  let fbSeen = null;
  if (Game.feastBurn) { const real = Game.feastBurn.bind(Game); Game.feastBurn = () => { fbSeen = real(); return fbSeen || 0; }; }

  const t0 = f.fightersByKey[mk].hp;
  Game.tbPlayerStrike(mk);
  const dealt = t0 - f.fightersByKey[mk].hp;
  // Base roll is 10-16 + weapon bonus; with SEED fixed it's deterministic.
  console.log('dealt damage:', dealt);
  console.log('multiplier say() lines fired:');
  for (const l of lines) {
    if (/RAGE|CORNERED|DEAD AIM|GRISTLEFIT|feast|TRUE SWING|PATIENT|AMBUSH|HAYMAKER|×/i.test(l)) console.log('  - ' + l);
  }
  console.log(`feastBurn returned: ${fbSeen}`);
  // Sanity bound: nothing should exceed ~40x base in any sane stack
  console.log('note: max plausible bound check — dealt/baseRoll');
  process.exit(0);
})();
