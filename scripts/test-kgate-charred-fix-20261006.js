// ============================================================================
// KNOWLEDGE-GATING: charred-kill carcass leak — fix proof + related checks.
// 2026-10-06 (flesh-out loop worker). READ-ONLY on game files.
//
// L1 (as audited): the beam-weapon charred branch of huntAnimal() pushed
// foodCarcass() — which bakes animal.name raw — WITHOUT calling
// encIdentifyAnimal first. Pack would show "American Woodcock (charred
// remains)" while encAnimalKnown() === false.
//
// RESOLUTION: game.js's huntAnimal() is SHADOWED DEAD CODE — the encounters.js
// wrapper (G.huntAnimal = ..., _wrapped=true, encounters.js:1575, loads after
// game.js in index.html) is the LIVE path, and it ALREADY calls
// encIdentifyAnimal(a.id) at the kill, BEFORE the charsMeat split
// (encounters.js:1785-1799). Sibling commit 00ed4c8 ("Hunter playtest:
// charred-kill leak investigation") verified this end-to-end and made no
// game-code change; independently re-verified here on the current tree. A
// defense-in-depth edit to the dead game.js branch was applied, then REVERTED
// as unnecessary — the branch is left unmodified by design. PART 2 proves the
// LIVE wrapper path end-to-end with a real save, real data, real RNG-forced
// catch (no game-internal mocks).
//
// Also: C = unnamed-monster possessive (encDamageSource) verification;
//       D = day-12 system_task quest display REPRO (reported, NOT fixed here).
// Run: node scripts/test-kgate-charred-fix-20261006.js
// ============================================================================
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
// NODE HARNESS (AGENTS.md 2026-10-06): eval the FULL src/js list in index.html
// order, minus DOM-only app.js/sprites.js/tile-scenes.js/move-anim.js.
// equipment.js/build.js need `window` at load — stub it, then DELETE it before
// playing so tbAfterPlayerAction takes the sync path (not tbAdvanceAsync).
global.window = global;
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/conversation.js',
 'src/js/convo-mood.js', 'src/js/convoTopics.js', 'src/js/convo-wants.js',
 'src/js/convo-dialogue.js', 'src/js/convo-beats.js', 'src/js/examine.js',
 'src/js/equipment.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/party-formal.js', 'src/js/truth.js', 'src/js/contests.js',
 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js',
 'src/js/justice.js', 'src/js/food.js', 'src/js/betrayal.js', 'src/js/corpses.js',
 'src/js/lifeseed.js', 'src/js/progression.js', 'src/js/ledger.js',
 'src/js/villager-agency.js', 'src/js/codex-people.js', 'src/js/membership.js',
 'src/js/hierarchy.js', 'src/js/debug-scenarios.js', 'src/js/build.js'
].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
delete global.window;
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond, note) {
  if (cond) { pass++; console.log(`ok   ${name}`); }
  else { fail++; console.log(`FAIL ${name}${note ? ' — ' + note : ''}`); }
}

(async () => {
  await Game.init();
  const said = [];
  const origSay = Game.say;
  Game.say = function (t) { said.push(String(t)); return origSay.call(this, t); };
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  said.length = 0;
  Game.depart();

  const S = Game.state.scholar;
  const WC = 'american_woodcock';
  const wcDef = Game.data.animals.find(a => a.id === WC);
  ok('setup: american_woodcock exists in real data', !!wcDef);
  // fresh codex: woodcock is hard/camouflaged, not auto-known (audit C2)
  Game.state.codex.animalEncounters = Game.state.codex.animalEncounters || {};
  delete Game.state.codex.animalEncounters[WC];
  ok('setup: woodcock unknown to fresh codex', Game.encAnimalKnown(WC) === false,
    `encAnimalKnown=${Game.encAnimalKnown(WC)}`);
  ok('setup: live huntAnimal is the encounters.js wrapper (game.js branch shadowed)',
    Game.huntAnimal && Game.huntAnimal._wrapped === true);

  // ---- PART 1: the OLD branch behavior, replayed verbatim (no identify) ----
  // This is what an un-fixed charred branch does: push the carcass, say the
  // (clean) message, never teach. It MUST leak — documenting the open hole.
  const stale = Game.foodCarcass(wcDef, 50, S.day, 'charred');
  S.inventory.push(stale);
  Game.state.codex.animalEncounters[WC] = (Game.state.codex.animalEncounters[WC] || 0) + 1;
  const staleKnown = Game.encAnimalKnown(WC);
  const staleName = String(Game.itemDisplayName(stale));
  ok('PART1(doc): without identify, the charred carcass carries the TRUE species name',
    staleKnown === false && /woodcock/i.test(staleName),
    `pack="${staleName}" known=${staleKnown} — the leak an un-fixed branch has`);
  S.inventory.splice(S.inventory.indexOf(stale), 1);
  delete Game.state.codex.animalEncounters[WC];

  // ---- PART 2: the LIVE huntAnimal() charred path, end to end ----
  // Real save, real searcaster (charsMeat), real calm animal target at dist 2
  // (in range, no bite), RNG forced so the strike does not bolt (aware=0 ->
  // fleeP=0) and the kill roll succeeds. No game-internal mocks.
  S.equipped = { weapon: { itemId: 'searcaster' } };
  const px = S.mx ?? 4, py = S.my ?? 4;
  S.animal = { id: WC, mx: px + 2, my: py, aware: 0, stamina: 2, pstate: 'graze', edgeTurns: 0 };
  said.length = 0;
  const realRandom = Math.random;
  Math.random = () => 0.0; // fleeP=0 -> no bolt; kill roll 0.0 < chance -> kill
  let huntRet = null;
  try { huntRet = Game.huntAnimal(); } finally { Math.random = realRandom; }
  ok('PART2: live huntAnimal() killed via the charred branch',
    huntRet === true && S.animal === null, `returned ${huntRet}, s.animal=${JSON.stringify(S.animal)}`);
  const charred = S.inventory.find(i => i.charred && i.plantId === 'meat_' + WC);
  ok('PART2: a charred carcass landed in the pack', !!charred);
  const knownAfter = Game.encAnimalKnown(WC);
  ok('PART2: the kill TAUGHT the species before the carcass (identify-before-name)',
    knownAfter === true, `encAnimalKnown=${knownAfter}`);
  const killLine = said.join(' ');
  ok('PART2: the kill message itself names nothing',
    /beam takes it apart/i.test(killLine) && !/woodcock/i.test(killLine),
    `said: "${killLine.slice(0, 160)}"`);
  const fixedName = charred ? String(Game.itemDisplayName(charred)) : '';
  ok('PART2: carcass shows the true name only because it is now KNOWN (earned, not leaked)',
    !!charred && knownAfter === true && /woodcock/i.test(fixedName),
    `pack="${fixedName}" known=${knownAfter}`);
  // source-level: the game.js charred branch is INTENTIONALLY unmodified —
  // it is shadowed dead code (live path = the encounters.js wrapper, which
  // identifies at the kill). Sibling 00ed4c8 verified this and made no
  // game-code change; a defense-in-depth edit here was applied then reverted
  // as unnecessary.
  const gsrc = fs.readFileSync(path.join(ROOT, 'src/js/game.js'), 'utf8');
  const cb0 = gsrc.indexOf('if (charsMeat) {');
  const cb1 = gsrc.indexOf('} else {', cb0);
  ok('PART2: game.js charred branch left unmodified by design (dead code — live path is the wrapper)',
    !/encIdentifyAnimal/.test(gsrc.slice(cb0, cb1)),
    'unexpected identify call in the shadowed game.js branch');
  // ... and the LIVE wrapper already identified before the charsMeat split
  const esrc = fs.readFileSync(path.join(ROOT, 'src/js/encounters.js'), 'utf8');
  const idPos = esrc.indexOf('this.encIdentifyAnimal(a.id); // a kill teaches you what it was');
  const splitPos = esrc.indexOf('if (charsMeat) {', idPos);
  ok('PART2: live wrapper identifies at the kill BEFORE the charsMeat split (was already closed)',
    idPos !== -1 && splitPos !== -1 && idPos < splitPos);

  // ---- PART 3 (task C): unnamed-monster possessive composition ----
  // The old bug: "something huge, rooting in the underbrush's the attack hits
  // you". encDamageSource must stay dread for the unknown, possessive for named.
  const bdef = Game.data.monsters.find(m => m.id === 'bulldozer');
  ok('PART3: bulldozer def present', !!bdef);
  const mUnknown = { name: bdef.unknown, mdef: bdef };
  const dread = Game.encDamageSource(mUnknown, null);
  ok('PART3: unnamed attacker gets NO descriptor possessive',
    !/'s\b/.test(dread) && /^The attack/.test(dread),
    `got "${dread}"`);
  // named path: village names it, pattern learned -> grammatical possessive.
  // (encShortLabel gives the designed strike-line short name "boar".)
  Game.state.codex.monsters = Game.state.codex.monsters || {};
  Game.state.codex.monsters['bulldozer'] = { villageName: 'Bulldozer', patterns: { 'China-Shop Charge': true } };
  const mNamed = { name: Game.monsterDisplayName('bulldozer'), mdef: bdef };
  const poss = Game.encDamageSource(mNamed, 'China-Shop Charge');
  ok('PART3: named attacker keeps a grammatical possessive', /'s China-Shop Charge/.test(poss),
    `got "${poss}"`);

  // ---- PART 4 (task D): system_task quest display REPRO — reported, NOT fixed ----
  // game.js:13196 builds {id, desc} only; app.js:10709 falls back to
  // "giverName needs qty plant." Reproduce the render verbatim.
  Game.triggerEvent({ id: 'system_task' });
  const q = Game.state.scholar.activeQuest;
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const rendered = q ? esc(q.text || (q.giverName + ' needs ' + q.qty + ' ' + q.plant + '.')) : '(no quest)';
  ok('PART4(repro): system_task renders the broken line (bug CONFIRMED, unfixed here)',
    q && /undefined/.test(rendered),
    `rendered="📋 ${rendered}" — report to surface owner, do not fix in this task`);

  console.log(`\n${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR:', e); process.exit(2); });
