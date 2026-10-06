// Speak-it-back + translator two-stage rework. Usage: node scripts/test-speak-it-back.js
// Steve's directives (2026-10-06):
//  1. "Address both" — add the speak-back beat: try your hard-won words on a
//     native speaker. Offered at exposure 3+, never under live translate.
//  2. Translator starts as a MEMORY AID (logs + replays words, boosts learning,
//     never translates novel speech); LIVE TRANSLATE unlocks at integration 60+.
//  3. Fiction correction: "your brain is the system" — the old "your brain
//     doesn't bother learning" framing is dead. The tradeoff is social:
//     the System gives you the WORDS without the human work; what you lose
//     is the PERSON. Rapport gains halve while mediated; villagers react.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js',
 'src/js/justice.js', 'src/js/betrayal.js', 'src/js/corpses.js', 'src/js/codex-people.js', 'src/js/progression.js',
 'src/js/ledger.js', 'src/js/lifeseed.js', 'src/js/villager-agency.js', 'src/js/debug-scenarios.js', 'src/js/convo-mood.js'].forEach(f => {
  try { eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); }
  catch (e) { console.log(`LOAD FAIL ${f}: ${e.message}`); }
});
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL: ${name}`); }
}

(async () => {
  await Game.init();
  Game.debugScenario('mootAccused');
  const v = Game.state.village;
  const s = Game.state.scholar;
  const roster = (v.roster || []).filter(id => id !== Game.villagerId);
  ok('roster non-empty', roster.length > 0);
  const vid = roster[0];
  // Foreign speaker: native Italian, no English.
  v.bgLangs = v.bgLangs || {};
  v.bgLangs[vid] = { native: 'italian', levels: { italian: 2 } };
  s.languages = { native: 'english', levels: { english: 2 } }; // player: English only
  s.langExposure = {};
  s.translatorWords = {};
  delete s._translatorStageSeen; delete s._translatorNote;

  console.log('=== 1. translatorStage ===');
  Game.state.systemArrived = false;
  s.abilities = (s.abilities || []).filter(a => ((a && a.id) || a) !== 'translator');
  ok('stage 0 without system', Game.translatorStage() === 0);
  Game.state.systemArrived = true;
  ok('stage 0 without ability', Game.translatorStage() === 0);
  ok('translatorActive false at stage 0', Game.translatorActive() === false);
  ok('memoryAidActive false at stage 0', Game.memoryAidActive() === false);
  s.abilities.push({ id: 'translator' });
  s.integration = 10;
  ok('stage 1 = memory aid (ability, integration < 60)', Game.translatorStage() === 1);
  ok('memoryAidActive at stage 1', Game.memoryAidActive() === true);
  ok('translatorActive false at stage 1 (aid is not live)', Game.translatorActive() === false);
  s.integration = 59;
  ok('stage 1 at integration 59', Game.translatorStage() === 1);
  s.integration = 60;
  ok('stage 2 = live translate at integration 60', Game.translatorStage() === 2);
  ok('translatorActive true at stage 2', Game.translatorActive() === true);

  console.log('=== 2. old fiction is dead ===');
  const src = fs.readFileSync(path.join(ROOT, 'src/js/conversation.js'), 'utf8');
  ok('no "brain doesn\'t bother" say-text', !src.includes("doesn't bother learning \u2014 why would it?"));
  ok('no "brain never bothers" text', !src.includes("never bothers"));

  console.log('=== 3. stage transition beats fire once ===');
  s.integration = 10; delete s._translatorStageSeen;
  const said = [];
  const origSay = Game.say;
  Game.say = function (t) { said.push(String(t)); return origSay.call(this, t); };
  Game.translatorStageCheck(vid);
  ok('0->1 transition fires', (s._translatorStageSeen || 0) === 1);
  ok('0->1 beat is about a ledger, not a voice', said.join(' ').includes('ledger'));
  const n1 = said.length;
  Game.translatorStageCheck(vid);
  ok('transition beat fires once', said.length === n1);
  s.integration = 70;
  Game.translatorStageCheck(vid);
  ok('1->2 transition fires', s._translatorStageSeen === 2);
  ok('1->2 beat names the trade (words free, person costs)', said.join(' ').includes("The person doesn"));
  Game.say = origSay;

  console.log('=== 4. memory aid: bonus + replay, no novel translation ===');
  s.integration = 10; // stage 1
  s.langExposure = {}; s.translatorWords = {};
  delete s._translatorStageSeen; // silence transition beats from here
  s._translatorStageSeen = 1;
  const e1 = Game.langExposureGain(vid, 'italian', 1);
  ok('memory aid: +1 bonus per gain (1+1=2)', e1 === 2);
  const ph = { lang: 'italian', t: 'S\u00ec, s\u00ec, esatto.', en: 'Yes, yes, exactly.', kw: { 'S\u00ec': 'yes' } };
  s.langExposure = {}; s.translatorWords = {};
  const r1 = Game.renderForeign(vid, ph);
  ok('novel speech NOT translated at stage 1', r1.text === '\u00abS\u00ec, s\u00ec, esatto.\u00bb');
  const r2 = Game.renderForeign(vid, ph);
  ok('device replays logged word on second hearing', r2.text.includes('device replays') && r2.text.includes("'S\u00ec' meant 'yes'"));
  ok('still no full English at stage 1', !r2.text.includes('Yes, yes, exactly.'));

  console.log('=== 5. live translate: full, but vocabulary still accrues ===');
  s.integration = 70; // stage 2
  const r3 = Game.renderForeign(vid, ph);
  ok('stage 2 auto-translates', r3.text.includes('\u2192') && r3.text.includes('Yes, yes, exactly.'));
  s.langExposure = {};
  const e2 = Game.langExposureGain(vid, 'italian', 1);
  ok('stage 2: exposure still accrues (vocabulary is not lost)', e2 === 1);
  ok('stage 2: no memory-aid bonus', e2 === 1);

  console.log('=== 6. mediatedBySystem ===');
  s.integration = 70;
  ok('mediated: stage 2 + no shared tongue', Game.mediatedBySystem(vid) === true);
  s.integration = 10;
  ok('not mediated at stage 1', Game.mediatedBySystem(vid) === false);
  s.integration = 70;
  s.languages.levels.italian = 1; // now we share a tongue
  ok('not mediated when a tongue is shared', Game.mediatedBySystem(vid) === false);
  delete s.languages.levels.italian;

  console.log('=== 7. trustGain: the relationship cost ===');
  s.integration = 10;
  v.trust = {}; v.trust[vid] = 10;
  Game.trustGain(vid, 4);
  ok('trustGain full when unmediated', v.trust[vid] === 14);
  s.integration = 70; // mediated now
  Game.trustGain(vid, 4);
  ok('trustGain halved when mediated (14 + ceil(4/2) = 16)', v.trust[vid] === 16);
  Game.trustGain(vid, -3);
  ok('penalties land whole, never softened', v.trust[vid] === 13);

  console.log('=== 8. speak-back choice gating ===');
  s.integration = 10; // stage 1
  s.langExposure = { italian: 0 }; // nvOpen grants 1 (+1 aid bonus) = 2 < 3
  Game.startConvo(vid);
  let ids = Game.convoChoices(vid).map(c => c.id);
  ok('no speak_back below exposure 3', !ids.includes('speak_back'));
  s.langExposure = { italian: 5 };
  ids = Game.convoChoices(vid).map(c => c.id);
  ok('speak_back offered at exposure 5, stage 1', ids.includes('speak_back'));
  s.integration = 70; // stage 2
  ids = Game.convoChoices(vid).map(c => c.id);
  ok('speak_back NOT offered under live translate', !ids.includes('speak_back'));
  s.integration = 10;

  console.log('=== 9. speak-back outcomes scale ===');
  // LOW tier (3-9): charming failure, correction teaches
  s.langExposure = { italian: 5 };
  v.trust[vid] = 40; // rapport high -> endearing
  const c = Game.convoGet(vid); delete c.speakBackDone;
  const t0 = v.trust[vid], ex0 = Game.langExposure('italian');
  const resLow = Game.convoTurn(vid, 'speak_back');
  ok('low tier returns a beat', !!(resLow && resLow.line));
  // convoTurn pushes the player's attempt into the transcript as a 'you'
  // entry (it is not on the return object) — check the real surface.
  const trLow = (Game.convoGet(vid).transcript || []);
  ok('low tier: transcript shows the attempt', trLow.some(e => e.who === 'you' && /try it in italian/i.test(e.text || '')));
  ok('low tier: exposure grew (correction teaches)', Game.langExposure('italian') > ex0);
  ok('low tier: trust +1 with rapport (human path, unhalved)', v.trust[vid] === t0 + 1);
  ok('one attempt per conversation', !Game.convoChoices(vid).map(x => x.id).includes('speak_back'));

  // MID tier (10-24)
  delete Game.convoGet(vid).speakBackDone;
  s.langExposure = { italian: 15 };
  v.trust[vid] = 40;
  const t1 = v.trust[vid];
  const resMid = Game.convoTurn(vid, 'speak_back');
  ok('mid tier returns a beat', !!(resMid && resMid.line));
  ok('mid tier: trust +2', v.trust[vid] === t1 + 2);

  // LEVEL tier (25+)
  delete Game.convoGet(vid).speakBackDone;
  s.langExposure = { italian: 26 };
  v.trust[vid] = 40;
  const t2 = v.trust[vid];
  const resHi = Game.convoTurn(vid, 'speak_back');
  ok('level tier returns a beat', !!(resHi && resHi.line));
  ok('level tier: trust +3', v.trust[vid] === t2 + 3);
  ok('level tier: beat reads as success', /just two people talking|delighted|grandmother/.test(resHi.line));
  const pnotes = (((Game.state.codex || {}).people || {})[vid] || {}).notes || [];
  ok('journal: speak-back attempt landed', pnotes.some(n => /tried speaking|spoke italian/i.test(n.text || '')));

  console.log('=== 10. mediated reaction beat (nvRespond) ===');
  s.integration = 70; // stage 2
  const c2 = Game.convoGet(vid);
  delete c2._mediatedReacted;
  const band = Game.npcAgeBand ? Game.npcAgeBand(vid) : 'adult';
  const nr = Game.nvRespond(vid, 'nod');
  const reacted = typeof nr === 'string' && /through it|audience in your head|teeth on edge|unsettles them/.test(nr);
  ok(`mediated reaction fires once (${band})`, reacted && c2._mediatedReacted === true);
  const nr2 = Game.nvRespond(vid, 'nod');
  ok('mediated reaction does not repeat', !/through it|audience in your head|teeth on edge|unsettles them/.test(nr2));

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR:', e); process.exit(1); });
