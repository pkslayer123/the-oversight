// Proof test: characterGen smallest-pool expansion (Steve 2026-10-07).
// Plain node, no jest. Seeded PRNG (mulberry32; SEED env overrides default).
// Checks:
//  1. every pool count >= hardcoded baseline count (no regressions, no shrinkage)
//  2. no new top-level keys, no new field names on darkTells/goal objects
//  3. new entries have valid shape; ids unique within pool
//  4. new entries use only the pool's established placeholder token set
//  5. no new entry duplicates an existing entry (>60% char-trigram overlap = FAIL),
//     and new entries don't duplicate each other
//  6. sampled new entries survive the real consumer token-fill with no leftover {tokens}
'use strict';
const fs = require('fs');
const path = require('path');

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const SEED = process.env.SEED ? parseInt(process.env.SEED, 10) : 20261007;
const rand = mulberry32(SEED);

const P = path.join(__dirname, '..', 'src', 'data', 'characterGen.json');
const d = JSON.parse(fs.readFileSync(P, 'utf8'));

// ---------- baselines (measured 2026-10-07 before expansion) ----------
const BASE_ARR = {
  questTemplates: 3, misunderstandTemplates: 5, curiosities: 6, grievances: 6,
  sharingStyles: 7, theorizeAsks: 8, temperaments: 11, heritageMap: 11,
  goals: 12, habits: 15, hopes: 15, quirks: 20, fears: 20, talkTemplates: 44,
};
const BASE_DARK = { benign: 5, malicious: 4 };
const BASE_WAKE = { warm: 3, debt: 3, suspicious: 3, scared: 3, practical: 3, curious: 3, gruff: 3, overwhelmed: 3 };
const BASE_MOOD = { grieving: 6, scared: 6, cheerful: 6, lonely: 6, weary: 6 };
const BASE_INTEL = ['analytical', 'practical', 'social', 'observant', 'creative', 'steady'];
const BASE_TOPIC = ['lately', 'you', 'fears', 'oldworld', 'skills', 'others', 'systemtake', 'advice', 'loved'];
const BASE_TEMPTALK_KEYS = ['bold', 'cautious', 'warm', 'prickly', 'steady', 'restless', 'dry', 'gentle', 'intense', 'withdrawn'];
const BASE_TOP_KEYS = ['_comment', 'darkTells', 'curiosities', 'firstNames', 'lastNames', 'misunderstandTemplates',
  'occupations', 'questTemplates', 'wakeUpSpeeches', 'sampleOrigins', 'sharingStyles', 'talkTemplates',
  'temperaments', 'heritageMap', 'grievances', 'quirks', 'habits', 'hopes', 'fears', 'goals', 'temperamentTalk',
  'moodTalk', 'convo', 'intelligences', 'theories', 'intelOpeners', 'theorizeAsks', 'overheard', 'voice',
  'topicPack', 'appearancePools', 'languages', 'originKeywords'];

// established placeholder token vocab per pool (harvested from baseline entries)
const TOKENS = {
  questTemplates: ['{first}', '{occ}', '{origin}', '{city}', '{skill}', '{an_occ}'],
  misunderstandTemplates: ['{first}', '{lang}'],
  talkTemplates: ['{an_occ}', '{Occ}', '{occ}', '{first}', '{origin}', '{skill}'],
  wakeUpSpeeches: ['{first}', '{occ}', '{origin}'],
  goals: ['{an_occ}', '{Occ}', '{occ}', '{first}', '{origin}', '{skill}'],
  darkTells: ['{They}', '{they}', '{Their}', '{their}', '{them}', '{first}'],
};
const NO_TOKENS = ['curiosities', 'grievances', 'sharingStyles', 'theorizeAsks', 'temperaments',
  'habits', 'hopes', 'quirks', 'fears', 'moodTalk', 'overheard', 'topicPack', 'temperamentTalk', 'heritageMap'];

let failures = [];
const ok = (cond, msg) => { if (!cond) failures.push(msg); };
const tokensIn = s => { const m = String(s).match(/\{[A-Za-z_0-9]+\}/g); return m ? [...new Set(m)] : []; };
const trigrams = s => {
  const t = String(s).toLowerCase(); const set = new Set();
  for (let i = 0; i + 3 <= t.length; i++) set.add(t.slice(i, i + 3));
  return set;
};
const trigOverlap = (a, b) => {
  const A = trigrams(a), B = trigrams(b);
  if (!A.size || !B.size) return 0;
  let inter = 0; for (const t of A) if (B.has(t)) inter++;
  return inter / Math.min(A.size, B.size);
};
// text used for duplicate comparison per entry
const entryText = e => {
  if (typeof e === 'string') return e;
  if (Array.isArray(e)) return e.join(' | ');
  if (e && typeof e === 'object') {
    if (e.quirk) return [e.quirk, e.note, e.assessment].join(' | ');
    if (e.lines) return e.lines.join(' | ');
    return Object.values(e).map(entryText).join(' | ');
  }
  return String(e);
};

// ---------- 1. top-level keys: no additions, no removals ----------
{
  const keys = Object.keys(d);
  ok(keys.length === BASE_TOP_KEYS.length, `top-level key count ${keys.length} != ${BASE_TOP_KEYS.length}`);
  for (const k of BASE_TOP_KEYS) ok(keys.includes(k), `missing top-level key ${k}`);
  for (const k of keys) ok(BASE_TOP_KEYS.includes(k), `NEW top-level key ${k} (forbidden)`);
}

// ---------- 2. counts >= baseline ----------
const checkArr = (arr, base, name) => {
  ok(Array.isArray(arr), `${name} is not an array`);
  ok(arr.length >= base, `${name} count ${arr.length} < baseline ${base}`);
};
for (const [k, b] of Object.entries(BASE_ARR)) checkArr(d[k], b, k);
checkArr(d.darkTells.benign, BASE_DARK.benign, 'darkTells.benign');
checkArr(d.darkTells.malicious, BASE_DARK.malicious, 'darkTells.malicious');
for (const [k, b] of Object.entries(BASE_WAKE)) checkArr(d.wakeUpSpeeches[k], b, `wakeUpSpeeches.${k}`);
for (const [k, b] of Object.entries(BASE_MOOD)) checkArr(d.moodTalk[k], b, `moodTalk.${k}`);
for (const k of BASE_INTEL) {
  checkArr(d.overheard.openers[k], 2, `overheard.openers.${k}`);
  checkArr(d.overheard.replies[k], 2, `overheard.replies.${k}`);
  checkArr(d.intelOpeners[k], 6, `intelOpeners.${k} (untouched pool, regression check)`);
}
for (const k of BASE_TOPIC) {
  checkArr(d.topicPack.labels[k], 3, `topicPack.labels.${k}`);
  checkArr(d.topicPack.moreLabels[k], 3, `topicPack.moreLabels.${k}`);
}
for (const k of BASE_TEMPTALK_KEYS) checkArr(d.temperamentTalk[k], 8, `temperamentTalk.${k} (untouched, regression check)`);

// ---------- helpers to slice new entries ----------
const newOnes = (arr, base) => arr.slice(base);
const subNew = {};

// ---------- 3. shape + ids + tokens + dupes ----------
function checkStringPool(name, arr, base, { quoted = false } = {}) {
  const olds = arr.slice(0, base), news = newOnes(arr, base);
  subNew[name] = news;
  news.forEach((e, i) => {
    ok(typeof e === 'string' && e.length > 0, `${name}[${base + i}] not a non-empty string`);
    if (quoted) ok(e.startsWith('"') && e.endsWith('"'), `${name}[${base + i}] not quoted speech`);
  });
  checkTokens(name, news);
  checkDupes(name, olds, news);
}
function checkTokens(name, news) {
  const allowed = TOKENS[name] || [];
  const forbid = NO_TOKENS.includes(name);
  news.forEach((e, i) => {
    for (const t of tokensIn(entryText(e))) {
      if (forbid) ok(false, `${name} new entry ${i} uses token ${t} (pool has no token vocab)`);
      else ok(allowed.includes(t), `${name} new entry ${i} uses unestablished token ${t} (allowed: ${allowed.join(' ')})`);
    }
  });
}
function checkDupes(name, olds, news) {
  const oldTexts = olds.map(entryText);
  news.forEach((e, i) => {
    const t = entryText(e);
    oldTexts.forEach((o, j) => {
      const ov = trigOverlap(t, o);
      ok(ov <= 0.60, `${name} new entry ${i} duplicates baseline entry ${j} (trigram overlap ${(ov * 100).toFixed(1)}%)`);
    });
    for (let j = 0; j < i; j++) {
      const ov = trigOverlap(t, entryText(news[j]));
      ok(ov <= 0.60, `${name} new entries ${i} and ${j} duplicate each other (${(ov * 100).toFixed(1)}%)`);
    }
  });
}

checkStringPool('questTemplates', d.questTemplates, BASE_ARR.questTemplates);
checkStringPool('misunderstandTemplates', d.misunderstandTemplates, BASE_ARR.misunderstandTemplates);
checkStringPool('curiosities', d.curiosities, BASE_ARR.curiosities);
checkStringPool('grievances', d.grievances, BASE_ARR.grievances);
checkStringPool('sharingStyles', d.sharingStyles, BASE_ARR.sharingStyles);
checkStringPool('theorizeAsks', d.theorizeAsks, BASE_ARR.theorizeAsks, { quoted: true });
checkStringPool('temperaments', d.temperaments, BASE_ARR.temperaments);
checkStringPool('habits', d.habits, BASE_ARR.habits);
checkStringPool('hopes', d.hopes, BASE_ARR.hopes);
checkStringPool('quirks', d.quirks, BASE_ARR.quirks);
checkStringPool('fears', d.fears, BASE_ARR.fears);
checkStringPool('talkTemplates', d.talkTemplates, BASE_ARR.talkTemplates, { quoted: true });

// darkTells
for (const side of ['benign', 'malicious']) {
  const arr = d.darkTells[side], olds = arr.slice(0, BASE_DARK[side]), news = newOnes(arr, BASE_DARK[side]);
  subNew[`darkTells.${side}`] = news;
  const ids = new Set();
  news.forEach((e, i) => {
    const ks = Object.keys(e).sort().join(',');
    ok(ks === 'assessment,id,note,quirk', `darkTells.${side}[${i}] fields changed: ${ks}`);
    ok(typeof e.id === 'string' && e.id.length > 0, `darkTells.${side}[${i}] bad id`);
    ok(!ids.has(e.id), `darkTells.${side} duplicate new id ${e.id}`);
    ids.add(e.id);
    ok(!olds.some(o => o.id === e.id), `darkTells.${side} new id ${e.id} collides with baseline id`);
  });
  const allIds = arr.map(e => e.id);
  ok(new Set(allIds).size === allIds.length, `darkTells.${side} has duplicate ids overall`);
  checkTokens('darkTells', news);
  checkDupes(`darkTells.${side}`, olds, news);
}

// heritageMap
{
  const olds = d.heritageMap.slice(0, BASE_ARR.heritageMap), news = newOnes(d.heritageMap, BASE_ARR.heritageMap);
  subNew.heritageMap = news;
  news.forEach((e, i) => {
    ok(Array.isArray(e) && e.length === 2 && typeof e[0] === 'string' && typeof e[1] === 'string',
      `heritageMap new entry ${i} not a [tag,name] pair`);
    ok(!olds.some(o => o[0] === e[0]), `heritageMap new tag ${e[0]} collides with baseline tag (order-sensitive!)`);
  });
  checkTokens('heritageMap', news);
  checkDupes('heritageMap', olds, news);
}

// goals
{
  const olds = d.goals.slice(0, BASE_ARR.goals), news = newOnes(d.goals, BASE_ARR.goals);
  subNew.goals = news;
  const ids = new Set();
  news.forEach((e, i) => {
    const ks = Object.keys(e).sort().join(',');
    ok(ks === 'id,lines,want', `goals[${i}] fields changed: ${ks}`);
    ok(!ids.has(e.id), `goals duplicate new id ${e.id}`); ids.add(e.id);
    ok(!olds.some(o => o.id === e.id), `goals new id ${e.id} collides with baseline id`);
    ok(Array.isArray(e.lines) && e.lines.length === 8, `goals ${e.id} lines != 8`);
    e.lines.forEach((l, j) => ok(typeof l === 'string' && l.length > 0, `goals ${e.id} line ${j} bad`));
  });
  checkTokens('goals', news);
  checkDupes('goals', olds, news);
}

// wakeUpSpeeches / moodTalk / overheard / topicPack / temperamentTalk sub-pools
for (const [k, b] of Object.entries(BASE_WAKE)) {
  const news = newOnes(d.wakeUpSpeeches[k], b);
  subNew[`wakeUpSpeeches.${k}`] = news;
  checkTokens('wakeUpSpeeches', news);
  checkDupes(`wakeUpSpeeches.${k}`, d.wakeUpSpeeches[k].slice(0, b), news);
}
for (const [k, b] of Object.entries(BASE_MOOD)) {
  const news = newOnes(d.moodTalk[k], b);
  subNew[`moodTalk.${k}`] = news;
  news.forEach((e, i) => ok(e.startsWith('"') && e.endsWith('"'), `moodTalk.${k} new ${i} not quoted`));
  checkTokens('moodTalk', news);
  checkDupes(`moodTalk.${k}`, d.moodTalk[k].slice(0, b), news);
}
for (const k of BASE_INTEL) {
  for (const side of ['openers', 'replies']) {
    const news = newOnes(d.overheard[side][k], 2);
    subNew[`overheard.${side}.${k}`] = news;
    news.forEach((e, i) => ok(e.startsWith('"') && e.endsWith('"'), `overheard.${side}.${k} new ${i} not quoted`));
    checkTokens('overheard', news);
    checkDupes(`overheard.${side}.${k}`, d.overheard[side][k].slice(0, 2), news);
  }
}
for (const k of BASE_TOPIC) {
  for (const side of ['labels', 'moreLabels']) {
    const news = newOnes(d.topicPack[side][k], 3);
    subNew[`topicPack.${side}.${k}`] = news;
    news.forEach((e, i) => ok(e.startsWith('"') && e.endsWith('"'), `topicPack.${side}.${k} new ${i} not quoted`));
    checkTokens('topicPack', news);
    checkDupes(`topicPack.${side}.${k}`, d.topicPack[side][k].slice(0, 3), news);
  }
}
// temperamentTalk: new keys must carry 8 quoted lines each, matching convention
{
  const newKeys = Object.keys(d.temperamentTalk).filter(k => !BASE_TEMPTALK_KEYS.includes(k));
  ok(newKeys.length > 0, 'expected new temperamentTalk keys for new temperaments');
  const newTemps = d.temperaments.slice(BASE_ARR.temperaments);
  newTemps.forEach(t => ok(newKeys.includes(t), `new temperament ${t} has no temperamentTalk key`));
  for (const k of newKeys) {
    const lines = d.temperamentTalk[k];
    ok(Array.isArray(lines) && lines.length === 8, `temperamentTalk.${k} should have 8 lines, has ${lines && lines.length}`);
    lines.forEach((l, i) => ok(typeof l === 'string' && l.startsWith('"') && l.endsWith('"'), `temperamentTalk.${k}[${i}] not quoted`));
    checkTokens('temperamentTalk', lines);
    // dupe-check new temperament lines against ALL baseline temperamentTalk lines
    const allBase = BASE_TEMPTALK_KEYS.flatMap(bk => d.temperamentTalk[bk]);
    checkDupes(`temperamentTalk.${k}`, allBase, lines);
  }
}

// ---------- 4. fill simulation on seeded sample of new entries ----------
// fillTalkLine (game.js): {an_occ},{Occ},{occ},{first},{origin},{skill}
const fillTalkLine = (line) => String(line)
  .replaceAll('{an_occ}', 'a cook').replaceAll('{Occ}', 'Cook').replaceAll('{occ}', 'cook')
  .replaceAll('{first}', 'Mara').replaceAll('{origin}', 'the valley').replaceAll('{skill}', 'making do');
// wake-up fill (game.js): {first},{occ},{origin}
const fillWake = (line) => String(line)
  .replaceAll('{first}', 'Mara').replaceAll('{occ}', 'cook').replaceAll('{origin}', 'the valley');
// quest fill (game.js genRoster): {first},{occ},{origin},{city},{skill}
const fillQuest = (line) => String(line)
  .replaceAll('{first}', 'Mara').replaceAll('{occ}', 'cook').replaceAll('{origin}', 'the valley')
  .replaceAll('{city}', 'Reno').replaceAll('{skill}', 'making do');
// fillPronouns subset for darkTells (she/her): {first},{their},{Their},{them},{They} V,{they} V
const fillTell = (line) => String(line)
  .replaceAll('{first}', 'Mara').replaceAll('{their}', 'her')
  .replaceAll('{Their}', 'Her').replaceAll('{them}', 'them')
  .replace(/\{They\} ([A-Za-z]+)/g, 'She $1').replace(/\{they\} ([A-Za-z]+)/g, 'she $1')
  .replaceAll('{They}', 'She').replaceAll('{they}', 'she');
// misunderstand fill: {first},{lang}
const fillMis = (line) => String(line).replaceAll('{first}', 'Mara').replaceAll('{lang}', 'Spanish');

const FILLERS = {
  talkTemplates: fillTalkLine, questTemplates: fillQuest, goals: fillTalkLine,
  misunderstandTemplates: fillMis, darkTells: fillTell,
};
Object.keys(FILLERS).forEach(pool => { FILLERS[pool + '.benign'] = fillTell; FILLERS[pool + '.malicious'] = fillTell; });
FILLERS['wakeUpSpeeches.warm'] = fillWake; // representative; all wake keys share the filler
Object.keys(BASE_WAKE).forEach(k => { FILLERS[`wakeUpSpeeches.${k}`] = fillWake; });

const LEFTOVER = /\{[A-Za-z_0-9]+\}/;
let sampled = 0;
for (const [pool, news] of Object.entries(subNew)) {
  const base = pool.split('.')[0];
  const filler = FILLERS[pool] || FILLERS[base] || (s => s);
  // seeded shuffle, sample up to 4 per pool
  const idx = news.map((_, i) => i);
  for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1));[idx[i], idx[j]] = [idx[j], idx[i]]; }
  for (const i of idx.slice(0, 4)) {
    sampled++;
    const filled = filler(entryText(news[i]));
    ok(!LEFTOVER.test(filled), `${pool} new entry ${i} leaves unfilled token after consumer fill: ${filled.slice(0, 120)}`);
  }
}

// ---------- report ----------
const totalNew = Object.values(subNew).reduce((a, n) => a + n.length, 0);
console.log(`seed=${SEED} pools-checked new-entries=${totalNew} fill-sampled=${sampled}`);
if (failures.length) {
  console.log(`FAIL ${failures.length}:`);
  failures.forEach(f => console.log(' - ' + f));
  process.exit(1);
}
console.log('ALL GREEN');
