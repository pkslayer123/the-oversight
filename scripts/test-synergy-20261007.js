#!/usr/bin/env node
// EMERGENT SYNERGY LEDGER proof (Steve 2026-10-05).
// Fleshes out progression.js: the emergent-resonance attempt ledger.
// Steve's design (2026-10-04): "Synergy discovery is earned through practice:
// logical, guessable activation conditions (e.g. abilities in succession on
// the same target), a few successful attempts required — no reward for
// one-off tries; attempts 1–2 reliably hint at what's possible without
// saying how."
//
// Node harness only (no jest this run): evals the FULL production script list
// from index.html in order (minus DOM-only app.js/sprites.js/tile-scenes.js/
// move-anim.js); window stubbed for the eval phase (equipment.js), then
// deleted before playing. Seeded PRNG for a deterministic proof.
//
// Played as a player: the script performs ability-use sequences the way the
// game itself logs them (noteAbilityUse is the game's own funnel for passive
// and activated uses), reads every hint/unlock line aloud, and judges whether
// it feels like DISCOVERY or a vending machine.
// Usage: node scripts/test-synergy-20261007.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;var t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
Math.random = mulberry32(Number(process.env.SEED || 20261007));
global.window = global; // stub for eval phase only (equipment.js needs window)
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
const FILES = [
  'src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
  'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
  'src/js/game.js', 'src/js/encounters.js', 'src/js/conversation.js', 'src/js/convo-mood.js',
  'src/js/convoTopics.js', 'src/js/convo-wants.js', 'src/js/convo-dialogue.js', 'src/js/convo-beats.js',
  'src/js/examine.js', 'src/js/equipment.js', 'src/js/journal.js', 'src/js/party.js',
  'src/js/party-formal.js', 'src/js/truth.js', 'src/js/contests.js', 'src/js/storage.js',
  'src/js/perceive.js', 'src/js/carexplore.js', 'src/js/justice.js', 'src/js/food.js',
  'src/js/betrayal.js', 'src/js/corpses.js', 'src/js/lifeseed.js', 'src/js/progression.js',
  'src/js/ledger.js', 'src/js/villager-agency.js', 'src/js/codex-people.js',
  'src/js/membership.js', 'src/js/hierarchy.js', 'src/js/debug-scenarios.js', 'src/js/build.js',
];
FILES.forEach(f => {
  try { eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); }
  catch (e) { console.error('EVAL FAIL ' + f + ': ' + e.message); process.exit(2); }
});
delete global.window; // sync path from here on
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log('FAIL ' + name + (extra ? ' — ' + extra : '')); }
}

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  try { Game.depart(); } catch (e) {}
  const sch = Game.state.scholar;
  const setDay = (n) => { sch.day = n; Game.state.village.day = n; }; // ledger mirrors game.js: village.day first
  setDay(10); Game.dayPart = 1;
  sch.kcal = 3000; sch.energy = 60; sch.health = 100;

  // grant the gifts the player will practice with
  const grant = (id) => {
    const def = (Game.data.abilities || []).find(a => a.id === id);
    sch.abilities = sch.abilities || [];
    if (!sch.abilities.some(a => a.id === id)) sch.abilities.push({ id, name: def ? def.name : id, level: 1, xp: 0 });
  };
  ['triage', 'adrenaline_control', 'camp_cook', 'steady_hands'].forEach(grant);

  const sayLog = [];
  const _say = Game.say.bind(Game);
  Game.say = function (m) { sayLog.push(String(m)); return _say(m); };
  const newSays = (from) => sayLog.slice(from);
  const ledger = () => Game.synLedger().cands;
  const use = (id, target) => Game.noteAbilityUse(id, target ? { target } : undefined);

  console.log('--- PLAYER READ: the full discovery arc (triage -> adrenaline_control) ---');

  // ACT 1: one-off try. A single pairing must hint but never unlock.
  let m0 = sayLog.length;
  use('steady_hands'); use('camp_cook');
  let says = newSays(m0);
  const key1 = 'seq:steady_hands>camp_cook';
  ok('one-off try creates a candidate', !!ledger()[key1]);
  ok('one-off try does not unlock', !Game.synLedger().emergent || Object.keys(Game.synLedger().emergent).length === 0);
  ok('one-off try fires a hint', says.length >= 1, 'says=' + says.length);
  const leakWords = ['steady_hands', 'Steady Hands', 'camp_cook', 'Camp Cook'];
  ok('hint 1 never names the recipe', !says.some(s => leakWords.some(w => s.includes(w))), says.join(' | ').slice(0, 200));
  console.log('  hint@1: "' + says[0] + '"');

  // ACT 2: dawn decay. The feeling fades; one-off tries evaporate.
  setDay(11); Game.progDaily();
  ok('dawn decay evaporates the one-off candidate', !ledger()[key1]);

  // ACT 3: wrong sequences decay honestly. Build run=2, then mash B.
  setDay(12);
  use('steady_hands'); use('camp_cook');   // run 1
  use('steady_hands'); use('camp_cook');   // run 2
  ok('two clean pairings reach run 2', ledger()[key1] && ledger()[key1].run === 2, 'run=' + (ledger()[key1]||{}).run);
  use('camp_cook'); // B without a fresh A — the rhythm broke
  ok('mashing B decays the run (2 -> 1)', ledger()[key1] && ledger()[key1].run === 1, 'run=' + (ledger()[key1]||{}).run);
  use('camp_cook'); // again
  ok('mashing B decays again (1 -> 0)', ledger()[key1] && ledger()[key1].run === 0);

  // ACT 4: the discovery arc. Five clean activations crystallize.
  setDay(13);
  const rkey = 'seq:triage>adrenaline_control';
  const hintTexts = [];
  const stages = [];
  for (let i = 1; i <= 5; i++) {
    const m = sayLog.length;
    use('triage'); use('adrenaline_control');
    const fresh = newSays(m);
    hintTexts.push({ run: i, texts: fresh });
    stages.push(ledger()[rkey] ? ledger()[rkey].hintStage : 'unlocked');
    if (i < 5) {
      const main = fresh.filter(t => !t.includes('ATTUNEMENT'));
      console.log(`  hint@${i}: "${main[main.length - 1] || '(none)'}"`);
    }
  }
  ok('hint escalation climbs 1-2-3-4 before unlock', JSON.stringify(stages) === JSON.stringify([1, 2, 3, 4, 'unlocked']), 'stages=' + JSON.stringify(stages));
  const unlockSays = hintTexts[4].texts.join('\n');
  ok('5th activation crystallizes the resonance', !!Game.synLedger().emergent['res_stabilize_fight'], 'emergent=' + Object.keys(Game.synLedger().emergent));
  ok('unlock names it STABILIZE THEN FIGHT ON', unlockSays.includes('Stabilize Then Fight On'));
  ok('unlock beat is System-voiced fiction', unlockSays.includes('SYSTEM:'));
  ok('candidate consumed on unlock', !ledger()[rkey]);
  console.log('  unlock:');
  hintTexts[4].texts.forEach(t => console.log('    ' + t.split('\n')[0]));

  // ACT 5: the resonance is mechanically real.
  Game.recomputeActiveSynergies();
  ok('resonance active while both gifts held', Game.activeEmergentIds().includes('res_stabilize_fight'));
  const mods = Game.synergyMods().filter(m => String(m.source).startsWith('emergent:'));
  ok('emergent modifiers ride the pipeline', mods.length === 2, 'mods=' + mods.length);
  ok('hasSynergy sees it', Game.hasSynergy('res_stabilize_fight'));
  // triage itself is x1.5 healing; the resonance adds x1.25 on top.
  const healedActive = Game.modTarget('healing.amount', 100);
  ok('healing.amount reflects the resonance (100 -> 187.5)', healedActive === 187.5, 'got ' + healedActive);

  // ACT 6: codex gating — if you don't know, it doesn't show.
  ok('emergentInfo null for the unknown', Game.emergentInfo('res_nope') === null);
  const info = Game.emergentInfo('res_stabilize_fight');
  ok('emergentInfo full after discovery', !!(info && info.name === 'Stabilize Then Fight On' && info.active));
  ok('codex entry written at unlock', !!((Game.state.codex || {}).synergies || {})['res_stabilize_fight']);

  // ACT 7: the 6-slot cap is the boss — unequip one gift, resonance dormants.
  // (strip from both lists: newGame may have granted it as a background gift,
  // and background gifts are always "held" — free, outside the slot cap.)
  sch.abilities = sch.abilities.filter(a => a.id !== 'adrenaline_control');
  sch.backgroundAbilities = (sch.backgroundAbilities || []).filter(a => (a.id || a) !== 'adrenaline_control');
  Game.recomputeActiveSynergies();
  ok('resonance dormant when a gift leaves the slots', !Game.activeEmergentIds().includes('res_stabilize_fight'));
  ok('hasSynergy false while dormant', !Game.hasSynergy('res_stabilize_fight'));
  ok('dormant resonance stops bending numbers (187.5 -> 150)', Game.modTarget('healing.amount', 100) === 150, 'got ' + Game.modTarget('healing.amount', 100));
  grant('adrenaline_control');
  Game.recomputeActiveSynergies();
  ok('resonance wakes when both gifts held again', Game.activeEmergentIds().includes('res_stabilize_fight'));

  // ACT 8: attunement — neural-creep evolution. Stage 2, L3 gift, 8 uses.
  Game.state.systemArrived = true;
  sch.integration = 45; // neural creep
  ok('integration stage is 2 (neural creep)', Game.integrationStage() === 2);
  const tri = sch.abilities.find(a => a.id === 'triage');
  tri.level = 3;
  const mA = sayLog.length;
  for (let i = 0; i < 8; i++) use('triage');
  const attSays = newSays(mA).join('\n');
  ok('8 uses at L3 reach flicker phase', Game.attunePhase('triage') === 1, 'phase=' + Game.attunePhase('triage'));
  ok('flicker plays a System-voice beat', attSays.includes('ATTUNEMENT') && attSays.includes('SYSTEM:'));
  const attFirst = newSays(mA).find(t => t.includes('ATTUNEMENT'));
  console.log('  attune: "' + (attFirst ? attFirst.split('\n')[0] : '(none)') + '"');
  // flicker protects pairs involving the attuned gift from dawn decay
  setDay(14);
  use('triage'); use('camp_cook'); // run 1 on seq:triage>camp_cook (involves attuned triage)
  const fkey = 'seq:triage>camp_cook';
  setDay(15); Game.progDaily();
  ok('flicker pair survives dawn decay (run stays 1)', ledger()[fkey] && ledger()[fkey].run === 1, 'run=' + (ledger()[fkey] || {}).run);

  // ACT 9: same-target pattern — both gifts on the same mark.
  setDay(16);
  const mT = sayLog.length;
  for (let i = 0; i < 5; i++) { use('triage', 'villager:bob'); use('camp_cook', 'villager:bob'); }
  const tgtSays = newSays(mT);
  const emKeys = Object.keys(Game.synLedger().emergent);
  const tgtId = emKeys.find(k => k.startsWith('res_camp_cook_triage') || k.startsWith('res_triage_camp_cook'));
  ok('same-target pattern crystallizes a generic resonance', !!tgtId, 'emergent=' + emKeys.join(','));
  if (tgtId) {
    const gi = Game.emergentInfo(tgtId);
    ok('generic resonance is System-named fiction', gi && gi.name.includes('×') && gi.flavor.length > 20, gi && gi.name);
    console.log('  generic unlock: "' + gi.name + '" — ' + gi.effect);
  }
  void tgtSays;

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS FAIL:', e); process.exit(2); });
