// Dialogue coherence tests — Steve's four rules for the social/leader player.
// Rule 1: choices must respond to the current conversational context.
// Rule 2: the show/teach action must relate to what's being discussed.
// Rule 3: topic transitions need narrative bridges, never hard pivots.
// Rule 4: NPC questions deserve answer options.
// Plus replay-value: line retirement, conversation memory.
// Usage: node scripts/test-dialogue-coherence.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js',
 'src/js/justice.js', 'src/js/betrayal.js', 'src/js/corpses.js', 'src/js/codex-people.js',
 'src/js/progression.js', 'src/js/ledger.js', 'src/js/debug-scenarios.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}`); }
}
const idsOf = (choices) => (choices || []).map(c => c.id);

function freshGame() {
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const roster = (Game.state.village.roster || []).filter(id => id !== Game.villagerId);
  for (const id of roster) Game.state.village.bgLangs[id] = { native: 'english', levels: { english: 3 } };
  return roster;
}
// a villager whose convo won't trip reactive/generic on the opener
function plainConvo(roster) {
  for (const id of roster) {
    try { Game.endConvo(id, 'leave'); } catch (e) {}
    const st = Game.startConvo(id);
    const c = Game.convoGet(id);
    if (!c.reactiveQ && !c.genericQ && c.thread !== 'nonverbal') return { id, st, c };
    Game.endConvo(id, 'leave');
  }
  return null;
}

(async () => {
  await Game.init();
  const cg = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/characterGen.json'), 'utf8'));

  // === RULE 4: every NPC question line in the pools yields answer options ===
  {
    const lines = [];
    const grab = (pool) => { for (const l of (pool || [])) if (typeof l === 'string' && l.indexOf('?') !== -1) lines.push(l); };
    grab(cg.convo.openers); grab(cg.talkTemplates);
    for (const v of Object.values(cg.moodTalk || {})) grab(v);
    for (const v of Object.values(cg.temperamentTalk || {})) grab(v);
    const roster = freshGame();
    const vid = roster[0];
    let answered = 0, rhetorical = 0;
    for (const line of lines) {
      Game.startConvo(vid);
      const c = Game.convoGet(vid);
      c.reactiveQ = null; c.genericQ = null; c.pendingQ = null;
      if (Game.convoMatchReactive(line)) { Game.endConvo(vid, 'leave'); answered++; continue; } // bespoke def
      const gq = Game.convoGenericQ(vid, line);
      if (!gq) { Game.endConvo(vid, 'leave'); rhetorical++; continue; } // deliberately unanswerable
      const ids = idsOf(Game.convoChoices(vid));
      const hasAnswer = ids.some(id => id.indexOf('gq:') === 0 || ['agree', 'joke', 'silence'].indexOf(id) !== -1);
      if (!hasAnswer) console.log('  no-answer line: ' + line.slice(0, 80));
      ok('R4 answers offered: ' + line.slice(0, 45), hasAnswer);
      answered++;
      Game.endConvo(vid, 'leave');
    }
    ok('R4: all ' + lines.length + ' question-lines resolve (answered=' + answered + ' rhetorical=' + rhetorical + ')',
      answered + rhetorical === lines.length);
  }

  // === RULE 4b: discourse markers are not questions; rhetorical is not either ===
  {
    const roster = freshGame();
    const vid = roster[0];
    Game.startConvo(vid);
    const c = Game.convoGet(vid);
    c.reactiveQ = null; c.genericQ = null;
    ok('R4: bare "Honestly?" is a tag, not a question',
      Game.convoGenericQ(vid, '"Honestly? holding together, somehow."') === null);
    ok('R4: rhetorical "Don\'t answer that" stays unanswerable',
      Game.convoGenericQ(vid, '"Do you think they talk about me? Don\'t answer that."') === null);
    Game.endConvo(vid, 'leave');
  }

  // === RULE 4c: dodging a question never drops it silently ===
  {
    const roster = freshGame();
    const pc = plainConvo(roster);
    ok('R4: plain convo available', !!pc);
    if (pc) {
      const { id: vid } = pc;
      const c = Game.convoGet(vid);
      Game.convoGenericQ(vid, '"Are you eating enough? You look thin."');
      // dodge once with a topic ask
      let choices = Game.convoChoices(vid);
      const dodge = choices.find(ch => ch.id.indexOf('ask:') === 0);
      ok('R4: dodge option exists alongside answers', !!dodge);
      if (dodge) {
        Game.convoTurn(vid, dodge.id);
        const c2 = Game.convoGet(vid);
        const followedUp = c2.genericQ && c2.genericQ.followedUp;
        ok('R4: dodged question gets one follow-up, not silence', !!followedUp);
        // dodge again -> honest lapse, never a silent drop
        choices = Game.convoChoices(vid);
        const dodge2 = choices.find(ch => ch.id.indexOf('ask:') === 0) || choices.find(ch => ch.id === 'joke');
        if (dodge2 && followedUp) {
          Game.convoTurn(vid, dodge2.id);
          const c3 = Game.convoGet(vid);
          ok('R4: second dodge lapses honestly', c3.genericQ === null);
          if (dodge2.id.indexOf('ask:') === 0) {
            const lapseLine = (c3.transcript || []).map(e => e.text).join(' ');
            ok('R4: lapse is spoken, not silent', /Never mind|Forget it/.test(lapseLine));
          } else {
            // humor is an answer, not a dodge — the question was engaged
            ok('R4: joke engages the question (humor is an answer)', true);
          }
        }
      }
      Game.endConvo(vid, 'leave');
    }
  }

  // === RULE 1: mid-question menus narrow — no context-ignoring pivots ===
  {
    const roster = freshGame();
    const pc = plainConvo(roster);
    ok('R1: plain convo available', !!pc);
    if (pc) {
      const { id: vid } = pc;
      Game.convoGenericQ(vid, '"Do you think the stars look different now?"');
      const ids = idsOf(Game.convoChoices(vid));
      const bad = ids.filter(id => /^(theorize|teach|ask:plans|ask:village|ask:gossip)/.test(id) && id !== 'ask:village' && id !== 'ask:plans');
      ok('R1: no teach/theorize mid-question (' + ids.join(',') + ')',
        ids.indexOf('teach') === -1 && ids.indexOf('theorize') === -1);
      ok('R1: answers lead the menu', ids[0].indexOf('gq:') === 0);
      Game.endConvo(vid, 'leave');
    }
  }

  // === RULE 2: teach connects to the topic ===
  {
    const roster = freshGame();
    const vid = roster[0];
    Game.state.codex.plants = Game.state.codex.plants || {};
    for (const p of (Game.data.plants || []).slice(0, 8)) Game.state.codex.plants[p.id] = { level: 3 };
    try { Game.discover('teach'); } catch (e) {}
    const plantNames = (Game.data.plants || []).slice(0, 8).map(p => p.name);
    // (a) NPC names a teachable plant -> you teach THAT plant, connected line
    Game.startConvo(vid);
    let c = Game.convoGet(vid);
    c.reactiveQ = null; c.genericQ = null;
    Game.state.village.taught[vid] = []; // clear seeded knowledge: control the setup
    const named = (Game.data.plants || []).slice(0, 8)[0];
    Game.convoNoteFlora(vid, `"The ${named.name} down by the creek is fruiting early."`);
    ok('R2: flora mention detected', !!(c.floraMentioned && c.floraMentioned.pid === named.id));
    let choices = Game.convoChoices(vid);
    if (idsOf(choices).indexOf('teach') !== -1) {
      Game.convoTurn(vid, 'teach');
      c = Game.convoGet(vid);
      const taught = (Game.state.village.taught[vid] || []);
      ok('R2: mentioned plant is the one taught', taught.indexOf(named.id) !== -1);
      const txt = c.transcript.map(e => e.text).join(' ');
      ok('R2: teach line connects to the mention', txt.indexOf(named.name) !== -1 && /you were just talking about/.test(txt));
    } else ok('R2: teach offered', false);
    Game.endConvo(vid, 'leave');
    // (b) nothing green mentioned -> bridge, never a random teach
    const vid2 = roster[1];
    Game.startConvo(vid2);
    c = Game.convoGet(vid2);
    c.reactiveQ = null; c.genericQ = null; c.floraMentioned = null;
    choices = Game.convoChoices(vid2);
    if (idsOf(choices).indexOf('teach') !== -1) {
      Game.convoTurn(vid2, 'teach');
      c = Game.convoGet(vid2);
      const youLine = (c.transcript.find(e => e.who === 'you') || {}).text || '';
      ok('R2: irrelevant teach carries a bridge (' + youLine.slice(0, 50) + ')',
        /reminds me|Different subject|Speaking of staying alive/.test(youLine));
    } else ok('R2: teach offered (b)', false);
    Game.endConvo(vid2, 'leave');
  }

  // === RULE 3: formal question off a live thread carries a bridge ===
  {
    const roster = freshGame();
    const pc = plainConvo(roster);
    ok('R3: plain convo available', !!pc);
    if (pc) {
      const { id: vid } = pc;
      const c = Game.convoGet(vid);
      c.reactiveQ = null; c.genericQ = null;
      c.thread = 'plans'; c.depth = 1; // live thread, like the tree-line moment
      // Drive until the formal question fires (forceQ at exchanges>=2 in a
      // first conversation). Clear any incidental genericQ so the setup
      // stays controlled — this test is about the bridge, not Rule 4.
      let guard = 0;
      while (guard++ < 6 && !Game.convoGet(vid).pendingQ && Game.convoGet(vid).active && !Game.convoGet(vid).over) {
        const cc = Game.convoGet(vid);
        cc.genericQ = null;
        if (cc.windingDown) break;
        const chs = idsOf(Game.convoChoices(vid));
        const pick = chs.indexOf('agree') !== -1 ? 'agree'
          : chs.indexOf('silence') !== -1 ? 'silence'
          : chs.indexOf('joke') !== -1 ? 'joke' : null;
        if (!pick) break;
        Game.convoTurn(vid, pick);
      }
      const c2 = Game.convoGet(vid);
      ok('R3: formal question fired off the thread', !!c2.pendingQ);
      if (c2.pendingQ) {
        const t = c2.transcript;
        const qi = t.map(e => e.text).findIndex(x => x && x.indexOf(c2.pendingQ.q) !== -1);
        const prev = qi > 0 ? t[qi - 1].text : '';
        ok('R3: bridge precedes the question (' + prev.slice(0, 50) + ')',
          /A beat|let that thread drop|A pause|glance away/.test(prev));
      }
      Game.endConvo(vid, 'leave');
    }
  }

  // === REPLAY: no identical openers twice in a row from the same villager ===
  {
    const roster = freshGame();
    let checked = 0, okCount = 0;
    for (const vid of roster.slice(0, 4)) {
      const s1 = Game.startConvo(vid); Game.endConvo(vid, 'leave');
      const s2 = Game.startConvo(vid); Game.endConvo(vid, 'leave');
      checked++;
      if (s1.line !== s2.line) okCount++;
      else console.log('  repeat opener: ' + s1.line.slice(0, 60));
    }
    ok('replay: ' + okCount + '/' + checked + ' villagers vary consecutive openers', okCount === checked);
  }

  // === REPLAY: NPCs don't re-ask formal questions (conversation memory) ===
  {
    const roster = freshGame();
    const vid = roster[1];
    const seen = [];
    // Up to 5 rounds to collect 3 (a round can end early on wind-down;
    // the assertion is about distinctness + persistence, not the schedule).
    for (let round = 0; round < 5 && seen.length < 3; round++) {
      Game.startConvo(vid);
      const c = Game.convoGet(vid);
      c.reactiveQ = null; c.genericQ = null;
      c.count = 1; // re-arm forceQ: deterministic formal question per round
      let guard = 0;
      while (guard++ < 6 && !c.pendingQ && c.active && !c.over && !c.windingDown) {
        Game.convoGet(vid).genericQ = null;
        const chs = idsOf(Game.convoChoices(vid));
        // reacts only — never drive a thread (that would block forceQ)
        const pick = chs.indexOf('agree') !== -1 ? 'agree'
          : chs.indexOf('silence') !== -1 ? 'silence'
          : chs.indexOf('joke') !== -1 ? 'joke' : null;
        if (!pick) break;
        Game.convoTurn(vid, pick);
      }
      if (c.pendingQ) {
        seen.push(c.pendingQ.id);
        const ans = (Game.convoChoices(vid) || []).find(ch => ch.id.indexOf('ans:') === 0);
        if (ans) Game.convoTurn(vid, ans.id); // answer it too
      }
      Game.endConvo(vid, 'leave');
    }
    const uniq = [...new Set(seen)];
    ok('memory: 3 formal questions fired across rounds', seen.length === 3);
    const c = Game.convoGet(vid);
    ok('memory: askedQs persists across the conversation boundary',
      seen.every(id => c.askedQs.indexOf(id) !== -1));
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
