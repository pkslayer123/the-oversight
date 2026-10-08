# Playtest-54: Contests & Shows (worker-contests)

Played as a player in the headless node harness (full `src/js/*.js` load order, `delete global.window` before playing). Every action wrapped in try/catch — zero exceptions across all 6 scenarios. No hangs. No `undefined`/`NaN` in any surfaced text.

## contestPit
Verdict: PLAYABLE
Setup: Day 15, player eligible, The Pit fired; tested three paths (choice-participate, choice-refuse, grabbed).
Played: Participate path (Spear → Hold your ground → Meet the rush): won, prize granted as knowledge-gated alien loot ("Spare battery… You have no System tech. Still: dense, valuable, faintly warm.") — no id/mechanics leak. Refuse path: full refusal sequence ("NOTED… THE AUDIENCE WILL REMEMBER THE COWARDICE. OR THE PRINCIPLE."), +showmanship, +5 trauma, game continues. Grabbed path (no choice): died on "Meet the rush" → bespoke death line + mantle transfer to a new scholar, game continues. Multi-take others named when taken alongside.
Found: Nothing blocking. The shifted choice-phase indexes (choice prepended at index 0) route correctly — Participate → phase 1, Refuse → REFUSE terminal.
Fix: None.

## contestHide
Verdict: PLAYABLE
Setup: Day 20, extreme-risk Hide and Seek, taken with Felix and Alba.
Played: Choice path → Participate → Climb high → Hold your breath → Stay hidden: player WON while co-taken Felix died on camera ("It found Felix… ☠ Felix is gone. The village will say the name for a long time.") and Alba survived — multi-take fates resolve with distinct, coherent beats per person. Verdict terminal, no stuck state.
Found: Text coherence holds (win for me ≠ win for them; separate arenas). Die odds real (0.32/0.25/0.38 family). Nothing to fix in this path.
Fix: None.

## contestForage
Verdict: NEEDS WORK
Setup: Day 18 Calorie Run, taken with Kenji and Ibrahim; forced the choice branch and chose Refuse.
Played: Refusal played as a real sequence ("You refuse Calorie Run…"), and the co-taken villagers' fates resolved (Kenji WON, Ibrahim made it out) — refusal is yours alone, per design. BUT the fates lead-in reads: "While you fought your fight, they fought theirs." The player refused; they fought nothing. Text incoherence.
Found: `_contestResolveOthers` (src/js/contests.js:2810) is shared by `_contestEnd`, `_contestDie`, and `_contestRefuse` with no outcome context — the "fought your fight" lead-in is wrong on the refusal path.
Fix: In `_contestRefuse`, set `ac._refused = true` before calling `_contestResolveOthers(ac)`; in `_contestResolveOthers`, choose the lead-in from that flag: refused → "📺 While you said no, they fought theirs." Red test: `hidden_files/playtest-54/tests/test-contestForage-20261007.js` (currently RED, exit 1).

## contestWatch
Verdict: NEEDS WORK
Setup: Watch mode — villager taken (Sanne, then Amara), player watches; kcal set to 1500 to unlock the bet branch.
Played: Full watch arc works: Cheer → Bet 200 kcal on Sanne → Go to them → verdict (lost, bet lost, comfort resolved). Second run: Study the pattern (taught without bleeding) → Bet → Give them space → verdict. Verdict odds, cheer cap, 2x bet payout path, and comfort/mourning all fire. Watch beats are contest-specific (Pit beats: sand/bone arena, beast circling Sanne). No exceptions, resolves cleanly.
Found: Choosing "Give them space" is not honored. `_contestEnd`'s watch-lost branch (src/js/contests.js:2245) unconditionally prints "You go to Sam. They're quiet. They'll talk about it later. Or never." — the watcher explicitly chose space, and the game narrates the opposite. The choice is a lie.
Fix: Gate the line on `ac.comfort`:
```js
if (ac.comfort) {
  this.sysSay(`📺 You go to ${pname}. They're quiet. They'll talk about it later. Or never.`);
} else {
  this.sysSay(`📺 You give ${pname} space. The cameras move on. You don't.`);
}
```
(Comfort trust/mourning in `_contestVerdict` already keys off `ac.comfort` and stays untouched.) Red test: `hidden_files/playtest-54/tests/test-contestWatch-20261007.js` (currently RED, exit 1).

## showWhyEat
Verdict: NEEDS WORK
Setup: Day 16, WHY DO THEY EAT? show.
Played: The scenario does one `sysSay` announcement: "📺 TONIGHT: WHY DO THEY EAT?. Cook for the aliens. They are horrified. The audience is delighted." That's the entire show — no villager pull, no village reaction, no stakes for the player. It also bypasses the real show path: `Game.fireShow` (src/js/contests.js:509) exists and does the full pull-away (cameras take a villager, "will be back by morning. Probably.", village talks for days, +showmanship) but the scenario never calls it.
Found: (1) scenario under-delivers vs the implemented feature — the watchable-show path is untested by its own debug scenario; (2) text never explains stakes — why should the player care that aliens are horrified by cooking?; (3) nit: "WHY DO THEY EAT?." — the `TONIGHT: ${name}.` format double-punctuates names that end in "?".
Fix: In `src/js/debug-scenarios.js` `showWhyEat()`, call `Game.fireShow(show)` instead of (or in addition to) the bare announcement. Strip the trailing "." when `show.name` ends in "?" in both `fireShow` announcement lines, or store names without terminal punctuation. Consider one stakes line in the show desc (e.g. what the village gains/risks from the broadcast).

## contestEligible
Verdict: PLAYABLE
Setup: Day 15, player has `wave2Kill` notability; 3 villagers placed.
Played: `contestEligible()` returns 4 eligible (You, Tariq, Sam, Felix) with the player's notability surfaced honestly ("slew a wave-2 beast"). Day gate honest: day 10 → `{ eligible: [], reason: 'Show not yet casting (day 14+' }`. Dead player (health 0) excluded from the pool. No silent inclusions/exclusions found among the placed villagers.
Found: Honest as far as it goes. Minor gap: per-person exclusion reasons (no grid position, wrong age, severed) are silently dropped — a player asking "why wasn't *I* taken?" gets no per-name answer, only the global reason. Acceptable for now; flagging, not blocking.
Fix: None required. Optional: include an `excluded: [{name, reason}]` list in the return for a future eligibility panel.

## Summary of bugs (both have RED tests)
1. **Watch "Give them space" dishonored** — src/js/contests.js:2245 — test: `hidden_files/playtest-54/tests/test-contestWatch-20261007.js`
2. **Refusal path claims "you fought your fight"** — src/js/contests.js:2810 — test: `hidden_files/playtest-54/tests/test-contestForage-20261007.js`
3. **showWhyEat scenario bypasses `fireShow`**; show explains no stakes; "?." punctuation — src/js/debug-scenarios.js:995 (no test; scenario wiring + copy)
