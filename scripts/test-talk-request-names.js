// Talk-request name freshness tests. Usage: node scripts/test-talk-request-names.js
// Bug: "Can we talk?" requests baked the requester's displayName at CREATION
// time. Names are earned socially — a day-1 requester stored as "A person,
// maybe 60s" would open the conversation with that stale descriptor even
// after the player learned their real name ("Daljit").
// Fix: requests store a __NAME__ template; the name renders at DELIVERY time.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/party.js', 'src/js/justice.js',
 'src/js/conversation.js', 'src/js/truth.js', 'src/js/betrayal.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}`); }
}
const realName = (vid) => {
  // same lookup revealName itself uses: villagers, then background_survivors
  const v = ((Game.data.villagers || []).find(x => x.id === vid) || {})
  const b = ((Game.data.background_survivors || []).find(x => x.id === vid) || {});
  return ((v.name || b.name || 'Someone')).split(' ')[0];
};

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const roster = Game.state.village.roster.filter(id => id !== Game.villagerId);

  // === 1. DAY-1 NUDGE: stored as template, delivered with the earned name ===
  {
    Game.state.scholar.day = 1;
    Game.state.village.day1NudgeDone = false;
    Game.state.village.talkRequests = {};
    Game.dayOneNudge();
    const reqs = Object.keys(Game.state.village.talkRequests || {});
    ok('nudge: exactly one request fires on day 1', reqs.length === 1);
    const stored = Game.state.village.talkRequests[reqs[0]].line;
    ok('nudge: stored line is a template (no baked name)', stored.indexOf('__NAME__') !== -1);
    ok('nudge: stored line has no stale descriptor', !/maybe \d0s/.test(stored));

    // Delivery scenario, deterministic: a requester the player shares words
    // with. (A 'none'-comm requester gets the nonverbal barrier opening —
    // by design, never fluent English — so the template is tested directly.)
    const vid = roster.find(id => { try { return Game.commLevel(id).level !== 'none'; } catch (e) { return false; } });
    Game.state.village.talkRequests = { [vid]: { line: stored } };
    const rn = realName(vid);
    ok('test setup: name is earned through the intro', rn !== 'Someone');
    const st = Game.startConvo(vid);
    ok('nudge: opening still invites talk', /Can we talk\?/.test(st.line || ''));
    ok(`nudge: delivered with earned name (${rn}), not the descriptor`,
      (st.line || '').indexOf(rn) !== -1 && !/maybe \d0s/.test(st.line || ''));
    Game.endConvo(vid, 'leave');
  }

  // === 2. talkReason: all reasons are templates ===
  {
    let checked = 0, templated = 0;
    for (let i = 0; i < 60 && checked < 20; i++) {
      const vid = roster[i % roster.length];
      const r = Game.talkReason(vid);
      if (!r) continue;
      checked++;
      // reasons that mention the speaker must use the placeholder
      if (/__NAME__/.test(r.line) || !/maybe \d0s/.test(r.line)) templated++;
    }
    ok(`talkReason: returns reasons (${checked} checked)`, checked > 0);
    ok('talkReason: no baked descriptors in any reason', templated === checked);
    // renderTalkLine fills the placeholder with the CURRENT displayName
    const vid = roster[0];
    Game.revealName(vid, 'intro');
    const rn = realName(vid);
    const out = Game.renderTalkLine(`"Can we talk?" __NAME__ shifts their weight.`, vid);
    ok('renderTalkLine: placeholder becomes the current name', out.indexOf(rn) !== -1);
    // old saves (baked text, no placeholder) render unchanged — no crash
    const old = Game.renderTalkLine('"Can we talk?" A person, maybe 60s sits down near you.', vid);
    ok('renderTalkLine: legacy baked lines pass through', /maybe 60s/.test(old));
  }

  // === 3. NPC ASKS YOU: a passive conversationalist gets questioned ===
  // Design: questions follow the player's lead — they land after small talk,
  // not when the player is driving threads. A first conversation of pure
  // small talk (agree/joke/silence) must include a question from them.
  {
    // FRESH villager: nobody talked to yet in this run (section 1 used one).
    const used = Object.keys(Game.state.village.conv || {});
    const vid = roster.find(id => used.indexOf(id) === -1 && (() => { try { return Game.commLevel(id).level !== 'none'; } catch (e) { return false; } })());
    let sawQuestion = false, answered = false;
    const st = Game.startConvo(vid);
    void st;
    let guard = 0;
    while (guard++ < 14) {
      const c = Game.convoGet(vid);
      if (!c || c.over || !c.active) break;
      const choices = Game.convoChoices(vid) || [];
      if (!choices.length) break;
      // a question is pending: answer it
      const ans = choices.find(ch => ch.id.indexOf('ans:') === 0);
      if (ans) {
        sawQuestion = true;
        const r = Game.convoTurn(vid, ans.id);
        answered = !!(Game.convoGet(vid).answered && Object.keys(Game.convoGet(vid).answered).length);
        void r;
        continue;
      }
      // otherwise stay passive: reacts only, never drive a thread
      const passive = choices.find(ch => ['agree', 'joke', 'silence'].indexOf(ch.id) !== -1)
        || choices.find(ch => ch.id === 'deflect_q');
      if (!passive) break;
      Game.convoTurn(vid, passive.id);
    }
    try { Game.endConvo(vid, 'leave'); } catch (e) {}
    ok('passive first conversation: they ask you a question', sawQuestion);
    ok('passive first conversation: your answer is remembered', answered);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
