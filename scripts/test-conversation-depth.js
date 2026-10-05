// Conversation depth tests: variety, flow, dead-end audit.
// Steve's phone verdict: "Most still seem to start the same way and take the
// same paths, and it feels all very stiff. Some options cut off the dialog
// after speaking a few answers from the person."
// Usage: node scripts/test-conversation-depth.js
//
// 1. OPENER VARIETY: N consecutive conversations with different villagers
//    produce no repeated opener.
// 2. THREAD DEPTH: goal/past/plans threads serve >=K distinct beats before
//    honest exhaustion (across conversations; no-repeat tracking persists).
// 3. GRAPH WALK (dead-end audit): every choice from every thread entry leads
//    somewhere real — a live turn with choices, a wind-down, or a deliberate
//    player-chosen exit. No surprise endings, no nulls, no exceptions.
// 4. REACTIVE COVERAGE: every reactive answer continues the scene.
// 5. QUESTION FOLLOW BEATS: answers sometimes earn a second beat.
// 6. WIND-DOWN: budget end lands gracefully, never a chop.
// 7. DEFLECT COHERENCE: a deflected past closes the topic without killing
//    the conversation.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js',
 'src/js/justice.js', 'src/js/betrayal.js', 'src/js/corpses.js', 'src/js/codex-people.js',
 'src/js/progression.js', 'src/js/ledger.js', 'src/js/debug-scenarios.js'
].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}` + (extra ? ' — ' + extra : '')); }
}
const normId = (id) => {
  if (/^(ans|react):/.test(id)) return id.split(':').slice(0, 2).join(':');
  return id;
};
function freshGame() {
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  return (Game.state.village.roster || []).filter(id => id !== Game.villagerId);
}
function setTrust(ids, n) {
  Game.state.village.trust = Game.state.village.trust || {};
  for (const id of ids) Game.state.village.trust[id] = n;
}
function startWithOpener(vid, line, thread) {
  const real = Game.convoOpening;
  Game.convoOpening = () => ({ line, thread: thread || 'small' });
  const st = Game.startConvo(vid);
  Game.convoOpening = real;
  return st;
}

(async () => {
  await Game.init();

  // === 0. POOL SIZE REPORT (the variety budget) ===
  {
    const cg = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/characterGen.json'), 'utf8'));
    const tt = Object.values(cg.temperamentTalk).map(v => v.length);
    const mt = Object.values(cg.moodTalk).map(v => v.length);
    const io = Object.values(cg.intelOpeners).map(v => v.length);
    console.log(`pools: temperamentTalk ${Math.min(...tt)}-${Math.max(...tt)}/temp, ` +
      `moodTalk ${Math.min(...mt)}-${Math.max(...mt)}/mood, intelOpeners ${Math.min(...io)}-${Math.max(...io)}/intel, ` +
      `openers ${cg.convo.openers.length}, templates ${cg.talkTemplates.length}, ` +
      `questions ${cg.convo.questions.length}, goalFollow ${cg.convo.goalFollow.lead.length}/goal, ` +
      `pastFollow ${cg.convo.pastFollow.length}, plansFollow ${cg.convo.plansFollow.length}, ` +
      `winddowns ${Object.keys(cg.convo.winddowns || {}).length} temps`);
    ok('temperamentTalk >= 6 per temperament', Math.min(...tt) >= 6);
    ok('moodTalk >= 4 per mood', Math.min(...mt) >= 4);
    ok('intelOpeners >= 4 per intelligence', Math.min(...io) >= 4);
    ok('every question has a follow beat', cg.convo.questions.every(q => typeof q.follow === 'string' && q.follow.length > 0));
    ok('every question has >= 2 answers', cg.convo.questions.every(q => (q.answers || []).length >= 2));
    ok('winddowns pool exists per temperament', Object.keys(cg.convo.winddowns || {}).length >= 10);
    // foreign speech covers every non-english language
    const fspeech = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/foreignSpeech.json'), 'utf8'));
    const langIds = cg.languages.map(l => l.id).filter(id => id !== 'english');
    const uncovered = langIds.filter(id => !fspeech[id]);
    ok('foreignSpeech covers every language', uncovered.length === 0, uncovered.join(','));
    for (const id of langIds) {
      for (const kind of ['openers', 'questions', 'agree', 'warm', 'need_food', 'need_danger']) {
        if (!((fspeech[id] || {})[kind] || []).length) { ok(`foreignSpeech ${id}.${kind} non-empty`, false); }
      }
    }
    pass++; // the loop above only fails on gaps
  }

  // === 1. OPENER VARIETY: 12 villagers, 12 distinct openers ===
  {
    const roster = freshGame();
    setTrust(roster, 10); // below every goal shareAt: no goal-branch openers
    const seen = [];
    const villagers = roster.slice(0, 12);
    for (const vid of villagers) {
      const st = Game.startConvo(vid);
      ok(`opener returned for ${vid.slice(0, 8)}`, !!(st && st.line));
      seen.push(st.line);
      Game.endConvo(vid, 'left');
    }
    const uniq = new Set(seen).size;
    ok(`12 conversations, 12 distinct openers (got ${uniq})`, uniq === villagers.length,
      seen.filter((l, i) => seen.indexOf(l) !== i).slice(0, 2).join(' / '));
  }

  // === 2. THREAD DEPTH: >= 6 distinct beats per thread before exhaustion ===
  {
    const K = 6;
    const drain = (vid, topic) => {
      const key = { goal: 'goaldeep', past: 'pastdeep', plans: 'plansdeep' }[topic];
      const poolLen = topic === 'goal'
        ? ((Game.data.characterGen.convo.goalFollow || {})[Game.npcGoal(vid)] || []).length
        : (Game.data.characterGen.convo[topic === 'past' ? 'pastFollow' : 'plansFollow'] || []).length;
      let guard = 0;
      for (let convo = 0; convo < 6 && guard++ < 80; convo++) {
        // allow re-asking the goal across conversations
        if (Game.state.village.goalsKnown) delete Game.state.village.goalsKnown[vid];
        let cur = Game.startConvo(vid);
        let tguard = 0;
        while (cur && !cur.ended && tguard++ < 16) {
          const c = Game.convoGet(vid);
          const ids = cur.choices.map(x => x.id);
          let pick = null;
          // answer what hangs: reactive questions and formal questions first,
          // or the topic stays buried under the menu
          if (c.reactiveQ) pick = ids.find(id => id.indexOf('react:') === 0);
          else if (c.pendingQ) pick = ids.find(id => id.indexOf('ans:') === 0) || 'deflect_q';
          else if (c.thread !== topic && ids.includes('ask:' + topic)) pick = 'ask:' + topic;
          else if (ids.includes('more')) pick = 'more';
          else if (cur.windingDown) pick = 'leave';
          else if (ids.includes('subject')) pick = 'subject';
          else break;
          if (!pick) break;
          cur = Game.convoTurn(vid, pick);
        }
        // endConvo clears the thread, so exhaustion is measured on said-lines,
        // not on convoThreadHasMore
        const said = (Game.convoGet(vid).said[key] || []).length;
        if (said >= poolLen) break;
        try { Game.endConvo(vid, 'left'); } catch (e) {}
      }
      const c = Game.convoGet(vid);
      return (c.said[key] || []).slice();
    };
    const roster = freshGame();
    setTrust(roster, 80); // deep gates open, past never deflects
    // Force a steady temperament on drain villagers: deflectors only offer 2
    // topics (topicCap) and run short budgets — thread depth is what we test.
    const vps = (Game.data.villagers || []).concat(Game.data.background_survivors || []);
    const forceSteady = (vid) => {
      const vp = vps.find(x => x.id === vid);
      if (vp) { vp.personality = vp.personality || {}; vp.personality.temperament = 'steady'; }
    };
    const pickDrainVid = () => {
      const vid = roster.find(id => {
        try { return Game.commLevel(id).level !== 'none'; } catch (e) { return true; }
      });
      forceSteady(vid);
      return vid;
    };
    for (const topic of ['past', 'plans']) {
      const beats = drain(pickDrainVid(), topic);
      ok(`${topic} thread serves >= ${K} distinct beats (got ${beats.length})`, beats.length >= K);
      ok(`${topic} beats never repeat`, new Set(beats).size === beats.length);
    }
    // goal: one villager per goal present in the roster
    const byGoal = {};
    for (const id of roster) {
      try {
        if (Game.commLevel(id).level === 'none') continue;
        const g = Game.npcGoal(id);
        (byGoal[g] = byGoal[g] || []).push(id);
      } catch (e) {}
    }
    const goals = Object.keys(byGoal);
    ok('roster covers >= 4 goals for the depth check', goals.length >= 4, goals.join(','));
    for (const g of goals.slice(0, 6)) {
      const vid = byGoal[g][0];
      forceSteady(vid);
      const beats = drain(vid, 'goal');
      ok(`goal '${g}' serves >= ${K} distinct beats (got ${beats.length})`, beats.length >= K);
      ok(`goal '${g}' beats never repeat`, new Set(beats).size === beats.length);
    }
  }

  // === 3. GRAPH WALK: every choice leads somewhere real ===
  {
    const roster = freshGame();
    setTrust(roster, 45);
    // Force the temperaments we want to cover (mutating generated villagers
    // is fine headless) plus one forced-nonverbal villager.
    const wantTemps = ['withdrawn', 'prickly', 'warm', 'dry', 'intense', 'steady'];
    const walkIds = [];
    const vps = (Game.data.villagers || []).concat(Game.data.background_survivors || []);
    wantTemps.forEach((t, i) => {
      const vid = roster[i % roster.length];
      const vp = vps.find(x => x.id === vid);
      if (vp) { vp.personality = vp.personality || {}; vp.personality.temperament = t; }
      if (!walkIds.includes(vid)) walkIds.push(vid);
    });
    // force nonverbal: a tongue the player doesn't share
    const nvId = roster[roster.length - 1];
    Game.state.village.bgLangs = Game.state.village.bgLangs || {};
    Game.state.village.bgLangs[nvId] = { native: 'swahili', levels: { swahili: 2 } };
    try { Game.state.scholar.languages = Game.state.scholar.languages || {}; } catch (e) {}
    if (!walkIds.includes(nvId)) walkIds.push(nvId);
    const nv = Game.commLevel(nvId).level === 'none' ? nvId : null;
    ok('walk covers deflectors + core temps + nonverbal',
      walkIds.length >= 6 && !!nv, walkIds.map(id => Game.npcTemper(id)).join(','));

    for (const vid of walkIds) {
      const tried = new Set();
      let convos = 0, turns = 0, sawWindDown = false, sawEnd = false;
      let isNV = false;
      try { isNV = Game.commLevel(vid).level === 'none'; } catch (e) {}
      // NOTE: the walk does NOT stop at the first ended conversation — later
      // conversations try the remaining choice types (state persists).
      while (convos < 4 && turns < 60) {
        convos++;
        let cur = Game.startConvo(vid);
        let prevWindDown = false;
        let tguard = 0;
        while (cur && !cur.ended && tguard++ < 14) {
          turns++;
          const ids = cur.choices.map(x => x.id);
          ok(`[${vid.slice(0, 6)}] live turn has choices`, ids.length > 0);
          ok(`[${vid.slice(0, 6)}] live turn offers leave`, ids.includes('leave'));
          // pick the first untried choice (leave last) to maximize coverage
          let pick = ids.map(normId).map((n, i) => ({ n, id: ids[i] }))
            .find(x => x.id !== 'leave' && !tried.has(x.n));
          if (!pick) pick = { id: 'leave', n: 'leave' };
          tried.add(pick.n);
          let r = null, err = null;
          try { r = Game.convoTurn(vid, pick.id); }
          catch (e) { err = e; }
          ok(`[${vid.slice(0, 6)}] '${pick.n}' does not throw`, !err, err && err.message);
          if (err) break;
          ok(`[${vid.slice(0, 6)}] '${pick.n}' returns a turn`, !!r);
          if (!r) break;
          ok(`[${vid.slice(0, 6)}] '${pick.n}' returns a line`, typeof r.line === 'string' && r.line.length > 0);
          if (r.windingDown) sawWindDown = true;
          if (r.ended) {
            sawEnd = true;
            ok(`[${vid.slice(0, 6)}] ended only via leave or after wind-down`,
              pick.id === 'leave' || prevWindDown, `pick=${pick.id}`);
            break;
          }
          ok(`[${vid.slice(0, 6)}] live turn has follow-up choices`, (r.choices || []).length > 0);
          prevWindDown = !!r.windingDown;
          cur = r;
        }
        if (cur && !cur.ended) { try { Game.endConvo(vid, 'left'); sawEnd = true; } catch (e) {} }
      }
      ok(`[${vid.slice(0, 6)}${isNV ? '/nv' : ''}] walk reached turns`, turns >= 8, `turns=${turns}`);
      if (!isNV) ok(`[${vid.slice(0, 6)}] walk saw a wind-down landing`, sawWindDown);
      ok(`[${vid.slice(0, 6)}] walk tried >= ${isNV ? 4 : 6} distinct choice types`, tried.size >= (isNV ? 4 : 6),
        [...tried].join(','));
    }
  }

  // === 4. REACTIVE COVERAGE: every reactive answer continues the scene ===
  {
    const roster = freshGame();
    setTrust(roster, 30);
    // enumerate reactive defs by probing the registry through match strings
    const src = fs.readFileSync(path.join(ROOT, 'src/js/conversation.js'), 'utf8');
    const matches = [...src.matchAll(/^\s*match: '((?:[^'\\]|\\.)*)',/gm)].map(x => x[1].replace(/\\'/g, "'"));
    ok('reactive registry non-empty', matches.length >= 8);
    let vi = 0;
    for (const mt of matches) {
      const def = Game.convoMatchReactive('zz' + mt + 'zz');
      for (const a of def.answers) {
        const vid = roster[vi++ % roster.length];
        startWithOpener(vid, `"${mt}"`, 'small');
        const r = Game.convoTurn(vid, `react:${def.id}:${a.id}`);
        ok(`react:${def.id}:${a.id} continues (not ended)`, r && !r.ended);
        ok(`react:${def.id}:${a.id} has a line`, r && typeof r.line === 'string' && r.line.length > 0);
        ok(`react:${def.id}:${a.id} offers leave`, r && (r.choices || []).some(c => c.id === 'leave'));
        try { Game.endConvo(vid, 'left'); } catch (e) {}
      }
    }
  }

  // === 5. QUESTION FOLLOW BEATS: answers earn a second beat ===
  {
    const roster = freshGame();
    setTrust(roster, 50);
    const vid = roster[0];
    const cg = Game.data.characterGen.convo;
    const qd = cg.questions.find(q => q.id === 'q_miss');
    Game.startConvo(vid);
    const c = Game.convoGet(vid);
    c.pendingQ = qd;
    const realRandom = Math.random;
    Math.random = () => 0.1; // force the 50% follow roll
    let r;
    try { r = Game.convoTurn(vid, 'ans:q_miss:a_food'); }
    finally { Math.random = realRandom; }
    const them = (r.transcript || []).filter(t => t.who === 'them');
    ok('answer + follow = two them-beats in one turn', them.length >= 2,
      them.map(t => t.text.slice(0, 40)).join(' | '));
    ok('follow beat is the question follow line',
      them.length >= 2 && them[them.length - 1].text.indexOf(qd.follow) !== -1);
    try { Game.endConvo(vid, 'left'); } catch (e) {}
  }

  // === 6. WIND-DOWN: budget end lands gracefully ===
  {
    const roster = freshGame();
    setTrust(roster, 30);
    const vid = roster[0];
    let cur = Game.startConvo(vid);
    let wd = null, guard = 0;
    while (cur && !cur.ended && guard++ < 12) {
      const ids = cur.choices.map(x => x.id);
      const pick = ids.find(id => id !== 'leave');
      cur = Game.convoTurn(vid, pick);
      if (cur && cur.windingDown) { wd = cur; break; }
    }
    ok('wind-down beat fires before natural end', !!wd);
    if (wd) {
      ok('wind-down is not ended', !wd.ended);
      ok('wind-down offers leave', wd.choices.some(c => c.id === 'leave'));
      ok('wind-down line is non-empty', typeof wd.line === 'string' && wd.line.length > 0);
      const ids = wd.choices.map(x => x.id);
      const r2 = Game.convoTurn(vid, ids.includes('more') ? 'more' : 'leave');
      ok('turn after wind-down ends the scene', r2 && r2.ended);
    } else { try { Game.endConvo(vid, 'left'); } catch (e) {} }
  }

  // === 7. DEFLECT COHERENCE: closed past, open conversation ===
  {
    const roster = freshGame();
    // force a deflector: withdrawing/prickly villagers are not guaranteed
    const vps = (Game.data.villagers || []).concat(Game.data.background_survivors || []);
    const vp0 = vps.find(x => x.id === roster[0]);
    if (vp0) { vp0.personality = vp0.personality || {}; vp0.personality.temperament = 'withdrawn'; }
    let deflected = null;
    for (const vid of roster) {
      const t = Game.npcTemper(vid);
      if (!(t === 'withdrawn' || t === 'prickly')) continue;
      try { if (Game.commLevel(vid).level === 'none') continue; } catch (e) {}
      Game.state.village.trust = Game.state.village.trust || {};
      Game.state.village.trust[vid] = 5;
      Game.startConvo(vid);
      const realRandom = Math.random;
      Math.random = () => 0.1; // force the 55% deflect roll
      let r;
      try { r = Game.convoTurn(vid, 'ask:past'); }
      finally { Math.random = realRandom; }
      if (Game.convoGet(vid).pastDeflected) { deflected = { vid, r }; break; }
      try { Game.endConvo(vid, 'left'); } catch (e) {}
    }
    ok('deflect path reachable for withdrawn/prickly at low trust', !!deflected);
    if (deflected) {
      const { vid, r } = deflected;
      const ids = (r.choices || []).map(x => x.id);
      ok('deflect does not end the conversation', r && !r.ended);
      ok("'tell me more' not offered after a deflect", !ids.includes('more'));
      ok('other topics still offered after deflect', ids.some(id => id.indexOf('ask:') === 0));
      // the conversation continues somewhere real
      const r2 = Game.convoTurn(vid, ids.includes('ask:village') ? 'ask:village' : 'leave');
      ok('conversation continues after deflect', r2 && (r2.ended || (r2.choices || []).length > 0));
      try { Game.endConvo(vid, 'left'); } catch (e) {}
    }
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
