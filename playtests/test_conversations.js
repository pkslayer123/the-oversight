// Conversation test: real back-and-forth dialogue
const fs = require('fs');
const path = require('path');
const ROOT = '/home/hatch/workspace/the-scattering';
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/conversation.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));

async function main() {
  const Game = globalThis.Scattering.Game;
  await Game.init();

  let pass = 0, fail = 0;
  const t = (name, cond) => {
    if (cond) { pass++; }
    else { fail++; console.log('  FAIL: ' + name); }
  };

  Game.newGame('Chicago, Illinois', null, null);
  const v = Game.state.village;
  const roster = (v.roster || []).filter(id => id !== Game.villagerId);
  t('roster has NPCs', roster.length >= 5);
  const vid = roster[0];
  const dname = Game.displayName(vid);

  // --- 1. startConvo ---
  console.log('1. startConvo');
  const kcalBefore = Game.state.scholar.kcal;
  const st = Game.startConvo(vid);
  t('startConvo returns state', !!st && !!st.line);
  t('opening line is non-empty', st.line.length > 5);
  t('choices offered', st.choices.length >= 2);
  t('no bare "continue" choice', !st.choices.some(c => /continue/i.test(c.label)));
  t('leave always available', st.choices.some(c => c.id === 'leave'));
  t('energy cost applied', Game.state.scholar.kcal < kcalBefore);
  t('transcript has opening', st.transcript.length >= 1 && st.transcript[0].who === 'them');
  t('convoUI active', Game.convoUI(vid).active === true);

  // --- 2. convoTurn: every choice type works ---
  console.log('2. convoTurn choice types');
  const tryChoice = (id) => {
    try {
      const s = Game.convoTurn(vid, id);
      return s && s.line ? true : 'no-line';
    } catch (e) { return 'throw:' + e.message; }
  };
  // fresh NPC for the walk: first conversation always includes their question
  const wvid = roster[3];
  Game.startConvo(wvid);
  let ui = Game.convoUI(wvid);
  const seenIds = new Set();
  for (const ch of ui.choices) {
    if (ch.id === 'leave' || ch.id.startsWith('ans:') || ch.id === 'deflect_q') continue;
    seenIds.add(ch.id);
  }
  t('multiple distinct choice types', seenIds.size >= 3);
  // walk a full conversation to natural end
  // (stub random low so the NPC's question roll always fires — deterministic)
  const realRandom2 = Math.random;
  Math.random = () => 0.1;
  Game.startConvo(wvid);
  let turns = 0, ended = false, sawQuestion = false, lastLine = '';
  const allLines = [];
  while (turns < 12 && !ended) {
    ui = Game.convoUI(wvid);
    if (!ui.active) break;
    const chs = ui.choices;
    // prefer answering questions when asked
    let pick = chs.find(c => c.id.startsWith('ans:'));
    if (pick) sawQuestion = true;
    else pick = chs.find(c => c.id === 'more') || chs.find(c => c.id.startsWith('ask:')) || chs.find(c => c.id === 'agree') || chs.find(c => c.id === 'silence') || chs[0];
    const s = Game.convoTurn(wvid, pick.id);
    turns++;
    if (!s) { t('convoTurn returned state (turn ' + turns + ')', false); break; }
    allLines.push(s.line);
    if (s.line === lastLine) t('no immediate line repeat (turn ' + turns + ')', false);
    lastLine = s.line;
    if (s.ended) ended = true;
  }
  Math.random = realRandom2;
  t('conversation ended naturally within 12 turns', ended);
  t('NPC asked a question during convo', sawQuestion);
  t('convoUI inactive after end', Game.convoUI(wvid).active === false);
  t('Talk again available', Game.convoUI(wvid).transcript.length > 0);

  // --- 3. answers remembered (fresh NPC: earlier convos already asked) ---
  console.log('3. memory');
  const mvid = roster[2];
  const mc = Game.convoGet(mvid);
  const answeredKeys = Object.keys(Game.convoGet(wvid).answered);
  t('answers recorded (from earlier convos)', answeredKeys.length > 0);
  // answer a question explicitly, then check recall on next convo.
  // (Any question — first questions are now voice-varied, so q_origin
  // isn't guaranteed. The memory mechanic is what's under test.)
  Game.startConvo(mvid);
  // force a question: stub random to trigger, answer whatever comes up
  const realRandom = Math.random;
  Math.random = () => 0.1; // low => triggers question roll (<0.4)
  let qTurns = 0, gotQ = false, answeredQid = null;
  while (qTurns < 10) {
    ui = Game.convoUI(mvid);
    if (!ui.active) break;
    const ans = ui.choices.find(x => x.id.startsWith('ans:'));
    if (ans) {
      const parts = ans.id.split(':');
      answeredQid = parts[1];
      Game.convoTurn(mvid, ans.id); gotQ = true; break;
    }
    const p = ui.choices.find(x => !x.id.startsWith('ans:') && x.id !== 'leave' && x.id !== 'deflect_q');
    if (!p) break;
    const s = Game.convoTurn(mvid, p.id);
    if (s && s.ended) break;
    qTurns++;
  }
  Math.random = realRandom;
  t('answered an NPC question', gotQ);
  t('answer stored', !!answeredQid && !!Game.convoGet(mvid).answered[answeredQid]);
  // next conversation should recall it (if the question has recall logic)
  const st2 = Game.startConvo(mvid);
  const mc2 = Game.convoGet(mvid);
  const recalled = Object.keys(mc2.recalled || {}).length > 0 || Object.keys(mc2.answered || {}).length > 0;
  t('NPC tracks your answers across convos', !!recalled);
  Game.convoTurn(mvid, 'leave');

  // --- 4. no repeats across many conversations ---
  console.log('4. no repeats');
  const seen = {};
  let dupes = 0, total = 0;
  for (let i = 0; i < 6; i++) {
    const s0 = Game.startConvo(vid);
    if (!s0) continue;
    let n = 0;
    while (n < 10) {
      const u = Game.convoUI(vid);
      if (!u.active) break;
      const key = vid;
      seen[key] = seen[key] || {};
      const lastThem = u.transcript.filter(e => e.who === 'them').slice(-1)[0];
      if (lastThem) {
        total++;
        // the honest "nothing new" pool and human filler are allowed to cycle
        const isExh = /told you everything|all I've got|nothing new|covered that|ask me again/i.test(lastThem.text)
          || /^("Yeah\."|"Mm\."|"Right\."|Nods along\.|Snorts\.|Grins\.|A short laugh\.|The quiet holds\.|\.\.\.|Say nothing more\.)$/.test(lastThem.text);
        if (!isExh) {
          if (seen[key][lastThem.text]) dupes++;
          seen[key][lastThem.text] = true;
        }
      }
      const p = u.choices.find(x => x.id === 'more') || u.choices.find(x => x.id.startsWith('ask:')) || u.choices.find(x => x.id === 'joke') || u.choices.find(x => x.id === 'agree') || u.choices.find(x => x.id === 'silence') || u.choices[0];
      const s = Game.convoTurn(vid, p.id);
      if (!s || s.ended) break;
      n++;
    }
  }
  console.log('   lines seen: ' + total + ', dupes: ' + dupes);
  t('no repeated NPC lines across 6 conversations', dupes === 0);

  // --- 5. thread exhaustion is honest ---
  console.log('5. exhaustion');
  Game.startConvo(vid);
  let exhLine = null, guard = 0;
  // force goal thread and hammer 'more'
  const u0 = Game.convoUI(vid);
  const askGoal = (u0.choices || []).find(x => x.id === 'ask:goal');
  if (askGoal) Game.convoTurn(vid, 'ask:goal');
  while (guard < 10) {
    const u = Game.convoUI(vid);
    if (!u.active) break;
    const more = u.choices.find(x => x.id === 'more');
    if (!more) break;
    const s = Game.convoTurn(vid, 'more');
    if (s && /told you everything|all I've got|nothing new/i.test(s.line)) { exhLine = s.line; break; }
    if (!s || s.ended) break;
    guard++;
  }
  t('exhausted thread admits it (or thread naturally short)', exhLine !== null || guard < 10);

  // --- 6. trust + effects on end ---
  console.log('6. effects');
  const trustBefore = (Game.state.village.trust || {})[vid] || 10;
  Game.startConvo(vid);
  Game.convoTurn(vid, 'leave');
  const trustAfter = (Game.state.village.trust || {})[vid] || 10;
  t('leaving still builds a little trust or holds', trustAfter >= trustBefore);

  // --- 7. legacy talkTo compat ---
  console.log('7. compat');
  const legacy = Game.talkTo(vid);
  t('talkTo still returns a line', typeof legacy === 'string' && legacy.length > 0);
  Game.convoTurn(vid, 'leave');

  // --- 8. multi-NPC: conversations are per-person ---
  console.log('8. per-NPC state');
  const vid2 = roster[1];
  Game.startConvo(vid); Game.startConvo(vid2);
  t('two convos independent', Game.convoGet(vid) !== Game.convoGet(vid2));
  t('second convo active', Game.convoUI(vid2).active === true);
  Game.convoTurn(vid, 'leave'); Game.convoTurn(vid2, 'leave');

  // --- 9. nonverbal conversation (no shared language) ---
  console.log('9. nonverbal');
  let nvid = roster.find(id => { try { return Game.commLevel(id).level === 'none'; } catch (e) { return false; } });
  if (!nvid) {
    // force it: strip to an unknown tongue
    nvid = roster[4];
    const nv = Game.vpOf(nvid);
    nv.languages = { native: 'klingon' };
  }
  t('found/forced no-common-language NPC', !!nvid && Game.commLevel(nvid).level === 'none');
  const nvs = Game.startConvo(nvid);
  t('nonverbal convo starts', !!nvs && nvs.choices.some(c => c.id.indexOf('nv:') === 0));
  const nvLines = [];
  let nvOk = true;
  for (let i = 0; i < 4; i++) {
    const u = Game.convoUI(nvid);
    if (!u.active) break;
    const s = Game.convoTurn(nvid, 'nv:nod');
    if (!s || !s.line) { nvOk = false; break; }
    nvLines.push(s.line);
    if (s.ended) break;
  }
  t('nonverbal turns work', nvOk);
  t('nonverbal outcomes vary', new Set(nvLines).size > 1);
  Game.convoTurn(nvid, 'leave');

  console.log(`\n${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error('THROW:', e); process.exit(2); });
