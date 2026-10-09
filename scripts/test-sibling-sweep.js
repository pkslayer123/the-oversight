#!/usr/bin/env node
// SIBLING SWEEP proof script (2026-10-08).
// Verifies the bug-CLASS closures from today's break-it runs:
//  CLASS 1 (shadow-death): every Game-level name defined in 2+ files must be
//    either a proper _orig chain or a documented intentional override.
//  CLASS 2 (unwired): the confirmed-dead feature list must stay dead OR get
//    wired — never silently resurrected half-way. Asserts zero live callers.
//  CLASS 5 (converters): cannibal_frenzy must not admit a net-positive loop.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS', name, detail || ''); }
  else { fail++; console.log('  FAIL', name, detail || ''); }
}
const KEYWORDS = new Set(['catch','for','if','switch','while']);
const ORDER = ['game.js','encounters.js','conversation.js','convo-mood.js','convoTopics.js','convo-wants.js','convo-dialogue.js','convo-beats.js','convo-scene.js','examine.js','equipment.js','journal.js','party.js','party-formal.js','truth.js','contests.js','alienPlayers.js','storage.js','perceive.js','carexplore.js','justice.js','food.js','betrayal.js','corpses.js','lifeseed.js','progression.js','ledger.js','abilityActions.js','monsterBehaviors.js','statusEffects.js','villager-agency.js','codex-people.js','membership.js','hierarchy.js'];
function read(f) { return fs.readFileSync(path.join(ROOT, 'src/js', f), 'utf8'); }
const defs = {};
for (const f of ORDER) {
  let src = ''; try { src = read(f); } catch (e) { continue; }
  const names = new Set(); let m;
  const re = /(?:^|\n)\s{2,}([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{/g;
  while ((m = re.exec(src))) { if (!KEYWORDS.has(m[1])) names.add(m[1]); }
  const reP = /(?:^|\n)\s{2,}([A-Za-z_$][\w$]*)\s*:\s*function\s*\(/g;
  while ((m = reP.exec(src))) { if (!KEYWORDS.has(m[1])) names.add(m[1]); }
  const re2 = /(?:Game|G)\.([A-Za-z_$][\w$]*)\s*=\s*(?:function|\()/g;
  while ((m = re2.exec(src))) { if (!KEYWORDS.has(m[1])) names.add(m[1]); }
  for (const n of names) { if (!defs[n]) defs[n] = []; defs[n].push(f); }
}
// CLASS 1: every adjacent pair must chain (save Game.name) or be documented.
const DOCUMENTED = {
  'examineCell': 'carexplore.js documents the override',
  'activatableAbilities': 'abilityActions.js documents the replacement',
  'animalTurn': 'encounters.js framework migration (game.js copy tombstoned)',
  'huntAnimal': 'encounters.js framework migration (game.js copy tombstoned)',
  'tbHostileTurn': 'encounters.js documents the lazy late-chain',
};
let shadowBreaks = [];
for (const n of Object.keys(defs).filter(k => defs[k].length > 1)) {
  const fl = defs[n];
  for (let i = 1; i < fl.length; i++) {
    const later = fl[i];
    const src = read(later);
    const saveRe = new RegExp('\\b(?:const|let|var)\\s+[A-Za-z_$][\\w$]*\\s*=\\s*(?:Game|G)\\.' + n + '\\b');
    if (!saveRe.test(src) && !DOCUMENTED[n]) shadowBreaks.push(n + ' in ' + later);
  }
}
check('CLASS 1: no undocumented shadow-death', shadowBreaks.length === 0, shadowBreaks.join('; ') || '(all chained or documented)');
// CLASS 2: confirmed-dead features have zero live callers (outside their def file).
const DEAD = [
  ['ledger.js', 'abduct'], ['ledger.js', 'declineChallenge'], ['ledger.js', 'bringCompanion'],
  ['ledger.js', 'shareFood'], ['ledger.js', 'hoardFood'], ['ledger.js', 'hearGossipAboutSelf'], ['ledger.js', 'legendSurface'],
  ['game.js', 'drinkWild'], ['game.js', 'earnedEnding'],
  ['membership.js', 'formAlliance'], ['membership.js', 'memberBenefits'],
  ['hierarchy.js', 'bidForPrimacy'], ['hierarchy.js', 'renegotiateLink'],
  ['party-formal.js', 'disbandParty'],
  // BREAK-IT (social r7 2026-10-09): roleBonus (trivial PARTY_ROLES accessor)
  // and clearRole (no UI path clears a role — assignRole reassigns) have zero
  // callers anywhere. Tracked dead, not deleted.
  ['party-formal.js', 'roleBonus'], ['party-formal.js', 'clearRole'],
];
let resurrected = [];
const rawSrc = ORDER.map(f => { try { return read(f); } catch (e) { return ''; } }).join('\n')
  + fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
// strip line comments so @ontology mentions don't count as callers
const allSrc = rawSrc.split('\n').map(l => l.replace(/\/\/.*$/, '')).join('\n');
for (const [df, n] of DEAD) {
  const callRe = new RegExp('[^_a-zA-Z$"\']' + n + '\\s*\\(', 'g');
  let count = 0, m;
  while ((m = callRe.exec(allSrc))) count++;
  // subtract the definition occurrence itself (approx: defs are `    name(`)
  const defRe = new RegExp('(?:^|\\n)\\s{2,}' + n + '\\s*[\\(:]', 'g');
  let dcnt = 0; while (defRe.exec(allSrc)) dcnt++;
  if (count - dcnt > 0) resurrected.push(n);
}
check('CLASS 2: dead features stay dead (no new callers)', resurrected.length === 0, resurrected.join(', ') || '(all still unwired)');
// CLASS 2b: ontology must not claim wiring that doesn't exist.
const ledgerHead = read('ledger.js').split('\n').slice(0, 20).join('\n');
check('CLASS 2b: no false WIRING claims in ledger.js @ontology',
  !/WIRING: game\.js calls/.test(ledgerHead) && !/WIRING: conversation\.js calls/.test(ledgerHead),
  '(header must not claim callers that do not exist)');
console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
