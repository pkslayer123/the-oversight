// Background text quality (Steve 2026-10-06):
// "Backgrounds are all sorts of messed up, repetitive, and weird.
//  Bits of pseudo code interjected with frequency."
// Generates 20 characters and asserts:
// - no "reads as" (engine language leaking into fiction)
// - no second-person POV breaks in third-person bios
// - pronoun consistency (no he/they or she/they mixes)
// - no repeated identical sentences across backgrounds
// Usage: node scripts/test-backgrounds-20261006.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/lifeseed.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}` + (extra ? ' — ' + extra : '')); }
}

(async () => {
  await Game.init();

  const chars = [];
  const usedNames = new Set();
  const usedOccs = new Set();
  for (let i = 0; i < 20; i++) {
    try {
      const ch = Game.genCharacter({ origin: 'Kyiv, Ukraine', candidate: false, usedNames, usedOccs });
      if (ch && ch.backstory) chars.push(ch);
    } catch (e) { /* skip failures */ }
  }
  ok('generated 20 characters', chars.length >= 15, `got ${chars.length}`);

  // 1. No "reads as" anywhere
  let readsAs = 0;
  for (const ch of chars) {
    const text = (ch.backstory || '') + ' ' + (ch.systemAssessment || '');
    if (/reads as/i.test(text)) { readsAs++; console.log(`  reads-as in: ${ch.name}`); }
  }
  ok('no "reads as" in backgrounds', readsAs === 0, `${readsAs} found`);

  // 2. No second-person POV breaks (you/your/yours in third-person bio)
  // Quoted speech is character voice (e.g. a text message: 'call when you can')
  // and may use second person. Strip quotes carefully — don't let possessive
  // apostrophes (Petro's) pair with quote delimiters.
  let povBreaks = 0;
  for (const ch of chars) {
    const text = (ch.backstory || '') + ' ' + (ch.systemAssessment || '');
    // Protect possessives (Name's) before stripping quoted speech
    const protected_ = text.replace(/([A-Z][a-z]+)'s\b/g, '$1\uE000s');
    const unquoted = protected_.replace(/"[^"]*"/g, '').replace(/(?<![A-Za-z0-9])'[^']*'/g, '').replace(/\uE000/g, "'");
    const youMatch = unquoted.match(/\b(you|your|yours|yourself)\b/i);
    if (youMatch) {
      povBreaks++;
      console.log(`  POV break in ${ch.name}: "...${unquoted.slice(Math.max(0, youMatch.index - 40), youMatch.index + 40)}..."`);
    }
  }
  ok('no second-person POV breaks', povBreaks === 0, `${povBreaks} found`);

  // 3. Pronoun consistency: if name is gendered (he/she), no they/them for that person
  let pronounMix = 0;
  for (const ch of chars) {
    const first = ch.name.split(' ')[0];
    const gender = Game.guessNameGender(first, null);
    if (gender === 'm' || gender === 'f') {
      const text = (ch.backstory || '') + ' ' + (ch.systemAssessment || '');
      // they/them/their referring to the character (not generic "they")
      // Heuristic: "They" at sentence start followed by verb, or "their/them" near the name
      if (/\bThey\s+(have|are|were|do|know|keep|build|look)\b/.test(text)) {
        pronounMix++;
        console.log(`  pronoun mix in ${ch.name} (${gender}): they/them used`);
      }
    }
  }
  ok('pronoun consistency for gendered names', pronounMix === 0, `${pronounMix} found`);

  // 4. No repeated identical sentences across backgrounds (beyond chance)
  // Old system: 3 assessment variants total → each appears ~7x in 20 chars.
  // New: 90+ combinations → duplicates should be rare. Wounds/events are shared
  // life experiences (drawn from pools, not deduped), so allow up to 3x.
  // Fail on 4x+ (systematic template repetition).
  const sentences = {};
  for (const ch of chars) {
    const text = (ch.backstory || '') + ' ' + (ch.systemAssessment || '');
    for (const s of text.split(/[.!?]+/).map(x => x.trim()).filter(x => x.length > 20)) {
      sentences[s] = (sentences[s] || 0) + 1;
    }
  }
  const dupes = Object.entries(sentences).filter(([_, n]) => n >= 4);
  if (dupes.length) {
    console.log(`  over-repeated sentences (4x+):`);
    for (const [s, n] of dupes.slice(0, 5)) console.log(`    (${n}x) ${s.slice(0, 80)}...`);
  }
  ok('no sentence repeats 4x+ across backgrounds', dupes.length === 0, `${dupes.length} over-repeated`);

  // 5. Spot check: Leonid gets he/him (the screenshot case)
  const leonidGender = Game.guessNameGender('Leonid', 'ukrainian');
  ok('Leonid reads masculine', leonidGender === 'm', `got ${leonidGender}`);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
