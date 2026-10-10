#!/usr/bin/env node
// COMBAT BREAK-IT round 2: dead-code verification (Steve 2026-10-08).
//   X1. The 4 combat data actions (pocket_sand.throw_sand,
//       scream_cheese.scream, leech.leech_stance, peacemaker.walk_in) were
//       dead-but-polite in round 1. ABILITIES BREAK-IT 2026-10-10 wired all
//       four: they now resolve for real (fire, or refuse pre-payment with an
//       honest line). This block asserts the wired behavior — no turn spent
//       on refusals, exactly one turn on fires, costs paid once.
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

  console.log('--- X1. the 4 wired combat actions: resolve honestly ---');
  const implSrc = fs.readFileSync(path.join(ROOT, 'src/js/abilityActions.js'), 'utf8');
  const implKeys = new Set([...implSrc.matchAll(/['"]([a-zA-Z0-9_]+\.[a-zA-Z0-9_]+)['\"]:/g)].map(m => m[1]));
  const nowWired = ['pocket_sand.throw_sand', 'scream_cheese.scream', 'leech.leech_stance', 'peacemaker.walk_in'];
  for (const id of nowWired) {
    const [aid, actid] = id.split('.');
    check(`X1 ${id} has an impl`, implKeys.has(id));
    const def = Game.data.abilities.find(a => a.id === aid) || {};
    (s.backgroundAbilities = s.backgroundAbilities || []).push({ id: aid, name: def.name || aid, level: 1, xp: 0 });
    H.synthFight(Game, 'bulldozer', { mhp: 60 });
    const p = Game.tbFighter('p');
    const m = Game.tbfight.fighters.find(f => f.kind === 'monster');
    const hpBefore = s.health;
    const msgs = []; const o = Game.say;
    Game.say = mm => { msgs.push(String(mm)); return o.call(Game, mm); };
    s.kcal = 5000;
    const roundBefore = Game.tbfight.round;
    const r = Game.activateAbility(aid + '.' + actid);
    Game.say = o;
    // NOTE: this harness does NOT stub tbAfterPlayerAction, so a fired
    // action advances the world for real: the monster takes its turn and
    // play returns to the player (acted=false again, fresh turn). "Exactly
    // one turn" is proven by the round advancing exactly once — the old
    // dead_aim double-advance would push it two rounds and let the monster
    // act twice.
    if (id === 'scream_cheese.scream') {
      check(`X1 ${id} fires`, r === true, `ret=${r}`);
      check(`X1 ${id} stun skipped the monster's turn`, msgs.some(mm => /still frozen from your scream/.test(mm)),
        msgs.slice(-3).join(' | '));
      check(`X1 ${id} advanced exactly one round`, Game.tbfight && Game.tbfight.round === roundBefore + 1,
        `round=${Game.tbfight && Game.tbfight.round}`);
      check(`X1 ${id} pays the 20 kcal once`, s.kcal === 4980, `kcal=${s.kcal}`);
    } else if (id === 'pocket_sand.throw_sand') {
      check(`X1 ${id} fires and blinds 2 rounds`, r === true && m.blind === 2, `ret=${r} blind=${m.blind}`);
      check(`X1 ${id} advanced exactly one round`, Game.tbfight && Game.tbfight.round === roundBefore + 1,
        `round=${Game.tbfight && Game.tbfight.round}`);
    } else if (id === 'leech.leech_stance') {
      // no villagers in this fight: honest pre-payment refusal, turn kept
      check(`X1 ${id} refuses with no one to shield`, r === false && p.acted === false, `ret=${r} acted=${p.acted}`);
      check(`X1 ${id} refusal is honest`, msgs.some(mm => /No one here to shield/.test(mm)), msgs.slice(-1)[0]);
      check(`X1 ${id} refusal pays nothing`, s.kcal === 5000 && s.health === hpBefore);
      check(`X1 ${id} refusal advances nothing`, Game.tbfight.round === roundBefore, `round=${Game.tbfight.round}`);
    } else if (id === 'peacemaker.walk_in') {
      check(`X1 ${id} resolves: stand down or exposed`, r === true && (m.fled === true || p.exposedTurns > 0),
        `ret=${r} fled=${m.fled} exposed=${p.exposedTurns}`);
    }
    check(`X1 ${id} never the wiring message`, !msgs.some(mm => /isn't wired up yet/.test(mm)));
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
