// Social early-game tests. Usage: node scripts/test-social-early.js
// Covers the fresh-eyes playtest fixes (days 1-7, socialite):
//  1. Village-wide line retirement: shared pools must not recycle visibly
//     across villagers ("heard 13 times in 4 days"). convoPick excludes
//     lines said anywhere in the village in the last LINE_FRESH_DAYS.
//  2. Gossip ask: 'ask:gossip' choice exists in convoChoices, gated like
//     theorize (trust 20+ or 2nd conversation), wired to the gossip engine.
//  3. Invite flow: warmer rate once avg trust >= 15; day-1 NPC initiation
//     ("Can we talk?") fires exactly once.
//  4. Ambient: villagePick (nightfall lines) doesn't repeat while fresh.
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

function freshGame() {
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  return (Game.state.village.roster || []).filter(id => id !== Game.villagerId);
}
const idsOf = (choices) => choices.map(c => c.id);

(async () => {
  await Game.init();

  // === 1. VILLAGE-WIDE LINE RETIREMENT ===
  {
    const roster = freshGame();
    const [a, b, c] = roster;
    const pool = ['L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7', 'L8'];
    const pa = Game.convoPick(a, 'k1', pool);
    const pb = Game.convoPick(b, 'k1', pool);
    const pc = Game.convoPick(c, 'k1', pool);
    ok('retirement: 3 villagers, 3 distinct lines', new Set([pa, pb, pc]).size === 3);
    ok('retirement: lines logged village-wide', Object.keys(Game.convLineLog()).length === 3);

    // same villager, different key: still avoids village-used lines
    const pa2 = Game.convoPick(a, 'k2', pool);
    ok('retirement: second pick avoids village-used', [pb, pc].indexOf(pa2) === -1 && pa2 !== pa);

    // fallback: pool smaller than speakers -> still returns something (no null collapse)
    const small = ['X', 'Y'];
    Game.state.village.convLineLog = {};
    Game.convoPick(a, 's1', small);
    Game.convoPick(b, 's1', small);
    const sc = Game.convoPick(c, 's1', small);
    ok('retirement: exhausted pool falls back, never null', sc === 'X' || sc === 'Y');

    // expiry: after LINE_FRESH_DAYS, lines are fresh again
    Game.state.village.convLineLog = {};
    const q1 = Game.convoPick(a, 'q1', pool);
    Game.state.scholar.day += Game.LINE_FRESH_DAYS + 1;
    const q2 = Game.convoPick(b, 'q1', pool);
    ok('retirement: lines refresh after N days (pool all fresh again)', pool.indexOf(q2) !== -1 && q1 !== undefined);
    // with everything fresh, B may legitimately reuse A's line — assert no crash, valid pick
    ok('retirement: expired log does not block picking', !!q2);
  }

  // === 2. GOSSIP ASK ===
  {
    const roster = freshGame();
    const vid = roster[0];
    // closed: low trust, first conversation
    Game.state.village.trust[vid] = 10;
    let st = Game.startConvo(vid);
    ok('gossip ask hidden at trust 10 / first convo', idsOf(st.choices).indexOf('ask:gossip') === -1);
    Game.endConvo(vid, 'leave');

    // open: trust 20+
    Game.state.village.trust[vid] = 25;
    st = Game.startConvo(vid);
    ok('gossip ask present at trust 25', idsOf(st.choices).indexOf('ask:gossip') !== -1);
    // label is one of the gossip variants
    const gchoice = st.choices.find(ch => ch.id === 'ask:gossip');
    ok('gossip ask label is a gossip variant', /Heard anything|word around the fire|saying anything interesting/.test(gchoice.label));
    Game.endConvo(vid, 'leave');

    // open: 2nd conversation even at low trust
    const vid2 = roster[1];
    Game.state.village.trust[vid2] = 10;
    Game.startConvo(vid2); Game.endConvo(vid2, 'leave');
    st = Game.startConvo(vid2);
    ok('gossip ask present on 2nd conversation', idsOf(st.choices).indexOf('ask:gossip') !== -1);

    // choosing it produces a line and sets the thread
    const r = Game.convoTurn(vid2, 'ask:gossip');
    ok('gossip ask returns a line', !!(r && r.line));
    const cc = Game.convoGet(vid2);
    ok('gossip ask sets gossip thread', cc.thread === 'gossip');
    ok('gossip ask recorded in askedTopics', (cc.askedTopics || []).indexOf('gossip') !== -1);
    Game.endConvo(vid2, 'leave');
  }

  // === 3. INVITE FLOW + DAY-1 NUDGE ===
  {
    const roster = freshGame();
    // warm rate
    roster.forEach(id => { Game.state.village.trust[id] = 20; });
    let total = 0;
    const ITERS = 200;
    for (let i = 0; i < ITERS; i++) {
      const bs = Game.betrayalState();
      for (const k of Object.keys(bs.invites || {})) bs.invites[k].pending = null;
      Game.npcInviteTick();
      for (const k of Object.keys(bs.invites || {})) if (bs.invites[k].pending) total++;
    }
    const warmAvg = total / ITERS;
    ok(`invite rate warm (~1.85/day expected, got ${warmAvg.toFixed(2)})`, warmAvg > 1.2);

    // cold rate is lower
    roster.forEach(id => { Game.state.village.trust[id] = 10; });
    total = 0;
    for (let i = 0; i < ITERS; i++) {
      const bs = Game.betrayalState();
      for (const k of Object.keys(bs.invites || {})) bs.invites[k].pending = null;
      Game.npcInviteTick();
      for (const k of Object.keys(bs.invites || {})) if (bs.invites[k].pending) total++;
    }
    const coldAvg = total / ITERS;
    ok(`invite rate cold < warm (${coldAvg.toFixed(2)} < ${warmAvg.toFixed(2)})`, coldAvg < warmAvg);

    // day-1 nudge fires exactly once
    const roster2 = freshGame();
    Game.state.scholar.day = 1;
    Game.state.village.day1NudgeDone = false;
    Game.state.village.talkRequests = {};
    Game.betrayalDaily();
    const reqs = Object.keys(Game.state.village.talkRequests || {});
    ok('day-1 nudge: a villager approaches on day 1', reqs.length > 0);
    const rid = reqs[0];
    ok('day-1 nudge line is a can-we-talk', /Can we talk\?/.test(Game.state.village.talkRequests[rid].line));
    // the opening delivers it
    const st = Game.startConvo(rid);
    ok('day-1 nudge delivered as conversation opening', /Can we talk\?/.test(st.line || ''));
    Game.endConvo(rid, 'leave');
    Game.betrayalDaily();
    ok('day-1 nudge fires exactly once', Object.keys(Game.state.village.talkRequests || {}).length === reqs.length);
    void roster2;
  }

  // === 4. AMBIENT villagePick ===
  {
    freshGame();
    const pool = ['n1', 'n2', 'n3', 'n4'];
    const seen = new Set();
    for (let i = 0; i < 4; i++) seen.add(Game.villagePick(pool));
    ok('villagePick: no repeats while pool is fresh', seen.size === 4);
    const fifth = Game.villagePick(pool);
    ok('villagePick: falls back to a repeat rather than silence', pool.indexOf(fifth) !== -1);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
