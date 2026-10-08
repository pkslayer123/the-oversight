// Proof: equipment FEEL — wear arc, provenance, knowledge-gated inspection, equip friction, tool-gating.
// Played AS A PLAYER over in-game days, not just unit asserts. Node-only.
// Run: node scripts/test-equipment-feel-20261007.js
'use strict';
const fs = require('fs');
const path = require('path');

global.window = global;
const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'js', 'equipment.js'), 'utf8');
eval(src); // loads window.S.equipment (plain script file, IIFE style)
const E = window.S.equipment;

let pass = 0, fail = 0;
function ok(cond, label) {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}`); }
}
function say(t) { console.log(t); }

const itemDefs = [
  { id: 'fire_axe', name: 'Fire axe', class: 'weapon', weapon: { bonus: 8 } },
  { id: 'pruning_saw', name: 'Pruning saw', class: 'weapon', weapon: { bonus: 3 } },
  { id: 'military_vest', name: 'Military vest', armor: { protection: 12 } },
  { id: 'knit_cap', name: 'Knit cap' },
  { id: 'work_gloves', name: 'Work gloves', armor: { protection: 2 } },
  { id: 'good_boots', name: 'Good boots', armor: { protection: 3 } },
  { id: 'hunting_knife', name: 'Hunting knife', class: 'weapon', weapon: { bonus: 5 } },
];
const defOf = id => itemDefs.find(i => i.id === id);

function newVillager() {
  return {
    name: 'Rook',
    personality: { temperament: 'steady', sharing: 'balanced' },
    items: ['fire_axe', 'pruning_saw', 'military_vest', 'knit_cap', 'work_gloves', 'good_boots', 'hunting_knife'],
    equipped: {},
  };
}

say('\n=== SCENE 1: day 0 — fresh gear, person card reads clean ===');
const v = newVillager();
E.autoEquip(v, itemDefs);
say(`person card: ${E.gearDescription(v)}`);
ok(E.gearDescription(v) === 'wielding Fire axe; wearing Military vest; Knit cap, Work gloves, Good boots',
  'day-0 description byte-identical to the old prose (no wear, no story leaked)');
ok(E.threatLabel(E.threatLevel(v, itemDefs)) === 'armored', 'threat reads armored off visible gear');
const armorFresh = E.armorOf(v, itemDefs);

say('\n=== SCENE 2: the wear arc — fights and foraging grind the gear down ===');
const gearBySlot = () => E.gearDescription(v);
const expectedWords = ['pristine', 'worn', 'battered', 'patched', 'makeshift'];
say('Day 0: ' + gearBySlot());
// Each "day": one fight (weapon +15, torso +4), foraging (hands +10). Accelerated,
// but narrated as days — the arc is what matters, and every stage must read.
const dayWords = [];
for (let day = 1; day <= 7; day++) {
  E.applyWear(v.equipped.weapon, 15);
  E.applyWear(v.equipped.torso, 12); // armor takes hits in a fight
  E.applyWear(v.equipped.hands, 10);
  const word = E.wearWord(v.equipped.weapon);
  dayWords.push(word);
  say(`Day ${day}: weapon is ${word} — person card: "${gearBySlot()}"`);
}
ok(new Set(dayWords).size >= 4, `weapon passed through 4+ wear stages (saw: ${[...new Set(dayWords)].join(', ')})`);
ok(gearBySlot().includes('patched Military vest') || gearBySlot().includes('makeshift Military vest'),
  'torso wear is readable at a glance in the person card');
ok(E.wearWord(v.equipped.weapon) === 'makeshift', 'weapon reaches makeshift');
ok(E.isFragile(v.equipped.weapon), 'weapon at 100 wear is fragile');
ok(gearBySlot().includes('held together by hope'), 'fragile gear says so on the card');
ok(E.armorOf(v, itemDefs) === armorFresh, 'wear never silently nerfs stats (armorOf unchanged)');

say('\n=== SCENE 3: provenance — the axe has a history (unique-person law) ===');
E.addProvenance(v.equipped.weapon, { maker: 'Mara', event: 'the boar raid', place: 'North Pines' });
const cardK2 = E.gearDescriptionK(v, 2);
say(`person card (knows the story): ${cardK2}`);
ok(cardK2.includes('made by Mara'), 'maker woven into description at knowledge 2');
ok(cardK2.includes('boar raid'), 'lived event woven into description at knowledge 2');
ok(cardK2.includes('North Pines'), 'place woven into description at knowledge 2');
const cardK0 = E.gearDescriptionK(v, 0);
ok(!cardK0.includes('Mara') && !cardK0.includes('boar raid'), 'no story leaks at knowledge 0 ("if you don\'t know, it doesn\'t show")');
ok(cardK0.includes('makeshift'), 'condition still visible to everyone at knowledge 0');

say('\n=== SCENE 4: knowledge-gated inspection — blind is honest ===');
const blind = E.inspectPiece(v.equipped.weapon, defOf('fire_axe'), 0);
say(`k0: ${blind}`);
ok(blind.includes('makeshift'), 'condition visible at knowledge 0');
ok(!blind.includes('Mara'), 'maker hidden at knowledge 0');
ok(blind.includes("can't read its history"), 'blind inspection is honest about being blind');
const fam = E.inspectPiece(v.equipped.weapon, defOf('fire_axe'), 1);
say(`k1: ${fam}`);
ok(fam.includes('Mara'), 'maker revealed at knowledge 1');
ok(!fam.includes('boar raid'), 'story NOT revealed at knowledge 1');
ok(fam.includes("haven't earned yet"), 'partial knowledge says there is more to earn');
const learned = E.inspectPiece(v.equipped.weapon, defOf('fire_axe'), 2);
say(`k2: ${learned}`);
ok(learned.includes('boar raid') && learned.includes('North Pines'), 'full story at knowledge 2');
ok(learned.includes('will not survive much more'), 'fragile warning in inspection');
const gearList = E.inspectGear(v, itemDefs, 1);
ok(gearList.length === 5 && gearList.every(e => typeof e.text === 'string'),
  'inspectGear covers all 5 equipped slots with text');
say(`full gear inspection (k1), first line: ${gearList[0].text}`);

say('\n=== SCENE 5: equip friction — the mid-fight swap costs an action, and says so ===');
const combatSwap = E.swapCost('weapon', 'combat');
say(`mid-fight: ${combatSwap.text}`);
ok(combatSwap.actionCost === true, 'mid-combat swap costs an action');
ok(combatSwap.text.includes('costs your action'), 'mid-combat cost is NAMED, not silent');
ok(E.midCombatSwapText('torso').includes('costs your action'), 'named helper exists for any slot');
const exploreSwap = E.swapCost('weapon', 'explore');
ok(!exploreSwap.actionCost && exploreSwap.text.includes('few minutes'), 'explore swap: honest time cost');
const havenSwap = E.swapCost('weapon', 'haven');
ok(!havenSwap.actionCost && havenSwap.text.includes('costs nothing'), 'haven swap: free, and says so');

say('\n=== SCENE 6: tool-gating — the axe fells, the pruning saw forages branches, never fells ===');
ok(E.toolKind(defOf('fire_axe')) === 'felling-axe', 'fire axe is a felling tool');
ok(E.toolKind(defOf('pruning_saw')) === 'pruning-saw', 'pruning saw identified as pruning-saw');
ok(E.toolKind(defOf('hunting_knife')) === 'knife', 'knife identified');
ok(E.toolFellsTrees('felling-axe') === true, 'axe fells a tree');
ok(E.toolFellsTrees('pruning-saw') === false, 'pruning saw NEVER fells a large tree');
ok(E.toolFellsTrees('hand-saw') === 'slow', 'hand saw works but is a big job (honest slow)');
ok(E.toolForagesWood('pruning-saw') === true, 'pruning saw forages branches');
ok(E.toolForagesWood('knife') === false, 'knife does not gather wood');
say(`  fell verdict: ${E.toolVerdict(defOf('pruning_saw'), 'fell')}`);
ok(E.toolVerdict(defOf('pruning_saw'), 'fell').includes("can't fell"), 'fell verdict is honest');
ok(E.toolVerdict(defOf('fire_axe'), 'fell').includes('can fell'), 'axe verdict is affirmative');
ok(E.toolVerdict(defOf('hunting_knife'), 'forage-wood').includes("isn't the tool"), 'knife verdict is honest');

say('\n=== SCENE 7: threat honesty — battered gear can flatter the label ===');
const note = E.threatNote(v, itemDefs);
say(`threat note: ${note || '(none)'}`);
ok(note.includes('flatters'), 'worn gear triggers a wear-honesty note beside threatLabel');
ok(E.threatLabel(E.threatLevel(v, itemDefs)) === 'armored', 'threatLabel itself unchanged');
const freshNote = E.threatNote(newVillager(), itemDefs);
ok(freshNote === '', 'no note when nothing is worn');

say('\n=== SCENE 8: repair + robustness — no crashes on bad input ===');
const before = E.wearWord(v.equipped.torso);
E.mendWear(v.equipped.torso, 100);
ok(E.wearWord(v.equipped.torso) === 'pristine', `mend restores condition (${before} -> pristine)`);
ok(E.applyWear(null, 5) === 'pristine', 'applyWear(null) does not crash');
ok(E.wearOf(undefined) === 0 && E.wearWord(undefined) === 'pristine', 'wearOf/wearWord handle undefined');
ok(E.inspectPiece(null, null, 0).includes('gear'), 'inspectPiece(null) does not crash');
ok(E.toolKind(null) === 'none', 'toolKind(null) is none');
ok(E.swapCost('weapon', 'weird-context').actionCost === false, 'unknown context falls back to haven rules');
ok(E.addProvenance(null, { maker: 'x' }) === null, 'addProvenance(null) returns null safely');

say(`\n==== ${pass} passed, ${fail} failed ====`);
process.exit(fail ? 1 : 0);
