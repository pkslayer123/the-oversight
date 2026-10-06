// SOCIAL SCENARIO RE-AUDIT, ROUND 2 — v2 (Steve 2026-10-06).
// Replays moot/exile/ambush/liars/uprising as a PLAYER through the real UI
// paths (convo choices, dossier dispatcher, ambush UI gate), verifying:
//   1. every intro is pure scene-setting (zero mechanic coaching, zero dev
//      markers in player-facing text)
//   2. knowledge leaks: text revealing stats/names/patterns/tactics not yet
//      earned ("if you don't know, it doesn't show")
//   3. villager-dialogue repetition: concrete repeated lines with repro
//   4. dialogue-box contract: one-message-at-a-time, speaker-tab history,
//      cap-200 transcript, tap-advance anchored on entry identity
// Usage: node scripts/play-social-audit-2.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js',
 'src/js/justice.js', 'src/js/betrayal.js', 'src/js/corpses.js', 'src/js/codex-people.js', 'src/js/progression.js',
 'src/js/ledger.js', 'src/js/debug-scenarios.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let sayLog = [];
const _say = Game.say.bind(Game);
Game.say = (t) => { sayLog.push(String(t)); return _say(t); };
function fresh(id) { sayLog = []; Game.debugScenario(id); }
const say = () => sayLog.slice();

const findings = [];
function find(tag, desc, where) { findings.push({ tag, desc, where }); console.log(`  !! [${tag}] ${desc} (${where})`); }

function narrativeLines() {
  return say().filter(l =>
    !l.startsWith('🐞') && !l.startsWith('📖') && !l.startsWith('📓') &&
    !/^Travel \d+ tile/i.test(l) && !/^— .* —$/.test(l) && l.trim().length > 0);
}

const COACH_PHRASES = [
  'the intended move', 'watch what happens', 'bad liars', 'press them',
  'flip the weakest', 'examine the site', 'name witnesses', 'call witnesses',
  'tap a', 'best bet', 'll need to', 'talk to them — ask', 'ask again later',
  'confront them. watch', 'defense window is ticking', 'running is the intended',
];
const DEV_RE = /\(debug\)|debug scenario:|\bTODO\b|\bFIXME\b|\[object Object\]|\bNaN\b/i;

(async () => {
  await Game.init();

  // ============ PART 1: intros as a player ============
  console.log('\n##### PART 1 — scenario intros (player-facing narrative) #####');
  for (const id of ['mootAccused', 'mootJuror', 'ambush', 'liars', 'exile', 'uprising']) {
    console.log(`\n--- ${id} ---`);
    fresh(id);
    narrativeLines().slice(-4).forEach(l => console.log('  | ' + l.slice(0, 200)));
    for (const l of narrativeLines()) {
      if (DEV_RE.test(l)) find('DEVLEAK', `"${l.slice(0, 100)}..."`, id + '/intro');
      for (const p of COACH_PHRASES) if (l.toLowerCase().includes(p)) find('COACH', `coaching phrase "${p}" in "${l.slice(0, 90)}..."`, id + '/intro');
      if (/you should/i.test(l)) find('COACH', `"${l.slice(0, 90)}..."`, id + '/intro');
    }
    // exact-phrase repetition across distinct lines (>= 4 words, >= 20 chars)
    const ls = say().filter(l => !l.startsWith('🐞') && l.length > 30);
    const ph = {};
    for (const l of ls) {
      const words = l.replace(/["“”]/g, '').split(/\s+/).filter(w => w.length > 1);
      for (let i = 0; i + 4 <= words.length; i++) {
        const k = words.slice(i, i + 4).join(' ').toLowerCase();
        if (k.length >= 20) { ph[k] = ph[k] || new Set(); ph[k].add(l.slice(0, 60)); }
      }
    }
    for (const [k, v] of Object.entries(ph)) {
      // descriptors ("A person, maybe 30s, with...") are formulaic by design —
      // only flag true repeated prose.
      if (/^(a |the )?(person|man|woman),? maybe/.test(k)) continue;
      if (v.size > 1) { find('REPEAT', `phrase "${k.slice(0, 50)}..." x${v.size} distinct lines`, id + '/intro'); break; }
    }
  }

  // uprising contradiction: "no talking your way out" + prompt offers TALK
  fresh('uprising');
  const ul = say().join('\n');
  if (/no talking your way out/i.test(ul) && /FIGHT, FLEE, or TALK/.test(ul))
    find('CONTRADICT', '"There\'s no talking your way out of this." but the prompt offers TALK — and tbHostileTalk tactics (beg/reason/bribe/taunt) DO work', 'uprising/intro');

  // ============ PART 2: liar conversations ============
  console.log('\n##### PART 2 — liar conversations (voice, repetition, leaks) #####');
  fresh('liars');
  const roster = (Game.state.village.roster || []).filter(id => id !== Game.villagerId).slice(0, 5);
  const themLines = [];
  for (const rid of roster) {
    try {
      Game.startConvo(rid);
      let r = null, turns = 0;
      while (turns < 8) {
        turns++;
        const choices = (Game.convoChoices && Game.convoChoices(rid)) || [];
        const pick = choices.find(c => /past|where|occupation|from|know you better/i.test(c.label)) || choices.find(c => !/leave|bye|goodbye/i.test(c.label)) || choices[0];
        if (!pick) break;
        r = Game.convoTurn(rid, pick.id);
        if (r && r.line) themLines.push({ vid: rid, text: String(r.line) });
        if (!r || r.ended) break;
      }
      try { Game.endConvo(rid, 'left'); } catch (e) {}
    } catch (e) { console.log('  convo drive threw for', rid, e.message); }
  }
  console.log('them-lines captured:', themLines.length);
  // TRUE doubled-quote bug: adjacent "" (single quote layer is correct)
  for (const t of themLines) {
    if (/["“”]{2}/.test(t.text)) find('QUOTE', `doubled quotes: "${t.text.slice(0, 100)}..."`, 'liars/convo ' + t.vid);
  }
  if (!findings.some(f => f.tag === 'QUOTE')) console.log('  doubled-quote check: CLEAN (single quote layer only — 1a6cea7 holds)');
  // cross-speaker repetition of full statements (>= 30 chars)
  const byText = {};
  for (const t of themLines) {
    const k = t.text.trim();
    if (k.length < 30) continue;
    (byText[k] = byText[k] || new Set()).add(t.vid);
  }
  for (const [k, vids] of Object.entries(byText)) {
    if (vids.size > 1) find('REPEAT', `x${vids.size} speakers, same line: "${k.slice(0, 90)}..."`, 'liars/convo cross-speaker');
  }
  // knowledge leak: 'personal' topic leaks real occupation under an active cover
  for (const rid of roster) {
    const vp = Game.vpOf(rid);
    const truth = (vp.formerOccupation || '').toLowerCase();
    const cover = ((vp.lies && vp.lies.occupation && vp.lies.occupation.told) || '').toLowerCase();
    if (!truth || !cover) continue;
    Game.startConvo(rid);
    for (let i = 0; i < 10; i++) {
      const ch = (Game.convoChoices(rid) || []).filter(c => !/leave|bye|goodbye/i.test(c.label));
      if (!ch.length) break;
      const r = Game.convoTurn(rid, ch[i % ch.length].id);
      const line = String((r && r.line) || '');
      if (line.toLowerCase().includes(truth) && !line.toLowerCase().includes(cover)) {
        find('KNOWLEAK', `"personal" smalltalk reveals real occupation "${truth}" under active "${cover}" cover: "${line.slice(0, 100)}..."`, 'liars/personal ' + rid);
        break;
      }
      if (!r || r.ended) break;
    }
    try { Game.endConvo(rid, 'left'); } catch (e) {}
  }

  // ============ PART 3: mootJuror press via convo UI ============
  console.log('\n##### PART 3 — mootJuror press (convo UI) #####');
  fresh('mootJuror');
  try {
    const cs = (Game.betrayalState().cases || []).find(x => x.playerRole === 'juror');
    const accused = (cs && (cs.accusedIds || cs.accused || [])) || [];
    console.log('accused ids:', accused.join(', ') || '(none found)');
    for (const vid of accused.slice(0, 2)) {
      Game.startConvo(vid);
      const press = (Game.convoChoices(vid) || []).find(c => /^betrayal:press/.test(c.id));
      if (!press) { console.log(' ', vid, '— no press choice'); try { Game.endConvo(vid, 'left'); } catch (e) {} continue; }
      const got = [];
      for (let i = 0; i < 2; i++) {
        sayLog = [];
        Game.convoTurn(vid, press.id);
        got.push(say().join(' ').slice(0, 200));
      }
      console.log(' ', vid, 'press x2:');
      got.forEach(g => console.log('   | ' + g.slice(0, 130)));
      if (got[0].length > 60 && got[0] === got[1]) find('REPEAT', 'pressing the same accused twice yields the identical line', 'mootJuror/press ' + vid);
      try { Game.endConvo(vid, 'left'); } catch (e) {}
    }
  } catch (e) { console.log('  mootJuror press drive threw:', e.message); }

  // ============ PART 4: ambush talk through the UI gate ============
  console.log('\n##### PART 4 — ambush talk (UI-gated like the real interface) #####');
  fresh('ambush');
  try {
    const plot = (Game.betrayalState().plots || []).find(p => p.sprung && Game.isPlayer(p.target));
    if (plot) {
      const seq = [];
      Game.say = (t) => { seq.push(String(t)); return _say(t); };
      let rounds = 0;
      // betrayal.js:1639 — the real interface only offers TALK while talksLeft > 0
      while ((plot.talksLeft || 0) > 0 && rounds < 10) {
        rounds++;
        const res = Game.ambushExchange(plot, 'talk');
        if (!res || !res.continue) break;
      }
      Game.say = (t) => { sayLog.push(String(t)); return _say(t); };
      console.log('UI-gated talk rounds:', rounds, '| talksLeft now:', plot.talksLeft, '| outcome:', plot.outcome);
      seq.filter(l => !l.startsWith('🐞') && !l.startsWith('📓')).forEach(l => console.log('  | ' + l.slice(0, 130)));
      const seen = new Set();
      for (const l of seq) {
        const k = l.trim();
        if (k.length >= 50 && seen.has(k)) { find('REPEAT', `ambush talk repeats: "${k.slice(0, 80)}..."`, 'ambush/talk'); break; }
        seen.add(k);
      }
      if (rounds > 0) console.log('  no repetition inside the UI-gated talk window');
    } else console.log('  no sprung player-target plot found');
  } catch (e) { console.log('  ambush talk drive threw:', e.message); }

  // ============ PART 5: dialogue-box contract (code + runtime) ============
  console.log('\n##### PART 5 — dialogue-box contract #####');
  const appSrc = fs.readFileSync(path.join(ROOT, 'src/js/app.js'), 'utf8');
  const checks = [
    ['one-message-at-a-time (msgIndex clamp)', /msgIndex.*clamp|clamp.*msgIndex/i.test(appSrc) || /let mi = cv\.msgIndex/.test(appSrc)],
    ['speaker tab toggles history (dlg-hist)', /dlg-hist/.test(appSrc) && /chatView\.history = !chatView\.history/.test(appSrc)],
    ['history scrolls inside the box (dlg-history)', /dlg-history/.test(appSrc)],
    ['tap-advance anchors on entry identity (lastBefore/lastIndexOf)', /lastIndexOf\(lastBefore\)/.test(appSrc)],
    ['tap box advances except on choices/x/hist', /box\.onclick[\s\S]{0,300}chatAdvance/.test(appSrc)],
  ];
  const convSrc = fs.readFileSync(path.join(ROOT, 'src/js/conversation.js'), 'utf8');
  // CAP-8 SIBLINGS (bug class Steve flagged 2026-10-05: cap was 8, destroyed
  // history and desynced tap-advance; conversation.js push sites were raised
  // to 200 but WRAPPER trims in betrayal/game/truth still use 8).
  const wrapperFiles = ['src/js/betrayal.js', 'src/js/game.js', 'src/js/truth.js'];
  let cap8sites = 0;
  for (const f of wrapperFiles) {
    const s = fs.readFileSync(path.join(ROOT, f), 'utf8');
    const n = [...s.matchAll(/transcript\.length > 8/g)].length;
    if (n) { console.log(`  FAIL cap-8 trim still present: ${f} x${n}`); cap8sites += n; }
  }
  checks.push(['no cap-8 trims in convo wrappers (betrayal/game/truth)', cap8sites === 0]);
  for (const [name, ok] of checks) console.log(`  ${ok ? 'PASS' : 'FAIL'} ${name}`);
  if (checks.some(c => !c[1])) find('UICONTRACT', 'a dialogue-box contract check failed (see above)', 'app.js/conversation.js/wrappers');

  console.log('\n##### FINDINGS #####');
  for (const f of findings) console.log(`  [${f.tag}] ${f.desc}  — ${f.where}`);
  console.log('total:', findings.length);
})().catch(e => { console.error('HARNESS CRASH:', e.message); console.error((e.stack || '').split('\n').slice(0, 5).join('\n')); process.exit(2); });
