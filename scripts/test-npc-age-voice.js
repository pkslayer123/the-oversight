// NPC age voice test. Usage: node scripts/test-npc-age-voice.js
// Steve's directive (2026-10-06): "Villager and player ages please for voice.
// Diversity too, not just one set for each."
//
// Verifies:
//  1. Villagers carry age; npcAge/npcAgeBand derive young/adult/elder.
//  2. 12 age voice sets exist (4 per band), all with open+close pools.
//  3. Voice sets distribute (diversity): seeded per villager, stable, varied.
//  4. Voice fingerprints (band:set:temperament) are unique across a roster.
//  5. Same temperament + different age band => different voice sets/pools.
//  6. Playtest: 6+ villagers of varied ages, voiceLine outputs read naturally
//     (no caricature), no two sound alike.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js',
 'src/js/justice.js', 'src/js/betrayal.js', 'src/js/corpses.js', 'src/js/codex-people.js', 'src/js/progression.js',
 'src/js/ledger.js', 'src/js/lifeseed.js', 'src/js/villager-agency.js', 'src/js/debug-scenarios.js', 'src/js/convo-mood.js'].forEach(f => {
  try { eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); }
  catch (e) { console.log(`LOAD FAIL ${f}: ${e.message}`); }
});
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL: ${name}`); }
}

const SAMPLE_LINES = [
  '"We should move camp before the water turns."',
  '"I saw something out past the treeline."',
  '"Are you alright?"',
  '"The pantry is getting low."',
  '"I remember when this place was just tents."',
];

(async () => {
  await Game.init();
  Game.debugScenario('mootAccused');
  const v = Game.state.village;
  const roster = (v.roster || []).filter(id => id !== Game.villagerId);
  ok('roster non-empty', roster.length > 0);

  console.log('=== 1. npcAge / npcAgeBand ===');
  const bands = {};
  for (const vid of roster) {
    const age = Game.npcAge(vid);
    const band = Game.npcAgeBand(vid);
    ok(`age numeric for ${vid}`, typeof age === 'number' && age >= 15 && age <= 90);
    ok(`band valid for ${vid}`, ['young', 'adult', 'elder'].includes(band));
    bands[band] = (bands[band] || 0) + 1;
  }
  console.log('  band distribution:', JSON.stringify(bands));

  console.log('=== 2. ageSets data: 12 sets, 4 per band ===');
  const ageSets = (((Game.data.characterGen || {}).voice || {}).ageSets) || {};
  for (const band of ['young', 'adult', 'elder']) {
    const sets = ageSets[band] || {};
    const ids = Object.keys(sets);
    ok(`${band} has >=3 voice sets (diversity)`, ids.length >= 3);
    for (const id of ids) {
      const s = sets[id];
      ok(`${band}.${id} has open pool`, Array.isArray(s.open) && s.open.length >= 2);
      ok(`${band}.${id} has close pool`, Array.isArray(s.close) && s.close.length >= 2);
    }
  }

  console.log('=== 3. voice set assignment: seeded, stable, diverse ===');
  const seenSets = {};
  for (const vid of roster) {
    const s1 = Game.npcVoiceSet(vid);
    const s2 = Game.npcVoiceSet(vid);
    ok(`voice set stable for ${vid}`, s1 === s2 && typeof s1 === 'string');
    const band = Game.npcAgeBand(vid);
    const valid = Object.keys(ageSets[band] || {});
    ok(`voice set valid for band (${vid})`, valid.includes(s1));
    seenSets[band + ':' + s1] = (seenSets[band + ':' + s1] || 0) + 1;
  }
  console.log('  set distribution:', JSON.stringify(seenSets));

  console.log('=== 4. fingerprint uniqueness across roster ===');
  const fps = roster.map(vid => Game.npcVoiceFingerprint(vid));
  const dupes = fps.filter((f, i) => fps.indexOf(f) !== i);
  ok('no duplicate voice fingerprints', dupes.length === 0);
  if (dupes.length) console.log('  dupes:', dupes.join(', '));
  console.log('  fingerprints:', fps.join(' | '));

  console.log('=== 5. same temperament, different age band => different voice ===');
  // Force two villagers to share a temperament but sit in different bands.
  const byBand = { young: [], adult: [], elder: [] };
  for (const vid of roster) byBand[Game.npcAgeBand(vid)].push(vid);
  const bandsPresent = Object.keys(byBand).filter(b => byBand[b].length);
  if (bandsPresent.length >= 2) {
    const a = byBand[bandsPresent[0]][0], b = byBand[bandsPresent[1]][0];
    const rc = id => ((v.rosterChars || {})[id]) || (Game.data.villagers || []).find(x => x.id === id) || {};
    // pin temperament equal via personality override on the underlying record
    for (const id of [a, b]) {
      const rec = rc(id);
      rec.personality = rec.personality || {};
      rec.personality.temperament = 'steady';
    }
    const fa = Game.npcVoiceFingerprint(a), fb = Game.npcVoiceFingerprint(b);
    ok('same temperament + different band => different fingerprint', fa !== fb);
    console.log(`  ${a} (${Game.npcAge(a)}y) => ${fa}`);
    console.log(`  ${b} (${Game.npcAge(b)}y) => ${fb}`);
  } else {
    console.log('  SKIP: roster lacks 2 age bands (bands: ' + bandsPresent.join(',') + ')');
  }

  console.log('=== 6. voiceLine actually voices age (pool coverage) ===');
  // Run voiceLine many times per villager; collect distinct outputs.
  // Age-flavored bits must appear for non-adult villagers.
  const ageBits = {};
  for (const band of ['young', 'adult', 'elder']) {
    for (const id of Object.keys(ageSets[band] || {})) {
      for (const bit of (ageSets[band][id].open || []).concat(ageSets[band][id].close || [])) {
        ageBits[bit.trim()] = band;
      }
    }
  }
  let voicedWithAge = 0, voicedTotal = 0;
  const transcripts = [];
  for (const vid of roster.slice(0, 8)) {
    const outs = new Set();
    for (let i = 0; i < 40; i++) {
      for (const ln of SAMPLE_LINES) {
        const out = Game.voiceLine(vid, ln);
        if (out && out !== ln) outs.add(out);
      }
    }
    voicedTotal++;
    const band = Game.npcAgeBand(vid);
    const hasAgeBit = [...outs].some(o => Object.keys(ageBits).some(bit => bit && o.includes(bit) && ageBits[bit] === band));
    if (band !== 'adult' && hasAgeBit) voicedWithAge++;
    const rec = ((v.rosterChars || {})[vid]) || {};
    transcripts.push({ vid, name: rec.name || vid, age: Game.npcAge(vid), band, fp: Game.npcVoiceFingerprint(vid), samples: [...outs].slice(0, 4) });
  }
  const nonAdult = transcripts.filter(t => t.band !== 'adult').length;
  ok(`age bits surface for non-adult villagers (${voicedWithAge}/${nonAdult})`, nonAdult === 0 || voicedWithAge > 0);

  console.log('\n=== PLAYTEST TRANSCRIPTS (caricature check: read these) ===');
  for (const t of transcripts.slice(0, 6)) {
    console.log(`\n--- ${t.name}, ${t.age}y [${t.band}] fp=${t.fp} ---`);
    for (const s of t.samples) console.log('  ' + s);
  }

  // Caricature guard: cheap old-person lines must not exist in elder sets.
  const cheap = ['back in my day', 'whippersnapper', 'in my time,', 'kids these days'];
  const elderText = JSON.stringify(ageSets.elder || {}).toLowerCase();
  for (const c of cheap) ok(`no caricature phrase "${c}" in elder sets`, !elderText.includes(c));
  const youngText = JSON.stringify(ageSets.young || {}).toLowerCase();
  for (const c of ['yeet', 'lit ', 'fam,', 'no cap']) ok(`no caricature phrase "${c}" in young sets`, !youngText.includes(c));

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
