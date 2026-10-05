// Socialite archetype playtest: play as the village's social connector.
// Hold real conversations (choices, follow-ups, gossip), build relationships,
// track trust over days, test party building post-System arrival (day 7+).
// Multi-day feel evaluation: is the social game fun or chores?
// Usage: node scripts/playtest-socialite.js [--seed N]
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/food.js', 'src/js/conversation.js', 'src/js/journal.js',
 'src/js/party.js', 'src/js/party-formal.js', 'src/js/truth.js', 'src/js/betrayal.js',
 'src/js/villager-agency.js'
].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

const seedIdx = process.argv.indexOf('--seed');
let seedUsed = 'random';
if (seedIdx >= 0 && process.argv[seedIdx + 1] !== undefined) {
  let s = parseInt(process.argv[seedIdx + 1], 10) || 1;
  seedUsed = String(s);
  Math.random = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
}

const name = (vid) => { try { return Game.displayName(vid); } catch (e) { return vid; }; };
const linesSeen = [];        // all NPC lines, village-wide, to catch repeats
const choiceIdsSeen = {};    // choice ids exercised
const convoStats = [];       // per-conversation summaries
const errors = [];

// Play one full conversation like a curious socialite would:
// open, ask a topic (rotating), follow up with "tell me more" once or twice,
// ask about THEM (questions back), maybe gossip, react naturally.
function holdConversation(vid, topics) {
  const rec = { vid: name(vid), exchanges: 0, lines: [], ended: null, npcAskedMe: false, errors: [] };
  try {
    const st = Game.startConvo(vid);
    if (st && st.line) { rec.lines.push(st.line); linesSeen.push(st.line); }
    const cc = Game.convoGet(vid);
    if (cc && cc.thread === 'nonverbal') { rec.nonverbal = true; }
    // NPC may have opened with a talk request or question
    // QUESTION DETECTION (2026-10-05): r.askedMe was never set by the engine —
    // detect via convo state (pendingQ/genericQ/reactiveQ) instead.
    let guard = 0;
    while (guard++ < 12) {
      const cur = Game.convoGet(vid);
      if (!cur || cur.over || !cur.active) { rec.ended = cur && cur.over ? 'over' : 'inactive'; break; }
      if (cur.pendingQ || cur.genericQ || cur.reactiveQ) rec.npcAskedMe = true;
      const choices = Game.convoChoices(vid) || [];
      choices.forEach(c => { choiceIdsSeen[c.id] = (choiceIdsSeen[c.id] || 0) + 1; });
      if (!choices.length) { rec.ended = 'no-choices'; break; }
      // pick like a player: prefer the rotating topic if unasked, then other
      // unasked topics, then follow-ups, then gossip, then a reaction
      const unaskedTopic = choices.find(c => /^ask:/.test(c.id) && topics.indexOf(c.id) !== -1 && (cur.askedTopics || []).indexOf(c.id.replace('ask:', '')) === -1);
      let pick = unaskedTopic ||
        choices.find(c => /^ask:/.test(c.id) && (cur.askedTopics || []).indexOf(c.id.replace('ask:', '')) === -1) ||
        choices.find(c => c.id === 'more') ||
        choices.find(c => c.id === 'ask:gossip') ||
        choices.find(c => /agree|joke|laugh/.test(c.id)) ||
        choices[Math.floor(Math.random() * choices.length)];
      if (!pick) { rec.ended = 'no-choices'; break; }
      // answer hanging questions when asked (first answer choice), then pivot
      let r;
      try {
        const cur2 = Game.convoGet(vid);
        if (cur2 && (cur2.pendingQ || cur2.genericQ || cur2.reactiveQ)) rec.npcAskedMe = true;
        r = Game.convoTurn(vid, pick.id);
      }
      catch (e) { rec.errors.push(`turn(${pick.id}): ${e.message}`); errors.push(`convoTurn ${pick.id} threw: ${e.message}`); break; }
      rec.exchanges++;
      if (r && r.line) { rec.lines.push(r.line); linesSeen.push(r.line); }
      if (r && r.askedMe) rec.npcAskedMe = true;
      if (cur.over) { rec.ended = r && r.ended ? 'ended' : 'over'; break; }
      if (pick.id === 'leave' || pick.id === 'goodbye') { rec.ended = 'left'; break; }
    }
    try { Game.endConvo(vid, 'left'); } catch (e) {}
  } catch (e) { rec.errors.push(`open: ${e.message}`); errors.push(`conversation with ${vid} threw: ${e.message}`); }
  convoStats.push(rec);
  return rec;
}

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();

  const v = Game.state.village;
  const roster = v.roster.filter(id => id !== Game.villagerId);
  console.log(`=== SOCIALITE PLAYTEST: ${roster.length} villagers, seed ${seedUsed} ===`);

  const topicCycle = ['ask:goal', 'ask:past', 'ask:village', 'ask:plans'];
  const dayTrust = [];
  let talkReqsSeen = 0, npcQuestions = 0, followupsEarned = 0;

  for (let d = 0; d < 10; d++) {
    const day = Game.state.scholar.day;
    console.log(`\n---------- DAY ${day} ----------`);
    // FEED THE SOCIALITE: a talker eats from the pantry, same as any villager.
    // Without this the run starves on night 6 and the social game can't be played.
    Game.state.scholar.kcal = Math.max(Game.state.scholar.kcal || 0, 2800);
    Game.state.scholar.health = Math.max(Game.state.scholar.health || 0, 100);
    Game.stockPantry(40000, 'playtest pantry');
    try { Game.betrayalDaily(); } catch (e) { errors.push(`betrayalDaily d${day}: ${e.message}`); }
    try { Game.npcInviteTick(); } catch (e) { errors.push(`npcInviteTick d${day}: ${e.message}`); }

    // talk requests: "Can we talk?" — count only PENDING ones (delivered
    // records linger by design; raw lines are __NAME__ templates, so render).
    const reqs = Object.keys(v.talkRequests || {}).filter(id => v.talkRequests[id] && !v.talkRequests[id].delivered);
    if (reqs.length) {
      talkReqsSeen += reqs.length;
      const show = reqs.map(id => `${name(id)}: "${Game.renderTalkLine(v.talkRequests[id].line, id).slice(0, 70)}"`);
      console.log(`talk requests pending (${reqs.length}): ${show.join(' | ')}`);
    }

    // hold conversations with ~5 villagers per day (a socialite's full day)
    const shuffle = [...roster].sort(() => Math.random() - 0.5);
    const targets = shuffle.slice(0, 5);
    for (const vid of targets) {
      const t = topicCycle[d % topicCycle.length];
      const rec = holdConversation(vid, [t]);
      if (rec.npcAskedMe) npcQuestions++;
      if (rec.lines.some(l => /tell me more|go on/i.test(l))) followupsEarned++;
    }

    // midday: ask gossip around
    if (d >= 2) {
      for (let i = 0; i < 3; i++) {
        const vid = roster[Math.floor(Math.random() * roster.length)];
        try {
          Game.state.village.trust[vid] = Math.max(Game.state.village.trust[vid] || 0, 22);
          const r = Game.convoTurn(vid, 'ask:gossip');
          void r;
        } catch (e) { errors.push(`gossip d${day}: ${e.message}`); }
      }
    }

    // trust snapshot
    const trusts = roster.map(id => v.trust[id] || 0);
    dayTrust.push({ day, avg: (trusts.reduce((a, b) => a + b, 0) / trusts.length).toFixed(1), max: Math.max(...trusts), min: Math.min(...trusts) });

    // day 7: System arrival happened — try party invites
    if (day >= 7) {
      for (const vid of roster.slice(0, 4)) {
        try {
          const r = Game.inviteToParty(vid);
          if (r && r.ok) console.log(`  party invite → ${name(vid)}: ACCEPTED (${r.msg || ''})`.slice(0, 110));
        } catch (e) { errors.push(`inviteToParty d${day}: ${e.message}`); }
      }
      const party = (Game.state.party || {}).members || [];
      if (party.length) console.log(`  party members: ${party.map(name).join(', ')}`);
    }

    console.log(`trust avg ${dayTrust[dayTrust.length - 1].avg} (max ${dayTrust[dayTrust.length - 1].max}, min ${dayTrust[dayTrust.length - 1].min})`);
    try { Game.endDay(); } catch (e) { errors.push(`endDay d${day}: ${e.message}`); }
  }

  console.log('\n=== FEEL REPORT ===');
  console.log(`conversations held: ${convoStats.length}`);
  const avgEx = (convoStats.reduce((a, r) => a + r.exchanges, 0) / Math.max(1, convoStats.length)).toFixed(1);
  console.log(`avg exchanges per conversation: ${avgEx}`);
  console.log(`talk requests answered over 10 days: ${talkReqsSeen}`);
  console.log(`conversations where an NPC asked me a question: ${npcQuestions}/${convoStats.length}`);
  console.log('trust over days:', dayTrust.map(t => `d${t.day}:${t.avg}`).join(' '));

  // line variety: how many unique lines vs total (catch "heard 13 times" regressions)
  const uniq = new Set(linesSeen);
  console.log(`NPC lines: ${linesSeen.length} total, ${uniq.size} unique (${(100 * uniq.size / Math.max(1, linesSeen.length)).toFixed(0)}% unique)`);
  const lineCounts = {};
  for (const l of linesSeen) lineCounts[l] = (lineCounts[l] || 0) + 1;
  const repeats = Object.entries(lineCounts).filter(([, n]) => n >= 4).sort((a, b) => b[1] - a[1]).slice(0, 8);
  if (repeats.length) {
    console.log('most-repeated lines (4+ times):');
    for (const [l, n] of repeats) console.log(`  [${n}x] ${l.slice(0, 120)}`);
  } else console.log('no line repeated 4+ times across the village — variety OK');

  // conversation-ending sanity: do convos end naturally, or do they fizzle?
  const endedKinds = {};
  for (const r of convoStats) endedKinds[r.ended] = (endedKinds[r.ended] || 0) + 1;
  console.log('conversation endings:', JSON.stringify(endedKinds));

  // errors
  if (errors.length) {
    console.log(`\nERRORS (${errors.length}):`);
    const ue = [...new Set(errors)].slice(0, 15);
    ue.forEach(e => console.log('  ' + e));
  } else console.log('\nno errors during 10-day socialite run');

  // sample transcripts (first 2 conversations, day 1) so the run reads like play
  console.log('\n--- sample conversation (day 1) ---');
  for (const r of convoStats.slice(0, 6)) {
    if (r.lines.length) console.log(`${r.vid}: "${r.lines[0].slice(0, 160)}..." (${r.exchanges} exchanges, ended ${r.ended})`);
  }
})();
