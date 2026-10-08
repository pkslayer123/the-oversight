#!/usr/bin/env node
// Proof test: equipment.js deepening (Steve 2026-10-07).
// Improvised tools, tool knowledge progression, condition beats (dull/snap),
// social tools (lend/steal/return), scarcity options. Deterministic: mulberry32.
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'js', 'equipment.js'), 'utf8');
const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(src, sandbox);
const E = sandbox.window.S.equipment;

let pass = 0, fail = 0;
function ok(cond, label) {
  if (cond) { pass++; }
  else { fail++; console.log('FAIL:', label); }
}
function has(s, sub) { return String(s).includes(sub); }

// ---- 1. Improvised tools plug into the existing gating hooks ----
ok(E.toolKind({ id: 'x', name: 'sharp rock' }) === 'improv-edge', 'toolKind names sharp rock improv-edge');
ok(E.toolKind({ id: 'x', name: 'sturdy stick' }) === 'improv-club', 'toolKind names sturdy stick improv-club');
ok(E.toolKind({ improvId: 'bone-shard', name: 'weird thing' }) === 'improv-edge', 'def.improvId wins for bone-shard');
ok(E.toolKind({ id: 'x', name: 'flint flake' }) === 'improv-edge', 'toolKind names flint flake improv-edge');
ok(E.toolFellsTrees('improv-edge') === false, 'improv-edge never fells');
ok(E.toolFellsTrees('improv-club') === false, 'improv-club never fells');
ok(E.toolForagesWood('improv-edge') === true, 'improv-edge forages wood');
ok(has(E.toolVerdict({ name: 'sharp rock' }, 'fell'), "isn't the tool for felling"), 'fell verdict honest no');
ok(has(E.toolVerdict({ name: 'sharp rock' }, 'forage-wood'), 'works for gathering wood'), 'forage verdict honest yes');
ok(E.improvWearMult('improv-edge') === 2, 'improv wears 2x');
ok(E.improvWearMult('felling-axe') === 1, 'real tools wear 1x');

// Blind discovery is honest; knowledgeable discovery names deficits.
const blind = E.improvVerdict('sharp-rock', 0);
ok(has(blind, "You'll find out"), 'blind improv verdict admits not knowing');
ok(!has(blind, 'chips'), 'blind verdict leaks nothing about wear');
const known = E.improvVerdict('sharp-rock', 2);
ok(has(known, 'chips') && has(known, 'fell a tree'), 'known verdict names deficits');
const pk0 = E.pickImprovTool('cut', 0);
ok(pk0.blind === true && pk0.pick === null, 'ignorant pick is null, flagged blind');
const pk2 = E.pickImprovTool('dig', 2);
ok(pk2.pick === 'sturdy-stick' && pk2.blind === false, 'knowledge picks the right improv tool');

// ---- 2. Tool knowledge progression: strict gating ----
const axeDef = { id: 'axe1', name: 'fire axe' };
const k0 = E.toolKnowledgeText(axeDef, 0);
ok(has(k0, "don't know its name") && !has(k0, 'axe'), 'level 0 hides even the name');
const k1 = E.toolKnowledgeText(axeDef, 1);
ok(has(k1, 'fire axe') && !has(k1, 'cannot'), 'level 1: name only, no uses leaked');
const k2 = E.toolKnowledgeText(axeDef, 2);
ok(has(k2, 'cannot') && has(k2, 'fell a tree') && !has(k2, 'Technique'), 'level 2: uses + limits, no technique leaked');
const k3 = E.toolKnowledgeText(axeDef, 3);
ok(has(k3, 'Technique') && !has(k3, 'Keeping it'), 'level 3: technique, no maintenance leaked');
const k4 = E.toolKnowledgeText(axeDef, 4);
ok(has(k4, 'Keeping it') && has(k4, 'File the edge'), 'level 4: maintenance content');
ok(E.toolKnowName(0) === 'stranger' && E.toolKnowName(4) === 'maintenance', 'level names');

// Earning: technique only by use, maintenance only by teaching.
let r = E.earnToolKnowledge('fire axe', 0, 'used');
ok(r.level === 1, 'used 0->1');
r = E.earnToolKnowledge('fire axe', 0, 'taught');
ok(r.level === 2, 'taught 0->2 (good teaching unlocks fast)');
r = E.earnToolKnowledge('fire axe', 2, 'used');
ok(r.level === 3, 'used 2->3 technique earned');
r = E.earnToolKnowledge('fire axe', 3, 'used');
ok(r.level === 3 && has(r.text, 'Nothing new'), 'used caps at technique');
r = E.earnToolKnowledge('fire axe', 3, 'taught');
ok(r.level === 4, 'taught reaches maintenance');
r = E.earnToolKnowledge('fire axe', 2, 'watched');
ok(r.level === 2 && has(r.text, 'Nothing new'), 'watched caps at uses');
r = E.earnToolKnowledge('fire axe', 1, 'danced');
ok(r.level === 1, 'unknown method learns nothing');

ok(E.techniqueFactor(axeDef, 3) === 0.8, 'technique speeds work');
ok(E.techniqueFactor(axeDef, 1) === 1, 'untaught: no silent speedup');
ok(E.techniqueFactor({ name: 'rock' }, 3) === 1, 'non-tool: no speedup');

// ---- 3. Condition beats: dull is slower and says so; snap is telegraphed ----
const dullEntry = { name: 'fire axe', wear: 70 };
const tf1 = E.toolTimeFactor(dullEntry, axeDef, 2);
ok(tf1.factor === 1.5 && has(tf1.notes[0], 'dull'), 'dull axe slower, says so (know 2)');
const tf0 = E.toolTimeFactor(dullEntry, axeDef, 0);
ok(tf0.factor === 1.5 && has(tf0.notes[0], 'tired') && !has(tf0.notes.join(' '), 'dull'), 'know 0: honest slowdown, mechanism unnamed');
const tf9 = E.toolTimeFactor({ name: 'fire axe', wear: 95 }, axeDef, 2);
ok(tf9.factor === 2 && has(tf9.notes.join(' '), 'twice as long'), 'wrecked tool 2x, named');
const tfFresh = E.toolTimeFactor({ name: 'fire axe', wear: 5 }, axeDef, 2);
ok(tfFresh.factor === 1 && tfFresh.notes.length === 0, 'fresh tool: no penalty, no noise');

// Stats never move: armorOf / weaponBonusOf untouched by wear.
const vestEntry = { itemId: 'v', name: 'vest' };
const person = { equipped: { torso: vestEntry } };
const itemDefs = [{ id: 'v', armor: { protection: 10 } }, { id: 'w', weapon: { bonus: 5 } }];
ok(E.armorOf(person, itemDefs) === 10, 'armorOf baseline');
E.applyWear(vestEntry, 90);
ok(E.armorOf(person, itemDefs) === 10, 'armorOf untouched by wear (no silent nerf)');
const wEntry = { itemId: 'w', name: 'bat' };
ok(E.weaponBonusOf({ equipped: { weapon: wEntry } }, itemDefs) === 5, 'weaponBonus baseline');
E.applyWear(wEntry, 95);
ok(E.weaponBonusOf({ equipped: { weapon: wEntry } }, itemDefs) === 5, 'weaponBonus untouched by wear');

// Snap: never a surprise.
ok(E.snapRisk({ wear: 10 }) === 'none', 'fresh: no risk');
ok(E.snapRisk({ wear: 92 }) === 'cracked', 'worn: cracked');
ok(E.snapRisk({ wear: 100, fragile: true }) === 'critical', 'fragile: critical');
const safe = { name: 'axe', wear: 10 };
let safeSnaps = 0;
const rngA = mulberry32(7);
for (let i = 0; i < 500; i++) if (E.trySnap({ name: 'axe', wear: 10 }, rngA).snapped) safeSnaps++;
ok(safeSnaps === 0, 'healthy tools never snap (500 seeded trials)');
const doomed = { name: 'axe', wear: 100, fragile: true };
const rngB = mulberry32(7);
let snapped = false, snapText = '';
for (let i = 0; i < 300 && !snapped; i++) {
  const res = E.trySnap(doomed, rngB);
  if (res.snapped) { snapped = true; snapText = res.text; }
}
ok(snapped, 'fragile tool eventually snaps');
ok(doomed.broken === true, 'snap marks entry broken');
ok(has(snapText, 'saw it coming'), 'snap text admits it was telegraphed');
ok(has(E.toolConditionText({ name: 'fire axe', wear: 92 }, axeDef, 2), 'cracked'), 'condition text warns of crack first');

// Mend: gated, and improv is replaced not mended.
ok(has(E.mendText({ name: 'fire axe' }, axeDef, 1), 'guessing'), 'mend without knowledge: honest guessing');
ok(has(E.mendText({ name: 'fire axe' }, axeDef, 4), 'File the edge'), 'mend with maintenance knowledge');
ok(has(E.mendText({ name: 'sharp rock' }, { name: 'sharp rock', improvId: 'sharp-rock' }, 4), 'find another one'), 'improv tools are replaced, not mended');

// ---- 4. Social tools: lend, steal, witness, return ----
const axe = { name: 'fire axe' };
const lendText = E.lendTool(axe, 'Mara', 'Tomas');
ok(has(lendText, 'lends') && has(E.toolSocialText(axe), 'On loan'), 'lend recorded, readable');
ok(E.toolHistory(axe).length === 1 && has(E.toolHistory(axe)[0], 'Mara lent it to Tomas'), 'history carried');
const retLend = E.returnTool(axe);
ok(has(retLend, 'trust'), 'lending returned builds bond');
ok(E.toolSocialText(axe) === '', 'returned tool shows clean state');
ok(E.toolHistory(axe).length === 2, 'history kept after return');

const saw = { name: 'hand saw' };
const steal = E.borrowUnasked(saw, 'Tomas', 'Mara');
ok(has(steal.text, 'without asking'), 'theft allowed and named');
ok(has(E.toolSocialText(saw), 'Taken, not borrowed'), 'taken state readable');
ok(has(E.toolSocialText(saw), 'Nobody saw'), 'unseen theft says so honestly');
ok(E.markObserved(saw, 'Jae') === 'Jae saw.', 'witness recorded');
ok(has(E.toolSocialText(saw), 'Jae saw'), 'witness visible in social text');
const retSteal = E.returnTool(saw);
ok(has(retSteal, "doesn't un-take it"), 'returning stolen goods: people remember');
ok(E.toolHistory(saw).length === 2, 'theft + return in history');
ok(E.returnTool({ name: 'x' }) === 'It was never out.', 'return of unloaned tool');

// ---- 5. Scarcity: honest options when the ideal tool is missing ----
const fellOpts = E.missingToolOptions('fell', { kinds: [] }, 2, 'pine barrens');
ok(fellOpts.length === 4, 'fell without axe: 4 options');
ok(fellOpts[0].viable === false && has(fellOpts[0].honestNote, 'Nothing improvises a fell'), 'no fake improvise-fell option');
ok(fellOpts.some(o => o.id === 'branches' && o.viable && has(o.cost, 'honest work')), 'branches option viable, honest cost');
ok(fellOpts.some(o => o.id === 'borrow' && has(o.cost, 'social debt')), 'borrow names social cost');
ok(fellOpts.some(o => o.id === 'go-without'), 'go-without always offered');
ok(has(fellOpts[2].cost, 'pine barrens'), 'biome flavors prose');
ok(E.missingToolOptions('fell', { kinds: ['felling-axe'] }, 2).length === 0, 'has axe: no scarcity UI');
const fellBlind = E.missingToolOptions('fell', { kinds: [] }, 0);
ok(has(fellBlind[0].honestNote, 'hesitate'), 'blind scarcity note admits ignorance');
const woodOpts = E.missingToolOptions('forage-wood', { kinds: [] }, 0);
ok(woodOpts[0].id === 'improvise' && woodOpts[0].viable === true, 'forage-wood: improvise viable');
ok(has(woodOpts[0].cost, 'twice the wear'), 'improvise cost named');
const digOpts = E.missingToolOptions('dig', { kinds: [] }, 2);
ok(digOpts[0].id === 'improvise' && digOpts[0].viable === true && has(digOpts[0].cost, 'shallow only'), 'dig: stick option honest about limits');

// ---- Regression: existing behavior untouched ----
ok(E.gearWord({ name: 'axe' }) === 'axe', 'pristine gearWord unchanged');
ok(E.wearWord({ wear: 20 }) === 'worn', 'wearWord unchanged');
ok(E.toolFellsTrees('felling-axe') === true, 'axe still fells');
ok(E.toolFellsTrees('hand-saw') === 'slow', 'hand saw still slow-fells');
ok(E.toolFellsTrees('pruning-saw') === false, 'pruning saw still never fells');
ok(has(E.inspectPiece({ name: 'axe', wear: 50 }, axeDef, 0), 'battered'), 'inspectPiece condition visible');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
