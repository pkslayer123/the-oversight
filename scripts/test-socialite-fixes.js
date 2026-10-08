// Socialite regression tests: the two bugs caught 2026-10-04 by the
// playtest loop, fixed same run. Both must hold across ALL random draws.
// Harness loads the FULL production module list (index.html order, minus
// DOM-only) — the 2026-10-04 short list tested a menu stack that never
// exists in production. Usage: node scripts/test-socialite-fixes.js
// RNG seeded mulberry32 (default 20261007, SEED env override).
const fs = require('fs');
const path = require('path');
const ROOT = '/home/hatch/workspace/the-scattering';
let _seed = parseInt(process.env.SEED || '20261007', 10) >>> 0;
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
Math.random = mulberry32(_seed);
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
const ORDER = (fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').match(/src\/js\/[^\"]+\.js/g) || []);
const SKIP = new Set(['src/js/app.js', 'src/js/sprites.js', 'src/js/tile-scenes.js', 'src/js/move-anim.js', 'src/js/drama.js']);
global.window = global;
for (const f of ORDER) {
  if (SKIP.has(f)) continue;
  try { eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); }
  catch (e) { console.error('EVAL FAIL', f, e.message); process.exit(1); }
}
delete global.window;

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
  console.log('2. invite never crowded out by small talk (design-honest: initial menu OR one subject-change away)');
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  Game.state.systemArrived = true;
  Game.state.scholar.codexUnlocked = true; // real arrival unlocks the codex in the same beat (game.js)
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
    let ids = ui.choices.map(x => x.id);
    // The invite lives under two ids by menu generation: dlg:invite on the
    // dialogue path, invite_party on the classic menu. Mid-thread it waits
    // one subject-change away (thread coherence, Steve 2026-10-06) — the
    // honest invariant is: never more than one tap away once earned.
    let found = ids.includes('invite_party') || ids.includes('dlg:invite');
    if (!found) {
      const subj = ids.includes('dlg:subject') ? 'dlg:subject' : (ids.includes('subject') ? 'subject' : null);
      if (subj) {
        Game.convoTurn(vid, subj);
        ids = Game.convoUI(vid).choices.map(x => x.id);
        found = ids.includes('invite_party') || ids.includes('dlg:invite');
      }
    }
    if (found) {
      inviteSeen++;
      // fire the handler once overall to prove it resolves without throwing
      if (!firedOnce) {
        firedOnce = true;
        try {
          const invId = ids.includes('dlg:invite') ? 'dlg:invite' : 'invite_party';
          Game.convoTurn(vid, invId);
        } catch (e) { t('invite resolves without throwing', false); }
      }
    } else {
      console.log('    missing for', vid, 'choices:', JSON.stringify(ids));
    }
    Game.endConvo(vid, 'left');
  }
  t('invite reachable (initial menu or one subject-change) for every eligible verbal NPC at trust 60', inviteChecked > 0 && inviteSeen === inviteChecked);
  t('at least one verbal NPC tested', inviteChecked > 0);

  console.log(`\n${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
