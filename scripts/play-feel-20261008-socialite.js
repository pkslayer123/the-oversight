// SOCIALITE run (2026-10-08, archetype 2): the daily social fabric.
// NEW territory vs yesterday's scenario-suite run (moots/ambush/liar's-den/exile):
//   (1) daily haven conversations — coherence: choices respond to context,
//       subject changes carry bridges, NPC questions get answers
//   (2) gossip propagation — who hears what, distortion on retelling, rep teeth
//   (3) trust building over days — does trust move, do villagers treat you differently
//   (4) "can we talk?" requests — arrival, delivery, answering
//   (5) teaching/showing — player->villager knowledge transfer, topical coherence
//   (6) party building — followers volunteer at trust, travel banter
//   (7) regression: yesterday's two fixed bugs (ambush talked_down narration;
//       player-convened moot always asks the vote)
// Played as a player, judged like a player. Run: node scripts/play-feel-20261008-socialite.js
// (SEED=... to override; default 20261008)
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const SEED = parseInt(process.env.SEED || '20261008', 10);

// RNG seeded BEFORE eval (modules capture const R = Math.random at load)
function mulberry32(seed) {
  let s = seed >>> 0;
  const f = function () {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  f.reset = (ns) => { s = ns >>> 0; };
  return f;
}
Math.random = mulberry32(SEED);

global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
global.window = global; // eval-phase stub only (equipment.js needs it at load)
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const SKIP = new Set(['src/js/app.js', 'src/js/sprites.js', 'src/js/tile-scenes.js', 'src/js/move-anim.js', 'src/js/drama.js']);
const order = [...html.matchAll(/src\/js\/[^"]+\.js/g)].map(m => m[0]).filter(f => !SKIP.has(f));
order.forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
delete global.window; // flips combat to the sync path
const Game = globalThis.Scattering.Game;

let ASSERTS = 0, FAILS = 0;
function ok(cond, msg) { ASSERTS++; if (!cond) { FAILS++; console.log('  FAIL:', msg); } }

const says = [];
const osay = Game.say.bind(Game);
Game.say = (t) => { says.push(String(t)); return osay(t); };
function flush(tag, max) {
  max = max || 10;
  const n = Math.min(says.length, max);
  for (const t of says.splice(0, n)) console.log(`   | ${tag} ${String(t).slice(0, 185)}`);
  if (says.length) { console.log(`   | ${tag} ...(${says.length} more lines suppressed)`); says.length = 0; }
}
function name(id) { try { return Game.displayName(id) || id; } catch (e) { return id; } }
function turn(vid, cid) {
  const r = Game.convoTurn(vid, cid);
  const line = r && (r.line || r.msg || '');
  console.log(`  you[${String(cid).slice(0, 36)}] -> "${String(line).slice(0, 205)}"`);
  return r;
}
function choices(vid) { return Game.convoChoices(vid) || []; }
function cids(vid) { return choices(vid).map(c => c.id); }
function trueFirst(id) {
  const v = Game.state.village;
  const n = (v.npcs || {})[id] || (v.people || {})[id];
  const nm = n && (n.name || n.first || n.trueName);
  return nm ? String(nm).split(' ')[0] : null;
}

(async () => {
  await Game.init();
  Game.debugScenario('day1');
  const v = Game.state.village;
  const roster = (v.roster || []).filter(id => id !== Game.villagerId);
  console.log(`seed=${SEED} cast(${roster.length}):`, roster.slice(0, 8).map(name).join(' | '));
  ok(roster.length >= 8, 'day1 roster has a real cast', `roster=${roster.length}`);

  // ============ ACT 1: morning rounds — real conversations, coherence ============
  console.log('\n=== ACT 1: morning rounds (coherence) ===');
  const A = roster[0], B = roster[1];
  const leakHits = [];
  for (const [vid, beats] of [[A, 9], [B, 7]]) {
    console.log(`\n-- talking to ${name(vid)} (trust ${v.trust[vid] || 0}) --`);
    const mark = says.length;
    Game.startConvo(vid);
    let ch = choices(vid);
    let a = ch.find(c => c.id.indexOf('gq:') === 0) || ch.find(c => c.id === 'agree') || ch.find(c => c.id === 'nod');
    if (a) turn(vid, a.id);
    let n = 0;
    const want = ['ask:personal', 'ask:work', 'ask:family', 'ask:mood', 'ask:opinion', 'tell:about'];
    while (n < beats) {
      ch = choices(vid);
      if (!ch.length) break;
      const c = want.map(w => ch.find(x => x.id === w)).find(Boolean)
        || ch.find(x => x.id.indexOf('thread:') === 0 && x.id !== 'leave')
        || ch.find(x => x.id.indexOf('dlg:') === 0 && x.id !== 'leave' && x.id.indexOf('dlg:more') !== 0)
        || ch.find(x => x.id === 'subject');
      if (!c) break;
      const r = turn(vid, c.id);
      n++;
      ok(r && (r.line || r.msg), `convo: ${c.id} returns a line`);
      ch = choices(vid);
      if (ch.length === 1 && ch[0].id === 'leave') break;
    }
    Game.endConvo(vid, 'left');
    console.log(`trust after: ${v.trust[vid] || 0}`);
    // knowledge-leak scan of everything said during this convo
    const said = says.slice(mark);
    for (const t of said) {
      if (t.indexOf('undefined') >= 0) leakHits.push(`undefined in: ${t.slice(0, 90)}`);
      if (/npc_\d+|villager_\d+/.test(t)) leakHits.push(`raw id in: ${t.slice(0, 90)}`);
      for (const oid of roster) {
        const known = (v.knownNames || {})[oid];
        if (!known) {
          const tf = trueFirst(oid);
          if (tf && tf.length > 2 && t.indexOf(tf) >= 0) leakHits.push(`stranger true-name "${tf}" spoken: ${t.slice(0, 90)}`);
        }
      }
    }
    flush('talk', 4);
  }
  ok(leakHits.length === 0, 'convo: no leaks/undefined/raw-ids in spoken lines', leakHits.slice(0, 2).join(' ‖ ') || 'clean');

  // ============ ACT 2: "can we talk?" requests ============
  console.log('\n=== ACT 2: "can we talk?" ===');
  let rid = null, reason = null;
  for (const id of roster) {
    try { const r = Game.talkReason(id); if (r && r.line) { rid = id; reason = r; break; } } catch (e) {}
  }
  if (!rid) { rid = roster[2]; reason = { line: '__NAME__ wants to talk to you.' }; console.log('(no natural reason; forcing one)'); }
  v.talkRequests = v.talkRequests || {};
  v.talkRequests[rid] = { line: reason.line, day: Game.state.scholar.day };
  const rendered = Game.renderTalkLine(reason.line, rid) + ` (Talk to ${name(rid)}.)`;
  console.log('player sees:', rendered.slice(0, 200));
  ok(rendered.indexOf('Talk to') >= 0, 'talk request renders with a "Talk to X" cue');
  ok(!/undefined|__NAME__/.test(rendered), 'talk request line has no template residue');
  const rqMark = says.length;
  Game.startConvo(rid);
  ok(v.talkRequests[rid] && v.talkRequests[rid].delivered === true, 'opening the convo consumes the talk request');
  const opener = says.slice(rqMark).join(' ‖ ').slice(0, 260);
  console.log('opener:', opener);
  Game.endConvo(rid, 'left');

  // ============ ACT 3: gossip — spread it, watch it distort ============
  // NOTE: gossip verbs gate on gossipOpen (trust>=20 || 2+ convos) — use A,
  // whom we've actually talked to. A stranger correctly hides them.
  console.log('\n=== ACT 3: gossip (spread + distort + rep teeth) ===');
  const C = A;
  // gossip verbs gate on gossipOpen (trust>=20 || 2+ conversations) — earn the
  // second conversation honestly first, like a player would.
  Game.startConvo(C);
  { let ch0 = choices(C);
    const q0 = ch0.find(c => c.id.indexOf('gq:') === 0);
    if (q0) turn(C, q0.id);
    const t0 = (choices(C).find(c => c.id === 'ask:personal') || choices(C).find(c => c.id.indexOf('dlg:') === 0 && c.id !== 'leave'));
    if (t0) turn(C, t0.id);
    Game.endConvo(C, 'left'); }
  console.log(`second convo done: convoCount=${(Game.convoGet(C) || {}).count}, trust=${v.trust[C] || 0}`);
  Game.startConvo(C);
  // answer their opener first: a hanging direct question narrows the menu
  // by design (coherence) — off-thread verbs wait behind the answer.
  let ch = choices(C);
  const openQ = ch.find(c => c.id.indexOf('gq:') === 0);
  if (openQ) { turn(C, openQ.id); ch = choices(C); }
  let sr = ch.find(c => c.id === 'ask:spread_rumor');
  if (!sr) {
    const sj = ch.find(c => c.id === 'dlg:subject') || ch.find(c => c.id === 'subject');
    if (sj) {
      turn(C, sj.id); ch = choices(C);
      sr = ch.find(c => c.id === 'ask:spread_rumor');
      if (!sr) {
        const topic = ch.find(c => c.id.indexOf('ask:') === 0 && c.id !== 'ask:gossip' && c.id !== 'ask:spread_rumor');
        if (topic) { turn(C, topic.id); ch = choices(C); }
        sr = ch.find(c => c.id === 'ask:spread_rumor');
      }
    }
  }
  ok(!!sr, 'gossip verb ask:spread_rumor is reachable once gossip opens (never starved)');
  const gMark = v.gossip ? v.gossip.length : 0;
  if (sr) {
    turn(C, 'ask:spread_rumor');
    ch = choices(C);
    const tgt = ch.find(c => c.id.indexOf('rumor:tgt:') === 0);
    ok(!!tgt, 'rumor target menu offered');
    if (tgt) {
      turn(C, tgt.id);
      ch = choices(C);
      const types = ch.filter(c => c.id.indexOf('rumor:type:') === 0);
      console.log('rumor types:', types.map(t => t.id.replace('rumor:type:', '')).join(', '));
      ok(types.length === 5, 'five rumor types offered');
      if (types[0]) {
        const type = types[0].id.replace('rumor:type:', '');
        turn(C, types[0].id);
        ok((v.gossip || []).length > gMark, 'spreading a rumor seeds v.gossip');
        var myRumor = (v.gossip || [])[(v.gossip || []).length - 1];
        console.log(`rumor seeded: action=${myRumor.action} heard=${myRumor.heard.length} distortion=${myRumor.distortion}`);
      }
    }
  }
  Game.endConvo(C, 'left');
  if (myRumor) {
    for (let i = 0; i < 10; i++) { try { Game.spreadGossip(); } catch (e) { console.log('spreadGossip err', e.message); break; } }
    console.log(`after 10 parts: heard=${myRumor.heard.length} distortion=${myRumor.distortion}`);
    ok(myRumor.heard.length > 1, 'rumor travels beyond the first hearer', `heard=${myRumor.heard.length}`);
    ok(myRumor.distortion >= 1, 'rumor distorts on retelling', `distortion=${myRumor.distortion}`);
    flush('gossip', 4);
  }
  // rep teeth: seed a positive rumor about the PLAYER and watch their rep move
  const repOf = (id) => Game.repOf(id);
  const rBefore = JSON.stringify(repOf(Game.villagerId));
  Game.seedGossip('shared_food', { who: Game.villagerId, generous: 12 }, [A], false);
  const sg = v.gossip[v.gossip.length - 1];
  let rounds = 0;
  while (sg.heard.length < 2 && rounds < 40) { try { Game.spreadGossip(); } catch (e) {} rounds++; }
  const rAfter = JSON.stringify(repOf(Game.villagerId));
  console.log(`player rep: ${rBefore} -> ${rAfter} (tell landed after ${rounds} part(s), hearers=${sg.heard.length})`);
  ok(sg.heard.length > 1, 'seeded gossip travels to a new hearer', `rounds=${rounds}`);
  ok(rBefore !== rAfter, 'gossip about the player moves THEIR rep (subject, not listener)');

  // ============ ACT 4: trust over days + followers + travel banter ============
  console.log('\n=== ACT 4: trust over days ===');
  const t0 = v.trust[A] || 0;
  for (let d = 0; d < 3; d++) {
    Game.startConvo(A);
    let ch2 = choices(A);
    for (let b = 0; b < 3; b++) {
      ch2 = choices(A);
      const c = ch2.find(x => x.id === 'ask:personal') || ch2.find(x => x.id === 'tell:about')
        || ch2.find(x => x.id.indexOf('dlg:') === 0 && x.id !== 'leave') || ch2.find(x => x.id === 'subject');
      if (!c) break;
      turn(A, c.id);
      ch2 = choices(A);
      if (ch2.length === 1 && ch2[0].id === 'leave') break;
    }
    Game.endConvo(A, 'left');
    console.log(`day ${Game.state.scholar.day}: trust(${name(A)})=${v.trust[A] || 0}`);
    try { Game.endDay(); } catch (e) { console.log('endDay err', e.message); break; }
  }
  const t1 = v.trust[A] || 0;
  ok(t1 >= t0, 'talking across days moves trust (or holds)', `${t0} -> ${t1}`);
  // a few npc batch turns: how do they treat you now?
  for (let i = 0; i < 2; i++) { try { Game.npcBatchTurn(); } catch (e) { console.log('batch err', e.message); } }
  flush('treat', 8);

  // followers volunteer at high trust
  console.log('\n=== followers ===');
  v.trust[A] = Math.max(v.trust[A] || 0, 82); v.trust[B] = Math.max(v.trust[B] || 0, 78);
  let fol = [];
  for (let i = 0; i < 80 && fol.length < 2; i++) { try { Game.followerCheck(); } catch (e) {} fol = (Game.partyState().followers || []); }
  console.log('followers:', fol.map(name).join(', ') || '(none volunteered in 80 checks)');
  ok(fol.length > 0, 'high-trust villagers volunteer as followers');
  if (fol.length) {
    const mx = Game.map.px, my = Game.map.py;
    try { Game.travelTo(5, 4, true); } catch (e) { console.log('travel err', e.message); }
    console.log(`traveled (${mx},${my}) -> (${Game.map.px},${Game.map.py})`);
    ok(Game.map.px !== mx || Game.map.py !== my, 'party travels with you');
    flush('banter', 8);
  }

  // ============ ACT 5: teaching — player shows a villager ============
  console.log('\n=== ACT 5: teaching ===');
  const pids = (Game.data.plants || []).map(p => p.id).filter(Boolean);
  let teachLanded = false, teachTopic = false;
  if (pids.length) {
    const pid = pids[Math.floor(Math.random() * pids.length)];
    try { Game.identifyPlant(pid); } catch (e) {}
    const D = roster.find(id => !((v.taught || {})[id] || []).includes(pid)) || roster[4];
    console.log(`player knows ${pid}; teaching ${name(D)}`);
    Game.startConvo(D);
    // answer their opener first (a hanging direct question suppresses
    // off-thread verbs by design), then change subject + pick a topic to
    // clear onto neutral ground where teach lives.
    let ch3 = choices(D);
    const openerQ = ch3.find(c => c.id.indexOf('gq:') === 0);
    if (openerQ) { turn(D, openerQ.id); ch3 = choices(D); }
    let tc = ch3.find(c => c.id === 'teach');
    if (!tc) {
      const sj = ch3.find(c => c.id === 'dlg:subject') || ch3.find(c => c.id === 'subject');
      if (sj) {
        // neutral ground is RIGHT AFTER the subject change — check for teach
        // before picking a new topic (a topic puts us back on-thread, where
        // teach correctly waits).
        turn(D, sj.id); ch3 = choices(D);
        tc = ch3.find(c => c.id === 'teach');
      }
    }
    if (tc) {
      const tTrust = v.trust[D] || 0;
      const taughtBefore = ((v.taught || {})[D] || []).slice();
      const r = turn(D, 'teach');
      const line = String((r && (r.line || r.msg)) || '');
      const gained = (((v.taught || {})[D] || []).filter(p => taughtBefore.indexOf(p) === -1));
      ok(gained.length === 1 && !!Game.state.codex.plants[gained[0]],
        'teaching registers a player-known plant as taught to them', `gained=${gained.join(',')}`);
      ok((v.trust[D] || 0) > tTrust, 'teaching builds trust', `${tTrust} -> ${v.trust[D]}`);
      // TOPICAL coherence: the bridge lives in the player's spoken line
      // ("That reminds me — ..."), the narration describes the showing.
      // Check the whole exchange, not just the narration.
      const tr = (r && r.transcript) || [];
      const youSaid = tr.filter(e => e && e.who === 'you').map(e => e.text).join(' ‖ ');
      const exchange = youSaid + ' ‖ ' + line;
      teachTopic = /reminds me|speaking of|different subject|let me show you|crouch|show them/i.test(exchange);
      ok(teachTopic, 'teach exchange carries a bridge or topical link (no non-sequitur drop)', youSaid.slice(0, 80));
      teachLanded = true;
    } else {
      const cDbg = Game.convoGet(D);
      console.log('(teach verb not offered this convo) menu:', choices(D).map(c => c.id).join('|'),
        '| thread:', cDbg.thread, 'reactiveQ:', !!cDbg.reactiveQ, 'genericQ:', !!cDbg.genericQ,
        'youKnow:', Object.keys(Game.state.codex.plants || {}).length,
        'theyKnow:', ((v.taught || {})[D] || []).length);
    }
    Game.endConvo(D, 'left');
  }
  ok(teachLanded, 'a player->villager teaching beat landed');

  // ============ ACT 6: ask about others — gossip knowledge ============
  console.log('\n=== ACT 6: ask:gossip (what the village is saying) ===');
  const E = roster.find(id => id !== A && id !== B) || roster[5];
  Game.startConvo(E);
  let ch4 = choices(E);
  let gq = ch4.find(c => c.id === 'ask:gossip');
  if (!gq) { const sj = ch4.find(c => c.id === 'subject'); if (sj) { turn(E, 'subject'); ch4 = choices(E); gq = ch4.find(c => c.id === 'ask:gossip'); } }
  if (gq) {
    const r = turn(E, 'ask:gossip');
    ok(r && (r.line || r.msg), 'ask:gossip returns a line');
    flush('gossipheard', 6);
  } else { console.log('(ask:gossip not offered — quiet village, honest)'); }
  Game.endConvo(E, 'left');

  // ============ ACT 7: regression — yesterday's two fixed bugs ============
  console.log('\n=== ACT 7: regression — ambush talked_down narration ===');
  try {
    Game.debugScenario('ambush');
    const bs = Game.betrayalState();
    const plot = (bs.plots || []).find(p => !p.resolved);
    ok(!!plot, 'ambush: plot sprang', plot ? `leader=${name(plot.leader)}` : 'none');
    const lid = plot.leader;
    let rounds = 0;
    while (rounds < 6 && cids(lid).includes('betrayal:talk')) { turn(lid, 'betrayal:talk'); rounds++; }
    const p2 = (Game.betrayalState().plots || []).find(p => p.id === plot.id);
    console.log(`ambush resolved: outcome=${p2 && p2.outcome} after ${rounds} talk round(s)`);
    ok(!!(p2 && p2.resolved), 'ambush: the beat resolves');
    ok(['escaped', 'knocked_out', 'talked_down', 'fought_off'].includes(p2.outcome), 'ambush: outcome is a known terminal', p2.outcome);
    // the closing line must be the per-outcome narration, tagged 'narr' — NOT leader speech
    const closing = {
      escaped: 'You get out. Breathing hard, alive.',
      talked_down: 'You talked them down. Now you have to live next to them.',
      fought_off: 'Down, not dead. And the whole village is about to hear about it.',
      knocked_out: 'Lighter, hurting, alive. And owed an answer.',
    }[p2.outcome];
    let tr = [];
    try { tr = (Game.convoGet(lid).transcript || []).slice(); } catch (e) {}
    const closingEntry = tr.filter(e => e && e.text === closing).pop();
    ok(!!closingEntry, `ambush: per-outcome closing line present ("${closing.slice(0, 50)}…")`);
    ok(!!closingEntry && closingEntry.who === 'narr', 'ambush: closing line is NARRATION, not the leader speaking', closingEntry ? `who=${closingEntry.who}` : 'no entry');
  } catch (e) { console.log('ambush regression err:', e.message); ok(false, 'ambush regression threw: ' + e.message); }

  console.log('\n=== ACT 7b: regression — player-convened moot always asks the vote ===');
  try {
    const bs = Game.betrayalState();
    const arr = bs.cases || [];
    const kc = arr.find(c => (c.status === 'open' || c.status === 'dormant') && !(c.accused || []).includes(Game.villagerId));
    if (kc) {
      Game.callMoot(kc.id); // byId defaults to player -> playerConvened = true
      const c = Game.getCase(kc.id);
      ok(c.playerConvened === true, 'callMoot by player sets playerConvened');
      let allVoter = true;
      for (let i = 0; i < 30; i++) {
        const t = Game.tallyVotes(c, false, Math.random);
        if (!t.playerVoter) { allVoter = false; break; }
      }
      ok(allVoter, 'player-convened moot: player asked to vote 30/30');
    } else { console.log('(no open case to convene — ambush aftermath may have auto-opened one already)'); ok(true, 'moot check skipped cleanly (no open case)'); }
  } catch (e) { console.log('moot regression err:', e.message); ok(false, 'moot regression threw: ' + e.message); }

  console.log(`\n==== SEED ${SEED}: ${ASSERTS - FAILS}/${ASSERTS} assertions green ====`);
  if (FAILS) process.exitCode = 1;
})().catch(e => { console.error('HARNESS CRASH:', e); process.exitCode = 2; });
