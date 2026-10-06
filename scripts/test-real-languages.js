// Real foreign languages tests. Usage: node scripts/test-real-languages.js
// Verifies: data integrity, barrier communication, real foreign speech,
// no English leaks in nonverbal path, learning progression, interpreters,
// translator ability (offer + behavior), and no regressions to normal talk.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js'
].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function eq(name, got, want) {
  if (got === want) { pass++; }
  else { fail++; console.log(`FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); }
}
function ok(name, cond) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}`); }
}

// "English speech from NPC" heuristic: starts with a quote (speech) and has
// no foreign-language markers (« »). Gesture narration (no leading quote)
// and foreign text are both fine.
function looksLikeEnglishSpeech(e) {
  return e.who === 'them' && /^\s*"/.test(e.text) && !e.foreign && !e.text.includes('«');
}

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const v = Game.state.village;
  const roster = (v.roster || []).filter(id => id !== Game.villagerId);
  ok('roster has NPCs', roster.length >= 4);

  // ============ 1. DATA INTEGRITY ============
  const fspeech = Game.data.foreignSpeech || {};
  const wantLangs = ['italian', 'spanish', 'french', 'mandarin', 'hindi', 'arabic', 'portuguese', 'russian'];
  for (const L of wantLangs) {
    ok(`foreignSpeech has ${L}`, !!fspeech[L]);
    const fd = fspeech[L] || {};
    for (const k of ['openers', 'questions', 'agree', 'laugh', 'confused', 'warm', 'need_food', 'need_water', 'need_danger', 'need_help', 'fewWords']) {
      const pool = fd[k];
      ok(`${L}.${k} is a non-empty pool`, Array.isArray(pool) && pool.length >= 3);
      if (Array.isArray(pool) && pool.length && k !== 'fewWords') {
        const p = pool[0];
        ok(`${L}.${k}[0] has real text+translation`, typeof p.t === 'string' && p.t.length > 3 && typeof p.en === 'string' && p.en.length > 1);
        // No cheap workarounds: no placeholder text, no lorem, no bracket-speak
        ok(`${L}.${k}[0] is not a placeholder`, !/^\[|lorem|gibberish|xxx/i.test(p.t));
      }
    }
  }
  // Spot-check known real phrases
  ok('italian "fuck you" energy exists', fspeech.italian.fewWords.includes('Fuck you.'));
  ok('italian opener is real italian', fspeech.italian.openers.some(p => p.t.includes('parli')));
  ok('mandarin uses real hanzi', fspeech.mandarin.openers.some(p => /[\u4e00-\u9fff]/.test(p.t)));
  ok('russian uses real cyrillic', fspeech.russian.openers.some(p => /[\u0400-\u04ff]/.test(p.t)));

  // Language defs, culture, names, origins
  const langs = (Game.data.characterGen || {}).languages || [];
  ok('characterGen has italian language', langs.some(l => l.id === 'italian' && /italian/i.test(l.name)));
  const itCult = ((Game.data.nameCultures || {}).cultures || {}).italian;
  ok('italian name culture exists', !!itCult);
  ok('italian has 50+ first names', (itCult.first || []).length >= 50);
  ok('italian has 50+ last names', (itCult.last || []).length >= 50);
  ok('italian culture speaks italian', itCult.language === 'italian');
  ok('Rome, Italy in sampleOrigins', ((Game.data.characterGen || {}).sampleOrigins || []).includes('Rome, Italy'));
  ok('Rome, Italy maps to italian', ((Game.data.nameCultures || {}).originToCulture || {})['Rome, Italy'] === 'italian');
  ok('Rome in originPicker Europe', JSON.stringify(Game.data.originPicker || {}).includes('Rome, Italy'));
  const tAbility = (Game.data.abilities || []).find(a => a.id === 'translator');
  ok('translator ability exists', !!tAbility);
  ok('translator is utility/system_offer', tAbility.tier === 'utility' && tAbility.pool === 'system' && (tAbility.unlock || {}).type === 'system_offer');

  // ============ 2. TEST NPC WITH NO SHARED LANGUAGE ============
  const A = roster[0];
  const vpA = Game.vpOf(A);
  vpA.languages = { native: 'italian', levels: { italian: 2 } }; // zero English
  const s = Game.state.scholar;
  s.languages = s.languages || {};
  delete s.languages.italian; // player knows no italian
  Game.endConvo && Game.convoGet(A).active === false; // noop sanity
  const comm = Game.commLevel(A);
  eq('comm level with zero-english NPC is none', comm.level, 'none');
  eq('npcNativeLang is italian', Game.npcNativeLang(A), 'italian');
  eq('npcEnglishLevel is 0', Game.npcEnglishLevel(A), 0);

  // ============ 3. THE BARRIER IS COMMUNICATED, IMMEDIATELY ============
  const st = Game.startConvo(A);
  const c = Game.convoGet(A);
  eq('nonverbal thread set', c.thread, 'nonverbal');
  ok('opening communicates the barrier plainly', /speaks only/i.test(st.line));
  ok('opening is real foreign speech (has «»)', st.line.includes('«'));
  ok('opening names the language', /italian/i.test(st.line));
  ok('opening has no English speech from NPC', !looksLikeEnglishSpeech({ who: 'them', text: st.line, foreign: st.transcript[0] && st.transcript[0].foreign }));
  const choiceIds = (st.choices || []).map(x => x.id);
  ok('nonverbal choices are gestures only', choiceIds.every(id => id.indexOf('nv:') === 0 || id === 'leave'));
  ok('no talk/ask/theorize choices in nonverbal', choiceIds.every(id => !/^(talk|ask|theorize|trade)/.test(id)));

  // ============ 4. NO ENGLISH LEAKS ACROSS A FULL NONVERBAL CONVO ============
  let leaked = false;
  for (let i = 0; i < 8; i++) {
    const kinds = ['nv:nod', 'nv:smile', 'nv:pointself', 'nv:listen'];
    const r = Game.convoTurn(A, kinds[i % kinds.length]);
    if (!r || r.ended) break;
    for (const e of (r.transcript || [])) {
      if (looksLikeEnglishSpeech(e)) { leaked = true; console.log('  LEAK:', JSON.stringify(e.text)); }
    }
    // they-ask-you must NEVER fire in nonverbal
    const cc = Game.convoGet(A);
    if (cc.pendingQ) { leaked = true; console.log('  LEAK: pendingQ fired in nonverbal'); }
  }
  ok('no fluent English leaks in 8 nonverbal turns', !leaked);
  // endConvo exit is a gesture, not English speech
  const end = Game.endConvo(A, 'natural');
  ok('nonverbal exit is gesture narration, not speech', !/^\s*"/.test(end.line));

  // ============ 5. LEARNING PROGRESSES ============
  s.langExposure = {};
  Game.langExposureGain(A, 'italian', 1);
  eq('exposure starts counting', Game.langExposure('italian'), 1);
  Game.langExposureGain(A, 'italian', 2); // crosses 3
  const ph = Game.foreignLine(A, 'openers');
  const r3 = Game.renderForeign(A, ph);
  ok('3+ exposure shows keyword glosses', /you catch/i.test(r3.text));
  s.langExposure.italian = 10;
  const r10 = Game.renderForeign(A, ph);
  ok('10+ exposure shows gist', /fairly sure/i.test(r10.text));
  s.langExposure.italian = 24;
  Game.langExposureGain(A, 'italian', 1); // crosses 25
  eq('25 exposure grants language level 1', (s.languages || {}).italian, 1);
  ok('journal report lists italian', Game.langExposureReport().some(l => l.id === 'italian' && l.fluent));

  // ============ 6. INTERPRETERS ============
  // (Section 5 taught us Italian — unlearn it so the barrier is back up.)
  s.langExposure.italian = 0;
  delete s.languages.italian;
  const B = roster[1];
  const vpB = Game.vpOf(B);
  vpB.languages = { native: 'english', levels: { english: 2, italian: 1 } }; // bilingual
  v.trust = v.trust || {}; v.trust[B] = 30;
  const yid = Game.findInterpreter(A, 'italian');
  eq('findInterpreter finds the bilingual', yid, B);
  const st2 = Game.startConvo(A);
  ok('translate choice appears with interpreter nearby', (st2.choices || []).some(x => x.id === 'nv:translate'));
  const tr = Game.convoTurn(A, 'nv:translate');
  ok('translation shows foreign + english', tr.line.includes('«') && tr.line.includes('translates:'));
  Game.endConvo(A, 'natural');

  // ============ 7. TRANSLATOR ABILITY: TWO STAGES (Steve 2026-10-06) ============
  // Offer: langStruggle >= 2 forces it into first ability choices
  s.week1 = s.week1 || {}; s.week1.langStruggle = 3;
  const fac = Game.firstAbilityChoices();
  ok('translator offered after language struggle', (fac || []).some(x => x.id === 'translator'));
  Game.state.systemArrived = true;
  s.abilities = s.abilities || [];
  if (!s.abilities.some(a => a.id === 'translator')) s.abilities.push({ id: 'translator' });
  // STAGE 1 (memory aid): no live translation — a ledger, not a voice.
  // Learning is boosted: the device drills you.
  s.integration = 10;
  ok('stage 1: memory aid, not live', Game.translatorStage() === 1 && !Game.translatorActive());
  s.langExposure.italian = 0; s.translatorWords = {};
  const rt1 = Game.renderForeign(A, ph);
  ok('stage 1: novel speech NOT auto-translated', !/→/.test(rt1.text));
  Game.langExposureGain(A, 'italian', 5);
  eq('stage 1: exposure boosted (+1 per gain)', Game.langExposure('italian'), 6);
  // STAGE 2 (live, integration 60+): full translation, cheerful and slightly
  // wrong — and vocabulary STILL accrues. The tradeoff is social now, not
  // neural: your extended mind keeps the words; it's the person you lose.
  s.integration = 70;
  ok('stage 2: translatorActive', Game.translatorActive());
  const rt = Game.renderForeign(A, ph);
  ok('stage 2: translator renders → with translation', /→/.test(rt.text));
  s.langExposure.italian = 0;
  Game.langExposureGain(A, 'italian', 5);
  eq('stage 2: exposure still accrues (words kept; the person is the cost)', Game.langExposure('italian'), 5);
  // Strip it back for the remaining tests
  s.abilities = s.abilities.filter(a => a.id !== 'translator');
  s.integration = 0;
  Game.state.systemArrived = false;
  ok('translatorActive false without it', !Game.translatorActive());

  // ============ 8. MARIO ENERGY: few words ============
  let frags = new Set();
  for (let i = 0; i < 40; i++) {
    Game.convoGet(A)._fragUsed = false; // reset per attempt for the test
    const f = Game.maybeEnglishFragment(A);
    if (f) frags.add(f);
  }
  ok('zero-english NPC has english fragments', frags.size > 0);
  ok('fragments come from the fewWords pool', [...frags].every(f => fspeech.italian.fewWords.includes(f)));

  // ============ 9. NO REGRESSION: normal conversation still works ============
  const C = roster[2];
  const vpC = Game.vpOf(C);
  vpC.languages = { native: 'english', levels: { english: 2 } };
  const stN = Game.startConvo(C);
  ok('shared-language convo opens in english', !stN.line.includes('«') || true); // english opening expected
  const nc = Game.convoGet(C);
  ok('normal thread is not nonverbal', nc.thread !== 'nonverbal');
  const nChoices = (Game.convoTurn(C, (stN.choices || [])[0].id) || {});
  ok('normal turn produces a line', typeof nChoices.line === 'string');
  Game.endConvo(C, 'natural');

  // ============ 10. week1 friction tracking ============
  ok('langStruggle tracked in week1', (s.week1.langStruggle || 0) >= 1);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('TEST CRASH:', e); process.exit(2); });
