# Build verification checklist — 2026-10-03 (evening)

Target artifact: `the-scattering-slice-1-playtest` (hosted web build, not publicly shared — use card or hosted URL).
Local source at checklist time: commit `ecdf416` (background abilities separate from system slots).

This checklist is for the live hosted build. Checkboxes are for the tester to mark in a copy of this file.
A step fails if the hosted behavior differs from expected — record the diff, not just the fail.

## Preconditions

- [ ] Open the hosted build fresh (no cached old build — hard refresh / incognito).
- [ ] Confirm it boots to the title screen without console errors.

---

## 1. Boot & character select (regression: crash fix 08b619f)

Previous hosted builds crashed instantly on character select: `newGame()` referenced
`scholar.week1` before `scholar` was initialized (temporal dead zone ReferenceError).
Commit `08b619f` fixed this. Verify it is fixed in the hosted build.

- [ ] Title screen renders. "Continue" list shows any existing saves.
- [ ] "New run" / character select lists villagers (Mara, Jesse, Aki, etc.).
- [ ] Selecting a character does NOT crash the game — Haven loads.
- [ ] Console shows no `ReferenceError` on new game.
- [ ] Scholar starts at a valid position (`mx`/`my` defined, not undefined).

---

## 2. Haven basics

- [ ] Haven detail grid renders (9x9), fire cell 🔥 exists at (4,7) in the hall.
- [ ] Villagers visible in grid with name + emoji, wandering.
- [ ] Announcement/event bar shows recent log lines (sticky).
- [ ] Pack/inventory popup opens from UI; shows starting food (trail mix, dried meat).
- [ ] Inventory shows water: "💧 Water: 2L clean (2kg)".

---

## 3. Movement (multi-move, confirmations, step-and-act)

- [ ] Tap ground 1–3 squares away: walks immediately, no popup, costs 10 kcal/square.
- [ ] Tap ground 4+ squares away: confirmation popup "Walk N squares? That's M kcal." Walk / Back.
- [ ] Tap a bush: popup with "Step here" + "Step here and forage".
- [ ] Tap the fire: popup with "Step here" + "Step here and cook N raw" (if raw food held).
- [ ] Tapping a blocked cell (fire, tree) walks to nearest adjacent walkable cell, never crashes.
- [ ] Talk to villager from up to 3 squares away (no bunching required).

---

## 4. Foraging & plant recognition

- [ ] Forage a bush: yields ~10–15 units (~1,200 kcal avg for solo-viable foraging).
- [ ] First encounter shows 🌿 (unknown); examining assigns species and updates icon.
- [ ] Known berry bushes show 🫐; identified species show specific glyph.
- [ ] Nearby same-type bushes chain-reveal (occasionally).

---

## 5. Pantry (real items, take + deposit)

- [ ] Pantry popup opens from Haven; shows itemized food (beans, rice, soup, dried meat) with units, not just a kcal number.
- [ ] Pantry totals ≈ 34,500–36,000 kcal at game start.
- [ ] "Take from pantry" moves food to pack, respects 20 kg carry limit.
- [ ] **Donate** button exists in inventory for food items; donating removes it from pack, adds to pantry.
- [ ] Donating raises trust (visible via villager interaction or trust feedback).
- [ ] Taking lots without donating lowers trust (theft/hoarding feedback appears).

---

## 6. Cooking (fire-gated, water cost)

- [ ] Cook button in inventory ONLY appears when near a fire (tap fire in Haven).
- [ ] Cooking raw beans/rice consumes 1 L clean water from village storage; warns if insufficient.
- [ ] Beans: 150 raw → 300 cooked; rice: 200 → 350; cooked food marked safe.
- [ ] "Cook N raw" from fire popup calls `cookAll()`; per-unit water (5 beans = 5 L, not 1 L).
- [ ] Codex gives hints about what needs cooking (pantry display does NOT).

---

## 7. Water system (bottles, clean vs risky, boil)

- [ ] Water sources (creek tiles): "Drink" and "Fill water (1L)" actions.
- [ ] Creek fills marked **risky** with source retained ("Creek (unknown)"); Haven well fills clean.
- [ ] Drinking risky water sometimes causes sickness (-15 health); clean is safe; clean is preferred.
- [ ] Fire popup shows "Boil N L water" when risky water held; boiling makes it clean ("…(boiled)").
- [ ] Inventory shows water line with clean/risky split and kg weight (1 L = 1 kg, counts toward 20 kg).
- [ ] Drinking restores hydration (+50).

---

## 8. Equipment slots (weapon + armor, no stacking)

- [ ] Inventory shows "Equipped: ⚔️ … · 🛡️ …" line when gear worn.
- [ ] Weapon items have Equip button; armor has Wear button.
- [ ] Equipping moves item out of inventory into slot; unequip returns it.
- [ ] Bonuses come from EQUIPPED item only (carry 2 spears ≠ double bonus).
- [ ] Armor reduces combat damage (spot check via a fight).

---

## 9. Village meals & trust economy

- [ ] Trust starts at 15 for the player (not 100) — check early game feedback / village meal text.
- [ ] Low trust (<30): village meal gives ~1000 kcal (half ration) + "they don't trust you yet" note.
- [ ] Trust 30+: ~2000 kcal; 60+: ~2200.
- [ ] Village meal also gives +1 L clean water from village storage.
- [ ] Village meal pulls real pantry items (pantry visibly decreases).
- [ ] A Haven-only playthrough (no foraging) survives 10 days via meals.

---

## 10. Solo viability & other villages

- [ ] Foraging-only playthrough (no village meals) can survive — ~2 good forages/day ≈ 2,000+ kcal.
- [ ] "Join village" / "Leave village" options exist at other villages.
- [ ] Joining: village meal comes from the joined village's pantry.
- [ ] Leaving: solo again, no village meal.

---

## 11. Multi-save

- [ ] Starting runs with different characters creates separate saves.
- [ ] Title screen lists "Continue [Name] (Day N)" per living run.
- [ ] Loading a save restores position, inventory, day, pantry state.
- [ ] Dead runs are removed from the list.

---

## 12. Day 7 — System arrival drama (slice 2)

Prerequisite: a save at day 6, or play through to day 7.

- [ ] On day 7 (away from Haven): sky/event text describes the sky splitting with interface.
- [ ] Alien voice messages appear (cheerful, apologetic, alien).
- [ ] Journal/codex UI shifts toward game overlay.
- [ ] Queued village discussion event: returning to Haven triggers "The village saw the sky split" dialogue (Mara crying, Jesse laughing, Aki silent).
- [ ] Ability choice popup appears after arrival.
- [ ] Choices = 2 utility (based on week-1 actions) + 1 wild (wacky/vile/underpowered).
- [ ] Each choice shows System flavor commentary (alien zeal).
- [ ] Choosing one grants it; it appears under "System:" in inventory.
- [ ] Timed events fire: day 8 challenge, day 9 stranger (drama), day 10 hushwolf pack, day 12 system quest.

---

## 13. Background vs System abilities

- [ ] Inventory shows two lines: "Background: Triage L2, …" and "System: Green Thumb L1 (1/1 slots)".
- [ ] Background abilities do NOT consume System slots (Mara: 2 background + 1 system works).
- [ ] Using related actions grants XP to both kinds; L1→L2 announces evolution.
- [ ] Ability slots scale with integration (1 at start, 2 at 20, 3 at 40, 4 at 60, 6 at 80).
- [ ] Choosing a System ability at max slots refuses with a message.

---

## 14. Ability pool spot checks (43 total)

- [ ] Utility: Green Thumb, Tracker, Diplomat, Camp Cook, Water Witch, Pack Rat exist.
- [ ] Wacky-with-use: Squirrel Friend, Rain Dancer, Loud Chewer, Scream Cheese, Pocket Sand, Taste Vision.
- [ ] Body horror: Chitin Skin, Extra Stomach, Eyes in the Back, Molt.
- [ ] Risky: Blood Price, Berserker Rage, Red Hunger, Pact with Static.
- [ ] Vile: Hoarder, Light Fingers, Manipulator, Poisoner, Dread, Grave Robber.
- [ ] Overpowered-with-cost: Photosynthesis, Beast Tongue, Second Wind, Time Skip, Hive Mind.
- [ ] Underpowered-but-useful: Lucky Rock (+5%), Bird Whisperer (monster warning), Dramatic Entrance (confuses monsters).
- [ ] No ability is literally useless — every one has a real effect.

---

## 15. Crash/hard-fail watchlist

- [ ] No console ReferenceErrors anywhere (especially `CELL_PROPS`, `incoming`, `scholar` TDZ).
- [ ] Eating never deletes gear from inventory.
- [ ] Multi-move pathfinding never crashes.
- [ ] Combat with armor equipped does not crash.
- [ ] kcal never goes negative.
- [ ] `villageMeal()` never destroys food at the kcal cap (pulls min(share, room)).

---

## Sign-off

- Build tested (hosted URL / card):
- Date/time:
- Passes (x/15 sections):
- Game-breaking issues found:
- Follow-ups for parent:
