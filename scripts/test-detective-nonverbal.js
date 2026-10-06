// test-detective-nonverbal.js: detective loop vs the language barrier.
// A nonverbal NPC (no shared language) can't verbally slip in English — and any
// doubt against them must stay actionable, via a bilingual interpreter.
//   A. endDay slip loop never plants verbal-slip doubts on no-words NPCs
//      (but still does for verbal liars in the same village).
//   B. observation doubts dedupe per (person, field): a repeat tell appends
//      evidence to the open doubt instead of stacking a new one.
//   C. gossip intel forms a lead doubt even when you never heard their claim.
//   D. confrontation choice appears in a nonverbal thread iff an interpreter
//      is bridging; the label names the interpreter.
// Usage: node scripts/test-detective-nonverbal.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/food.js', 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js'
].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
const ok = (cond, label) => { if (cond) { pass++; } else { fail++; console.log('FAIL:', label); } };
const seedRand = (sd) => { let s = sd; Math.random = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; }; };
const isLiar = (id) => { const l = Game.npcLies(id); return !!(l && Object.values(l).some(x => x && x.told)); };
const noWords = (id) => { try { return Game.commLevel(id).level === 'none'; } catch (e) { return false; } };

(async () => {
  // seed 7: one nonverbal liar + verbal liars in the same village
  seedRand(7);
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const roster = Game.state.village.roster.filter(id => id !== Game.villagerId);
  // materialize lies in roster order first: npcLies is lazy + RNG-consuming,
  // so call order decides the liar set — fix the order for determinism.
  roster.forEach(id => Game.npcLies(id));
  const nvLiars = roster.filter(id => noWords(id) && isLiar(id));
  const vLiars = roster.filter(id => !noWords(id) && isLiar(id));
  ok(nvLiars.length >= 1, `seed 7 has a nonverbal liar (found ${nvLiars.length})`);
  ok(vLiars.length >= 1, `seed 7 has verbal liars (found ${vLiars.length})`);
  const nvLiar = nvLiars[0];

  // --- A. run 40 days; slips may fire for verbal liars, never for the nonverbal one
  for (let d = 0; d < 40; d++) { try { Game.endDay(); } catch (e) {} }
  const slips = (Game.state.codex.doubts || []).filter(x => x.kind === 'slip');
  const nvSlips = slips.filter(x => x.vid === nvLiar);
  const vSlips = slips.filter(x => x.vid !== nvLiar);
  ok(nvSlips.length === 0, `no slip doubts on nonverbal liar (found ${nvSlips.length})`);
  ok(vSlips.length >= 1, `verbal liars still slip (${vSlips.length} slip doubts village-wide)`);
  // the slip text must never claim a nonverbal NPC "told" the player something
  const nvTexts = (Game.state.codex.doubts || []).filter(x => x.vid === nvLiar).map(x => x.text);
  ok(!nvTexts.some(t => /told you/i.test(t)), 'no doubt text claims the nonverbal NPC "told you" anything');

  // --- B. observation dedupe per (person, field)
  const target = vLiars[0];
  const d1 = Game.addDoubt(target, 'observation', 'OBS-TEXT-ONE', ['claims "x"', 'observed: tell one'], { field: 'occupation' });
  ok(!!d1, 'first observation doubt created');
  const evBefore = d1.evidence.length;
  const d2 = Game.addDoubt(target, 'observation', 'OBS-TEXT-TWO', ['observed: tell two'], { field: 'occupation' });
  ok(d2 && d2.id === d1.id, 'repeat observation tell returns the SAME doubt (no stacking)');
  ok(d1.evidence.length === evBefore + 1 && d1.evidence.some(e => /tell two/.test(e)),
    'repeat tell appends evidence to the open doubt (mounting evidence)');
  const d3 = Game.addDoubt(target, 'observation', 'OBS-TEXT-THREE', ['observed: origin tell'], { field: 'origin' });
  ok(d3 && d3.id !== d1.id, 'different field still forms its own doubt');

  // --- C. gossip intel without a heard claim forms a lead doubt
  const teller = roster.find(id => id !== target);
  const before = Game.allDoubts().filter(x => x.vid === target && x.kind === 'gossip').length;
  Game.checkGossipClaim(target, 'occupation', 'blacksmith', teller);
  const leads = Game.allDoubts().filter(x => x.vid === target && x.kind === 'gossip');
  ok(leads.length === before + 1, 'gossip intel with no heard claim forms a lead doubt');
  const lead = leads[leads.length - 1];
  ok(/haven't heard/.test(lead.text) && !/said "/.test(lead.text),
    'lead text admits you never heard their story (no fake contradiction)');
  // consistent gossip afterwards: no new doubt
  Game.trackClaimSilent(target, 'occupation', 'blacksmith');
  const b2 = Game.allDoubts().filter(x => x.vid === target && x.kind === 'gossip').length;
  Game.checkGossipClaim(target, 'occupation', 'blacksmith', teller);
  ok(Game.allDoubts().filter(x => x.vid === target && x.kind === 'gossip').length === b2,
    'consistent gossip forms no doubt');
  // conflicting gossip after a claim: classic contradiction doubt
  Game.checkGossipClaim(target, 'occupation', 'cooper', teller);
  const contra = Game.allDoubts().filter(x => x.vid === target && x.kind === 'gossip').pop();
  ok(contra && /said "blacksmith"/.test(contra.text), 'heard claim + conflicting gossip keeps the aha contradiction');

  // --- D. bridged confrontation in a nonverbal thread
  // plant a doubt on the nonverbal liar directly (observation-style, no slip)
  const nd = Game.addDoubt(nvLiar, 'observation', 'NV-OBS', ['claims "x"', 'observed: hands'], { field: 'occupation' });
  ok(!!nd, 'observation doubt planted on nonverbal liar');
  const helper = roster.find(id => id !== nvLiar);
  const realFI = Game.findInterpreter.bind(Game);
  // nobody bridging: gestures only, no confrontation
  Game.findInterpreter = () => null;
  Game.startConvo(nvLiar);
  let c = Game.convoGet(nvLiar);
  ok(c.thread === 'nonverbal', 'nonverbal liar opens a nonverbal thread');
  let choices = Game.convoChoices(nvLiar);
  ok(!choices.some(ch => String(ch.id).indexOf('confront:') === 0),
    'no interpreter → no confront choice (gestures only)');
  try { Game.endConvo && Game.endConvo(nvLiar, 'left'); } catch (e) {}
  // bilingual villager bridging: confrontation goes through them
  Game.findInterpreter = () => helper;
  Game.startConvo(nvLiar);
  c = Game.convoGet(nvLiar);
  choices = Game.convoChoices(nvLiar);
  const cf = choices.find(ch => String(ch.id).indexOf('confront:') === 0);
  ok(!!cf, 'interpreter bridging → confront choice appears');
  ok(cf && /via /.test(cf.label), 'bridged confront label names the interpreter');
  ok(cf && cf.id === 'confront:' + nd.id, 'bridged confront targets the open doubt');
  // and the turn actually runs through confrontDoubt
  const res = Game.convoTurn(nvLiar, cf.id);
  ok(res && typeof res.line === 'string' && res.line.length > 0, 'bridged confrontation produces a line');
  const after = (Game.state.codex.doubts || []).find(x => x.id === nd.id);
  ok(after && (after.resolved || (after.evidence || []).some(e => /confronted/.test(e))),
    'bridged confrontation resolves or deepens the doubt');
  try { Game.endConvo && Game.endConvo(nvLiar, 'left'); } catch (e) {}
  Game.findInterpreter = realFI;

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR:', e); process.exit(2); });
