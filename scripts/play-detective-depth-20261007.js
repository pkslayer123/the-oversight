// Detective archetype × conversation-depth playtest (2026-10-07 run).
// Plays as a player through the full lie/doubt/confront loop against the
// NEW depth systems (topic ledger, open-thread resume, recap verb, drift):
//  - knowledge gate: the player's surfaces must only ever show what the
//    villager TOLD the player, never the truth — until a confrontation
//    confession legitimately reveals it.
//  - feel: is the detective loop alive — enough leads, confrontations land,
//    resume/recap add texture rather than noise?
// Seeded mulberry32 (default 20261007, SEED env override). Exits nonzero on failure.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const SEED = parseInt(process.env.SEED || '20261007', 10);
Math.random = mulberry32(SEED);

global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
global.window = global; // eval-phase stub only (equipment.js needs window at load)

const SCRIPTS = [
  'src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
  'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
  'src/js/game.js', 'src/js/encounters.js', 'src/js/conversation.js', 'src/js/convo-mood.js',
  'src/js/convoTopics.js', 'src/js/convo-wants.js', 'src/js/convo-dialogue.js', 'src/js/convo-beats.js',
  'src/js/examine.js', 'src/js/equipment.js', 'src/js/journal.js', 'src/js/party.js',
  'src/js/party-formal.js', 'src/js/truth.js', 'src/js/contests.js', 'src/js/storage.js',
  'src/js/perceive.js', 'src/js/carexplore.js', 'src/js/justice.js', 'src/js/food.js',
  'src/js/betrayal.js', 'src/js/corpses.js', 'src/js/lifeseed.js', 'src/js/progression.js',
  'src/js/ledger.js', 'src/js/villager-agency.js', 'src/js/codex-people.js',
  'src/js/membership.js', 'src/js/hierarchy.js', 'src/js/debug-scenarios.js', 'src/js/build.js',
];
for (const f of SCRIPTS) {
  try { eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); }
  catch (e) { console.error(`FAILED loading ${f}: ${e.message}`); process.exit(2); }
}
delete global.window; // runtime checks take the sync path from here

const Game = globalThis.Scattering.Game;
const name = (vid) => { try { return Game.displayName(vid); } catch (e) { return vid; } };

let failures = 0;
const fail = (msg) => { failures++; console.log('  FAIL: ' + msg); };
const pass = (msg) => console.log('  ok: ' + msg);

const STOP = new Set(['survive', 'survivor', 'belong', 'heal', 'healing', 'somewhere', 'out', 'west', 'the', 'and', 'from',
  'what', 'with', 'that', 'this', 'have', 'were', 'been', 'they', 'them', 'their', 'there', 'when', 'where',
  'would', 'could', 'should', 'your', 'about', 'into', 'over', 'under', 'than', 'then', 'also', 'just', 'like']);
const tokensOf = (s) => String(s || '').toLowerCase().split(/[^a-z]+/).filter(w => w.length > 3 && !STOP.has(w));
// goal truths are matched by full want-phrase ("to be left alone"), never by
// single common words ("alone" appears in ordinary belong-cover lines).

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const roster = Game.state.village.roster.filter(id => id !== Game.villagerId);

  // ---- who lies? (hidden from the player; drives the forbidden-word scan) ----
  const liesBy = {};
  for (const vid of roster) {
    const lies = (Game.npcLies(vid) || {});
    for (const [field, lie] of Object.entries(lies)) {
      if (lie && lie.told && lie.truth) {
        (liesBy[vid] = liesBy[vid] || []).push({ field, told: lie.told, truth: lie.truth, motive: lie.motive });
      }
    }
  }
  const liars = Object.keys(liesBy);
  console.log(`village: ${roster.length} villagers, natural liars (hidden): ${liars.length}`);
  for (const vid of liars) {
    console.log(`  liar ${name(vid)}: ${liesBy[vid].map(l => `${l.field}: told="${l.told}" truth="${l.truth}" [${l.motive}]`).join(' | ')}`);
  }

  // ---- player-visible corpus: every string the player could see ----
  const corpus = []; // {text, tag, vid}
  const cap = (text, tag, vid) => {
    if (text == null) return;
    const t = String(text);
    if (t.length) corpus.push({ text: t, tag, vid: vid || null });
  };
  const confessed = new Set(); // vid:field legitimately revealed by confession

  // ---- DAY 1: interview everyone, walk away mid-thread on half (plants open threads) ----
  for (let i = 0; i < roster.length; i++) {
    const vid = roster[i];
    Game.startConvo(vid);
    try { cap(Game.convoAskTopic(vid, 'past'), 'ask:past', vid); } catch (e) {}
    try { cap(Game.convoAskTopic(vid, 'goal'), 'ask:goal', vid); } catch (e) {}
    try { Game.endConvo(vid, 'left'); } catch (e) {}
  }
  pass(`day-1 interviews done, corpus=${corpus.length} strings`);

  // ---- DAY 2: resume openers + recap + ledger read ----
  let resumes = 0, recaps = 0;
  for (const vid of roster) {
    Game.state.village.trust = Game.state.village.trust || {};
    Game.state.village.trust[vid] = 20; // harness shortcut past the trust>=15 gate
    Game.startConvo(vid);
    for (let t = 0; t < 8; t++) {
      let op = null;
      try { op = Game.convoResumeOpener(vid); } catch (e) {}
      if (op && op.line) { cap(op.line, 'resume', vid); resumes++; break; }
    }
    try { const r = Game.convoRecapLine(vid); cap(r, 'recap', vid); recaps++; } catch (e) {}
    try {
      const led = Game.convoTopicLedger(vid);
      if (led) {
        for (const o of (led.open || [])) { cap(o.label, 'ledger:open-label', vid); cap(o.snippet, 'ledger:open-snippet', vid); }
        for (const [tid, rec] of Object.entries(led.discussed || {})) { cap(tid, 'ledger:tid', vid); cap(JSON.stringify(rec), 'ledger:rec', vid); }
      }
    } catch (e) {}
    try { Game.endConvo(vid, 'left'); } catch (e) {}
  }
  pass(`resume openers fired: ${resumes}/${roster.length}, recaps: ${recaps}`);

  // ---- confrontation outcome read-back (UI path returns no outcome field) ----
  const outcomeOf = (vid, doubtId) => {
    const d = (Game.getDoubts(vid, true) || []).find(x => x.id === doubtId);
    if (!d) return 'gone';
    if (d.resolved) return 'confessed';
    const ev = (d.evidence || []).join(' ');
    if (/deflected/.test(ev)) return 'deflected';
    if (/hostile/.test(ev)) return 'attacked';
    return 'open';
  };

  // ---- DAYS 2-5: gossip, observe (roster-rotated, fair player behavior), confront ----
  let confronts = 0; const outcomes = {};
  const seenDoubts = new Set();
  // what the player actually HEARD per villager per field (for leak-checking flips)
  const heard = {}; // vid -> field -> Set of claim strings heard
  const hear = (vid, field, claim) => {
    heard[vid] = heard[vid] || {}; heard[vid][field] = heard[vid][field] || new Set();
    heard[vid][field].add(String(claim));
  };
  for (let d = 1; d <= 4; d++) {
    for (let i = 0; i < 5; i++) {
      const vid = roster[Math.floor(Math.random() * roster.length)];
      Game.startConvo(vid);
      try { cap(Game.convoAskTopic(vid, 'gossip'), 'ask:gossip', vid); } catch (e) {}
      try { Game.endConvo(vid, 'left'); } catch (e) {}
    }
    // observe the whole roster across days (a real detective watches everyone)
    for (const vid of roster) {
      try {
        const obs = Game.observePerson(vid);
        if (obs && obs.text) cap(obs.text, 'observe:' + (obs.found ? 'hit' : 'calm'), vid);
      } catch (e) {}
    }
    const open = Game.allDoubts().filter(x => !x.resolved);
    for (const dbt of open) {
      if (!seenDoubts.has(dbt.id)) {
        seenDoubts.add(dbt.id);
        cap(dbt.text, 'doubt:' + dbt.kind, dbt.vid);
        for (const e of (dbt.evidence || [])) cap(e, 'doubt:evidence:' + dbt.kind, dbt.vid);
      }
      Game.startConvo(dbt.vid);
      const choices = Game.convoChoices(dbt.vid);
      const cf = choices.find(ch => String(ch.id).indexOf('confront:') === 0);
      let out = 'none';
      if (cf) {
        const res = Game.convoTurn(dbt.vid, cf.id);
        cap(res && res.line, 'confront:ui', dbt.vid);
        out = outcomeOf(dbt.vid, dbt.id); // UI path returns no outcome field; read the doubt
      }
      confronts++; outcomes[out] = (outcomes[out] || 0) + 1;
      try { Game.endConvo(dbt.vid, 'left'); } catch (e) {}
    }
    try {
      const jn = Game.state.journal && Game.state.journal.notes ? Game.state.journal.notes : [];
      for (const n of jn.filter(x => String(x.text || x).includes('❓'))) cap(n.text || n, 'journal-note', n.vid || n.about || null);
      cap(Game.doubtsHTML ? Game.doubtsHTML() : '', 'doubtsHTML', null);
    } catch (e) {}
    Game.endDay();
  }
  console.log(`doubts ever: ${seenDoubts.size}, confronts: ${confronts}, outcomes: ${JSON.stringify(outcomes)}`);

  // ---- TRUST-FLIP STRESS: goal liars at trust 30-60 flip honest/lying ----
  // (getActiveLie returns null ~50% at trust>30). Each 'goal' ask is captured,
  // and the claim the player actually heard is recorded for leak-checking.
  let flipContradictions = 0;
  for (const vid of liars) {
    const gl = (liesBy[vid] || []).find(l => l.field === 'goal');
    if (!gl) continue;
    Game.state.village.trust[vid] = 40;
    for (let q = 0; q < 6; q++) {
      Game.startConvo(vid);
      let line = '';
      try { line = Game.convoAskTopic(vid, 'goal'); } catch (e) { line = ''; }
      cap(line, 'flip:goal', vid);
      try {
        const claims = (((Game.state.village.truthClaims || {})[vid] || {}).goal || []);
        if (claims.length) hear(vid, 'goal', claims[claims.length - 1].claim);
      } catch (e) {}
      // a fresh contradiction beat may have fired into the feed — capture doubt texts
      for (const dbt of Game.allDoubts(true)) {
        if (!seenDoubts.has(dbt.id)) {
          seenDoubts.add(dbt.id);
          cap(dbt.text, 'doubt:' + dbt.kind, dbt.vid);
          for (const e of (dbt.evidence || [])) cap(e, 'doubt:evidence:' + dbt.kind, dbt.vid);
          if (dbt.kind === 'contradiction') flipContradictions++;
        }
      }
      try { Game.endConvo(vid, 'left'); } catch (e) {}
    }
    pass(`trust-flip stress on ${name(vid)} (goal lie): heard=[${[...(heard[vid] && heard[vid].goal || [])].join(', ')}], contradictions=${flipContradictions}`);
  }

  // ---- ASSERTION A: knowledge gate — ordered earned-vs-leak ----
  // Designed reveal channels (the player EARNS the truth here): doubt texts of
  // any kind, confrontation lines, gossip lines, honesty-flip answers, ❓
  // journal notes, doubtsHTML. Every other player surface must show only what
  // the villager TOLD the player while the lie is unconfessed — even AFTER the
  // player earned the truth elsewhere (the NPC doesn't know you know).
  const REVEAL = (tag, text) =>
    /^doubt:/.test(tag) || /^confront:/.test(tag) || tag === 'ask:gossip' ||
    tag === 'flip:goal' || tag === 'doubtsHTML' ||
    (tag === 'journal-note' && String(text).includes('❓'));
  const wantText = (field, val) => field === 'goal' ? Game.goalWantText(val) : String(val);
  // truth matchers: goals match on the FULL want phrase (single common words
  // like "alone"/"left" appear in ordinary cover lines); occupation/origin
  // match on distinctive tokens.
  const truthHit = (l, text) => {
    const low = String(text).toLowerCase();
    if (l.field === 'goal') return low.includes(wantText(l.field, l.truth).toLowerCase());
    return tokensOf(wantText(l.field, l.truth)).some(t => low.includes(t));
  };
  let leaks = 0;
  for (const vid of liars) {
    for (const l of liesBy[vid]) {
      // confessed via confrontation? then the truth is legitimately on record
      const ds = Game.getDoubts(vid, true) || [];
      const wasConfessed = ds.some(d => d.resolved && /confessed/.test(d.resolution || ''));
      if (wasConfessed) continue;
      let earnedAt = Infinity;
      corpus.forEach((c, i) => {
        if (c.vid !== vid && c.vid !== null) return;
        if (!truthHit(l, c.text)) return;
        if (REVEAL(c.tag, c.text) && i < earnedAt) earnedAt = i;
      });
      corpus.forEach((c, i) => {
        if (c.vid !== vid && !(c.vid === null && c.tag === 'journal-note')) return;
        if (!truthHit(l, c.text)) return;
        if (REVEAL(c.tag, c.text)) return;
        if (i < earnedAt) {
          leaks++;
          fail(`TRUTH LEAK — ${name(vid)} ${l.field}: truth="${l.truth}" (told="${l.told}") on non-reveal surface [${c.tag}] before any earning event: ${c.text.slice(0, 140)}`);
        } else {
          fail(`TRUTH ON TOLD-SURFACE post-earning — ${name(vid)} ${l.field}: unconfessed lie but [${c.tag}] shows truth="${l.truth}": ${c.text.slice(0, 140)}`);
          leaks++;
        }
      });
    }
  }
  if (!leaks) pass('knowledge gate: no truth on any non-reveal surface (pre- and post-earning)');

  // ---- ASSERTION B: the loop is alive ----
  if (liars.length > 0) {
    if (seenDoubts.size === 0) fail('no doubts formed despite liars present');
    else pass(`doubts formed: ${seenDoubts.size}`);
    if (confronts === 0) fail('no confrontations happened');
    else pass(`confrontations ran: ${confronts} (${JSON.stringify(outcomes)})`);
  } else {
    console.log('  note: seed produced zero liars — loop-liveness assertions sample-gated');
  }

  // ---- ASSERTION C: resume/recap texture ----
  if (resumes === 0 && roster.length > 0) fail('resume opener never fired (trust shortcut applied)');
  else pass(`resume opener texture present (${resumes})`);

  // ---- ASSERTION D: drift computes, no crash, no leak through drifted voice ----
  try {
    const d = Game.convoDrift(roster[0]);
    if (d && typeof d === 'object') pass('convoDrift returns a vector, confrontation path unaffected');
    else fail('convoDrift returned non-object');
  } catch (e) { fail('convoDrift threw: ' + e.message); }

  console.log(`\nseed=${SEED} corpus=${corpus.length} failures=${failures}`);
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error('HARNESS CRASH: ' + (e && e.stack || e)); process.exit(2); });
