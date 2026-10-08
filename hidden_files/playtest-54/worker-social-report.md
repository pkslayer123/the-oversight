# Playtest-54 — Social/Drama Scenarios (worker-social)

13 scenarios played as a player in the headless node harness (harness-load.js).
Each scenario ran in its own process. Verdicts: **8 PLAYABLE, 4 NEEDS WORK, 0 BROKEN.**

## day7
Verdict: PLAYABLE
Setup: Fast-forward to day 7; the System arrives on your next action.
Played: `doAction('wait')` → full arrival cinematic (sky splits, gift offer, journal shimmer, party system). Chose Green Thumb via `chooseAbility` — granted L1 with flavor. Talked to a villager post-arrival; choices coherent.
Found: Nothing blocking. (Ability kit reads empty until the player picks — correct.)
Fix: —

## day1
Verdict: PLAYABLE
Setup: Fresh expedition, standard start.
Played: Started convo with a villager, asked around (`dlg:subject` → `ask:personal`), waited — day part advanced, villager requests surfaced ("needs 3 dandelion").
Found: Nothing blocking.
Fix: —

## language
Verdict: NEEDS WORK
Setup: "Nobody here speaks English" — villagers get fluent native tongues, zero English.
Played: Started convo — got fluent English dialogue ("How are you holding up? Honestly. No performance.") with normal verbal choices. No barrier anywhere.
Found: The scenario writes `v.bgLangs[rid] = {native, levels}` (debug-scenarios.js:321), but `npcLangs()` (game.js:1248) prefers `person.languages` — hydrated villagers carry `{native:'english', levels:{english:2}}` — so `bgLangs` is dead config and `commLevel()` returns 'full'. The entire nonverbal machinery (`nvOpen`, `nv:` choices) works — verified by overriding `person.languages` directly, which produced the barrier, the gesture-name beat, and gesture choices.
Fix: In `debug-scenarios.js language()`, write the override where `npcLangs()` reads it: `Game.getPerson(rid).languages = {native: t, levels: {[t]: 3}}` (keep bgLangs too for the legacy path).
Red test: `tests/test-language-20261007.js` (RED — asserts commLevel 'none' + nonverbal thread).

## liars
Verdict: PLAYABLE
Setup: Five villagers with forced cover identities (Brain surgeon, Navy SEAL…).
Played: Full detective loop — `ask:personal`, `observePerson` (30%+ detect) → doubt filed → `confront:` choice appeared → confrontation (denied first; confess chance scales with evidence/prior confronts per truth.js:777). End-of-day slip mechanic exists for the slow burn.
Found: `ask:personal` surfaces varied personal topics, not occupation — the lie itself is heard "around the fire" per setup text, and the doubt evidence quotes the claim. Acceptable.
Fix: —

## night
Verdict: PLAYABLE
Setup: Midnight, gray fox nearby, fire-hardened spear.
Played: `huntAnimal()` loop — stalk/chase/miss/bite/learned Night Hunting L1+L2. Tool-honest: spear is "a compromise", trap/bow better. (Did not land a kill in the test window; the loop itself is sound.)
Found (nit): ungrammatical method feedback — "You don't have the right tool for this one — no the trapping skill or a cage, no a bow or sling." The template at encounters.js:1705 prefixes "no " onto noun phrases that already carry articles (from `encMethodWords`, encounters.js:509).
Fix: Change the template to "without " + missing.join(' or ') or strip articles in `encMethodWords`.

## starving
Verdict: NEEDS WORK
Setup: Day 4, pantry nearly empty (2700 kcal total), "People notice what you take."
Played: Took 500 kcal — no reaction. Emptied the ENTIRE pantry (2700 kcal) — still no reaction: trust unchanged, no confrontation, no comment. `v.takes` ledger records it, but nothing visible ever fires.
Found: The "notice" mechanics are unreachable in this scenario by construction — `theftConfrontation` requires a single take ≥4000 kcal (game.js:8026) and the trust hit requires net takes < −5000 (game.js:8154/8195), but the whole pantry is 2700 kcal. The scenario's central tension (nearly-empty pantry, everyone knows it) has no mechanical expression; the core choice (take it all) has zero consequences.
Fix: Make the thresholds relative, not absolute — e.g. in `theftConfrontation`, compute the take as a fraction of pre-take pantry kcal and confront when fraction > 0.5 (or when pantry is below a starvation floor). Same for the net-takes trust hit.

## uprising
Verdict: NEEDS WORK
Setup: Stage-4 justice — the village comes at you; FIGHT / FLEE / TALK.
Played: Combat works; mob AI is excellent (hesitant, guilt-ridden, "looking for an exit"). TALK (`tbPlayerTalk` beg/intimidate/reason) works on the player's turn with visible effects (talkStun, flee, enrage). FLEE → exile aftermath ("You run. Behind you, the village — was the village…") with `exiled=true`. Died in one run → mantle transfer fired correctly mid-uprising. FIGHT: after first blood the mob YIELDS ("No more." sinks down) — the common outcome.
Found (main): The yield path in party.js `tbEnd` (~line 1079) handles `betrayal_yielded` inline and deliberately skips `betrayalAftermath` — so for an uprising, `uprisingAftermath()` never runs. The designed yield resolution exists (justice.js:681: "One by one, they stop…", `j.stage = 3`, fear +40) but is unreachable. Net effect: after the mob yields, the justice ladder sits at stage 4 forever — no exile enforcement, no cooling path (cooling only relaxes stage 1), no social resolution. The arc dead-ends in permanent limbo.
Fix: In party.js's yield branch, when the fight was an uprising (`this._lastBetrayal?.uprising`), set `lb.result='betrayal_yielded'` and route through `uprisingAftermath()` instead of the generic inline yield handling (skip the generic yield narration for uprisings to avoid double-voicing; keep the terror/trust seeding).
Red test: `tests/test-uprising-20261007.js` (RED — asserts stage 3 + yield text after uprising yield).
Found (nit): "grabs for you's weapon hand" — party.js:864 template `{n} grabs for {t}'s weapon hand` renders "you's" when the target is the player. Fix: render "your weapon hand" for the player target.

## mootAccused
Verdict: PLAYABLE
Setup: Accused of theft+assault; the moot is coming.
Played: Dossier actions all live — `speak` (heads nod), `alibi` (devastating: "Nobody meets your eyes"), `pressaccuser` offered, `demandmoot` → full trial ceremony → guilty 5–4 → weregild sentence ("You pay. And stay — this time."). Complete dramatic arc.
Found (nit): "The man in his 20s counts on their fingers" — betrayal.js:1211 uses "their" after a masculine descriptor. Cosmetic.
Fix: —

## mootJuror
Verdict: NEEDS WORK
Setup: Juror on an ambush-plot case; press suspects, flip the weakest, vote.
Played: `betrayal:press:` choice → found the seam ("Grace says dusk… the mechanic said full dark. Somebody's lying.") → `betrayal:approach:` on the weakest (declined, "Maybe later") → `conductTrial` → player vote → acquittal 1–8 → "The accused hear exactly who said it." Full arc, vote has social cost.
Found: The press payoff line "Done — their story has a crack in it now." is voiced AS the accused (`Grace: "Done — …"`, betrayal.js:2997 via `finish()` → `sayLine()`, which always prefixes the NPC name; transcript files it as `who:'them'`). It's investigation narration — the suspect would never say this about their own cover story. Voice-attribution break on the scenario's core beat.
Fix: In betrayal.js's `betrayal:` choice handler 'press' branch, narrate the outcome instead of voicing it: `this.say(outcome)` + transcript `{who:'narr', text: outcome}`, bypassing `finish()`'s `sayLine`. Same for the 'approach' success line ("They talked. Everything changes now.").
Red test: `tests/test-mootjuror-20261007.js` (RED — asserts the outcome line is not NPC-voiced).

## ambush
Verdict: PLAYABLE
Setup: Three plotters spring an ambush mid-walk; RUN / TALK / FIGHT.
Played: TALK ×3 → plot talked down ("Nobody moves to stop you leaving"); RUN → escape with wounds; FIGHT → first blood breaks them ("fought_off"). Each aftermath opens a moot case with the cover story seeded. Excellent fiction throughout.
Found (nit, harness-only): `ambushExchange` has no guard against a resolved plot — calling it after `plot.outcome` is set re-runs and opens a second case for the same plot. Unreachable in the UI (thread closes), but a one-line `if (plot.outcome || plot.state==='aftermath') return` guard would harden it.
Fix: — (nit only)

## exile
Verdict: PLAYABLE
Setup: Exiled; petition / found / drift.
Played: `villageCard` → petition Emberhold → rejected ("We've heard about Haven."). Petition Stonebridge + 700 kcal gift → rejected anyway, food kept ("They take your food — all 800 kcal of it — and turn you away anyway."). `foundHaven` → clear requirement list (7 solo days, campsite, hut, 10000 kcal cache). Judgment roll weighs crimes, gossip, gifts, read-people skill.
Found (nit): the button promises "Petition + offer food (700 kcal)" but `playerPackSpend` (betrayal.js:1787) rounds UP to whole units — with 400-kcal strips the player loses 800. The fiction honestly reports 800, but the button named 700. Violates "expensive buttons name their cost."
Fix: In `villageCard` (betrayal.js:1593-1595), compute the actual whole-unit spend from the player's real inventory and label the button with that number (e.g. "Petition + offer food (~800 kcal)").

## keepsake
Verdict: PLAYABLE
Setup: Mother's Ring (CHOSEN), resonance-harmonics taught, flashback played.
Played: `channelSentiment` → practice XP when calm; with trauma 20 → "The shaking eases. (−9 trauma)" (6 × 1.5 chosen multiplier ✓). Second channel same day correctly gated (once per day). Flashback text in setup is lovely.
Found: —
Fix: —

## mantle
Verdict: PLAYABLE
Setup: You die; the most-trusted villager takes the Codex.
Played: Death → "You're not her" beat → successor picks up the journal → Codex turns a page → game continues as the new villager (new id, fresh body, village progression kept). Talked and waited as the successor; codex notes persist. (Also verified live: dying in the uprising mantles mid-crisis coherently.)
Found: —
Fix: —

---

## Infrastructure notes (for the parent)
1. **Sibling broke the tree mid-run**: `src/js/convo-dialogue.js:315` currently has a SyntaxError (unescaped apostrophe in a single-quoted string: `'…spare — I'm running on empty.'`) from an uncommitted sibling edit. It kills the whole harness load. My `harness-load.js` now falls back to `git show HEAD:<file>` for any file that fails to parse (prints `HEAD-FALLBACK` to stderr) — currently only convo-dialogue.js. I did NOT modify any repo files.
2. **Cross-scenario contamination**: running two scenarios in one node process leaks state (the uprising's leftover `tbfight` resolved as 'fled' during the next scenario's `init()`). Every scenario above ran in its own process — do the same for future playtests.
3. Three red tests written (all RED, exit 1): `hidden_files/playtest-54/tests/test-language-20261007.js`, `test-uprising-20261007.js`, `test-mootjuror-20261007.js`.
