// Conversation overhaul tests: emoji codepoint leaks, deep-topic reachability,
// choice starvation, trust bonuses, wake-up language, occupation English.
// Usage: node scripts/test-conversation-overhaul.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
// FULL load order per index.html (minus app.js which needs DOM)
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/food.js', 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js',
 'src/js/justice.js', 'src/js/debug-scenarios.js'
].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}`); }
}

const topicsOf = (choices) => choices.filter(c => c.id.indexOf('ask:') === 0).map(c => c.id);
const hasCodepointLeak = (s) => /U0001F|\\U[0-9A-Fa-f]{8}|\\u0001[Ff][0-9A-Fa-f]{3}/.test(s);

function freshGame() {
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  return (Game.state.village.roster || []).filter(id => id !== Game.villagerId);
}

(async () => {
  await Game.init();

  // === 1. NO CODEPOINT LEAKS in conversation button labels ===
  {
    const roster = freshGame();
    const A = roster[0];
    Game.startConvo(A);
    const labels = Game.convoChoices(A).map(c => c.label).join(' | ');
    ok('convo choice labels have no codepoint leaks', !hasCodepointLeak(labels));
    Game.endConvo(A, 'natural');
    // askAbout submenu labels (the ones in Steve's screenshot)
    const goalL = Game.convoLabel(A, 'goal'), pastL = Game.convoLabel(A, 'past');
    ok('topic labels have no codepoint leaks', !hasCodepointLeak(goalL + pastL));
    // source-level: no Python-style escapes remain anywhere in src
    const srcFiles = ['src/js/app.js', 'src/js/game.js', 'src/js/food.js', 'src/js/conversation.js'];
    const leaked = srcFiles.filter(f => hasCodepointLeak(fs.readFileSync(path.join(ROOT, f), 'utf8')));
    ok('no codepoint escapes in source files', leaked.length === 0);
    // emoji actually render
    ok('target emoji renders', '🎯' === '\u{1F3AF}' && !hasCodepointLeak('🎯 "What do you want?"'));
  }

  // === 2. DEEP-TOPIC REACHABILITY: 2-3 conversations ===
  {
    const roster = freshGame();
    const A = roster[0];
    Game.startConvo(A);
    const t1 = topicsOf(Game.convoChoices(A));
    ok('convo 1: village+plans only', t1.includes('ask:village') && t1.includes('ask:plans') && !t1.includes('ask:past') && !t1.includes('ask:goal'));
    ok('convo 1: no theorize', !Game.convoChoices(A).some(c => c.id === 'theorize'));
    Game.endConvo(A, 'natural');
    Game.startConvo(A);
    const t2 = topicsOf(Game.convoChoices(A));
    ok('convo 2: past unlocked', t2.includes('ask:past'));
    ok('convo 2: theorize unlocked', Game.convoChoices(A).some(c => c.id === 'theorize'));
    ok('convo 2: goal still gated', !t2.includes('ask:goal'));
    Game.endConvo(A, 'natural');
    Game.startConvo(A);
    const t3 = topicsOf(Game.convoChoices(A));
    ok('convo 3: goal unlocked', t3.includes('ask:goal'));
    Game.endConvo(A, 'natural');
  }

  // === 3. STARVATION: rich NPC still offers topics ===
  {
    const roster = freshGame();
    const B = roster[1];
    const origIsTrader = Game.isKnowledgeTrader;
    const origTraderKn = Game.traderKnowledge;
    Game.isKnowledgeTrader = (vid) => vid === B;
    Game.traderKnowledge = (vid) => vid === B ? ['dandelion'] : [];
    Game.state.codex.plants = { dandelion: { level: 3 } };
    Game.state.village.goalsKnown = Game.state.village.goalsKnown || {};
    Game.state.village.goalsKnown[B] = true;
    ['trade', 'promise'].forEach(d => { try { Game.discover(d); } catch (e) {} });
    Game.startConvo(B); Game.endConvo(B, 'natural');
    Game.startConvo(B); // convo 2
    const ch = Game.convoChoices(B);
    const t = topicsOf(ch);
    ok('rich NPC convo 2 offers topic asks (no starvation)', t.length > 0);
    ok('rich NPC convo 2 offers past', t.includes('ask:past'));
    ok('rich NPC convo 2 still offers discovery actions', ch.some(c => c.id === 'trade' || c.id === 'teach' || c.id === 'offer_help'));
    Game.endConvo(B, 'natural');
    Game.isKnowledgeTrader = origIsTrader;
    Game.traderKnowledge = origTraderKn;
  }

  // === 4. TRUST BONUSES for deep exchanges ===
  {
    const roster = freshGame();
    const A = roster[0];
    Game.state.village.trust = Game.state.village.trust || {};
    Game.state.village.trust[A] = 10;
    Game.startConvo(A); Game.endConvo(A, 'natural'); // convo 1 -> trust 13
    Game.startConvo(A); // convo 2: past open
    const before = Game.state.village.trust[A];
    Game.convoTurn(A, 'ask:past');
    const after = Game.state.village.trust[A];
    ok('asking about past gives trust bonus', after > before);
    Game.convoTurn(A, 'theorize');
    const after2 = Game.state.village.trust[A];
    ok('theorizing gives trust bonus', after2 > after);
    ok('talk trust still caps at 40', after2 <= 40);
    try { Game.endConvo(A, 'left'); } catch (e) {}
  }

  // === 5. WAKE-UP LANGUAGE: zero-English waker speaks their tongue ===
  {
    let okCount = 0;
    for (let i = 0; i < 6; i++) {
      const roster = freshGame();
      const waker = roster[0];
      Game.state.village.bgLangs = Game.state.village.bgLangs || {};
      Game.state.village.bgLangs[waker] = { native: 'italian', levels: { italian: 3 } };
      Game.state.village.roster = [Game.villagerId, waker];
      Game.state.questGiven = false;
      const q = Game.getQuest();
      const foreign = q && q.lines.some(l => /«/.test(l) || /Not one word of English/.test(l));
      const leak = q && q.lines.some(l => /you're awake|Don't sit up fast|dragged your useless ass/.test(l));
      if (foreign && !leak) okCount++;
    }
    ok('zero-English waker wakes you in their tongue (6/6)', okCount === 6);
  }

  // === 6. OCCUPATION ENGLISH PLAUSIBILITY ===
  {
    const d = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/characterGen.json'), 'utf8'));
    const pilot = d.occupations.find(o => o.id === 'pilot');
    ok('bush pilot has plausible English', (pilot.polyglot || []).includes('english'));
    // genCultureLanguages gives the pilot fluent English with a reason
    Game.genRoster('Cairo, Egypt');
    let pilotFound = false, reasonFound = false;
    for (let i = 0; i < 30 && !pilotFound; i++) {
      Game.genRoster('Cairo, Egypt');
      for (const g of (Game.generatedRoster || [])) {
        const occ = (g.formerOccupation || '').toLowerCase();
        if (occ.includes('pilot') && Game.npcLangs) {
          // check via genCultureLanguages directly (real culture id)
          const cl = Game.genCultureLanguages('egyptian', { id: 'pilot', polyglot: ['english'] }, {});
          if ((cl.levels.english || 0) >= 2) pilotFound = true;
          if ((cl.reasons || []).join(' ').includes('English')) reasonFound = true;
        }
      }
    }
    ok('pilot gets fluent English from occupation', pilotFound);
    ok('occupation English has a backstory reason', reasonFound);
  }

  // === 7. CHAT VIEW exists in app.js + CSS ===
  {
    const appSrc = fs.readFileSync(path.join(ROOT, 'src/js/app.js'), 'utf8');
    for (const fn of ['function openChat', 'function closeChat', 'function renderChatScreen', 'function chatChoice', 'function armChatThinking']) {
      ok(`app.js defines ${fn}`, appSrc.includes(fn));
    }
    ok('talk opens chat view', /act === 'talk'[\s\S]{0,120}openChat\(vid\)/.test(appSrc));
    const css = fs.readFileSync(path.join(ROOT, 'src/css/main.css'), 'utf8');
    for (const cls of ['.chat {', '.chat-head', '.chat-msgs', '.chat-msg', '.chat-bubble', '.chat-choices', '.chat-choice']) {
      ok(`css defines ${cls}`, css.includes(cls));
    }
    ok('chat uses dynamic viewport height', css.includes('100dvh'));
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
