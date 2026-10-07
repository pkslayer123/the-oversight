// PROOF: conversation depth (2026-10-07 worker).
// Node harness only. Full production script list from index.html in order,
// minus DOM-only app.js/sprites.js/tile-scenes.js/move-anim.js. window is
// stubbed for the eval phase, then deleted before playing (sync combat path).
//
// Judges like Steve would: distinct voices, coherent people, no knowledge
// leaks, wants that answer the actual beat. Exits nonzero on failure.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

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
  catch (e) { console.log(`LOAD FAIL ${f}: ${e.message}`); process.exit(1); }
}
delete global.window; // sync path for play
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL: ${name}${extra ? ' — ' + extra : ''}`); }
}
function transcript(vid) {
  return (Game.convoGet(vid).transcript || []).map(t =>
    (t.who === 'you' ? 'YOU ' : t.who === 'them' ? 'THEM' : '    ') + ' ' + t.text).join('\n');
}
function seedNames(vid) {
  const ls = (Game.vpOf(vid) || {}).lifeseed || {};
  return ((ls.people || []).map(p => (p.name || '').split(' ')[0])).filter(Boolean);
}

(async () => {
  await Game.init();
  Game.debugScenario('mootAccused');
  const v = Game.state.village;
  const roster = (v.roster || []).filter(id => id !== Game.villagerId);
  ok('roster non-empty', roster.length >= 6, 'need 6+ villagers, got ' + roster.length);
  v.trust = v.trust || {};

  console.log('=== 1. bridges cover every thread ===');
  const threads = ['grief', 'cheer', 'goal', 'past', 'village', 'plans', 'gossip', 'personal',
    'want', 'secret', 'theorize', 'taughtref', 'recall', 'request', 'small',
    'work', 'hopes', 'hardstory', 'trade'];
  for (const t of threads) {
    let line = null;
    try { line = Game.bridgeLine(roster[0], t); } catch (e) {}
    ok(`bridge for '${t}'`, typeof line === 'string' && line.length > 4, String(line).slice(0, 60));
  }

  console.log('=== 2. distinct people: fingerprints unique, openings differ ===');
  const fps = roster.slice(0, 6).map(id => Game.npcVoiceFingerprint(id));
  ok('voice fingerprints unique', new Set(fps).size === fps.length, fps.join(' | '));
  const openings = [];
  for (const id of roster.slice(0, 6)) {
    v.trust[id] = 30;
    const st = Game.startConvo(id);
    openings.push(st && st.line);
    Game.endConvo(id, 'left');
  }
  ok('openings non-empty', openings.every(o => typeof o === 'string' && o.length > 3));
  const uniqOpen = new Set(openings.map(o => o.slice(0, 40)));
  ok('openings differ across villagers', uniqOpen.size >= 4, uniqOpen.size + '/6 distinct');

  console.log('=== 3. want beats: tagged at the source, menus answer the beat ===');
  // want->beat tag map is canonical and complete
  const wantIds = ['share_news', 'ask_favor', 'seek_comfort', 'warn_you', 'curious',
    'just_company', 'offer_teach', 'ask_opinion', 'make_amends', 'show_pride'];
  for (const wid of wantIds) {
    const tag = Game.wantBeatTag(wid);
    const offerOk = (wid === 'ask_favor' || wid === 'offer_teach');
    ok(`wantBeatTag(${wid})`, tag !== 'offer' || offerOk, 'tag=' + tag);
  }

  // ask_favor: favor menu, not teach menu
  {
    const id = roster[0];
    v.trust[id] = 50;
    Game.convoPlantSeed(id, { wantId: 'ask_favor', note: 'test favor' });
    const st = Game.startConvo(id);
    const beat = Game.beatOf(id);
    ok('ask_favor tagged offer', beat.tag === 'offer', 'tag=' + beat.tag + ' topic=' + beat.topic);
    const ids = (Game.dialogueResponses(id) || []).map(x => x.id);
    ok('favor menu has dlg:help', ids.includes('dlg:help'), ids.join(','));
    ok('favor menu has no dlg:learn', !ids.includes('dlg:learn'), ids.join(','));
    const r = Game.convoTurn(id, 'dlg:help');
    ok('favor stated concretely', /food|watch|stay close|pair of hands/i.test(r.line || ''), (r.line || '').slice(0, 80));
    ok('favor want engaged (no loop)', Game.convoGet(id).want.stage === 1 || Game.convoGet(id).offeredHelp, '');
    Game.endConvo(id, 'left');
  }

  // offer_teach: lesson menu; dlg:learn teaches from THEIR lifeseed; no farming
  {
    const id = roster[1];
    v.trust[id] = 60;
    Game.convoPlantSeed(id, { wantId: 'offer_teach', note: 'test teach' });
    Game.startConvo(id);
    const beat = Game.beatOf(id);
    ok('offer_teach tagged offer', beat.tag === 'offer', 'tag=' + beat.tag);
    const ids = (Game.dialogueResponses(id) || []).map(x => x.id);
    ok('teach menu has dlg:learn', ids.includes('dlg:learn'), ids.join(','));
    ok('teach menu has no dlg:help', !ids.includes('dlg:help'), ids.join(','));
    const trustBefore = v.trust[id] || 0;
    const r = Game.convoTurn(id, 'dlg:learn');
    const ls = (Game.vpOf(id) || {}).lifeseed || {};
    const soVals = Object.values(ls.skillOrigins || {});
    const names = seedNames(id);
    const originHit = soVals.some(sov => (r.line || '').includes(String(sov).split(' ').slice(-3).join(' '))) ||
      names.some(n => (r.line || '').includes(n));
    ok('lesson names their seed skill origin', originHit, (r.line || '').slice(0, 110));
    ok('lesson builds trust', (v.trust[id] || 0) > trustBefore, '');
    ok('lesson recorded', ((v.taughtBy || {})[Game.villagerId] || []).some(e => e.by === id), '');
    const t2 = v.trust[id];
    const r2 = Game.convoTurn(id, 'dlg:learn');
    ok('second lesson refused honestly', /shown you what I can|practice/i.test(r2.line || ''), (r2.line || '').slice(0, 80));
    ok('no trust farming', (v.trust[id] || 0) === t2, '');
    Game.endConvo(id, 'left');
  }

  // make_amends: feeling beat (guilt-driven)
  {
    const id = roster[2];
    v.trust[id] = 50;
    Game.remember(id, 'theft_done', 'stole rations');
    Game.convoPlantSeed(id, { wantId: 'make_amends', note: 'test amends' });
    Game.startConvo(id);
    const beat = Game.beatOf(id);
    ok('make_amends tagged feeling', beat.tag === 'feeling', 'tag=' + beat.tag);
    const ids = (Game.dialogueResponses(id) || []).map(x => x.id);
    ok('amends menu has dlg:comfort', ids.includes('dlg:comfort'), ids.join(','));
    Game.endConvo(id, 'left');
  }

  // show_pride: news beat from their memory
  {
    const id = roster[3];
    v.trust[id] = 50;
    Game.remember(id, 'promise_kept', 'watched the stores');
    Game.convoPlantSeed(id, { wantId: 'show_pride', note: 'test pride' });
    Game.startConvo(id);
    const beat = Game.beatOf(id);
    ok('show_pride tagged news', beat.tag === 'news', 'tag=' + beat.tag);
    // Engage: the want's engage beat queues on the continuer and names
    // the good thing from their memory.
    const ch = Game.convoChoices(id) || [];
    const react = ch.find(x => x.id === 'dlg:react') || ch.find(x => x.id === 'dlg:more');
    if (react) Game.convoTurn(id, react.id);
    const ch2 = Game.convoChoices(id) || [];
    ok('engage beat queued on continuer', ch2.some(x => x.id === 'goon'), ch2.map(x => x.id).join(','));
    let prideLine = '';
    if (ch2.some(x => x.id === 'goon')) {
      // drain any non-want beats first (mood beats), then read the engage beat
      let guard = 0, r = null;
      while (guard++ < 4) {
        r = Game.convoTurn(id, 'goon');
        prideLine = r.line || '';
        if (/kept my word|did right|witness/i.test(prideLine)) break;
        const cc = Game.convoChoices(id) || [];
        if (!cc.some(x => x.id === 'goon')) break;
      }
    }
    ok('pride deed names their memory', /watched the stores|kept my word/i.test(prideLine), prideLine.slice(0, 100));
    Game.endConvo(id, 'left');
  }

  // ask_opinion: news beat; matter from live village (grief)
  {
    const id = roster[4];
    v.trust[id] = 50;
    v.grief = 3;
    Game.convoPlantSeed(id, { wantId: 'ask_opinion', note: 'test opinion' });
    const st = Game.startConvo(id);
    const beat = Game.beatOf(id);
    ok('ask_opinion tagged news', beat.tag === 'news', 'tag=' + beat.tag);
    ok('opinion matter from live grief', /honor them|grieve properly/i.test(st.line || ''), (st.line || '').slice(0, 100));
    Game.endConvo(id, 'left');
    v.grief = 0;
  }

  console.log('=== 4. held-beat want surfacing: continuer offered, beat tagged ===');
  {
    const id = roster[5];
    v.trust[id] = 40;
    const st = Game.startConvo(id);
    const c = Game.convoGet(id);
    const wid = c.want && c.want.id;
    ok('want selected', !!wid, String(wid));
    // play a turn so the want surfaces into heldBeats
    const ch0 = Game.convoChoices(id) || [];
    const first = ch0.find(x => x.id.indexOf('dlg:') === 0) || ch0[0];
    if (first) Game.convoTurn(id, first.id);
    const c2 = Game.convoGet(id);
    const queued = (c2.heldBeats || []).some(h => h.wantSurface);
    const ch1 = Game.convoChoices(id) || [];
    ok('continuer offered while want queued', !queued || ch1.some(x => x.id === 'goon'),
      'queued=' + queued + ' menu=' + ch1.map(x => x.id).join(','));
    if (queued && ch1.some(x => x.id === 'goon')) {
      Game.convoTurn(id, 'goon');
      const beat = Game.beatOf(id);
      ok('surfaced want tagged at delivery', beat.topic === 'want' && beat.tag === Game.wantBeatTag(wid),
        'tag=' + beat.tag + ' topic=' + beat.topic + ' want=' + wid);
    }
    Game.endConvo(id, 'left');
  }

  console.log('=== 5. coherence: loved names come from the lifeseed ===');
  {
    const seen = [];
    for (const id of roster.slice(0, 6)) {
      v.trust[id] = 70;
      const line = Game.topic2Ask(id, 'loved');
      Game.endConvo(id, 'left');
      const m = /name was ([A-Z][a-z]+)/.exec(line || '');
      if (m) seen.push({ vid: id, name: m[1], line });
    }
    ok('loved reveals seed names at high trust', seen.length >= 1, seen.length + ' reveals');
    for (const s of seen) {
      ok(`'${s.name}' is a seed person`, seedNames(s.vid).includes(s.name),
        'seed people: ' + seedNames(s.vid).join(',') + ' | ' + s.line.slice(0, 90));
    }
    // no invented names leak anywhere in the topic pools
    const invented = ['Ellis', 'Theo', 'Wren', 'Silas'];
    let leaked = null;
    for (const id of roster.slice(0, 6)) {
      for (let i = 0; i < 4; i++) {
        const line = Game.topic2Ask(id, 'loved');
        for (const n of invented) if (line && line.includes(n) && !seedNames(id).includes(n)) leaked = n + ' in: ' + line.slice(0, 80);
      }
      Game.endConvo(id, 'left');
    }
    ok('no invented names leak', !leaked, leaked || '');
  }

  console.log('=== 6. knowledge gating: hardstory ===');
  {
    const id = roster[0];
    const def = Game.t2defs().find(d => d.id === 'hardstory');
    v.trust[id] = 70;
    ok('hardstory gated without hard lived event', Game.t2gate(id, def) === false, '');
    const char = Game.vpOf(id);
    Game.recordLifeseedEvent(char, { kind: 'death_of_kin', subject: 'June', note: 'test' });
    ok('hardstory opens after hard lived event', Game.t2gate(id, def) === true, '');
    const line = Game.topic2Ask(id, 'hardstory');
    ok('hardstory line real', typeof line === 'string' && line.length > 20, (line || '').slice(0, 90));
    ok('hardstory has no raw placeholders', !/\{[a-z_]+\}/.test(line || ''), line || '');
    ok('hardstory marked told', Game.convoGet(id).hardstoryTold === true, '');
    ok('hardstory gone from menu after', !Game.topic2Asks(id).some(x => x.id === 'ask:hardstory'), '');
    ok('hardstory gate closed after', Game.t2gate(id, def) === false, '');
    Game.endConvo(id, 'left');
  }

  console.log('=== 7. lifeseed mood inflects conversation start ===');
  {
    // Pick a villager whose lifeseed mood is neutral and whose npcMood is
    // steady, so the betrayal's -1 is cleanly attributable.
    const id = roster.find(x => {
      try {
        return Game.lifeseedMood(Game.vpOf(x)) === 'steady' && Game.npcMood(x) === 'steady';
      } catch (e) { return false; }
    }) || roster[1];
    v.trust[id] = 10;
    const nmBefore = Game.npcMood(id);
    const before = Game.convoMoodInit(id);
    const char = Game.vpOf(id);
    Game.recordLifeseedEvent(char, { kind: 'betrayal', subject: 'a friend', note: 'test' });
    ok('lifeseedMood tracks the event', Game.lifeseedMood(char) === 'wary', Game.lifeseedMood(char));
    const after = Game.convoMoodInit(id);
    ok('betrayed villager starts colder', after === before - 1 && Game.npcMood(id) === nmBefore,
      `before=${before} after=${after} npcMood=${nmBefore}->${Game.npcMood(id)}`);
  }

  console.log('=== 8. warn_you: names only what they know ===');
  {
    const id = roster[2];
    v.trust[id] = 50;
    Game.remember(id, 'threat', 'a wrong-shaped thing by the treeline');
    Game.convoPlantSeed(id, { wantId: 'warn_you', note: 'test warn' });
    const st = Game.startConvo(id);
    ok('warning names their own memory', (st.line || '').includes('a wrong-shaped thing by the treeline'),
      (st.line || '').slice(0, 110));
    Game.endConvo(id, 'left');
    // control: no threat memory -> honest uncertainty, no invented specifics
    const id2 = roster[3];
    v.trust[id2] = 50;
    const c = Game.convoGet(id2);
    const def = c.want && null;
    Game.convoPlantSeed(id2, { wantId: 'warn_you', note: 'test warn 2' });
    Game.startConvo(id2);
    const wdef = Game.convoGet(id2).want.def;
    const seen = new Set();
    for (let i = 0; i < 3; i++) seen.add(wdef.opener.call(Game, id2));
    const honest = [...seen].every(l => /rumor, not witnessed|don\'t know what it was|need you to hear this/i.test(l));
    ok('warning without memory stays honest', honest, [...seen].map(l => l.slice(0, 60)).join(' // '));
    Game.endConvo(id2, 'left');
  }

  console.log('=== 9. new topics exist and gate ===');
  {
    const id = roster[4];
    v.trust[id] = 35;
    const asks = Game.topic2Asks(id).map(x => x.id);
    ok('work topic offered at trust 35', asks.includes('ask:work'), asks.join(','));
    ok('hopes topic offered at trust 35', asks.includes('ask:hopes'), asks.join(','));
    const work = Game.topic2Ask(id, 'work');
    ok('work line real', typeof work === 'string' && work.length > 10 && !/\{[a-z_]+\}/.test(work), (work || '').slice(0, 80));
    const hopes = Game.topic2Ask(id, 'hopes');
    ok('hopes line real', typeof hopes === 'string' && hopes.length > 10 && !/\{[a-z_]+\}/.test(hopes), (hopes || '').slice(0, 80));
    Game.endConvo(id, 'left');
  }

  console.log('=== 10. played exchanges (as a player) ===');
  {
    const id = roster[0];
    v.trust[id] = 65;
    Game.convoPlantSeed(id, { wantId: 'offer_teach', note: 'player pass' });
    let st = Game.startConvo(id);
    console.log('--- teach conversation ---');
    console.log(transcript(id));
    let r = Game.convoTurn(id, 'dlg:learn');
    console.log('YOU  "Show me."\nTHEM ' + r.line);
    const ch = Game.convoChoices(id) || [];
    const more = ch.find(x => x.id === 'dlg:more') || ch.find(x => x.id === 'dlg:subject');
    if (more) { r = Game.convoTurn(id, more.id); console.log('YOU  ' + more.label + '\nTHEM ' + r.line); }
    Game.endConvo(id, 'natural');
    console.log(transcript(id).split('\n').slice(-4).join('\n'));
  }
  {
    const id = roster[5];
    v.trust[id] = 45;
    Game.remember(id, 'theft_done', 'stole rations');
    Game.convoPlantSeed(id, { wantId: 'make_amends', note: 'player pass' });
    Game.startConvo(id);
    console.log('--- amends conversation ---');
    console.log(transcript(id));
    const r = Game.convoTurn(id, 'dlg:comfort');
    console.log('YOU  "Are you okay?"\nTHEM ' + r.line);
    Game.endConvo(id, 'natural');
  }
})().then(() => {
  console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'}: ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}).catch(e => { console.error('FATAL', e); process.exit(1); });
