#!/usr/bin/env node
// COMBAT BREAK-IT round 2: dead-code verification (Steve 2026-10-08).
//   X1. The 4 dead combat data actions (pocket_sand.throw_sand,
//       scream_cheese.scream, leech.leech_stance, peacemaker.walk_in) — did
//       they get real impls since round 1, or are they still dead-but-polite?
//       (Still dead = content debt, not a bug — but the fail-fast MUST fire
//       in a real fight: no turn spent, no cost paid, honest message.)
//   X2. Fighter status appliers — which engine statuses can actually land on
//       a fighter in combat? fear/slow/bleed/burn/poison are declared in
//       statusEffects.json with tick/effect machinery, but if nothing
//       applies them the whole DoT/fear framework is dead code in fights.
const H = require('./combat-break-harness.js');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log(`  PASS ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${extra ? ' — ' + extra : ''}`); }
}

(async () => {
  const Game = await H.newCombatReadyGame();
  const s = Game.state.scholar;

  console.log('--- X1. dead combat actions: still dead, still polite ---');
  const implSrc = fs.readFileSync(path.join(ROOT, 'src/js/abilityActions.js'), 'utf8');
  const implKeys = new Set([...implSrc.matchAll(/['"]([a-zA-Z0-9_]+\.[a-zA-Z0-9_]+)['\"]:/g)].map(m => m[1]));
  const dead = ['pocket_sand.throw_sand', 'scream_cheese.scream', 'leech.leech_stance', 'peacemaker.walk_in'];
  for (const id of dead) {
    const [aid, actid] = id.split('.');
    check(`X1 ${id} still has no impl`, !implKeys.has(id));
    const def = Game.data.abilities.find(a => a.id === aid) || {};
    (s.backgroundAbilities = s.backgroundAbilities || []).push({ id: aid, name: def.name || aid, level: 1, xp: 0 });
    H.synthFight(Game, 'bulldozer', { mhp: 60 });
    const p = Game.tbFighter('p');
    const kcalBefore = s.kcal, hpBefore = s.health;
    const msgs = []; const o = Game.say;
    Game.say = m => { msgs.push(String(m)); return o.call(Game, m); };
    Game.activateAbility(aid + '.' + actid);
    Game.say = o;
    check(`X1 ${id} fail-fast keeps the turn`, p.acted === false, `acted=${p.acted}`);
    check(`X1 ${id} fail-fast pays nothing`, s.kcal === kcalBefore && s.health === hpBefore);
    check(`X1 ${id} honest message`, msgs.some(m => /isn't wired up yet/.test(m)), msgs.slice(-1)[0]);
    if (Game.tbfight) Game.tbEnd('fled');
    s.backgroundAbilities = s.backgroundAbilities.filter(a => a.id !== aid);
  }

  console.log('--- X2. fighter status appliers (static scan) ---');
  const src = ['game.js', 'abilityActions.js', 'monsterBehaviors.js', 'statusEffects.js',
               'encounters.js', 'alienPlayers.js', 'contests.js']
    .map(f => { try { return fs.readFileSync(path.join(ROOT, 'src/js', f), 'utf8'); } catch (e) { return ''; } })
    .join('\n');
  const ids = ['fear', 'slow', 'bleed', 'burn', 'poison', 'stun', 'stun_full'];
  for (const id of ids) {
    // applyStatus(<target>, '<id>') where target is not the literal 'scholar'
    const re = new RegExp(`applyStatus\\(\\s*(?!'scholar'|"scholar")([^,)]+?),\\s*['"]${id}['"]`, 'g');
    const hits = [...src.matchAll(re)].map(m => m[1].trim()).filter(t => !/^['"]scholar['"]$/.test(t));
    console.log(`    ${id}: fighter appliers = ${hits.length}${hits.length ? ' (' + [...new Set(hits)].join(', ') + ')' : ''}`);
    if (id === 'stun' || id === 'stun_full') check(`X2 ${id} is live`, hits.length > 0);
    else check(`X2 ${id} has zero fighter appliers (dead framework)`, hits.length === 0, hits.join(','));
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
