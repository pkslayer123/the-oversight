// Socialite regression tests: the two bugs caught 2026-10-04 by the
// playtest loop, fixed same run. Both must hold across ALL random draws.
// Usage: node scripts/test-socialite-fixes.js
const fs = require('fs');
const path = require('path');
const ROOT = '/home/hatch/workspace/the-scattering';
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/conversation.js', 'src/js/party.js',
 'src/js/truth.js', 'src/js/journal.js'
].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));

async function main() {
  const Game = globalThis.Scattering.Game;
  await Game.init();
  let pass = 0, fail = 0;
  const t = (name, cond) => {
    if (cond) { pass++; }
    else { fail++; console.log('  FAIL: ' + name); }
  };

  // === 1. Occupation English: WORK runs before the lingua-franca roll, so
  // the random pick can neither shadow the reason nor downgrade fluency.
  // Invariant over 300 random draws: level stays 2 and the reason is present.
  console.log('1. occupation English backstory (300 draws)');
  let lvlOK = true, reasonOK = true, reasonOnce = false;
  for (let i = 0; i < 300; i++) {
    const cl = Game.genCultureLanguages('egyptian', { id: 'pilot', polyglot: ['english'] }, {});
    if ((cl.levels.english || 0) !== 2) lvlOK = false;
    const r = (cl.reasons || []).join(' ');
    if (!r.includes('English')) reasonOK = false; else reasonOnce = true;
  }
  t('pilot English level is 2 on every draw', lvlOK);
  t('pilot English reason present on every draw', reasonOK && reasonOnce);
  // Native English speaker + polyglot english: no silly "learned English for work".
  const cl2 = Game.genCultureLanguages('american', { id: 'pilot', polyglot: ['english'] }, {});
  t('native speaker gets no work-English reason', !(cl2.reasons || []).join(' ').includes('English'));

  // === 2. Party invite: trust-earned, discovered person-action must appear
  // in the choice list even when every topic ask is also eligible (MAXC=6).
  console.log('2. invite_party never crowded out by small talk');
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  Game.state.systemArrived = true;
  Game.unlockPartySystem();
  const v = Game.state.village;
  const roster = (v.roster || []).filter(id => id !== Game.villagerId);
  t('roster has NPCs', roster.length >= 3);
  let inviteSeen = 0, inviteChecked = 0, nonverbal = 0, firedOnce = false;
  for (const vid of roster.slice(0, 8)) {
    if (Game.inParty(vid)) continue;
    // Nonverbal (no shared language) legitimately has no verbal invite —
    // that's the language-barrier game working as designed, not crowding.
    // (Feel note 2026-10-04: there is no GESTURE invite either — a "come with
    // me" hand signal with interpretation risk would fit Steve's design but
    // needs his call on how failure feels. Recorded, not built.)
    let comm = null;
    try { comm = Game.commLevel(vid); } catch (e) {}
    if (!comm || comm.level === 'none') { nonverbal++; continue; }
    v.trust = v.trust || {}; v.trust[vid] = 60; // unlocks goal, past, theorize
    Game.startConvo(vid);
    const ui = Game.convoUI(vid);
    inviteChecked++;
    const ids = ui.choices.map(x => x.id);
    if (ids.includes('invite_party')) {
      inviteSeen++;
      // fire the handler once overall to prove it resolves without throwing
      if (!firedOnce) { firedOnce = true; try { Game.convoTurn(vid, 'invite_party'); } catch (e) { t('invite resolves without throwing', false); } }
    } else {
      console.log('    missing for', vid, 'choices:', JSON.stringify(ids));
    }
    Game.endConvo(vid, 'left');
  }
  t('invite present for every eligible verbal NPC at trust 60', inviteChecked > 0 && inviteSeen === inviteChecked);
  t('at least one verbal NPC tested', inviteChecked > 0);

  console.log(`\n${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
