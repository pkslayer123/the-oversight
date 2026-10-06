// Conversation topics test — generated identity/event topics (Steve 2026-10-06).
// Usage: node scripts/test-conversation-topics.js
// Proves: 9 topics registered; trust gates; personalization (two villagers differ);
// event-driven 'lately'; 2-3 exchange depth; no repeats; change-over-run.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/conversation.js',
 'src/js/convoTopics.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js',
 'src/js/justice.js', 'src/js/betrayal.js', 'src/js/corpses.js', 'src/js/codex-people.js', 'src/js/progression.js',
 'src/js/ledger.js', 'src/js/debug-scenarios.js'].forEach(f => eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL ${name}` + (extra ? ' — ' + extra : '')); }
}
function noPlaceholders(s) { return !/\{[a-zA-Z_]+\}/.test(String(s)); }

(async () => {
  await Game.init();
  Game.debugScenario('liars');
  const vids = Game.npcIds().slice(0, 4);
  ok('roster has villagers', vids.length >= 2, vids.length);

  // ---- 1. registry ----
  const defs = Game.t2defs();
  ok('9 topics registered', defs.length === 9, defs.length);
  const ids = defs.map(d => d.id).sort();
  ok('expected topic ids', JSON.stringify(ids) === JSON.stringify(['advice','fears','lately','loved','oldworld','others','skills','systemtake','you'].sort()), ids.join(','));

  // ---- 2. gates ----
  const vid = vids[0];
  Game.state.village.trust = Game.state.village.trust || {};
  Game.state.village.trust[vid] = 5;
  let st = Game.startConvo(vid);
  let asks = (Game.topic2Asks(vid) || []).map(a => a.id);
  ok('low trust: skills open', asks.includes('ask:skills'), asks.join(','));
  ok('low trust: loved closed', !asks.includes('ask:loved'), asks.join(','));
  ok('low trust: you closed', !asks.includes('ask:you'), asks.join(','));
  Game.state.village.trust[vid] = 80;
  Game.startConvo(vid); // reset convo state for fresh gates
  asks = (Game.topic2Asks(vid) || []).map(a => a.id);
  ok('high trust: you open', asks.includes('ask:you'), asks.join(','));
  ok('high trust: loved open', asks.includes('ask:loved'), asks.join(','));
  ok('high trust: fears open', asks.includes('ask:fears'), asks.join(','));

  // ---- 3. event-driven 'lately' ----
  Game.state.village.grief = 0;
  Game.startConvo(vid);
  let asksNoGrief = (Game.topic2Asks(vid) || []).map(a => a.id);
  Game.state.village.grief = 3;
  Game.startConvo(vid);
  let asksGrief = (Game.topic2Asks(vid) || []).map(a => a.id);
  ok('lately absent without event', !asksNoGrief.includes('ask:lately'));
  ok('lately present during grief', asksGrief.includes('ask:lately'), asksGrief.join(','));
  ok('lately prioritized first', asksGrief[0] === 'ask:lately', asksGrief.slice(0, 3).join(','));
  Game.state.village.grief = 0;

  // ---- 4. personalization: two villagers differ ----
  Game.state.village.trust[vids[0]] = 80;
  Game.state.village.trust[vids[1]] = 80;
  const lines = [];
  for (const v of [vids[0], vids[1]]) {
    Game.startConvo(v);
    const line = Game.convoAskTopic(v, 'fears');
    lines.push(line);
    ok(`fears line for ${v} has no placeholders`, noPlaceholders(line), line);
  }
  ok('two villagers fear different things', lines[0] !== lines[1], lines.join(' || '));
  const youLines = [];
  for (const v of [vids[0], vids[1]]) {
    Game.startConvo(v);
    const line = Game.convoAskTopic(v, 'you');
    youLines.push(line);
    ok(`you line for ${v} has no placeholders`, noPlaceholders(line), line);
  }

  // fear slot actually filled from identity
  const vp0 = Game.vpOf(vids[0]);
  const fear0 = vp0.secretFear || vp0.fear || 'being forgotten';
  ok('fear line uses their secretFear', lines[0].toLowerCase().includes(String(fear0).toLowerCase()), `fear=${fear0} line=${lines[0].slice(0,80)}`);

  // ---- 5. depth: opener + 3 follow-ups, then done ----
  Game.startConvo(vid);
  const seen = new Set();
  let l = Game.convoAskTopic(vid, 'skills');
  seen.add(l);
  ok('skills opener no placeholders', noPlaceholders(l), l);
  let depthOk = true;
  for (let i = 0; i < 3; i++) {
    if (!Game.topic2HasMore(vid)) { depthOk = false; break; }
    const b = Game.topic2Beat(vid);
    if (!b || seen.has(b) || !noPlaceholders(b)) { depthOk = false; break; }
    seen.add(b);
  }
  ok('3 unique follow-up beats', depthOk, [...seen].map(s => s.slice(0, 50)).join(' | '));
  ok('thread honestly ends after 4', !Game.topic2HasMore(vid));

  // ---- 6. one topic per conversation ----
  Game.startConvo(vid);
  Game.convoAskTopic(vid, 'advice');
  const reask = Game.convoAskTopic(vid, 'advice');
  const exhPool = ((Game.data.characterGen || {}).convo || {}).exhausted || [];
  ok('re-ask deflects honestly', exhPool.indexOf(reask) !== -1, reask.slice(0, 80));

  // ---- 7. change over run ----
  Game.state.village.trust[vid] = 80;
  Game.startConvo(vid);
  const before = Game.convoAskTopic(vid, 'oldworld');
  Game.remember(vid, 'gift', 'unasked-for food');
  Game.state.scholar.day = (Game.state.scholar.day || 1) + 2;
  Game.startConvo(vid);
  const after = Game.convoAskTopic(vid, 'oldworld');
  ok('re-ask after events acknowledges change', /different question|different\.|simpler/i.test(after), after.slice(0, 100));

  // ---- 8. labels ----
  for (const d of defs) {
    const lb = Game.topic2Label(vid, d.id);
    ok(`label for ${d.id}`, typeof lb === 'string' && lb.length > 4 && noPlaceholders(lb), lb);
    const ml = Game.topic2MoreLabel(vid);
    ok(`more-label non-empty`, typeof ml === 'string' && ml.length > 2);
    break; // one is enough for the more-label shape check
  }
  const labels = defs.map(d => Game.topic2Label(vid, d.id));
  ok('labels distinct per topic', new Set(labels).size === labels.length, labels.join(' | '));

  // ---- 9. exhaustion across many conversations: variety, no crash ----
  let totalLines = new Set(), crashes = 0;
  for (const v of vids) {
    Game.state.village.trust[v] = 80;
    for (let ci = 0; ci < 3; ci++) {
      try {
        Game.startConvo(v);
        for (const d of ['skills', 'advice', 'oldworld', 'fears']) {
          const ol = Game.convoAskTopic(v, d);
          if (ol) totalLines.add(d + ':' + ol.slice(0, 60));
          for (let i = 0; i < 3 && Game.topic2HasMore(v); i++) {
            const b = Game.topic2Beat(v);
            if (b) totalLines.add(d + ':b' + b.slice(0, 60));
          }
        }
      } catch (e) { crashes++; console.log('CRASH', e.message); }
    }
  }
  ok('no crashes across 12 convos x 4 topics', crashes === 0);
  ok('real variety across villagers+convos', totalLines.size >= 30, totalLines.size);

  // ---- 10. full convoTurn path with a generated topic + rotation ----
  // Use a non-deflector temperament so the topic cap doesn't crowd out asks,
  // and a villager untouched by earlier sections so generated topics are fresh.
  const openVid = Game.npcIds().slice(4).find(v => !['withdrawn', 'prickly', 'restless'].includes(Game.npcTemper(v)))
    || vids.find(v => !['withdrawn', 'prickly', 'restless'].includes(Game.npcTemper(v))) || vids[0];
  Game.state.village.trust[openVid] = 80;
  st = Game.startConvo(openVid);
  const genAsks1 = (st.choices || []).map(c => c.id).filter(id => id.indexOf('ask:') === 0 && Game.topic2Has(id.slice(4)));
  ok('fresh generated topics surface in live list', genAsks1.length >= 2, genAsks1.join(','));
  // Discuss them; next conversation the rotation should surface different ones.
  for (const gid of genAsks1) Game.convoAskTopic(openVid, gid.slice(4));
  Game.startConvo(openVid);
  st = Game.startConvo(openVid);
  const genAsks2 = (st.choices || []).map(c => c.id).filter(id => id.indexOf('ask:') === 0 && Game.topic2Has(id.slice(4)));
  const rotated = genAsks2.some(id => genAsks1.indexOf(id) === -1);
  ok('rotation surfaces new generated topics', rotated, 'round1: ' + genAsks1.join(',') + ' round2: ' + genAsks2.join(','));
  // Full convoTurn path on a generated topic from round 2 (or round 1).
  const turnId = (genAsks2[0] || genAsks1[0]);
  st = Game.startConvo(openVid);
  const res = Game.convoTurn(openVid, turnId);
  ok('convoTurn generated topic returns line', res && res.line && res.line.length > 10, String(res && res.line).slice(0, 80));
  ok('convoTurn line has no placeholders', noPlaceholders(res.line), res.line.slice(0, 120));
  const moreChoice = (res.choices || []).find(c => c.id === 'more');
  ok('more choice offered', !!moreChoice, (res.choices || []).map(c => c.id).join(','));
  if (moreChoice) {
    const res2 = Game.convoTurn(openVid, 'more');
    ok('more yields follow-up beat', res2 && res2.line && res2.line.length > 5, String(res2 && res2.line).slice(0, 80));
  }

  // ---- 11. first-person grammar: no "I checks"/"I does" leaks ----
  const badFirst = /\bI (checks|does|tends|writes|paces|wakes|rinses|sits|oils|memorizes|saves|greets|cleans|sleeps|talks|counts|names|collects|folds|sharpens|hums|whistles)\b/;
  let grammarBad = [];
  for (const v of vids) {
    Game.state.village.trust[v] = 80;
    Game.startConvo(v);
    for (const d of defs.map(x => x.id)) {
      try {
        const ol = Game.convoAskTopic(v, d);
        if (ol && badFirst.test(ol)) grammarBad.push(d + ': ' + ol.slice(0, 70));
        for (let i = 0; i < 3 && Game.topic2HasMore(v); i++) {
          const b = Game.topic2Beat(v);
          if (b && badFirst.test(b)) grammarBad.push(d + 'b: ' + b.slice(0, 70));
        }
      } catch (e) {}
    }
  }
  // 'lately' needs an event to fire
  Game.state.village.grief = 3;
  for (const v of vids) {
    Game.startConvo(v);
    const ol = Game.convoAskTopic(v, 'lately');
    if (ol && badFirst.test(ol)) grammarBad.push('lately: ' + ol.slice(0, 70));
  }
  Game.state.village.grief = 0;
  ok('no third-person verbs after "I"', grammarBad.length === 0, grammarBad.slice(0, 3).join(' | '));

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
