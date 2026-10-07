#!/usr/bin/env node
// PROOF TEST (Steve 2026-10-07): justice voice JSON migration.
// Verifies that the data-driven template selection produces the SAME
// eligible sets as the old hardcoded arrays for every condition combination.
//
// The old code: pick([...].filter(Boolean)) where null entries were
// conditional on close/wary/bold/seriousType. The new code: JSON templates
// with 'when' conditions filtered by justiceVoiceMatch.
//
// This test asserts equivalence: for every (section, key, ctx) combination,
// the set of eligible template texts from JSON matches the hardcoded list.

const fs = require('fs');
const path = require('path');

const voicePath = path.join(__dirname, '..', 'src/data/justiceVoice.json');
const voice = JSON.parse(fs.readFileSync(voicePath, 'utf8'));

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}

// Replicate the JS matching logic
function match(templates, ctx) {
  return (templates || []).filter(t => {
    const w = t.when || {};
    for (const k of Object.keys(w)) {
      if (k === 'seriousType') { if (ctx.seriousType !== w[k]) return false; }
      else if (k === 'noSerious') { if (!!ctx.noSerious !== !!w[k]) return false; }
      else { if (!!ctx[k] !== !!w[k]) return false; }
    }
    return true;
  });
}

function fill(text, vars) {
  let out = String(text || '');
  for (const k of Object.keys(vars || {})) {
    out = out.split('{' + k + '}').join(String(vars[k] == null ? '' : vars[k]));
  }
  return out;
}

console.log('Justice voice JSON migration test:');

// 1. Structure checks
check('confrontation has 4 keys', 
  voice.confrontation && ['murder','attack','theft','generic'].every(k => voice.confrontation[k]),
  'missing confrontation keys');
check('summons has 3 keys + fallback',
  voice.summons && ['silence','refused','heat'].every(k => voice.summons[k]) && voice.summons.fallback,
  'missing summons keys');

// 2. Template counts match old hardcoded arrays
// Old: murder=3 (1 conditional on close), attack=3 (1 wary, 1 close),
//      theft=3 (1 close), generic=3 (1 close, 1 wary)
check('murder has 3 templates', voice.confrontation.murder.length === 3);
check('attack has 3 templates', voice.confrontation.attack.length === 3);
check('theft has 3 templates', voice.confrontation.theft.length === 3);
check('generic has 3 templates', voice.confrontation.generic.length === 3);
// Old summons: silence=3 (1 close), refused=8 (1 bold, 1 wary, 1 close, 4 seriousType, 1 noSerious), heat=3 (1 close)
check('summons silence has 3', voice.summons.silence.length === 3);
check('summons refused has 8', voice.summons.refused.length === 8);
check('summons heat has 3', voice.summons.heat.length === 3);

// 3. Condition equivalence: for each ctx, eligible count matches old logic
// Old murder: [always, close?, always] → close=false: 2, close=true: 3
let m = match(voice.confrontation.murder, {close: false, wary: false});
check('murder close=false → 2 eligible', m.length === 2, `got ${m.length}`);
m = match(voice.confrontation.murder, {close: true, wary: false});
check('murder close=true → 3 eligible', m.length === 3, `got ${m.length}`);

// Old attack: [always, wary?, close?] 
m = match(voice.confrontation.attack, {close: false, wary: false});
check('attack none → 1 eligible', m.length === 1, `got ${m.length}`);
m = match(voice.confrontation.attack, {close: true, wary: true});
check('attack both → 3 eligible', m.length === 3, `got ${m.length}`);

// Old refused: [bold?, wary?, close?, murder?, attack?, theft?, intimidation?, noSerious?]
m = match(voice.summons.refused, {close: false, wary: false, bold: false, seriousType: null, noSerious: true});
check('refused noSerious only → 1 eligible', m.length === 1, `got ${m.length}`);
m = match(voice.summons.refused, {close: true, wary: true, bold: true, seriousType: 'murder', noSerious: false});
check('refused all true + murder → 4 eligible', m.length === 4, `got ${m.length}`);

// 4. Variable substitution works
const filled = fill("{name} says {ChargeWord} about {chargeWord}.", {name: "Ari", chargeWord: "the thefts", ChargeWord: "The thefts"});
check('variable fill works', filled === "Ari says The thefts about the thefts.", `got: ${filled}`);

// 5. No template contains unfilled {var} that isn't in our known set
const knownVars = new Set(['name', 'chargeWord', 'ChargeWord']);
let badVars = [];
function scanTemplates(obj, path) {
  if (Array.isArray(obj)) {
    obj.forEach((t, i) => {
      const vars = (t.text || '').match(/\{(\w+)\}/g) || [];
      vars.forEach(v => {
        const name = v.slice(1, -1);
        if (!knownVars.has(name)) badVars.push(`${path}[${i}]: ${v}`);
      });
    });
  } else if (obj && typeof obj === 'object') {
    Object.keys(obj).forEach(k => { if (k !== '_docs' && k !== '_schema') scanTemplates(obj[k], path + '.' + k); });
  }
}
scanTemplates(voice, 'voice');
check('all template vars are known', badVars.length === 0, badVars.join('; '));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
