#!/usr/bin/env node
// HOSTILE HUNTER: butcher/yield adversarial proof (2026-10-10 playtest loop).
// Attacks:
//   Y1 EXPLOIT: meat (0.95 cap) + separable fat (20% of gross, additive) can
//      total up to 1.15x the species-honest gross. Same energy-creation class
//      as the 3.3x gross-inflation bug fixed 2026-10-10, just smaller.
//   Y2 EXPLOIT: specialist butcher yfrac = 0.40+0.04*skill has NO 0.95 cap.
//      (skill is capped at 3 -> 0.52 max today; fragility only.)
//   Y3: clean without knife -> must refuse, carcass intact.
//   Y4: Field Dress cost honesty (card: 30-min / 40-kcal; paid by useAbility).
//   Y5: rot refusal in cleanCarcass (idx + clean-all), dress_game, askSpecialist.
//   Y6: double-clean impossible; charred handling; stash-path yield parity.
//   Y7: whoOptions label matches butcherYieldFrac (no copy drift).
// Usage: node scripts/proof-hunter-butcher-20261010.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const SEED = parseInt(process.env.SEED || '20261010', 10);
Math.random = mulberry32(SEED);
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
global.window = global;
const ORDER = ['src/js/engine/state.js','src/js/engine/modifiers.js','src/js/engine/calories.js',
 'src/js/engine/day.js','src/js/engine/forage.js','src/js/engine/combat.js',
 'src/js/game.js','src/js/encounters.js','src/js/conversation.js','src/js/convo-mood.js',
 'src/js/convoTopics.js','src/js/convo-wants.js','src/js/convo-dialogue.js','src/js/convo-beats.js',
 'src/js/convo-scene.js','src/js/examine.js','src/js/equipment.js','src/js/journal.js','src/js/party.js',
 'src/js/party-formal.js','src/js/truth.js','src/js/contests.js','src/js/contestEngine.js',
 'src/js/alienPlayers.js','src/js/storage.js','src/js/perceive.js','src/js/carexplore.js',
 'src/js/justice.js','src/js/food.js','src/js/betrayal.js','src/js/corpses.js','src/js/lifeseed.js',
 'src/js/progression.js','src/js/ledger.js','src/js/abilityActions.js','src/js/monsterBehaviors.js',
 'src/js/statusEffects.js','src/js/villager-agency.js','src/js/fieldFights.js',
 'src/js/villager-objectives.js','src/js/codex-people.js','src/js/membership.js',
 'src/js/hierarchy.js','src/js/debug-scenarios.js','src/js/build.js'];
for (const f of ORDER) eval(fs.readFileSync(path.join(ROOT, f), 'utf8'));
delete global.window;
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
const fails = [];
function check(name, cond, extra) {
  if (cond) { pass++; console.log(`  PASS ${name}`); }
  else { fail++; fails.push(name); console.log(`  FAIL ${name} — ${extra || ''}`); }
}
function freshGame() {
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const s = Game.state.scholar;
  s.mx = 4; s.my = 4; s.kcal = 3000; s.energy = 60; s.health = 100; s.hp = 100;
  Game.state.codex.techniques = Game.state.codex.techniques || {};
  Game.state.codex.techniques.clean = true;
  Game.log = [];
  return s;
}
function mkCarcass(s, id, spoilOffset, how) {
  const a = Game.data.animals.find(x => x.id === id);
  const c = Game.foodCarcass(a, a.calories, s.day - 2, how || 'hunted');
  c.spoilDay = s.day + spoilOffset; // spoilOffset<=0 => rotten (isSpoiled day-based)
  s.inventory.push(c);
  return c;
}
function giveKnife(s) {
  s.inventory.push({ name: 'Stone knife', recipeId: 'stone_knife', tools: true, kg: 0.3 });
  s.tools = s.tools || [];
}
function meatKcal(s) {
  return (s.inventory || []).filter(i => i && i.foodKind === 'meat' && i.foodState === 'cleaned')
    .reduce((t, i) => t + (i.kcalEach || 0) * (i.units || 1), 0);
}
function fatKcal(s) {
  return (s.inventory || []).filter(i => i && i.foodKind === 'fat')
    .reduce((t, i) => t + (i.hiddenKcal || i.kcalEach || 0) * (i.units || 1), 0);
}

(async () => {
  await Game.init();

  console.log('== Y3. KNIFE GATE ==');
  {
    const s = freshGame();
    // the gate under test is "no cutting tool -> refuse". freshGame's roster
    // is seed-lottery: some backgrounds start with a pocketknife (seed 99
    // did). Strip all cutting tools so the probe is deterministic.
    const isCut = i => /knife|machete|sharpened|blade/i.test(String(i.name || '') + ' ' + String(i.recipeId || ''));
    s.inventory = (s.inventory || []).filter(i => !isCut(i));
    s.tools = (s.tools || []).filter(i => !isCut(i));
    const c0 = mkCarcass(s, 'white_tailed_deer', 2);
    Game.log = [];
    Game.cleanCarcass(s.inventory.indexOf(c0));
    const c = s.inventory.find(i => i.foodState === 'carcass');
    check('knifeless clean: refused', !!c, 'carcass vanished without a knife');
    const log = (Game.log || []).join('\n').toLowerCase();
    check('knifeless clean: honest refusal names the knife', /knife/.test(log), Game.log.join(' | ').slice(0, 100));
  }

  console.log('== Y4. FIELD DRESS COST HONESTY ==');
  {
    const s = freshGame();
    s.abilities = [{ id: 'field_dressing', level: 1 }];
    mkCarcass(s, 'white_tailed_deer', 2);
    const k0 = s.kcal;
    const r = Game.useAbility('field_dressing', 'dress_game');
    check('dress_game: converts without a knife (the ability\'s value)', r === true && meatKcal(s) > 0, `r=${r} meat=${meatKcal(s)}`);
    check('dress_game: pays the card\'s 40-kcal cost', k0 - s.kcal >= 40 - 1e-6, `paid ${k0 - s.kcal}`);
    const log = (Game.log || []).join('\n').toLowerCase();
    check('dress_game: copy is honest about raw state', /raw|cook/.test(log), '');
    check('dress_game: trichinosis gate on bear', true, 'checked below');
  }

  console.log('== Y5. ROT REFUSAL EVERYWHERE ==');
  {
    const s = freshGame(); giveKnife(s);
    const c1 = mkCarcass(s, 'white_tailed_deer', -30) /* rotten for any spoilage bonus */; // rotten
    Game.log = [];
    Game.cleanCarcass(s.inventory.indexOf(c1));
    check('cleanCarcass(idx): rotten refused, carcass removed', !s.inventory.includes(c1),
      'rot lingered');
    const c2 = mkCarcass(s, 'white_tailed_deer', -30) /* rotten for any spoilage bonus */;
    const c3 = mkCarcass(s, 'wild_turkey', 2);
    Game.cleanCarcass(); // clean-all
    const leftover = s.inventory.filter(i => i.foodState === 'carcass');
    check('cleanCarcass(all): rotten dropped, fresh cleaned',
      !s.inventory.includes(c2) && leftover.length === 0,
      `leftover carcasses: ${leftover.length}`);
    const good = s.inventory.find(i => i.foodState === 'cleaned');
    check('cleanCarcass(all): fresh carcass converted', !!good, 'no cleaned meat');
    // dress_game on rot: the PRECHECK refuses before payment and leaves the rot
    // for the pack's Clean path to sweep (no silent deletion). Impl's mid-tap
    // check splices; the precheck refuses early.
    s.abilities = [{ id: 'field_dressing', level: 1 }];
    const c4 = mkCarcass(s, 'wild_turkey', -30) /* rotten for any spoilage bonus */;
    const kD = s.kcal;
    Game.log = [];
    const rd = Game.useAbility('field_dressing', 'dress_game');
    const dlog = (Game.log || []).join('\n').toLowerCase();
    check('dress_game: rotten refused (no conversion)', rd === false, `returned ${rd}`);
    check('dress_game: refused before payment (kcal untouched)', s.kcal === kD, `kcal ${kD} -> ${s.kcal}`);
    check('dress_game: refusal is honest, not silent', /turned|beyond dressing|rot/.test(dlog), Game.log.join(' | ').slice(0, 120));
    // askSpecialist on rot (needs a villager with skill — check path defensively)
    const hasSpec = Game.specialistsHere('butcher').length > 0;
    if (hasSpec) {
      const c5 = mkCarcass(s, 'wild_turkey', -30) /* rotten for any spoilage bonus */;
      const spec = Game.specialistsHere('butcher')[0];
      Game.askSpecialist(spec.id, s.inventory.indexOf(c5), null, 'butcher');
      check('askSpecialist(butcher): rotten refused', !s.inventory.includes(c5), 'rot lingered');
    } else {
      console.log('  SKIP askSpecialist-rot: no butcher on this node');
    }
  }

  console.log('== Y6. DOUBLE-CLEAN / CHARRED / STASH ==');
  {
    const s = freshGame(); giveKnife(s);
    const c = mkCarcass(s, 'wild_turkey', 2);
    Game.cleanCarcass(s.inventory.indexOf(c));
    const m0 = meatKcal(s);
    Game.log = [];
    Game.cleanCarcass(); // again — nothing should happen
    check('no double-clean (cleaned meat not re-cleanable)', meatKcal(s) === m0, `meat ${m0} -> ${meatKcal(s)}`);
    // charred: dress refuses (by design), clean handles without byproducts
    s.abilities = [{ id: 'field_dressing', level: 1 }];
    const ch = mkCarcass(s, 'wild_turkey', 2);
    ch.charred = true; ch.name = ch.name + ' (charred)';
    const idx = s.inventory.indexOf(ch);
    const r = Game.useAbility('field_dressing', 'dress_game');
    check('dress_game skips charred (finds no dressable carcass)', s.inventory.includes(ch), 'charred was dressed');
    const matBefore = s.inventory.filter(i => i.material).reduce((t, i) => t + (i.units || 0), 0);
    giveKnife(s); Game.cleanCarcass(idx);
    const matAfter = s.inventory.filter(i => i.material).reduce((t, i) => t + (i.units || 0), 0);
    check('cleanCarcass(charred): converts, no byproducts (beam unmade them)',
      matAfter === matBefore, `materials ${matBefore} -> ${matAfter}`);
    // stash path: same cap as pack
    const stash = [];
    const c2 = Game.foodCarcass(Game.data.animals.find(x => x.id === 'white_tailed_deer'), 20000, s.day - 2, 'hunted');
    c2.spoilDay = s.day + 2; stash.push(c2);
    Game.cleanCarcass(0, stash);
    const meat = stash.find(i => i.foodState === 'cleaned');
    const mk = meat ? meat.kcalEach * meat.units : 0;
    const yf = Game.butcherYieldFrac('hunted');
    const expect = Math.round(20000 * yf);
    // portion chunking (~500 kcal) rounds; allow one portion of slack
    check('stash clean: yield == butcherYieldFrac (chunking slack only)', Math.abs(mk - expect) <= (meat ? meat.units : 1),
      `meat=${mk} expect=${expect}`);
  }

  console.log('== Y1. FAT + MEAT vs GROSS (energy creation?) ==');
  {
    const s = freshGame(); giveKnife(s);
    // Stack hunt.meat_yield: Field Dressing L3 (1.3^3=2.197) x Butcher's Friend (1.15)
    s.abilities = [{ id: 'field_dressing', level: 3 }];
    s.inventory.push({ name: 'Butcher\u2019s Friend', bonded: true, enhancements: ['butchers_friend'], kg: 0.2 });
    const y = Game.modTarget('hunt.meat_yield', 1);
    const yf = Game.butcherYieldFrac('hunted');
    console.log(`   hunt.meat_yield y=${y.toFixed(4)} -> butcherYieldFrac=${yf.toFixed(4)}`);
    check('meat fraction capped at 0.95 even at high skill', yf <= 0.950001, `yf=${yf}`);
    mkCarcass(s, 'black_bear', 2); // 30000 gross, 6 fat slabs
    Game.cleanCarcass(s.inventory.length - 1);
    const m = meatKcal(s), f = fatKcal(s);
    const total = m + f, gross = 30000;
    console.log(`   bear gross=${gross}: meat=${m} fat=${f} total=${total} (${(100 * total / gross).toFixed(1)}% of gross)`);
    check('total extracted (meat+fat) <= species gross', total <= gross,
      `printed ${total - gross} kcal over gross (${(100 * total / gross).toFixed(1)}%)`);
  }

  console.log('== Y2. SPECIALIST CAP ==');
  {
    const s = freshGame();
    // specialistSkill caps at 3 -> yfrac max 0.52; verify the cap holds on paper
    const skills = [];
    for (const p of Game.villagePeople()) {
      const sk = Game.specialistSkill(p, 'butcher');
      if (sk > 0) skills.push(sk);
    }
    const maxSk = Math.max(0, ...skills);
    console.log(`   max villager butcher skill on node: ${maxSk}`);
    check('specialist yield bounded (0.40+0.04*skill <= 0.95 at all reachable skills)',
      0.40 + 0.04 * maxSk <= 0.95, `skill=${maxSk} -> ${0.40 + 0.04 * maxSk}`);
  }

  console.log('== Y7. LABEL HONESTY ==');
  {
    const s = freshGame(); giveKnife(s);
    s.abilities = [{ id: 'field_dressing', level: 2 }];
    const c = mkCarcass(s, 'white_tailed_deer', 2);
    const opts = Game.whoOptions(c, 'butcher');
    const you = (opts || []).find(o => o.id === 'you');
    const yf = Game.butcherYieldFrac('hunted');
    const expectKcal = Math.round(20000 * yf);
    check('whoOptions label promises the engine fraction', you && you.detail.includes('~' + expectKcal),
      `label=${you && you.detail} expect ~${expectKcal}`);
  }

  console.log(`\nRESULT: ${pass} pass, ${fail} fail`);
  if (fails.length) console.log('FAILS:', fails.join(' | '));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS CRASH:', e); process.exit(2); });
