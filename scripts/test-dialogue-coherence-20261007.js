#!/usr/bin/env node
// Dialogue coherence rethink — proof script (Steve 2026-10-07).
// Concrete, player-facing coherence breaks in the conversation system,
// each demonstrated as a PASS/FAIL assertion. Seeded PRNG (mulberry32,
// default seed 20261007, SEED env override) for determinism.
//
// Runs against a repo root: DLG_ROOT env override selects the tree
// (used to verify scratch-patched extracts); default is this repo.
// Usage:
//   node scripts/test-dialogue-coherence-20261007.js
//   DLG_ROOT=/tmp/head-dlg node scripts/test-dialogue-coherence-20261007.js
//   SEED=42 DLG_ROOT=/tmp/head-dlg-patched node scripts/test-dialogue-coherence-20261007.js
//
// Breaks covered:
//   1. Speech DNA dead — lifeseedVoice() undefined, all NPCs share one voice signature
//   2. Want system dead on the dialogue path (dlg: early-return bypasses convo-wants)
//   3. Phantom seeds — never-surfaced wants plant seeds; next convo references
//      unfinished business the player never heard, with mangled quotes
//   4. Loved-name re-roll — "June" becomes "Silas" between conversations
//   5. Broken "A" reference — unnamed villagers render as bare "A" in others-talk
//   6. convoComposeBeat drops the closing quote
//   7. dlg:react infinite "Anyway." loop on dry threads
//   8. Recap verb unreachable (no menu insertion)
//   9. Goon continuer missing from the dialogue-path menu (held beats die unspoken)
//  10. Monster naming debate has no dialogue surface (gated names never spoken)
const fs = require('fs');
const path = require('path');
const ROOT = process.env.DLG_ROOT || path.join(__dirname, '..');
const SEED = parseInt(process.env.SEED || '20261007', 10);

// Seeded PRNG — deterministic proof.
let _s = SEED >>> 0;
Math.random = function () {
  _s |= 0; _s = (_s + 0x6D2B79F5) | 0;
  let t = Math.imul(_s ^ (_s >>> 15), 1 | _s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

global.fetch = (f) => Promise.resolve({
  json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8')))
});
global.window = global; // stub for eval phase only
const files = [
  'src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
  'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
  'src/js/game.js', 'src/js/encounters.js', 'src/js/conversation.js',
  'src/js/convo-mood.js', 'src/js/convoTopics.js', 'src/js/convo-wants.js',
  'src/js/convo-dialogue.js', 'src/js/convo-beats.js',
  'src/js/examine.js', 'src/js/equipment.js', 'src/js/journal.js',
  'src/js/party.js', 'src/js/party-formal.js', 'src/js/truth.js',
  'src/js/contests.js', 'src/js/storage.js', 'src/js/perceive.js',
  'src/js/carexplore.js', 'src/js/justice.js', 'src/js/food.js',
  'src/js/betrayal.js', 'src/js/corpses.js', 'src/js/lifeseed.js',
  'src/js/progression.js', 'src/js/ledger.js', 'src/js/villager-agency.js',
  'src/js/codex-people.js', 'src/js/membership.js', 'src/js/hierarchy.js',
  'src/js/debug-scenarios.js', 'src/js/build.js',
];
for (const f of files) { eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); }
delete global.window; // sync headless path from here on
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log(`PASS: ${name}`); }
  else { fail++; console.log(`FAIL: ${name}` + (extra ? ` — ${extra}` : '')); }
}
const show = (x, n) => String(x == null ? '' : x).slice(0, n || 120);
const quotesBalanced = (s) => (String(s).match(/"/g) || []).length % 2 === 0;

async function main() {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const npcs = (Game.state.village.roster || []).filter(id => id !== Game.villagerId);
  console.log(`=== Dialogue Coherence Rethink Proof (seed ${SEED}, root ${ROOT}) ===`);
  console.log(`NPCs: ${npcs.length}\n`);

  // ---- 1. Voice signatures must differ across the roster ----
  console.log('--- 1. voice signature diversity ---');
  const sigs = new Set();
  for (const vid of npcs) {
    try { sigs.add(Game.convoVoiceSig(vid)); } catch (e) {}
  }
  console.log(`  distinct signatures: ${sigs.size} of ${npcs.length}`);
  ok('lifeseedVoice is defined', typeof Game.lifeseedVoice === 'function',
    `typeof=${typeof Game.lifeseedVoice}`);
  ok('>=6 distinct voice signatures across roster', sigs.size >= 6,
    `only ${sigs.size} distinct`);

  // ---- 2. Want surfaces on the dialogue path ----
  console.log('\n--- 2. want surfaces on dlg: path ---');
  const v2 = npcs[0];
  let cur = Game.startConvo(v2);
  const w0 = Game.convoGet(v2).want;
  console.log(`  want selected: ${w0 ? w0.id : 'none'}`);
  // Play dlg: turns only — the break is dialogue-path-specific (the base
  // path's wants wrapper always ran; the dlg: early-return bypassed it).
  // Skip the arc-advancing choices (dlg:help sets stage directly in its
  // handler) so this tests the surfacing mechanism, not the arc.
  let dlgTurns = 0;
  for (let i = 0; i < 4; i++) {
    const chs = (cur && cur.choices) || [];
    const pick = chs.find(c => /^dlg:(more|react|comfort|empathize|details)$/.test(c.id || ''));
    if (!pick) break;
    dlgTurns++;
    try { cur = Game.convoTurn(v2, pick.id); } catch (e) { break; }
    if (!cur || cur.ended) break;
  }
  const w1 = Game.convoGet(v2).want;
  console.log(`  dlg: turns played: ${dlgTurns}, want stage: ${w1 ? w1.stage : 'none'}`);
  ok('want surfaces on the dialogue path (stage>=1)',
    dlgTurns > 0 && !!(w1 && w1.stage >= 1),
    dlgTurns === 0 ? 'setup: no dlg: turns playable on this seed' : `stage=${w1 && w1.stage}`);
  ok('Game.convoWant accessor exists', typeof Game.convoWant === 'function');
  try { Game.endConvo(v2); } catch (e) {}

  // ---- 3. No phantom seeds for never-surfaced wants ----
  console.log('\n--- 3. phantom seeds ---');
  const v3 = npcs[1];
  // Find a real seed-planting want def via the live selector.
  let planter = null;
  for (const vid of npcs) {
    try {
      const w = Game.convoSelectWant(vid);
      if (w && ['ask_favor', 'seek_comfort', 'share_news'].includes(w.id) && w.def) { planter = w; break; }
    } catch (e) {}
  }
  if (!planter) {
    ok('phantom-seed setup (found seed-planting want)', false, 'no planter want selected');
  } else {
    cur = Game.startConvo(v3);
    const c3 = Game.convoGet(v3);
    c3.want = { id: planter.id, def: planter.def, stage: 0, fromSeed: false }; // never surfaced
    Game.endConvo(v3, 'left');
    const seed = (Game.state.village.convoSeeds || {})[v3];
    console.log(`  want=${planter.id} stage 0 -> seed: ${seed ? JSON.stringify(seed.note) : 'none'}`);
    ok('no seed planted for a want that never surfaced', !seed,
      seed ? `phantom: "${seed.note}"` : '');
  }
  // Seed opener quote hygiene (direct plant -> fromSeed open).
  const v3b = npcs[2];
  Game.convoPlantSeed(v3b, { wantId: 'share_news', note: 'that news they were bursting to share' });
  cur = Game.startConvo(v3b);
  const seedLine = show(cur && cur.line, 200);
  console.log(`  seed opener: ${seedLine}`);
  ok('seed opener has balanced quotes', quotesBalanced(cur && cur.line),
    seedLine);
  try { Game.endConvo(v3b); } catch (e) {}

  // ---- 4. Loved-name stability ----
  console.log('\n--- 4. loved-name stability ---');
  const v4 = npcs[3];
  Game.state.village.trust[v4] = 65;
  Game.startConvo(v4);
  const names = [];
  for (let i = 0; i < 4; i++) {
    const c = Game.convoGet(v4);
    c.said = {}; c.askedTopics = []; c.thread = 'small';
    const line = Game.topic2Ask(v4, 'loved');
    const m = String(line).match(/name was ([A-Z][a-z]+)/);
    if (m) names.push(m[1]);
  }
  Game.endConvo(v4);
  console.log(`  loved names across asks: ${JSON.stringify(names)}`);
  const recorded = Game.convoFactRecalled(v4, 'loved:name');
  console.log(`  recorded loved:name: ${JSON.stringify(recorded)}`);
  ok('loved name recorded and stable across asks',
    !!(recorded && names.length >= 1 && names.every(n => n === recorded)),
    `names=${JSON.stringify(names)} recorded=${JSON.stringify(recorded)}`);

  // ---- 5. No bare "A" reference for unnamed villagers ----
  // Deterministic: force one NPC unnamed (knowledge-gated displayName) and
  // render directly through the generation function — no convo in between,
  // so the intro name-reveal can't close the gap first.
  console.log('\n--- 5. others-talk reference ---');
  const v5 = npcs[4];
  const unnamed = npcs[0];
  try { delete ((Game.state.village || {}).knownNames || {})[unnamed]; } catch (e) {}
  const dispUnnamed = Game.displayName(unnamed);
  const stillGated = !Game.nameKnown(unnamed);
  console.log(`  forced unnamed: ${unnamed} -> ${show(dispUnnamed, 40)} (gated=${stillGated})`);
  if (!stillGated) {
    ok('others-talk setup (unnamed villager present)', false, `displayName=${show(dispUnnamed, 40)}`);
  } else {
    const origPick = Game.t2pickOther;
    Game.t2pickOther = () => ({ id: unnamed, why: 'neutral' });
    let sampleLine = '', badRef = null;
    try {
      const cands = Game.t2gen_others(v5) || [];
      sampleLine = String(cands[0] || '');
      if (/"A[? ]/.test(sampleLine)) badRef = show(sampleLine, 90);
    } finally {
      Game.t2pickOther = origPick;
    }
    console.log(`  others line: ${show(sampleLine, 100)}`);
    ok('no bare "A" reference in others-talk', !badRef, badRef || '');
  }

  // ---- 6. convoComposeBeat quote hygiene ----
  console.log('\n--- 6. convoComposeBeat quotes ---');
  const v6 = npcs[5];
  Game.startConvo(v6);
  const composed = Game.convoComposeBeat(v6, '"I was a blacksmith, back when that meant something."',
    { label: 'ask:past', topic: 'past', isAnswer: false });
  Game.endConvo(v6);
  console.log(`  composed: ${show(composed, 130)}`);
  ok('composed beat keeps its closing quote', /"$/.test(String(composed).trim()),
    show(composed, 100));

  // ---- 7. dlg:react winds down on dry threads ----
  // Deterministic: find a dialogue-path NPC, put the thread in the dry
  // state the dlg:more handler produces, then play one REAL dry react
  // through the handler and inspect the menu.
  console.log('\n--- 7. dlg:react wind-down ---');
  let v7 = null;
  for (const vid of npcs) {
    const o = Game.startConvo(vid);
    const ids = ((o && o.choices) || []).map(c => c.id);
    if (ids.includes('dlg:more') && ids.includes('dlg:react')) { v7 = vid; break; }
    try { Game.endConvo(vid); } catch (e) {}
  }
  if (!v7) {
    ok('react setup (dialogue-path NPC)', false, 'none found');
  } else {
    const c7 = Game.convoGet(v7);
    c7.threadDryFor = c7.thread || 'small'; // dry-thread state, as dlg:more leaves it
    Game.convoTurn(v7, 'dlg:react'); // one real dry react through the handler
    const dryCount = Game.convoGet(v7).reactDryCount || 0;
    console.log(`  reactDryCount after one dry react: ${dryCount}`);
    ok('dry reacts are counted', dryCount >= 1, `reactDryCount=${dryCount}`);
    Game.convoGet(v7).reactDryCount = 2; // as after two dry reacts
    const chsAfter = Game.convoChoices(v7) || [];
    const stillThere = chsAfter.some(c => c.id === 'dlg:react');
    console.log(`  dlg:react in menu after dry x2: ${stillThere}`);
    ok('dlg:react winds down on a dry thread', !stillThere,
      'still offered: ' + chsAfter.map(c => c.id).join(','));
    try { Game.endConvo(v7); } catch (e) {}
  }

  // ---- 8. Recap reachable ----
  console.log('\n--- 8. recap verb ---');
  // Find an NPC on the dialogue path (base menu is the sibling's lane;
  // this patch covers the live dialogue menu).
  let v8 = null, cur8 = null;
  for (const vid of npcs) {
    const o = Game.startConvo(vid);
    const ids = ((o && o.choices) || []).map(c => c.id);
    if (ids.some(id => /^dlg:/.test(id || ''))) { v8 = vid; cur8 = o; break; }
    try { Game.endConvo(vid); } catch (e) {}
  }
  if (!v8) { ok('recap setup (dialogue-path NPC)', false, 'none found'); }
  else {
    cur = cur8;
    try {
      Game.convoNoteBeat(v8, 'past', '"I grew up by the water."');
      Game.convoNoteBeat(v8, 'goal', '"I want to fix the filter."');
    } catch (e) {}
  let chs = Game.convoChoices(v8) || [];
  const hasRecap = chs.some(c => c.id === 'recap');
  console.log(`  recap in menu: ${hasRecap} (choices: ${chs.map(c => c.id).join(',')})`);
  ok('recap choice appears on long threads', hasRecap);
  if (hasRecap) {
    const r = Game.convoTurn(v8, 'recap');
    console.log(`  recap line: ${show(r && r.line, 110)}`);
    ok('recap turn returns a re-anchor line', !!(r && r.line && /started on|talking about|were talking/i.test(String(r.line))),
      show(r && r.line, 80));
  }
  try { Game.endConvo(v8); } catch (e) {}
  } // end else (dialogue-path NPC found)

  // ---- 9. Goon continuer on dialogue path ----
  console.log('\n--- 9. goon continuer ---');
  const v9 = npcs[8];
  cur = Game.startConvo(v9);
  Game.convoGet(v9).heldBeats.push({ text: '"A queued beat that should surface."' });
  const chs9 = Game.convoChoices(v9) || [];
  const onDlgPath = chs9.some(c => /^dlg:/.test(c.id || ''));
  const hasGoon = chs9.some(c => c.id === 'goon');
  console.log(`  dialogue path: ${onDlgPath}, goon in menu: ${hasGoon}`);
  ok('goon continuer offered when beats are held', onDlgPath && hasGoon,
    !onDlgPath ? 'setup: not on dialogue path this seed' : 'goon missing from dialogue menu');
  try { Game.endConvo(v9); } catch (e) {}

  // ---- 10. Monster naming debate surfaces in dialogue (gated) ----
  console.log('\n--- 10. monster naming in dialogue ---');
  const mdefs = Game.data.monsters || [];
  if (!mdefs.length) {
    ok('monster naming setup', false, 'no monster defs');
  } else {
    const mid = mdefs[0].id;
    const trueName = mdefs[0].name;
    Game.ensureMonsterEntry(mid);
    Game.seedMonsterNames(mid);
    Game.ensureMonsterEntry(mid).namingKicked = true; // debate is live, no agreed name yet
    const v10 = npcs[9];
    let evKind = null, latelyLine = null;
    try {
      const ev = Game.t2LatelyEvent(v10);
      evKind = ev && ev.kind;
      if (evKind === 'naming') {
        const c = Game.convoGet(v10);
        latelyLine = String(Game.t2gen_lately(v10)[0] || '');
      }
    } catch (e) { console.log('  naming probe error: ' + e.message); }
    console.log(`  lately event kind: ${evKind}`);
    console.log(`  lately line: ${show(latelyLine, 150)}`);
    ok('naming debate surfaces as a lately event', evKind === 'naming', `got ${evKind}`);
    ok('naming line never leaks the true name',
      !!(latelyLine && latelyLine.indexOf(trueName) === -1), show(latelyLine, 80));
    ok('naming line carries a villager proposal',
      !!(latelyLine && /'[^']+'/.test(latelyLine)), show(latelyLine, 80));
  }

  console.log(`\n=== Results: ${pass} pass, ${fail} fail ===`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
