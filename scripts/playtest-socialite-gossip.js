// Socialite playtest: the gossip network end-to-end.
// Seeds gossip about the player's actions, advances time, and measures:
//   1. spread: heard-count growth hop-by-hop over parts
//   2. distortion: does the story mutate as it travels?
//   3. rep: do listeners' attitudes toward the player actually move?
//   4. visibility: does the PLAYER ever learn what is being said?
//   5. talkReason: do NPCs initiate "Can we talk?" about negative gossip?
//   6. confrontGossip: does clearing the air work, and can it backfire?
// Usage: node scripts/playtest-socialite-gossip.js
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
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}${extra ? ' — ' + extra : ''}`); }
}

// capture say() output for visibility analysis
const said = [];
const origSay = null;

(async () => {
  await Game.init();
  // wrap say() AFTER init
  const gSay = Game.say.bind(Game);
  Game.say = (msg) => { said.push(String(msg)); return gSay(msg); };

  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const v = Game.state.village;
  const roster = (v.roster || []).filter(id => id !== Game.villagerId);
  console.log(`roster NPCs: ${roster.length}`);

  const [w1, w2] = roster;
  // give the player names so gossip talkReason lines render
  for (const id of roster.slice(0, 4)) { try { Game.learnName(id); } catch (e) {} }

  // === 1. SEED + SPREAD: does gossip travel? ===
  Game.seedGossip('stole_food', { honest: -12, generous: -10 }, [w1, w2]);
  let g = v.gossip[v.gossip.length - 1];
  ok('seed: gossip created with 2 hearers', g && g.heard.length === 2 && g.distortion === 0);
  const heardGrowth = [g.heard.length], distGrowth = [g.distortion];
  for (let i = 0; i < 12; i++) { Game.spreadGossip(); heardGrowth.push(g.heard.length); distGrowth.push(g.distortion); }
  console.log(`heard over 12 parts: ${heardGrowth.join('->')}`);
  console.log(`distortion over 12 parts: ${distGrowth.join('->')}`);
  ok('spread: gossip reaches more people over time', g.heard.length > 2);
  ok('spread: distortion grows as story travels', g.distortion > 0, `distortion=${g.distortion}`);
  ok('spread: gossip fades after ~3 days (not eternal)', (() => {
    const day0 = Game.state.scholar.day;
    Game.state.scholar.day = day0 + 4;
    Game.spreadGossip();
    const gone = !v.gossip.includes(g);
    Game.state.scholar.day = day0;
    return gone;
  })());

  // === 2. REP: do listeners' attitudes toward the player move? ===
  // (harness lesson 2026-10-05: gossip travels along social lines, so pick
  // the listener from w1's own group and allow enough parts for the story
  // to reach them — a fixed far-away roster index + 10 parts flaked.)
  Game.state.scholar.day = (Game.state.scholar.day || 1);
  Game.seedGossip('stole_food2', { honest: -12, generous: -10 }, [w1]);
  const g2 = v.gossip[v.gossip.length - 1];
  let listener = roster[3];
  const w1mates = new Set();
  for (const gr of (v.groups || [])) if (gr.members.includes(w1)) gr.members.forEach(m => { if (m !== w1) w1mates.add(m); });
  const inGroup = roster.find(id => id !== w1 && w1mates.has(id));
  if (inGroup) listener = inGroup;
  const before = JSON.stringify(Game.repOf(listener));
  for (let i = 0; i < 40 && !g2.heard.includes(listener); i++) Game.spreadGossip();
  const after = JSON.stringify(Game.repOf(listener));
  ok('rep: listener rep changes when they hear gossip', before !== after && g2.heard.includes(listener),
    `heard=${g2.heard.includes(listener)} before=${before} after=${after}`);

  // ask "heard anything?" up to N times; the npcGossipAbout (50%) and
  // darkGossip (45%) branches may preempt the rumor-mill branch on any ask.
  function askUntil(vid, want, tries) {
    for (let i = 0; i < (tries || 40); i++) {
      said.length = 0;
      const r = Game.askAbout(vid, 'gossip');
      if (r && want(r, said.join(' '))) return { r, text: said.join(' ') };
    }
    return null;
  }

  // === 3. VISIBILITY: does the player ever learn what is being said? ===
  const gossipyLines = said.filter(s => /fragment|gossip|telling .* about you|story's getting bigger/i.test(s));
  console.log(`fire-fragment visibility lines in 22 spreads: ${gossipyLines.length}`);
  // ask "heard anything?" of a hearer: does it surface the negative gossip?
  const hearer = g2.heard.find(id => id !== w1) || w1;
  const hit3 = askUntil(hearer, (r, text) => r.gossip && !r.aboutOther && /saying things\. About you/i.test(text));
  ok('ask:gossip on a hearer returns the warning line', !!hit3,
    hit3 ? '' : 'warning never surfaced in 40 asks');

  // === 4. talkReason: do NPCs initiate about negative gossip? ===
  let initiated = 0;
  const oldRand = Math.random;
  for (let i = 0; i < 200; i++) {
    const tr = Game.talkReason(hearer);
    if (tr && /People are saying things/.test(tr.line)) initiated++;
  }
  console.log(`talkReason initiated about gossip: ${initiated}/200 rolls`);
  ok('talkReason: negative gossip can make NPCs initiate "Can we talk?"', initiated > 0, `${initiated}/200`);

  // === 5. confrontGossip: clearing the air ===
  // (harness lesson 2026-10-05: at trust 90 the hearer may still believe the
  // gossip (rep honest<0), which correctly makes confrontation a gamble per
  // the engine's "honesty helps" rule — so force the SUCCESS path with a
  // fixed random roll to verify what success does.)
  v.trust = v.trust || {};
  v.trust[hearer] = 90;
  said.length = 0;
  const dimsBefore = JSON.stringify(g2.dims);
  const realRand = Math.random;
  Math.random = () => 0.0; // guarantee the success branch
  Game.confrontGossip(hearer);
  Math.random = realRand;
  const cleared = said.find(s => /wasn't fair|loses its teeth/i.test(s));
  const dimsAfter = JSON.stringify(g2.dims);
  ok('confront: success dampens gossip dims', !!cleared && dimsBefore !== dimsAfter,
    `cleared=${!!cleared} dims ${dimsBefore} -> ${dimsAfter}`);
  ok('confront: success remembers the confrontation', (Game.state.village.memories || {})[hearer] !== undefined ||
    JSON.stringify(v).includes('cleared the air about gossip'));

  // backfire path: force failure with rock-bottom trust and hostile rep.
  // (Harness lesson: each successful confront dampens the SHARED gossip dims,
  // so two successes fully defuse it and later calls no-op. Reset dims per roll.
  // Also: (trust||{})[vid] || 10 means trust 0 reads as 10 — noted below.)
  v.trust[hearer] = 0;
  let backfires = 0, successes = 0, noops = 0;
  for (let i = 0; i < 200; i++) {
    g2.dims = { honest: -12, generous: -10 }; // fresh scandal each roll
    said.length = 0;
    Game.confrontGossip(hearer);
    if (said.some(s => /interrogating people|gets worse/i.test(s))) backfires++;
    else if (said.some(s => /wasn't fair|loses its teeth/i.test(s))) successes++;
    else noops++;
  }
  console.log(`confront 200 rolls at trust~0: backfire=${backfires} success=${successes} noop=${noops}`);
  ok('confront: failure path exists (backfire worsens the story)', backfires > 0);
  ok('confront: outcome is a gamble, not deterministic', backfires > 0 && backfires < 200 && successes > 0,
    `backfire=${backfires} success=${successes}`);
  // design claim: trust moves the odds. Measure success rate at trust 90 vs 0
  // with the SAME neutral rep (reset honest so only trust differs).
  function confrontRate(trust) {
    let s = 0, n = 120;
    for (let i = 0; i < n; i++) {
      g2.dims = { honest: -12, generous: -10 };
      v.trust[hearer] = trust; // success grants +4 trust — pin it per roll
      said.length = 0;
      Game.confrontGossip(hearer);
      if (said.some(x => /wasn't fair|loses its teeth/i.test(x))) s++;
    }
    return s / n;
  }
  // neutral honest rep so trust is the only variable
  const r0 = Game.repOf(hearer); r0.honest = 5;
  const rateHi = confrontRate(90), rateLo = confrontRate(0);
  console.log(`confront success rate: trust90=${(100 * rateHi).toFixed(0)}% trust0=${(100 * rateLo).toFixed(0)}%`);
  ok('confront: high trust meaningfully beats low trust', rateHi > rateLo + 0.15,
    `hi=${rateHi.toFixed(2)} lo=${rateLo.toFixed(2)}`);

  // === 6. positive gossip: does praise travel too? ===
  // (fade the old scandal first — a live scandal about you rightly jumps
  // the queue ahead of praise)
  Game.state.scholar.day += 4;
  Game.spreadGossip();
  said.length = 0;
  Game.seedGossip('gave_food', { kind: 10, generous: 8 }, [w2]);
  const gp = v.gossip[v.gossip.length - 1];
  for (let i = 0; i < 8; i++) Game.spreadGossip();
  const pHearer = gp.heard.find(id => id !== w2) || w2;
  const hit6 = askUntil(pHearer, (r, text) => r.gossip && !r.aboutOther && /doing right by people|Keep it up/i.test(text));
  ok('ask:gossip: positive gossip surfaces as praise', !!hit6,
    hit6 ? '' : 'praise never surfaced in 40 asks');

  // === 7. DEDUP: same action in same part seeds only once ===
  const n0 = v.gossip.length;
  Game.seedGossip('stole_food3', { honest: -5 }, [w1]);
  Game.seedGossip('stole_food3', { honest: -5 }, [w1]);
  ok('seed: same action+part dedupes', v.gossip.length === n0 + 1, `grew by ${v.gossip.length - n0}`);

  console.log(`\n${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
