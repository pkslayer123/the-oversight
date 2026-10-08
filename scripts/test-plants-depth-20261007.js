#!/usr/bin/env node
// Worker A (plants) depth test — 2026-10-07.
// Plain node, no jest. Verifies plants.json depth schema + biomes.json forageTable wiring.
"use strict";
const fs = require("fs");

const REPO = "/home/hatch/workspace/the-scattering";
const plantsRaw = fs.readFileSync(REPO + "/src/data/plants.json", "utf8");
const biomesRaw = fs.readFileSync(REPO + "/src/data/biomes.json", "utf8");

let pass = 0, fail = 0;
function ok(cond, label) {
  if (cond) { pass++; }
  else { fail++; console.error("FAIL:", label); }
}

// JSON must parse
let plants, biomes;
try { plants = JSON.parse(plantsRaw); ok(true, "plants.json parses"); }
catch (e) { ok(false, "plants.json parses: " + e.message); plants = []; }
try { biomes = JSON.parse(biomesRaw); ok(true, "biomes.json parses"); }
catch (e) { ok(false, "biomes.json parses: " + e.message); biomes = []; }

// raw-UTF-8 style: no \u escapes anywhere in plants.json
ok(!/\\u[0-9a-fA-F]{4}/.test(plantsRaw), "plants.json has no \\u escapes (raw UTF-8 style)");

// no duplicate ids
const ids = plants.map(p => p.id);
ok(new Set(ids).size === ids.length, "no duplicate plant ids (" + ids.length + " entries)");

// expected count after Worker A: 26 + 12 = 38
ok(ids.length === 38, "plant count is 38 (26 + 12 new)");

// new ids are genuinely new (not renames of the 26 baseline ids)
const baseline = ["dandelion","cattail","blackberry","persimmon","hickory_nut","acorn_white_oak",
  "wild_onion","chickweed","wood_sorrel","muscadine","elderberry","pawpaw","ramps",
  "lambs_quarters","purslane","black_walnut","sassafras","yarrow","plantain_leaf","jewelweed",
  "wild_strawberry","staghorn_sumac","burdock","goldenrod","mayapple","rare_herb"];
const newIds = ids.filter(id => !baseline.includes(id));
ok(newIds.length === 12, "12 new ids present: " + newIds.join(","));
const expectedNew = ["spicebush","american_hazelnut","sunchoke","stinging_nettle","greenbrier",
  "pokeweed","maypop","wild_cherry","serviceberry","groundnut","american_ginseng","wild_ginger"];
ok(expectedNew.every(id => newIds.includes(id)), "all 12 expected new species present");
ok(baseline.every(id => ids.includes(id)), "all 26 baseline ids still present");

// every entry has all required keys
const REQUIRED = ["id","name","scientific","description","biomes","regions","seasons",
  "tileAffinity","unit","caloriesPerUnit","spoilageDays","idDifficulty","waterContent",
  "confidence","codex","preparation","lookalikeNote","uses","knowledgeLevels","form",
  "edibility","taxon","sources"];
for (const p of plants) {
  const missing = REQUIRED.filter(k => !(k in p));
  ok(missing.length === 0, p.id + ": missing keys [" + missing.join(",") + "]");
  // knowledgeLevels 1..4 non-empty
  for (const lvl of ["1","2","3","4"]) {
    ok(typeof p.knowledgeLevels[lvl] === "string" && p.knowledgeLevels[lvl].length > 0,
       p.id + ": knowledgeLevels." + lvl + " non-empty");
  }
  // knowledge depth: levels build (level 4 longer than level 1 is typical, not required — just non-trivial)
  ok(p.knowledgeLevels["4"].length > 20, p.id + ": knowledgeLevels.4 is substantive");
  // uses entries well-formed
  ok(Array.isArray(p.uses) && p.uses.length > 0 &&
     p.uses.every(u => u.kind && typeof u.minLevel === "number" && u.note),
     p.id + ": uses entries well-formed");
  // description must not leak edibility (unknown-stage honesty)
  ok(!/edib|delicious|tasty|eat(able)? |nutrition|food|calorie/i.test(p.description),
     p.id + ": description leaks nothing about edibility ('" + p.description + "')");
  // idDifficulty in range
  ok(p.idDifficulty >= 1 && p.idDifficulty <= 5, p.id + ": idDifficulty 1-5");
}

// forageTable wiring
const se = biomes.find(b => b.id === "se_woodlands");
ok(!!se, "se_woodlands biome present");
const ft = se ? se.forageTable : {};
const unresolvable = Object.keys(ft).filter(id => !ids.includes(id));
ok(unresolvable.length === 0, "every forageTable id resolves to a plant id");
const forageableNew = ["spicebush","american_hazelnut","sunchoke","stinging_nettle","greenbrier",
  "pokeweed","maypop","wild_cherry","serviceberry","groundnut"];
ok(forageableNew.every(id => id in ft), "10 new forageable plants wired into forageTable");
ok(!("american_ginseng" in ft) && !("wild_ginger" in ft),
   "ginseng + wild_ginger are codex-only (not in forageTable)");
for (const id of forageableNew) {
  const w = ft[id];
  ok(w >= 2 && w <= 4, "forage weight of " + id + " modest (2-4): " + w);
}
// existing weights untouched: spot-check a few known values
ok(ft["dandelion"] === 5 && ft["hickory_nut"] === 4 && ft["mayapple"] === 2,
   "existing forageTable weights untouched");

// calorie sanity per assignment ranges
for (const p of plants) {
  const greens = ["dandelion","chickweed","wood_sorrel","lambs_quarters","purslane","plantain_leaf",
    "stinging_nettle","greenbrier","pokeweed","chickweed"];
  if (greens.includes(p.id)) ok(p.caloriesPerUnit <= 60, p.id + ": green calorie sane (" + p.caloriesPerUnit + ")");
  const nuts = ["hickory_nut","black_walnut","american_hazelnut"];
  if (nuts.includes(p.id)) ok(p.caloriesPerUnit >= 150 && p.caloriesPerUnit <= 220,
    p.id + ": nut calorie sane (" + p.caloriesPerUnit + ")");
}

console.log(`\nplants-depth-20261007: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
