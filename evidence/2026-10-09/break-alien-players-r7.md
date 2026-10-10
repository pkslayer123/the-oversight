# Break-it: alien players — r7 (2026-10-09)

Target index 7, round 7. Attacked `src/js/alienPlayers.js` (~2700 lines, 74 methods).
Read docs/CANON.md + MONSTER-WAVES.md + DIRECTIVES.md first. **Canon note:** no
ALIEN-PLAYERS.md exists in docs/ — nothing invented; worked from the @ontology header
(Steve 2026-10-07: they impersonate HUMANS, not monsters; exclusive pool) plus
CANON.md / MONSTER-WAVES.md / DIRECTIVES.md, same as r6.

Proof: `scripts/test-alien-r7-breakit-20261009.js` — **252 checks × 3 seeds, all green**
(full production script list in index.html order, seeded RNG installed BEFORE module
eval, window stub deleted before play). Red→green demonstrated: with the fix stashed,
the run aborts at the first honesty check (F3 pre-reveal "alien medkit" leak);
with the fix, 252/252. r6's suite re-run as regression: 75/75 green.
Ontology: 52/52 systems validated after the header change (docs/ONTOLOGY.md regenerated).
The shared harness `scripts/break-alien-harness.js` was extended to the current
index.html script list (+broadcast.js, contestEngine.js, corruption.js, fieldFights.js,
villager-objectives.js — all node-safe); r6's test still passes on it.

## Catches (6 — one bug class, five say/sysSay sites + one salvage path), all fixed

**Bug class: the word "alien" IS the alien truth, and it leaked pre-reveal.**
The module already knew this — the "MULTIPLE alien players" line is gated on
apKnowsAlien with the comment "'MULTIPLE alien players' names the alien truth
outright" — but five other player-facing strings said "alien" to a player who
never earned the truth, and the salvage path handed the player an item literally
named "Alien <piece>".

- **F3 — apPersonaPackage (sadistic):** "Inside: a beautiful **alien medkit**."
  Pre-reveal it now reads "a beautiful medkit" (still humming your name; the
  signed cover name stays — they signed the card). Post-reveal: "alien medkit".
- **F4 — apContactedVillager (establishment):** "(X has been contacted by **an
  alien player**…)" — narrator voice naming the truth. Now gated on knowing ANY
  alien; pre-reveal: "(X has been contacted by **something**…)".
- **F5 — apPlaygroundDuel:** "Even **aliens** have limits" — the old line gated
  the loser's NAME but not the sentence. The whole sentence follows the gate now
  ("Even they have limits." pre-reveal).
- **F6 — apBeamHit horror beat:** "You need **alien armor**." Pre-reveal:
  "Whatever they're wearing stops this. Yours doesn't." The attacker pid is now
  threaded through opts so the gate is per-attacker (apMaybeBeamAttack passes it).
- **F8 — apPlaygroundRookieMistake:** "Pip tried to trade with a villager using
  **alien currency**" on the System feed. Pre-reveal: "coins that chime wrong"
  (gated on knowing Pip; the joke lands either way).
- **F9 — salvage strip reveals:** the granted armor is literally named "Alien
  helm/carapace/…" — an inventory UI string saying "alien" pre-reveal. Fix, not
  copy: stripping humming alien hardware off a warm body IS learning the truth
  firsthand, so the strip now calls apRevealAlien(pid, 'you stripped their
  armor') when a piece is actually granted. A kill with no salvage (40% whiff
  or full set) keeps the normal reveal paths. Design call, documented for
  Steve's overrule.

Ontology header gained the `(knowledge_alien_word)` rule (single-line, validator
grammar). Sibling sweep for the same class in encounters.js/drama.js: clean —
the dread-projector status source is already knowledge-gated there.

## Held — real attacks that resisted

- **Persona-kill triple-dip farm:** 30 simulated days, kill every 2 days across
  3 personas with forced salvage success. Favor lanes clamp ±100 (observed max
  80); salvage dedupes owned pieces (5 max, all 5 granted, zero dupes);
  encounters counted exactly (no double-fire); killed personas stay in the pool
  — the "death is an inconvenience" resleeve fiction holds in the engine.
  Bounded by design, not an infinite loop.
- **Time manipulation:** no day-decrement path exists; endDay fires once per
  day (4 day-parts); apDailyTick is the only caller of the off-screen systems
  (distant-village catch-up sim never touches it). Same-day force-fire of
  apDailyTick: dead drop ≤1, care package ≤1, persona package ≤1, club boon ≤1.
- **Cooldown sharing:** dead-drop 3-day, care-package 4-day, persona-package
  6-day, club-boon 5-day gates are all GLOBAL (single lastXDay fields), not
  per-persona — no multi-persona stacking.
- **Favor economy:** ±100 clamps hold; drift is 1/day/lane toward 0; legacy
  `ap.favor` mirror stays in sync with the loudest lane; announcements print
  the exact n and lane value (no rounding); |n|<3 moves stay quiet (crowd
  doesn't notice a +1 — documented design, not a silent action).
- **Stasis softlock:** tbBarrierExit is confirmed the only mid-combat flee path
  (game.js refuses travel/exitBuilding mid-combat). Stasis consumes it while a
  live hostile fields the tech — but the field dies/flees/ends with the fighter
  (apStasisFieldLive false in all three cases). A stasis fight is a fight to
  the death by design; it cannot become a fight that never ends.
- **trackedBy permanence:** the flag is never cleared (only ever set by the
  sadistic package). Attacked as "unavoidable forever": sporting rules
  (2-day/persona) beat the ×3 weight — 0/40 forced rolls returned the tracked
  persona inside its window. Encounter-rate modifier, not a lock.
- **Contact warnings:** vague by design ("dreamed… teeth… be ready"); they
  promise no mechanic, name no timeline, and ignoring them has no hidden
  consequence — no phantom threat because no specific threat is ever claimed.
- **Exclusive pool:** all 7 combat personas build as kind 'hostile' with
  'ap_' keys; no persona id appears in the monster data; alienPid fighters only
  originate from startAlienCombat. They impersonate humans, never monsters.
- **Beam targeting:** with a villager fighter in the combat, the beam still
  targets 'player' — matches the "beam weapons are for the player" copy.
- **Dead-code re-census (post-r6):** the 6 new fan-club methods (apFanLane,
  apTopLane, apClubName, apPackageClubLine, apClubBoon, apSyncFavor) all exist
  and are behaviorally wired (callers in apDailyTick/apCarePackage/apFeedMessage/
  contests.js). No newly-dead code; the module-loads-in-index.html lesson holds.

## Landing

- Ready for landing; merge is the coordinator's job. Files changed:
  src/js/alienPlayers.js (6 fixes + ontology rule), scripts/test-alien-r7-breakit-20261009.js
  (new, 252×3), scripts/break-alien-harness.js (script-list parity), docs/ONTOLOGY.md
  (regenerated), evidence/2026-10-09/break-alien-players-r7.md (this file).
- No [needs-eyes]: copy-only honesty fixes, no feel/combat/UI changes.
  (F9 changes reveal timing on salvage — flagging here rather than in the
  commit message; coordinator's call whether Steve should see it.)
- Worktree contains only committed work after landing (to be verified).
