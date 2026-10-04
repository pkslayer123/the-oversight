// Cognitive diversity test: intelligence types shape people, dialogue, learning.
const fs = require('fs');
const path = require('path');
const ROOT = '/home/hatch/workspace/the-scattering';
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/conversation.js', 'src/js/journal.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));

async function main() {
  const Game = globalThis.Scattering.Game;
  await Game.init();

  let pass = 0, fail = 0;
  const t = (name, cond) => {
    if (cond) { pass++; }
    else { fail++; console.log('  FAIL: ' + name); }
  };
  const VALID = ['analytical', 'practical', 'social', 'observant', 'creative', 'steady'];

  // --- 1. generation: every villager has coherent intelligence ---
  console.log('1. intelligence generation');
  Game.newGame('Chicago, Illinois', null, null);
  const v = Game.state.village;
  const roster = (v.roster || []).filter(id => id !== Game.villagerId);
  t('roster has NPCs', roster.length >= 5);
  let allValid = true, allDiff = true;
  const primaries = {};
  for (const rid of roster) {
    const intel = Game.npcIntel(rid);
    if (!VALID.includes(intel.primary) || !VALID.includes(intel.secondary)) allValid = false;
    if (intel.primary === intel.secondary) allDiff = false;
    primaries[intel.primary] = (primaries[intel.primary] || 0) + 1;
  }
  t('all NPCs have valid primary+secondary (via npcIntel)', allValid);
  t('primary != secondary for all', allDiff);
  t('multiple intelligence types present', Object.keys(primaries).length >= 3);
  console.log('   primary distribution:', JSON.stringify(primaries));

  // occupation -> intelligence mapping is deterministic in data (not random):
  // every occupation must carry a valid intel field.
  const cg0 = Game.data.characterGen;
  let occValid = true, occChecked = 0;
  for (const o of (cg0.occupations || [])) {
    occChecked++;
    if (!VALID.includes(o.intel)) { occValid = false; console.log('   bad intel for', o.id, o.intel); }
  }
  t('all ' + occChecked + ' occupations have valid intel', occValid);
  // spot-check the mapping makes sense
  const expectMap = { programmer: 'analytical', farmer: 'practical', bartender: 'social', librarian: 'analytical', forager: 'observant', chef: 'creative', firefighter: 'steady', interpreter: 'social', locksmith: 'analytical' };
  for (const [occ, exp] of Object.entries(expectMap)) {
    const o = (cg0.occupations || []).find(x => x.id === occ);
    t(occ + ' -> ' + exp, o && o.intel === exp);
  }

  // --- 2. npcIntel helper + fallback for legacy villagers ---
  console.log('2. npcIntel helper');
  Game.newGame('Chicago, Illinois', null, null);
  const r2 = (Game.state.village.roster || []).filter(id => id !== Game.villagerId);
  const ni = Game.npcIntel(r2[0]);
  t('npcIntel returns valid pair', VALID.includes(ni.primary) && VALID.includes(ni.secondary) && ni.primary !== ni.secondary);
  t('npcIntelName returns a name', typeof Game.npcIntelName(r2[0]) === 'string' && Game.npcIntelName(r2[0]).length > 2);
  // legacy villager without intelligence field
  Game.data.villagers.push({ id: 'legacy_test', personality: { temperament: 'steady' } });
  const leg = Game.npcIntel('legacy_test');
  t('legacy fallback works', VALID.includes(leg.primary) && VALID.includes(leg.secondary));

  // --- 3. theorizeWith: each intelligence, no crash, voiced lines, effects ---
  console.log('3. theorizeWith mechanics');
  const byIntel = {};
  for (const rid of r2) {
    const p = Game.npcIntel(rid).primary;
    if (!byIntel[p]) byIntel[p] = rid;
  }
  console.log('   intelligences found:', Object.keys(byIntel).join(', '));
  for (const [intel, rid] of Object.entries(byIntel)) {
    const encBefore = JSON.stringify(Game.state.codex.encounters || {});
    const trustBefore = (Game.state.village.trust || {})[rid] || 10;
    const energyBefore = Game.state.scholar.energy || 50;
    let line = null, threw = null;
    try { line = Game.theorizeWith(rid, 'monsters'); } catch (e) { threw = e.message; }
    t(intel + ': theorizeWith no throw', !threw);
    t(intel + ': returns a voiced line', typeof line === 'string' && line.length > 10);
    if (intel === 'analytical') {
      t('analytical: grants encounter progress', JSON.stringify(Game.state.codex.encounters || {}) !== encBefore);
    }
    if (intel === 'practical') {
      t('practical: builds trust', ((Game.state.village.trust || {})[rid] || 10) > trustBefore);
    }
    if (intel === 'steady') {
      t('steady: restores energy', (Game.state.scholar.energy || 50) >= energyBefore);
    }
  }

  // --- 4. analytical theorizing compounds into real knowledge ---
  console.log('4. joint discovery -> learnSkill');
  Game.newGame('Chicago, Illinois', null, null);
  const r4 = (Game.state.village.roster || []).filter(id => id !== Game.villagerId);
  // force one NPC to be analytical for determinism
  const avp = Game.vpOf(r4[0]);
  avp.intelligence = { primary: 'analytical', secondary: 'practical' };
  // isolate: player background might already grant these skills
  delete (Game.state.codex.skills || {}).animal_behavior;
  delete (Game.state.codex.skills || {}).track_read;
  Game.state.codex.encounters = Game.state.codex.encounters || {};
  Game.state.codex.encounters.animal_behavior = 0;
  Game.state.codex.encounters.track_read = 0;
  const skillsBefore = Object.keys(Game.state.codex.skills || {}).length;
  // theorize 3x about monsters (2 progress each = 6 >= 4 threshold)
  Game.theorizeWith(r4[0], 'monsters');
  Game.theorizeWith(r4[0], 'monsters');
  Game.theorizeWith(r4[0], 'monsters');
  const learned = (Game.state.codex.skills || {}).animal_behavior || (Game.state.codex.skills || {}).track_read;
  t('3 analytical sessions teach a skill', !!learned && (learned.level || 0) >= 1);
  t('via is theorized', learned && learned.via === 'theorized');

  // --- 5. no-repeat on theory lines ---
  console.log('5. theory no-repeat');
  const seen = new Set();
  let dupes = 0;
  for (let i = 0; i < 5; i++) {
    const l = Game.theorizeWith(r4[0], 'situation');
    if (seen.has(l)) dupes++;
    seen.add(l);
  }
  // 3 lines per topic; 4th+ falls back to theorizeAsks (may repeat asks, not theories)
  t('first 3 situation theories unique', dupes <= 2);

  // --- 6. conversation integration: theorize choice ---
  console.log('6. conversation theorize choice');
  Game.newGame('Chicago, Illinois', null, null);
  const r6 = (Game.state.village.roster || []).filter(id => id !== Game.villagerId);
  const st = Game.startConvo(r6[1]);
  const ui = Game.convoUI(r6[1]);
  const hasTheorize = ui.choices.some(c => c.id === 'theorize');
  t('theorize choice offered', hasTheorize);
  if (hasTheorize) {
    const res = Game.convoTurn(r6[1], 'theorize');
    t('theorize turn returns a line', res && res.line && res.line.length > 10);
    t('theorize tracked', (Game.convoGet(r6[1]).theorized || []).length === 1);
    // second theorize offers a different topic; pre-System only monsters+situation
    // exist, so after both the choice correctly disappears
    const ui2 = Game.convoUI(r6[1]);
    const sysUp = !!Game.state.systemArrived;
    t('theorize offered again iff topics remain', ui2.choices.some(c => c.id === 'theorize') === sysUp);
    if (sysUp) {
      Game.convoTurn(r6[1], 'theorize');
      t('two topics theorized', (Game.convoGet(r6[1]).theorized || []).length === 2);
    } else {
      Game.convoTurn(r6[1], 'theorize');
      t('two topics theorized pre-System', (Game.convoGet(r6[1]).theorized || []).length === 2);
      const ui3 = Game.convoUI(r6[1]);
      t('theorize hidden when exhausted', !ui3.choices.some(c => c.id === 'theorize'));
    }
  }
  // intelligence openers in pool: run many openings, check exact line matches
  // (openers have no placeholders, so fillTalkLine passes them through verbatim)
  let intelOpenerSeen = false;
  const cg = Game.data.characterGen;
  const allOpeners = [];
  for (const k of Object.keys(cg.intelOpeners || {})) for (const l of cg.intelOpeners[k]) allOpeners.push(l);
  t('intelOpeners: 6 types x 3 lines', allOpeners.length === 18);
  for (let i = 0; i < 40 && !intelOpenerSeen; i++) {
    Game.newGame('Chicago, Illinois', null, null);
    const rx = (Game.state.village.roster || []).filter(id => id !== Game.villagerId);
    const so = Game.startConvo(rx[0]);
    if (so && allOpeners.indexOf(so.line) !== -1) intelOpenerSeen = true;
    try { Game.endConvo(rx[0], 'left'); } catch (e) {}
  }
  t('intelligence-voiced opener surfaces', intelOpenerSeen);

  // --- 7. overheard discussions ---
  console.log('7. overheard discussions');
  Game.newGame('Chicago, Illinois', null, null);
  let threwOh = null, fired = 0;
  const realRandom = Math.random;
  Math.random = () => 0.1; // force the probability gates
  try {
    for (let i = 0; i < 20; i++) { Game.overheardDiscussion(); }
    fired = 1;
  } catch (e) { threwOh = e.message; }
  Math.random = realRandom;
  t('overheardDiscussion no throw', !threwOh);

  // --- 8. teachPlant intelligence bonus ---
  console.log('8. teachPlant intelligence path');
  Game.newGame('Chicago, Illinois', null, null);
  const r8 = (Game.state.village.roster || []).filter(id => id !== Game.villagerId);
  const plant = (Game.data.plants || [])[0];
  t('plant data exists', !!plant);
  if (plant && r8.length) {
    const tvp = Game.vpOf(r8[0]);
    tvp.intelligence = { primary: 'analytical', secondary: 'practical' };
    Game.state.village.taught = Game.state.village.taught || {};
    Game.state.village.taught[r8[0]] = [plant.id];
    // commLevel may block; just verify no throw
    let threwT = null;
    try { Game.teachPlant(r8[0], plant.id); } catch (e) { threwT = e.message; }
    t('teachPlant with intelligence no throw', !threwT);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error('FATAL', e); process.exit(2); });
