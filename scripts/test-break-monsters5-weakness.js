#!/usr/bin/env node
// BREAK-IT monsters run 5 (2026-10-09): counter-honesty proof.
// CATCH: 9 monster weakness lines promised counters with NO mechanic — the
// same lie class as the hushwolf "fire" fix (2026-10-08). Verified dead:
//   - bulldozer/gallowdeer "(HARRY ...)": no player HARRY verb exists
//     ('harry' is a villager-AI action type only — tbVillagerTurn).
//   - mirrormoth "overcast days dull the wings": weather rolls only
//     'clear'/'rain'/'cold' (game.js weather roll) — 'overcast' can never occur.
//   - hummice "cats (ordinary cats terrify them)": no cat item, animal
//     companion, or cat mechanic anywhere in code/data.
//   - voice_mimic_radio "fire scrambles it", nevermore "fire scatters it",
//     understudy "fire breaks its concentration": no player-applied fire/burn
//     path against monsters exists (torch has no combat effect; applyStatus
//     'burn' is never applied to monsters). The radio's REAL scramble is the
//     reveal (+50% exposed); nevermore's is the grounded window (+50%);
//     the understudy's is the desperate-improv arc.
//   - moderator "darkness - it cannot moderate what it cannot see": no
//     darkness mechanic on the moderator; the real counter is silence
//     (wait -> loses the thread -> mute lifts).
//   - belltoad "loud noises scatter the pack": overstated — SHOUT breaks the
//     chorus for one round (chorusBrokenUntil), the pack returns.
// FIX: copy-only rewrites in monsters.json (+ the radio's first-contact
// coaching line in game.js) so every line names a verified real mechanic.
// PROOF: static. (1) every OLD lie string is gone from the data;
// (2) every NEW string is present; (3) every new string's claimed mechanic
// has a code anchor; (4) generic guards so the lie class can't return
// (no HARRY player-verb, no overcast, no ordinary cats, no fire-counters).
// The "before" section feeds the OLD strings through the same validator to
// show the test catches them (HEAD fails, patched passes).
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const monsters = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/monsters.json'), 'utf8'));
const gameJs = fs.readFileSync(path.join(ROOT, 'src/js/game.js'), 'utf8');

let pass = 0, fail = 0;
const check = (name, cond) => {
  if (cond) { pass++; console.log('  ok -', name); }
  else { fail++; console.log('  FAIL -', name); }
};
const allWeaknesses = () => monsters.flatMap(m => (m.weaknesses || []).map(w => ({ id: m.id, w })));

// Mechanic anchors: each rewritten counter must point at something real.
const ANCHORS = {
  boarWinded: /boarWinded[\s\S]{0,120}1\.5|winded x1\.5/i,
  disrupt: /DISRUPT: a solid hit while it's channeling/,
  mothRecover: /The moth shivers its wings — dull, lightless/,
  shoutChorus: /chorusBrokenUntil/,
  radioReveal: /The signal scrambles — exposed, it takes the hit badly/,
  nevermoreGrounded: /Wings tangled in the dirt/,
  understudyImprov: /DESPERATE IMPROV/,
  modLift: /The mute LIFTS/,
};

const FIXES = [
  { id: 'bulldozer', old: 'soft flanks (HARRY then STRIKE)',
    nw: 'dodge the charge - it ends winded, flanks soft; STRIKE then', anchor: 'boarWinded' },
  { id: 'gallowdeer', old: 'interrupt the freeze (HARRY)',
    nw: 'a solid strike while the beam burns can break its aim', anchor: 'disrupt' },
  { id: 'mirrormoth', old: 'overcast days dull the wings',
    nw: 'after the flash the wings hang dull and lightless - strike while it recovers', anchor: 'mothRecover' },
  { id: 'belltoad', old: 'deafened by its own chorus (loud noises scatter the pack)',
    nw: 'deafened by its own chorus - SHOUT breaks it for a round', anchor: 'shoutChorus' },
  { id: 'hummice', old: 'cats (ordinary cats terrify them)',
    nw: 'loud noise breaks the chorus - SHOUT scatters the swarm for a round', anchor: 'shoutChorus' },
  { id: 'voice_mimic_radio', old: 'fire scrambles it',
    nw: 'resist the crying - exposed, the signal scrambles; strike then', anchor: 'radioReveal' },
  { id: 'understudy', old: 'fire breaks its concentration',
    nw: 'below 30% it panics and chains everything it learned - end it clean', anchor: 'understudyImprov' },
  { id: 'moderator', old: 'darkness — it cannot moderate what it cannot see',
    nw: 'silence is a verb it cannot moderate - go quiet and it loses the thread', anchor: 'modLift' },
  { id: 'nevermore', old: 'fire scatters it',
    nw: 'it always lands after a strafing run - strike it grounded', anchor: 'nevermoreGrounded' },
];

console.log('== AFTER (patched tree) ==');
for (const f of FIXES) {
  const m = monsters.find(x => x.id === f.id);
  const ws = (m && m.weaknesses) || [];
  check(`${f.id}: old lie gone`, !ws.some(w => w.includes(f.old)));
  check(`${f.id}: new copy present`, ws.some(w => w === f.nw));
  check(`${f.id}: mechanic anchor real (${f.anchor})`, ANCHORS[f.anchor].test(gameJs));
}
// radio coaching line (game.js first-contact) also lied
check('voice_mimic coaching: "Fire scrambles the signal." gone',
  !gameJs.includes('Fire scrambles the signal.'));
check('voice_mimic coaching: honest reveal line present',
  gameJs.includes("The signal scrambles once it\\'s exposed"));

// Generic guards: the lie class can't return under new wording.
const LIE_TOKENS = [/\bHARRY\b/, /overcast/i, /ordinary cats/i,
  /fire scrambles it/, /fire scatters it/, /fire breaks its concentration/,
  /cannot moderate what it cannot see/, /loud noises scatter the pack/,
  /fire scrambles the signal/i, /fire scrambles the broadcast/i];
for (const t of LIE_TOKENS) {
  const hit = allWeaknesses().find(x => t.test(x.w));
  check(`no weakness matches ${t}`, !hit);
}
// Sibling sweep: codex earned-knowledge texts must not carry the same lies.
const codexTexts = () => monsters.flatMap(m => {
  const out = [];
  const cs = m.codexStages || {};
  for (const k of Object.keys(cs)) out.push({ id: m.id, where: 'codexStages.' + k, t: cs[k] });
  const enc = m.encounter || {};
  if (enc.knownTactics) out.push({ id: m.id, where: 'encounter.knownTactics', t: enc.knownTactics });
  return out;
});
for (const t of LIE_TOKENS) {
  const hit = codexTexts().find(x => t.test(x.t || ''));
  check(`no codex text matches ${t}${hit ? ' (' + hit.id + ' ' + hit.where + ')' : ''}`, !hit);
}
// SHOUT is a real player verb (the new lines lean on it).
check('tbPlayerShout exists (SHOUT is a real verb)', /tbPlayerShout\(\)/.test(gameJs));

console.log('== BEFORE (old strings through the same validator) ==');
for (const f of FIXES) {
  // the old string must trip at least one lie-token guard
  const trips = LIE_TOKENS.some(t => t.test(f.old)) || f.old.includes('HARRY');
  check(`old "${f.old.slice(0, 44)}..." would be caught`, trips);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
