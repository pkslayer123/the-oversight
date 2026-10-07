// PROOF TEST: detective soft probe (2026-10-06).
// Bug: dlg:doubt ("That doesn't quite add up.") was a DEAD VERB — a flavor
// line with no mechanics, sitting in the menu next to the real confront:
// choice. Players could pick it and never find the verb that works.
// Fix: dlg:doubt is now a real soft probe — it mounts 'prodded' evidence on
// the first open doubt (raising later confess odds in confrontDoubt) and the
// NPC visibly rattles with repeated prods.
// Run: node scripts/test-detective-softprobe-20261006.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const FILES = [
  'src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
  'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
  'src/js/game.js', 'src/js/encounters.js', 'src/js/conversation.js', 'src/js/convo-mood.js',
  'src/js/convoTopics.js', 'src/js/convo-wants.js', 'src/js/convo-dialogue.js',
  'src/js/convo-beats.js', 'src/js/examine.js', 'src/js/equipment.js', 'src/js/journal.js',
  'src/js/party.js', 'src/js/party-formal.js', 'src/js/truth.js', 'src/js/contests.js',
  'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js', 'src/js/justice.js',
  'src/js/food.js', 'src/js/betrayal.js', 'src/js/corpses.js', 'src/js/lifeseed.js',
  'src/js/progression.js', 'src/js/ledger.js', 'src/js/villager-agency.js',
  'src/js/codex-people.js', 'src/js/membership.js', 'src/js/hierarchy.js',
  'src/js/debug-scenarios.js', 'src/js/build.js',
];
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
global.window = global;
for (const f of FILES) eval(fs.readFileSync(path.join(ROOT, f), 'utf8'));
delete global.window;
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
const check = (label, cond, extra) => {
  if (cond) { pass++; console.log(`ok   ${label}`); }
  else { fail++; console.log(`FAIL ${label}${extra ? ' — ' + extra : ''}`); }
};

(async () => {
  let s = 7; Math.random = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const v = Game.state.village;
  const roster = v.roster.filter(id => id !== Game.villagerId);
  // 1. dlg:doubt mounts 'prodded' evidence on the first open doubt.
  // Any verbal villager works — beats are forced via c.lastBeat below.
  let liar = null;
  for (const vid of roster) {
    try {
      Game.startConvo(vid);
      const t = Game.convoGet(vid).thread;
      Game.endConvo(vid, 'left');
      if (t !== 'nonverbal') { liar = vid; break; }
    } catch (e) {}
  }
  check('a verbal villager exists', !!liar);
  if (!liar) { console.log('no verbal villager — abort'); process.exit(1); }
  const vp = Game.vpOf(liar);
  vp.lies = { occupation: { told: 'surgeon', truth: vp.formerOccupation || 'cook', motive: 'pathological', field: 'occupation' } };
  for (const vid of roster) v.trust[vid] = 10;
  // seed a doubt directly (deterministic) — the probe path is what we test
  const d = Game.addDoubt(liar, 'slip', 'test doubt', ['claimed "surgeon"']);
  check('doubt seeded', !!d && d.id);

  // 1. menu gate: the probe is offered on news/small beats, withheld on
  // offer/feeling beats (deliberate design). Force beats via c.lastBeat —
  // NPC wants are dynamic, so hunting for a natural beat is flaky.
  Game.startConvo(liar);
  const c0 = Game.convoGet(liar);
  const menuOn = (tag) => {
    c0.lastBeat = { tag, topic: 'past', line: 'test line' };
    return Game.convoChoices(liar).map(c => c.id);
  };
  check('dlg:doubt offered on news beat with open doubts',
    menuOn('news').includes('dlg:doubt'), menuOn('news').join(','));
  check('dlg:doubt offered on small beat with open doubts',
    menuOn('small').includes('dlg:doubt'));
  check('dlg:doubt withheld on offer beat (design)',
    !menuOn('offer').includes('dlg:doubt'));
  check('dlg:doubt withheld on feeling beat (design)',
    !menuOn('feeling').includes('dlg:doubt'));
  check('hard confrontation offered on every beat',
    menuOn('news').some(id => String(id).indexOf('confront:') === 0) &&
    menuOn('offer').some(id => String(id).indexOf('confront:') === 0));
  // leave the beat on news for the probe turns below
  c0.lastBeat = { tag: 'news', topic: 'past', line: 'test line' };
  let ch = Game.convoChoices(liar);
  const evBefore = d.evidence.length;
  const r1 = Game.convoTurn(liar, 'dlg:doubt');
  check('dlg:doubt mounts prodded evidence',
    d.evidence.length === evBefore + 1 && String(d.evidence[d.evidence.length - 1]).indexOf('prodded') === 0,
    JSON.stringify(d.evidence));
  check('first prod line: voice goes careful', /goes careful/.test(r1.line), r1.line.slice(0, 80));

  // 2. repeated prods escalate the fiction
  const r2 = Game.convoTurn(liar, 'dlg:doubt');
  check('second prod line: choosing words', /choosing their words/.test(r2.line), r2.line.slice(0, 80));
  const r3 = Game.convoTurn(liar, 'dlg:doubt');
  check('third prod line: rattled', /rattled/.test(r3.line), r3.line.slice(0, 80));
  const prods = d.evidence.filter(e => String(e).indexOf('prodded') === 0).length;
  check('three prods mounted', prods === 3, 'prods=' + prods);

  // 3. prods raise confess odds: pathological liar, trust 10, roll fixed at 0.20.
  //    base confessP ≈ 0.08 → roll 0.20 would deflect/attack; +3 prods (+0.15) → 0.23 → confess.
  Math.random = () => 0.20;
  const rc = Game.confrontDoubt(liar, d.id);
  check('3 prods flip a pathological liar to confess at roll 0.20',
    rc.outcome === 'confessed', 'outcome=' + rc.outcome);
  check('confession resolves the doubt', d.resolved === true);

  // 4. control: same setup WITHOUT prods → no confession at roll 0.20
  // (find a second VERBAL villager — some share no language with the player)
  const verbal = [];
  for (const vid of roster) {
    if (vid === liar) continue;
    try {
      Game.startConvo(vid);
      const t = Game.convoGet(vid).thread;
      Game.endConvo && Game.endConvo(vid, 'left');
      if (t !== 'nonverbal') verbal.push(vid);
    } catch (e) {}
  }
  check('a second verbal villager exists for the control', verbal.length > 0);
  const liar2 = verbal[0];
  const vp2 = Game.vpOf(liar2);
  vp2.lies = { occupation: { told: 'surgeon', truth: vp2.formerOccupation || 'cook', motive: 'pathological', field: 'occupation' } };
  const d2 = Game.addDoubt(liar2, 'slip', 'test doubt 2', ['claimed "surgeon"']);
  Math.random = () => 0.20;
  const rc2 = Game.confrontDoubt(liar2, d2.id);
  check('no prods: same liar does NOT confess at roll 0.20', rc2.outcome !== 'confessed', 'outcome=' + rc2.outcome);

  // 5. dlg:doubt with no open doubts does not crash (menu shouldn't offer it, handler must guard)
  Game.endConvo && Game.endConvo(liar, 'left');
  const clean = verbal.find(x => x !== liar2) || roster.find(x => x !== liar && x !== liar2);
  Game.startConvo(clean);
  const r5 = Game.convoTurn(clean, 'dlg:doubt');
  check('dlg:doubt with no doubts: no crash', !!r5 && typeof r5.line === 'string');
  Game.endConvo && Game.endConvo(clean, 'left');

  // 6. the hard confrontation choice is still offered alongside the probe
  // (force a news beat — both verbs side by side, both real now)
  Game.startConvo(liar2);
  Game.convoGet(liar2).lastBeat = { tag: 'news', topic: 'past', line: 'test line' };
  const ch2 = Game.convoChoices(liar2);
  const hasBoth = ch2.some(c => c.id === 'dlg:doubt') && ch2.some(c => String(c.id).indexOf('confront:') === 0);
  check('menu offers both probe (dlg:doubt) and hard confrontation (confront:)', hasBoth,
    ch2.map(c => c.id).join(','));
  Game.endConvo && Game.endConvo(liar2, 'left');

  console.log(`\n${pass}/${pass + fail} passed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('FATAL', e.stack); process.exit(1); });
