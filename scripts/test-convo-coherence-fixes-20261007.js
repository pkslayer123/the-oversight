#!/usr/bin/env node
// Conversation coherence fixes proof (Steve 2026-10-06):
// 1. threadBeatTag distinguishes want IDs (not all 'offer')
// 2. threadDry suppresses "tell me more" when thread is dry (was lost in beats override)
// 3. dlg:help states the favor concretely (was infinite "Here's the thing —" loop)
// 4. beatOf re-classifies want threads (lastBeat cached before c.want set)
// Usage: node scripts/test-convo-coherence-fixes-20261007.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
global.window = global;
const files = [
  'src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
  'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
  'src/js/game.js', 'src/js/encounters.js', 'src/js/conversation.js',
  'src/js/convo-mood.js', 'src/js/convoTopics.js', 'src/js/convo-wants.js',
  'src/js/convo-dialogue.js', 'src/js/convo-beats.js',
  'src/js/examine.js', 'src/js/equipment.js', 'src/js/journal.js',
  'src/js/party.js', 'src/js/party-formal.js', 'src/js/truth.js',
  'src/js/contests.js', 'src/js/storage.js', 'src/js/perceive.js',
  'src/js/carexplore.js', 'src/js/justice.js', 'src/js/food.js',
  'src/js/betrayal.js', 'src/js/corpses.js', 'src/js/lifeseed.js',
  'src/js/progression.js', 'src/js/ledger.js', 'src/js/villager-agency.js',
  'src/js/codex-people.js', 'src/js/membership.js', 'src/js/hierarchy.js',
  'src/js/debug-scenarios.js', 'src/js/build.js',
];
for (const f of files) { eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); }
delete global.window;
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL: ${name}` + (extra ? ` — ${extra}` : '')); }
}

(async () => {
  await Game.init();
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();

  console.log('=== Conversation Coherence Fixes Proof ===\n');

  // TEST 1: threadBeatTag distinguishes want IDs
  console.log('--- Test 1: threadBeatTag distinguishes want IDs ---');
  const mockC = (wid) => ({ thread: 'want', want: { id: wid } });
  ok('ask_favor -> offer', Game.threadBeatTag('want', mockC('ask_favor')) === 'offer');
  ok('seek_comfort -> feeling', Game.threadBeatTag('want', mockC('seek_comfort')) === 'feeling');
  ok('share_news -> news', Game.threadBeatTag('want', mockC('share_news')) === 'news');
  ok('warn_you -> news', Game.threadBeatTag('want', mockC('warn_you')) === 'news');
  ok('curious -> question', Game.threadBeatTag('want', mockC('curious')) === 'question');
  ok('just_company -> small', Game.threadBeatTag('want', mockC('just_company')) === 'small');

  // TEST 2: beatOf re-classifies cached lastBeat
  console.log('\n--- Test 2: beatOf re-classifies want threads ---');
  const npcs = (Game.state.village.roster || []).filter(id => id !== Game.villagerId);
  let foundWant = false;
  for (const vid of npcs.slice(0, 15)) {
    const opening = Game.startConvo(vid);
    const c = Game.convoGet(vid);
    if (c.thread === 'want' && c.want && c.want.id) {
      const beat = Game.beatOf(vid);
      const wid = c.want.id;
      let expected = 'offer';
      if (wid === 'seek_comfort') expected = 'feeling';
      else if (wid === 'share_news' || wid === 'warn_you') expected = 'news';
      else if (wid === 'curious') expected = 'question';
      else if (wid === 'just_company') expected = 'small';
      ok(`want ${wid} -> beat ${expected}`, beat.tag === expected, `got ${beat.tag}`);
      foundWant = true;
      Game.endConvo(vid);
      if (foundWant) break;
    }
    Game.endConvo(vid);
  }
  if (!foundWant) console.log('  (no want-thread NPC found in sample)');

  // TEST 3: dlg:help does not loop with "Here's the thing —"
  console.log('\n--- Test 3: dlg:help states favor (no infinite loop) ---');
  let testedHelp = false;
  for (const vid of npcs.slice(0, 15)) {
    const opening = Game.startConvo(vid);
    const beat = Game.beatOf(vid);
    if (beat.tag === 'offer') {
      const choices = opening.choices || [];
      const helpChoice = choices.find(ch => ch.id === 'dlg:help');
      if (helpChoice) {
        const result = Game.convoTurn(vid, 'dlg:help');
        const line = String(result.line || '');
        ok('dlg:help does not say "Here\'s the thing —"',
           !line.includes("Here's the thing —"),
           `got: ${line.slice(0, 60)}`);
        ok('dlg:help states something concrete',
           line.length > 30 && !line.endsWith('—"'),
           `got: ${line.slice(0, 60)}`);
        testedHelp = true;
        Game.endConvo(vid);
        break;
      }
    }
    Game.endConvo(vid);
  }
  if (!testedHelp) console.log('  (no offer-beat NPC found in sample)');

  // TEST 4: DIALOGUE_FEATURE_MAP completeness (all features mapped, none removed)
  console.log('\n--- Test 4: DIALOGUE_FEATURE_MAP completeness ---');
  const required = ['gossip', 'news', 'rumors', 'rumor_spread', 'teaching', 'learning',
    'trust', 'comfort', 'companionship', 'personal', 'trade', 'hawking', 'favors',
    'promises', 'invite', 'confrontation', 'lies', 'observation', 'past', 'goals',
    'village', 'plans', 'theorize', 'want_share_news', 'want_ask_favor',
    'want_seek_comfort', 'want_warn_you', 'want_curious', 'want_just_company',
    'secrets', 'grief', 'cheer', 'reactive_q', 'nonverbal', 'language', 'leave'];
  for (const f of required) {
    ok(`feature mapped: ${f}`, !!(Game.DIALOGUE_FEATURE_MAP && Game.DIALOGUE_FEATURE_MAP[f]));
  }

  // TEST 5: dialogueResponses is the beats version (live code path)
  console.log('\n--- Test 5: Live integration ---');
  const drSrc = Game.dialogueResponses.toString();
  ok('dialogueResponses is convo-beats version',
     drSrc.includes('beatOf') || drSrc.includes('topicPool'));

  console.log(`\n=== Results: ${pass} pass, ${fail} fail ===`);
  process.exit(fail > 0 ? 1 : 0);
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
