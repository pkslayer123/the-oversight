// Proof test: background_survivors.json pool expansion 75 -> 97 (2026-10-07).
// Plain node, no jest. Seeded PRNG (mulberry32, fixed default, SEED env override)
// used for the deterministic spot-check sample. All assertions are deterministic;
// a flaky aggregate assertion is fixed in THIS test, never by relaxing data rules.
//
// Honest legacy carve-outs (pre-existing in the 75, left byte-identical):
//  - kcal envelope for legacy entries is 1500-2800 (Ruth Goldstein 71: 1500,
//    Ella Johnson 67: 1500->1600). New block must be 1800-2600.
//  - Rosa Mendez (legacy): providesPerDay 1800 > kcalPerDay 1700 (a cook feeding
//    a crowd). New block must satisfy providesPerDay <= kcalPerDay.
"use strict";
const { execSync } = require("child_process");
const fs = require("fs");
const crypto = require("crypto");

// --- seeded PRNG (mulberry32) ---
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const SEED = process.env.SEED ? parseInt(process.env.SEED, 10) : 20261007;
const rand = mulberry32(SEED);

const EXPECTED_KEYS = ["id","name","age","formerOccupation","line","kcalPerDay","providesPerDay",
  "personality","gender","origin","homeRegion","skinTone","clothing"];
const VOCAB = {
  sharing: ["fair","generous","pragmatic","transactional"],
  temperament: ["anxious","bold","cautious","dry","gentle","intense","prickly","restless","steady","warm","withdrawn"],
  curiosity: ["curious","hungry-to-learn","practical","wary"],
  gender: ["f","m"],
  skinTone: ["brown","dark","deep","fair","light","tan"],
  clothing: ["bright","casual","outdoor","workwear"],
};

let failures = [];
function check(cond, msg) {
  if (!cond) failures.push(msg);
  console.log((cond ? "PASS" : "FAIL") + " " + msg);
}

const data = JSON.parse(fs.readFileSync("src/data/background_survivors.json", "utf8"));
const baselineRaw = execSync("git show HEAD:src/data/background_survivors.json", { encoding: "utf8", maxBuffer: 1 << 20 });
const baseline = JSON.parse(baselineRaw);

// 1. total count and growth
check(data.length >= 95 && data.length <= 100,
  `total count ${data.length} in 95-100`);
check(baseline.length === 75, `baseline HEAD count is 75 (got ${baseline.length})`);
check(data.length - baseline.length === 22,
  `exactly 22 new additions (75 -> ${data.length})`);

// 2. baseline 75 unchanged: hash the name set AND deep-compare the block
const hashNames = arr => crypto.createHash("sha256")
  .update([...arr.map(e => e.name)].sort().join("\n")).digest("hex");
check(hashNames(data.slice(0, 75)) === hashNames(baseline),
  "baseline 75 name-set hash matches HEAD");
check(JSON.stringify(data.slice(0, 75)) === JSON.stringify(baseline),
  "baseline 75 entries deep-equal to HEAD (byte-identical modulo parse)");

// 3. every entry has exactly the 13 keys
const badKeys = data.filter(e => {
  const ks = Object.keys(e);
  return ks.length !== 13 || !EXPECTED_KEYS.every(k => ks.includes(k)) || !ks.every(k => EXPECTED_KEYS.includes(k));
});
check(badKeys.length === 0, `all entries have exactly the 13 keys${badKeys.length ? " (bad: " + badKeys.map(e => e.id || e.name).join(",") + ")" : ""}`);

// 4. uniqueness
const ids = data.map(e => e.id), names = data.map(e => e.name);
check(new Set(ids).size === ids.length, `ids unique (${ids.length})`);
check(new Set(names).size === names.length, `names unique (${names.length})`);
const baseIds = new Set(baseline.map(e => e.id)), baseNames = new Set(baseline.map(e => e.name));
const added = data.slice(75);
check(added.every(e => !baseIds.has(e.id)), "new ids not in baseline");
check(added.every(e => !baseNames.has(e.name)), "new names not in baseline");

// 5. vocabulary within the file's existing value sets (all entries)
let vocabBad = [];
for (const e of data) {
  const p = e.personality;
  if (!p || !VOCAB.sharing.includes(p.sharing) || !VOCAB.temperament.includes(p.temperament) || !VOCAB.curiosity.includes(p.curiosity)) vocabBad.push(e.id + ":personality");
  if (!VOCAB.gender.includes(e.gender)) vocabBad.push(e.id + ":gender");
  if (!VOCAB.skinTone.includes(e.skinTone)) vocabBad.push(e.id + ":skinTone");
  if (!VOCAB.clothing.includes(e.clothing)) vocabBad.push(e.id + ":clothing");
  if (e.origin !== e.homeRegion) vocabBad.push(e.id + ":origin!=homeRegion");
}
check(vocabBad.length === 0, `all entries use existing vocabulary${vocabBad.length ? " (bad: " + vocabBad.join(",") + ")" : ""}`);

// 6. reality anchors: strict for the NEW block, envelope for legacy
const legacyKcalBad = baseline.filter(e => e.kcalPerDay < 1500 || e.kcalPerDay > 2800);
check(legacyKcalBad.length === 0, `legacy kcal within 1500-2800 envelope (known elders 1500/1600)`);
const newKcalBad = added.filter(e => e.kcalPerDay < 1800 || e.kcalPerDay > 2600);
check(newKcalBad.length === 0,
  `new block kcalPerDay 1800-2600${newKcalBad.length ? " (bad: " + newKcalBad.map(e => e.name + ":" + e.kcalPerDay).join(",") + ")" : ""}`);
const newProvBad = added.filter(e => !(e.providesPerDay <= e.kcalPerDay && e.providesPerDay >= 800));
check(newProvBad.length === 0,
  `new block providesPerDay <= kcalPerDay and >= 800${newProvBad.length ? " (bad: " + newProvBad.map(e => e.name).join(",") + ")" : ""}`);
const legacyProvLeak = baseline.filter(e => e.providesPerDay > e.kcalPerDay);
console.log(`INFO legacy provides>kcal entries (pre-existing, untouched): ${legacyProvLeak.map(e => e.name).join(", ") || "none"}`);
const allProvMin = data.filter(e => e.providesPerDay < 800);
check(allProvMin.length === 0, "no entry providesPerDay below 800");

// 7. lines: non-empty and pairwise distinct (trigram Jaccard <= 0.60)
function trigrams(s) {
  const t = s.toLowerCase().replace(/\s+/g, " ").trim();
  const set = new Set();
  for (let i = 0; i + 3 <= t.length; i++) set.add(t.slice(i, i + 3));
  return set;
}
const lines = data.map(e => e.line);
check(lines.every(l => typeof l === "string" && l.trim().length > 0), "all lines non-empty");
const tri = lines.map(trigrams);
let worst = 0, worstPair = null;
for (let i = 0; i < tri.length; i++) {
  for (let j = i + 1; j < tri.length; j++) {
    const a = tri[i], b = tri[j];
    let inter = 0;
    for (const t of a) if (b.has(t)) inter++;
    const jac = inter / (a.size + b.size - inter);
    if (jac > worst) { worst = jac; worstPair = [data[i].name, data[j].name]; }
  }
}
check(worst <= 0.60,
  `max pairwise line trigram Jaccard ${worst.toFixed(3)} <= 0.60${worstPair ? " (" + worstPair.join(" / ") + ")" : ""}`);

// 8. new-block ages sane
check(added.every(e => e.age >= 18 && e.age <= 70),
  `new block ages 18-70 (got ${Math.min(...added.map(e => e.age))}-${Math.max(...added.map(e => e.age))})`);

// --- deterministic spot-check sample (seeded) ---
const idxs = new Set();
while (idxs.size < 6) idxs.add(Math.floor(rand() * added.length));
console.log(`\nSPOT-CHECK sample (seed=${SEED}):`);
for (const i of [...idxs].sort((a, b) => a - b)) {
  const e = added[i];
  console.log(`  - ${e.name} (${e.formerOccupation}, ${e.origin}): "${e.line}"`);
}

console.log(failures.length === 0 ? "\nALL GREEN" : `\n${failures.length} FAILURES`);
process.exit(failures.length === 0 ? 0 : 1);
