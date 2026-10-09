#!/usr/bin/env node
// Party panel proof (Steve 2026-10-09): the 👥 HUD chip toggles a member-status
// popover (out of combat: persistent v.health + v.sick), and the in-combat
// ally strip shows live fighter HP in the combat UI's own visual language.
// Seeded ×3. Usage: SEED=7 node scripts/test-party-panel-20261009.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

// Seeded RNG BEFORE eval (modules capture Math.random at load).
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const SEED = parseInt(process.env.SEED || '20261009', 10);
Math.random = mulberry32(SEED);

global.fetch = (f) => Promise.resolve({
  json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8')))
});
// FULL src/js list in index.html order, minus DOM-only app.js/sprites.js/
// tile-scenes.js/move-anim.js/drama.js. (allyStripHTML lives in party.js so
// the strip logic is testable here; the app.js call site is a thin wrapper.)
const idx = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const files = [...idx.matchAll(/src\/js\/[^"]+\.js/g)].map(m => m[0])
  .filter(f => !/(^|\/)(app|sprites|tile-scenes|move-anim|drama)\.js$/.test(f));
// equipment.js needs window at load; stub it for eval, then delete before
// playing (a live window stub flips combat to the async path).
global.window = global;
for (const f of files) eval(fs.readFileSync(path.join(ROOT, f), 'utf8'));
delete global.window;
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) pass++;
  else { fail++; console.log(`FAIL [seed ${SEED}] ${name}`); }
}
function has(name, html, sub) { ok(`${name} contains ${JSON.stringify(sub)}`, html.includes(sub)); }
function lacks(name, html, sub) { ok(`${name} lacks ${JSON.stringify(sub)}`, !html.includes(sub)); }

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const v = Game.state.village;
  // System arrival → party unlock.
  Game.state.scholar.day = 7;
  Game.checkSystemArrival();
  ok('party unlocked', Game.partyUnlocked() === true);

  const roster = (v.roster || []).filter(id => id !== Game.villagerId);
  const [A, B, C] = roster;
  // Directly seat the party (invite path is covered by test-party.js).
  v.party = [A, B, C];
  ok('3 in party', Game.partyMembers().length === 3);

  // --- panel closed by default ---
  ok('panel closed by default', Game.isPartyPanelOpen() === false);
  ok('partyPanelHTML empty when closed', Game.partyPanelHTML() === '');
  const hudClosed = Game.partyHud();
  has('chip has toggle hook', hudClosed, 'data-partychip');
  lacks('chip shows no panel when closed', hudClosed, 'party-pop');

  // --- member states: A healthy, B hurt (35), C critical+sick (15, Gut Rot) ---
  v.health = v.health || {};
  v.health[A] = 100; v.health[B] = 35; v.health[C] = 15;
  v.sick = v.sick || {};
  v.sick[C] = { name: 'Gut Rot', daysLeft: 3, severity: 2 };

  Game.togglePartyPanel();
  ok('toggle opens', Game.isPartyPanelOpen() === true);
  const html = Game.partyPanelHTML();
  const nA = Game.displayName(A), nB = Game.displayName(B), nC = Game.displayName(C);
  has('panel names A', html, nA);
  has('panel names B', html, nB);
  has('panel names C', html, nC);
  has('A full bar', html, 'width:100%');
  has('B hurt bar 35%', html, 'width:35%');
  has('B hp number honest', html, '>35<');
  has('C critical bar 15%', html, 'width:15%');
  has('C critical icon', html, '🆘');
  has('B hurt icon', html, '🩸');
  has('C sick icon + name', html, 'Gut Rot');
  const count = (h, s) => h.split(s).length - 1;
  ok('hurt icon exactly once (B only)', count(html, '🩸') === 1);
  ok('critical icon exactly once (C only)', count(html, '🆘') === 1);
  has('dismiss affordance', html, 'data-partychip');

  Game.togglePartyPanel();
  ok('toggle closes', Game.isPartyPanelOpen() === false);
  ok('panel empty after close', Game.partyPanelHTML() === '');

  // --- empty party: honest, not broken ---
  v.party = [];
  Game.togglePartyPanel();
  const emptyHtml = Game.partyPanelHTML();
  has('empty party honest line', emptyHtml, 'No companions');
  Game.togglePartyPanel();
  v.party = [A, B, C];

  // --- knowledge gating: panel uses displayName, never raw names ---
  // (party members are known by invite rule, but the panel must not assume it)
  ok('status uses displayName', Game.partyMemberStatus(A).name === Game.displayName(A));

  // --- in-combat ally strip: live fighter HP ---
  Game.tbfight = {
    fighters: [
      { key: 'p', kind: 'player', name: 'You', hp: 80, maxHp: 100, alive: true },
      { key: 'v_' + A, kind: 'villager', villagerId: A, name: nA, emoji: '🧍', hp: 30, maxHp: 30, alive: true },
      { key: 'v_' + B, kind: 'villager', villagerId: B, name: nB, emoji: '🧍', hp: 12, maxHp: 30, alive: true },
      { key: 'v_' + C, kind: 'villager', villagerId: C, name: nC, emoji: '🧍', hp: 0, maxHp: 30, alive: false },
      { key: 'm1', kind: 'monster', name: 'boar', hp: 40, maxHp: 60, alive: true },
    ]
  };
  const strip = Game.allyStripHTML();
  has('strip has A', strip, nA);
  has('strip has B', strip, nB);
  has('strip A full bar', strip, 'width:100%');
  has('strip B 40% bar', strip, 'width:40%');
  has('strip B hurt mark', strip, '🩸');
  has('strip C downed mark', strip, '✖');
  has('strip C downed class', strip, 'cs-ally down');
  lacks('strip excludes monsters', strip, 'boar');
  lacks('strip excludes player', strip, '>You<');

  // damage the ally → bar updates (no stale render)
  Game.tbfight.fighters.find(f => f.key === 'v_' + B).hp = 6;
  const strip2 = Game.allyStripHTML();
  has('strip B updates to 20%', strip2, 'width:20%');
  has('strip B now critical', strip2, '🆘');

  // no fight → no strip
  Game.tbfight = null;
  ok('no strip without fight', Game.allyStripHTML() === '');

  // in-combat panel reads the LIVE fighter HP, not stale v.health
  v.health[A] = 5; // stale persistent value
  Game.tbfight = { fighters: [{ key: 'v_' + A, kind: 'villager', villagerId: A, hp: 28, maxHp: 30, alive: true }] };
  const liveStatus = Game.partyMemberStatus(A);
  ok('panel prefers live fighter HP in combat', liveStatus.hp === 28 && liveStatus.maxHp === 30);
  Game.tbfight = null;

  console.log(`\nparty-panel: ${pass} passed, ${fail} failed (seed ${SEED})`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
