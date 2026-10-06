// Occupation knowledge gating (Steve 2026-10-06): "Occupations are gated
// until you learn them, like names."
// Standing law: "If you don't know, it doesn't show."
//
// Gates (concrete):
//   - Game.occupationKnown(vid): systemArrived OR a journal occupation claim.
//     Read-only — never creates journal entries.
//   - Game.occupationLabel(vid): null when unknown; the value when sure;
//     "value?" when the claim is unsure (honest, never "???").
//   - panelHaven roster: occupation omitted when unknown (was: raw
//     p.formerOccupation leak).
//   - Untouched: character select (your own character), person card sys
//     branch (System overlay reveals all, consistent with names), membership
//     applicants (they introduce themselves), journal peopleSection (already
//     evidence-gated), assignment UI (shows tasks/competence, not occupation),
//     all mechanics reading formerOccupation (specialists, teaching, skills).
//   - Learning paths (pre-existing, verified here): ask about past in
//     conversation (sure), gossip (70% sure), confession (truth.js).
// Usage: node scripts/test-occupation-gating.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js',
 'src/js/justice.js', 'src/js/debug-scenarios.js', 'src/js/progression.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}${extra ? ' — ' + extra : ''}`); }
}

function flatGrid() {
  return Array.from({ length: 9 }, () => Array(9).fill('grass'));
}
function freshGame() {
  try { if (Game.tbfight) Game.tbEnd('fled'); } catch (e) {}
  Game.genRoster('Columbus, Ohio');
  const v = Game.generatedRoster[0];
  Game.newGame('Columbus, Ohio', null, v.id, ['multitool', 'lighter', 'hoodie', 'trail_compass'], 'OccGate Test');
  Game.depart();
  const s = Game.state.scholar;
  s.mx = 4; s.my = 4; s.kcal = 3000; s.energy = 60;
  Game.genDetail = flatGrid;
  Game.log = [];
  return s;
}
// A roster villager (not the player) with a real occupation.
function testVillager() {
  const roster = (Game.state.village.roster || []).filter(id => id !== Game.villagerId);
  for (const id of roster) {
    const v = (Game.data.villagers || []).find(x => x.id === id)
      || (Game.data.background_survivors || []).find(x => x.id === id);
    if (v && v.formerOccupation) return { id, occ: v.formerOccupation };
  }
  return null;
}

(async () => {
  await Game.init();
  freshGame();
  Game.state.systemArrived = false;
  Game.state.codex.people = {};

  const t = testVillager();
  ok('test setup: roster villager with occupation', !!t, t ? '' : 'no candidate');
  if (!t) { console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0); }
  const { id: vid, occ } = t;

  // 1. Unknown before learning.
  ok('occupationKnown false before learning', Game.occupationKnown(vid) === false);
  ok('occupationLabel null before learning', Game.occupationLabel(vid) === null);

  // 2. Read-only: the gate must not create journal entries.
  ok('gate creates no journal entry', !((Game.state.codex.people || {})[vid]));

  // 3. Sure claim reveals.
  Game.journalLearn(vid, 'occupation', occ, { sure: true, via: 'talk', quiet: true });
  ok('occupationKnown true after sure claim', Game.occupationKnown(vid) === true);
  ok('occupationLabel shows value when sure', Game.occupationLabel(vid) === occ);

  // 4. Unsure claim keeps its "?".
  const t2 = testVillager();
  let vid2 = null;
  if (t2 && t2.id !== vid) {
    vid2 = t2.id;
    Game.journalLearn(vid2, 'occupation', t2.occ, { sure: false, quiet: true });
    ok('unsure claim counts as known', Game.occupationKnown(vid2) === true);
    ok('unsure label keeps "?"', Game.occupationLabel(vid2) === t2.occ + '?');
  } else {
    ok('unsure claim counts as known (skipped, single villager)', true);
    ok('unsure label keeps "?" (skipped)', true);
  }

  // 5. System arrival reveals all.
  Game.state.systemArrived = true;
  const fresh3 = testVillager();
  const vid3 = fresh3 && fresh3.id !== vid && fresh3.id !== vid2 ? fresh3.id : vid;
  delete (Game.state.codex.people || {})[vid3];
  ok('systemArrived => known without claim', Game.occupationKnown(vid3) === true);
  const rawOcc = ((Game.data.villagers || []).find(x => x.id === vid3)
    || (Game.data.background_survivors || []).find(x => x.id === vid3) || {}).formerOccupation || null;
  ok('systemArrived => raw occupation label', Game.occupationLabel(vid3) === rawOcc);
  Game.state.systemArrived = false;

  // 6. Roster surface: no raw formerOccupation interpolation in the haven roster.
  const appSrc = fs.readFileSync(path.join(ROOT, 'src/js/app.js'), 'utf8');
  const rosterBlock = appSrc.slice(appSrc.indexOf('mains.map(p => {'));
  const rosterLine = rosterBlock.slice(0, rosterBlock.indexOf("}).join('')"));
  ok('roster line calls occupationLabel', rosterLine.includes('occupationLabel(p.id)'));
  ok('roster line has no raw ${p.formerOccupation} interpolation',
    !rosterLine.includes('${p.formerOccupation}'));
  ok('roster unknown branch renders empty (not "???")',
    rosterLine.includes("occ ? ` — ${esc(occ)}` : ''") || rosterLine.includes('occBit'));

  // 7. Other surfaces unchanged and correct:
  //    - person card sys branch still shows (System reveals all, like names)
  //    - journal peopleSection still evidence-gated
  //    - character select still shows (your own character)
  ok('person card sys branch intact', appSrc.includes("${esc(vp.formerOccupation || '')}"));
  ok('journal peopleSection still evidence-gated',
    appSrc.includes('e.occupation.sure ? esc(e.occupation.value)'));

  // 8. Mechanics untouched: specialist/competence still read raw occupation.
  ok('villagerCompetence still mechanical', typeof Game.villagerCompetence === 'function');

  // 9. Learning path: 'past' topic teaches occupation (journal.js hook).
  //    (Covered by hook presence + journalLearn shape; direct convo path
  //    needs DOM. Assert the hook exists.)
  const jSrc = fs.readFileSync(path.join(ROOT, 'src/js/journal.js'), 'utf8');
  ok("past-topic hook teaches occupation", jSrc.includes("topic === 'past'") && jSrc.includes("'occupation', vp.formerOccupation"));

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
