// NPC VOICE test. Usage: node scripts/test-npc-voice.js
// Tests: voiceMods derivation, voiceLine integrity, terse filtering,
// lived-experience inflection (same villager, before/after trauma),
// no double-voice on authored lines, blind voice distinctness.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.fetch = (f) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))) });
['src/js/engine/state.js', 'src/js/engine/modifiers.js', 'src/js/engine/calories.js',
 'src/js/engine/day.js', 'src/js/engine/forage.js', 'src/js/engine/combat.js',
 'src/js/game.js', 'src/js/encounters.js', 'src/js/food.js', 'src/js/conversation.js', 'src/js/journal.js', 'src/js/party.js',
 'src/js/truth.js', 'src/js/storage.js', 'src/js/perceive.js', 'src/js/carexplore.js',
 'src/js/justice.js', 'src/js/betrayal.js', 'src/js/corpses.js', 'src/js/codex-people.js', 'src/js/progression.js',
 'src/js/ledger.js', 'src/js/lifeseed.js', 'src/js/villager-agency.js', 'src/js/debug-scenarios.js'].forEach(f => {
  try { eval(fs.readFileSync(path.join(ROOT, f), 'utf8')); }
  catch (e) { console.log(`LOAD FAIL ${f}: ${e.message}`); }
});
const Game = globalThis.Scattering.Game;

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) pass++; else { fail++; console.log(`FAIL: ${name}`); }
}
function freshVillager(temp) {
  Game.genRoster('Columbus, Ohio');
  Game.newGame('Columbus, Ohio', null, Game.generatedRoster[0].id);
  Game.depart();
  const roster = Game.state.village.roster.filter(id => id !== Game.villagerId);
  const vid = roster[0];
  const vp = Game.vpOf(vid);
  vp.personality = vp.personality || {}; vp.personality.temperament = temp;
  Game.state.village.trust = Game.state.village.trust || {};
  Game.state.village.trust[vid] = 10;
  return vid;
}
const GENERIC = '"We should stick together. Twelve strangers is better than one stranger."';

(async () => {
  await Game.init();

  // 1. voiceMods derivation
  let vid = freshVillager('steady');
  ok('clean villager: no mods', Game.voiceMods(vid).length === 0);
  Game.state.village.grief = 2;
  ok('grief -> grieving mod', Game.voiceMods(vid).indexOf('grieving') !== -1);
  Game.state.village.grief = 0;
  Game.remember(vid, 'confronted', 'x');
  ok('confronted -> scarred mod', Game.voiceMods(vid).indexOf('scarred') !== -1);
  Game.remember(vid, 'promise_broken', 'x');
  ok('promise_broken -> betrayed mod', Game.voiceMods(vid).indexOf('betrayed') !== -1);
  Game.remember(vid, 'gift', 'x');
  ok('gift -> grateful mod', Game.voiceMods(vid).indexOf('grateful') !== -1);
  Game.state.village.trust[vid] = 60;
  ok('trust 60 -> close mod', Game.voiceMods(vid).indexOf('close') !== -1);
  // old memories expire: day jump
  Game.state.scholar.day = 30;
  const modsOld = Game.voiceMods(vid);
  ok('old trauma expires from voice', modsOld.indexOf('scarred') === -1 && modsOld.indexOf('betrayed') === -1);
  Game.state.scholar.day = 1;

  // 2. voiceLine integrity
  vid = freshVillager('cautious');
  let voiced = 0;
  let quoteOK = true, openerOnQ = false;
  for (let i = 0; i < 60; i++) {
    const out = Game.voiceLine(vid, GENERIC);
    if (out !== GENERIC) voiced++;
    if (!(out.startsWith('"') && out.endsWith('"'))) quoteOK = false;
    const q = Game.voiceLine(vid, '"Are you eating enough?"');
    if (/— Are you/.test(q) || /think Are you/.test(q)) openerOnQ = true;
  }
  ok('voiceLine voices generic lines sometimes', voiced > 5 && voiced < 60);
  ok('voiceLine keeps quote integrity', quoteOK);
  ok('voiceLine never puts openers before questions', !openerOnQ);
  // stage directions pass through
  const stage = '"I don\'t talk about before." Flat. Final.';
  ok('stage directions untouched', Game.voiceLine(vid, stage) === stage);
  ok('unquoted text untouched', Game.voiceLine(vid, 'narrates quietly') === 'narrates quietly');
  // missing voice data: defensive
  const savedVoice = Game.data.characterGen.voice;
  Game.data.characterGen.voice = undefined;
  ok('missing voice data: line unchanged', Game.voiceLine(vid, GENERIC) === GENERIC);
  Game.data.characterGen.voice = savedVoice;

  // 3. voicePool terse filtering
  const mixed = ['"Short."', '"A medium-length line, nothing special."',
    '"This is a very long line that goes on and on about the old days before everything changed, easily over seventy-five characters."',
    '"Tiny."', '"Another quite long line about how the winters used to be cold and the summers used to be kind and everything."'];
  vid = freshVillager('prickly');
  const filtered = Game.voicePool(vid, mixed);
  ok('terse temperament filters to short lines', filtered.length < mixed.length && filtered.every(s => s.length < 75));
  vid = freshVillager('steady');
  ok('non-terse temperament keeps full pool', Game.voicePool(vid, mixed).length === mixed.length);
  vid = freshVillager('bold');
  Game.state.village.grief = 2; // grieving makes anyone terse
  ok('grieving state makes voice terse', Game.voicePool(vid, mixed).length < mixed.length);
  Game.state.village.grief = 0;

  // 4. lived-experience inflection: same villager, before vs after
  vid = freshVillager('warm');
  const before = new Set();
  for (let i = 0; i < 40; i++) before.add(Game.voiceLine(vid, GENERIC));
  Game.remember(vid, 'you_threatened', 'x');
  Game.remember(vid, 'rumor_about_them', 'x');
  const after = new Set();
  for (let i = 0; i < 40; i++) after.add(Game.voiceLine(vid, GENERIC));
  const scarredMarks = ["I've said enough.", 'Watch yourself out there.', "Don't make me regret saying that.",
    'Why do you ask?', "What's this about?", 'Just... be straight with me.'];
  const beforeHit = [...before].some(l => scarredMarks.some(m => l.indexOf(m) !== -1));
  const afterHit = [...after].some(l => scarredMarks.some(m => l.indexOf(m) !== -1));
  ok('before trauma: no scarred/betrayed markers', !beforeHit);
  ok('after trauma: scarred/betrayed markers appear', afterHit);
  // grief compresses even the warm
  Game.state.village.grief = 3;
  const griefLines = [];
  for (let i = 0; i < 30; i++) griefLines.push(Game.voiceLine(vid, GENERIC));
  ok('grief adds flat closers', griefLines.some(l => /Anyway\."|Doesn't matter now\."|\.\.\.sorry\."/.test(l)));
  Game.state.village.grief = 0;

  // 5. no double-voice on authored temperament lines (via convoOpening guard)
  vid = freshVillager('withdrawn');
  const cg = Game.data.characterGen;
  const authored = (cg.temperamentTalk || {}).withdrawn[0];
  const origPick = Game.convoPick;
  Game.convoPick = function (v, key, pool) {
    if (key === 'small') return authored; // force authored line
    return origPick.call(this, v, key, pool);
  };
  const c = Game.convoGet(vid);
  Object.assign(c, { secretShared: true, wantHooked: true, taughtMentioned: true, recalled: { q_origin: true, q_trust: true } });
  Game.state.village.grief = 0; Game.state.village.cheer = 0;
  let doubleVoiced = false;
  for (let i = 0; i < 10; i++) {
    const o = Game.convoOpening(vid);
    if (o && o.line && o.line.indexOf(authored.slice(1, 20)) !== -1) {
      // authored line present — must not ALSO carry a voice bit
      if (/— Sorry — |lost it\."$|never mind\."$/.test(o.line) && o.line !== authored) doubleVoiced = true;
    }
  }
  Game.convoPick = origPick;
  ok('authored temperament lines not double-voiced', !doubleVoiced);

  // 6. blind distinctness: statistical voice markers per temperament
  const stats = {};
  for (const temp of ['bold', 'cautious', 'warm', 'prickly', 'withdrawn', 'steady']) {
    const v2 = freshVillager(temp);
    const lines = [];
    for (let i = 0; i < 40; i++) lines.push(Game.voiceLine(v2, GENERIC));
    const voicedLines = lines.filter(l => l !== GENERIC);
    const hedges = voicedLines.filter(l => /I think —|Maybe —|Probably —|not sure|Could be wrong|Just my read|how it looks to me/.test(l)).length;
    const questions = voicedLines.filter(l => /\?.*"$/.test(l) && l !== GENERIC).length;
    const avgLen = voicedLines.reduce((a, l) => a + l.length, 0) / Math.max(1, voicedLines.length);
    stats[temp] = { voiced: voicedLines.length, hedges, questions, avgLen: Math.round(avgLen) };
  }
  console.log('voice stats:', JSON.stringify(stats, null, 1));
  ok('cautious hedges more than bold', stats.cautious.hedges > stats.bold.hedges);
  ok('warm asks back more than prickly', stats.warm.questions > stats.prickly.questions);
  ok('terse temps (prickly/withdrawn) shorter than steady', stats.prickly.avgLen < stats.steady.avgLen && stats.withdrawn.avgLen < stats.steady.avgLen);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
