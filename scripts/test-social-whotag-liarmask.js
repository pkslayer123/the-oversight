// Regression: whoTag must not leak a liar's TRUE occupation.
// Bug: whoTag() tagged villagers with their true formerOccupation even when
// they had an unconfessed occupation lie — every dialogue line then revealed
// the truth the liar's-den gameplay is built around catching.
// Fix (Steve 2026-10-05): the tag uses the CLAIMED occupation while the lie
// is live, and flips to the truth after confession/exposure (a discovery
// beat, not a leak). Usage: node scripts/test-social-whotag-liarmask.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js',
 'src/js/justice.js', 'src/js/betrayal.js', 'src/js/corpses.js', 'src/js/codex-people.js', 'src/js/progression.js',
 'src/js/ledger.js', 'src/js/debug-scenarios.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}`); }
}

(async () => {
  await Game.init();
  Game.debugScenario('liars');
  const roster = Game.state.village.roster.filter(id => id !== Game.villagerId);
  const liars = roster.filter(rid => {
    const l = (Game.vpOf(rid).lies || {}).occupation;
    return l && l.told !== l.truth && !l.confessed;
  });
  ok('liars seeded with live occupation lies', liars.length > 0);
  for (const rid of liars.slice(0, 3)) {
    const lie = Game.vpOf(rid).lies.occupation;
    const tag = Game.whoTag(rid).toLowerCase();
    ok(`whoTag masks truth (${lie.truth})`, !tag.includes(String(lie.truth).toLowerCase()));
    ok(`whoTag shows claim (${lie.told})`, tag.includes(String(lie.told).toLowerCase()));
  }
  // confession flips the tag to the truth — the discovery beat.
  // The real confession path records the truth in the journal (truth.js);
  // the tag reads what was heard, so simulate that write here.
  const rid = liars[0];
  const lie = Game.vpOf(rid).lies.occupation;
  lie.confessed = true;
  Game.journalLearn(rid, 'occupation', lie.truth, { sure: true, via: 'confessed', quiet: true });
  const tagAfter = Game.whoTag(rid).toLowerCase();
  ok('whoTag reveals truth after confession', tagAfter.includes(String(lie.truth).toLowerCase()));
  // honest villagers: the true occupation is EARNED knowledge (F5 gate,
  // kgate audit 2026-10-06) — the tag shows it only once the player hears it.
  const honest = roster.find(id => {
    const l = (Game.vpOf(id).lies || {}).occupation;
    if (l) return false; // never lied at all — liars[0] was just confessed + journaled above
    const v = (Game.data.villagers || []).find(x => x.id === id)
      || (Game.data.background_survivors || []).find(x => x.id === id) || {};
    return !!v.formerOccupation;
  });
  if (honest) {
    const v = (Game.data.villagers || []).find(x => x.id === honest)
      || (Game.data.background_survivors || []).find(x => x.id === honest) || {};
    const occ = String(v.formerOccupation || '').toLowerCase();
    if (occ) {
      ok('honest villager tag hides occupation pre-knowledge', !Game.whoTag(honest).toLowerCase().includes(occ));
      // hearing it in conversation ('past' topic) earns the descriptor
      Game.journalLearn(honest, 'occupation', v.formerOccupation, { sure: true, via: 'talk' });
      ok('honest villager tag shows occupation once heard', Game.whoTag(honest).toLowerCase().includes(occ));
    }
  }
  console.log(`\nwhotag-liarmask: ${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('CRASH:', e.message); process.exit(2); });
