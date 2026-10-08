# Sibling sweep (2026-10-08)

Steve's order: "Continue breaking work. Use the bugs we have found to specifically look for related siblings, verify all before changing code."

Method: for each of the 6 confirmed bug classes from today's break-it runs, built a codebase-wide scan, then verified every hit behaviorally (proof scripts, not guesses). No speculative fixes.

## CLASS 1 — SHADOW-DEATH (Object.assign collisions): CLOSED, no new bugs

Built a full pairwise chain scanner over all 34 runtime modules (catches `name()`, `name: function`, `Game.name =`, `G.name =` patterns — the first version missed `G.` aliases and property-style defs).
- 90 names defined in 2+ files. Every adjacent pair verified: each later definition either saves `Game.<name>` to a `_orig`-style variable (proper chain) or is a documented intentional override.
- 5 genuine full shadows found, ALL verified intentional:
  - `examineCell` (carexplore.js over game.js) — documented self-attaching override.
  - `activatableAbilities` (abilityActions.js over game.js) — documented data-driven replacement.
  - `animalTurn`, `huntAnimal` (encounters.js over game.js) — encounter-framework migration; the encounters.js versions are 817/295 lines vs game.js's 67/113 (clear supersets).
  - `tbHostileTurn` (party.js over encounters.js) — documented lazy late-chain (encounters.js wraps at combat start because load-time wrapping would be silently replaced).
- FIX: tombstoned the dead game.js copies of `animalTurn`, `huntAnimal`, `activatableAbilities` (stale-copy drift is what produced the `endConvo` ReferenceError — these corpses will keep making those bugs).
- Proof: `scripts/test-sibling-sweep.js` CLASS 1 check (re-runnable; fails on any new undocumented shadow).

## CLASS 2 — UNWIRED FEATURES (built, documented, zero callers): 3 lies fixed, rest tombstoned

Zero-caller scan over the full runtime (src/js + index.html + data JSON, comments stripped so @ontology mentions don't false-positive).
- **CONFIRMED BUG — false WIRING claims in ledger.js @ontology**: the header claimed `shareFood`/`hoardFood` are called by game.js and `hearGossipAboutSelf` by conversation.js. Zero callers exist anywhere. The release gate can't catch this (functions exist; only the wiring claim is false). FIXED: header now says UNWIRED 2026-10-08; the in-body "WIRING (game.js owner...)" comments on `shareFood`, `hoardFood`, `hearGossipAboutSelf`, `legendSurface` corrected the same way.
- **CONFIRMED — dead contest trio in ledger.js**: `abduct`, `declineChallenge`, `bringCompanion` — full implementations, zero callers, superseded by contests.js (`fireContest`/`contestInterruption`/`resolveContest`, verified working by the break-contests runs). Tombstoned. Note: `showDebt` (the "you owe the show" lever) is only written inside dead `declineChallenge` and never read — dead promise, no player ever saw it.
- **CONFIRMED — dead leadership-vector inputs**: `shareFood`/`hoardFood` (foodStance never sees outward sharing or hoarding), `hearGossipAboutSelf` (the "you have a legend" moment never fires), `legendSurface` (no Codex legend page renders it). The inward half works (`ledgerAdd('foodShared')` from progression.js:295) — so the vector isn't fully dead, just half-blind. Wiring the dead halves is a design decision, not a safe unilateral fix — flagged for Steve/coordinator.
- Also confirmed dead (tombstoned where they lacked one): `drinkWild` (superseded by the bottle system; `drinkTreated` already had the Legacy mark), `earnedEnding`, membership.js's `formAlliance`/`memberBenefits`/`pantryAccess`/`recognizedAbroad`, hierarchy.js's `bidForPrimacy`/`renegotiateLink`/`kingdomEndingEligible`, party-formal.js's `disbandParty`/`clearRole`/`roleBonus`.
- Proof: `scripts/test-sibling-sweep.js` CLASS 2 + 2b checks.

## CLASS 3 — COPY-VS-ENGINE HONESTY: held

- Petition labels (700/1500 kcal) vs `playerPackSpend(Math.min(wanted, pack))` — charges exactly the labeled amount, message reports the actual gift moved. HONEST.
- No new labeled-cost lies found in the sampled action labels.

## CLASS 4 — SCOPE LEAKS (per-vid identity): held

- `resolveDoubt(doubtId)` takes no vid — no cross-villager path; its callers sit behind the detective run's identity guard. HOLDS.
- `castPlayerVote` gated on `awaitingPlayerVote` (single vote). HOLDS.
- No new (vid, id) mismatches found in the justice/truth/betrayal surfaces.

## CLASS 5 — UNCAPPED CONVERTERS: held

- `cannibal_frenzy` (+1000 kcal, -30 trust, gate kcal<500): PROVED the gate is mathematically sound — each reuse requires burning 500+ kcal first, so no net-positive loop exists (measured net −2000 kcal over 20 forced cycles; trust floors at 0). The trust floor means the marginal cost goes to zero after ~4 uses, but the kcal gate, not trust, is the real cap — and it holds. Proof: `scripts/test-sibling-frenzy-cap.js` 2/2.
- `photosynthesis`: +100/daypart, daylight only — capped by the daypart clock (200–300/day). HOLDS.
- `blood_magic` (2/daypart), `time_skip` (1/day), `field_medicine` (1/daypart), `echo_location` (1/day), `herbal_remedy`/`purify` (1/day): all capped. HOLDS.

## CLASS 6 — KNOWLEDGE GATING on new surfaces: held

- Batch cooking: unknown monster flesh is EXCLUDED with an honest message (`nUnknown` path in food.js wrap). Verified meat items use `foodState`, not `rawKcal`, so game.js's orig loop can't touch them — the hunter run's "cookAll bypassed unknown-flesh gating" fix holds.
- Per-item cooking: unknown flesh cooks to `kcalEach 0`, `safe false`, honest prep text ("Cooked, but still unknown flesh"). HOLDS — matches Steve's "cook it, still risk it" direction.
- Water UI: knowledge-gated descriptions (safe/poison/unknown). HOLDS.

## Files changed
- src/js/ledger.js: @ontology header (3 false WIRING claims → UNWIRED), tombstones on abduct/declineChallenge/bringCompanion/shareFood/hoardFood/hearGossipAboutSelf/legendSurface.
- src/js/game.js: tombstones on animalTurn/huntAnimal/activatableAbilities (dead copies), drinkWild (Legacy mark).
- docs/ONTOLOGY.md: auto-regenerated by the validator.
- scripts/test-sibling-sweep.js (new): CLASS 1/2/2b re-runnable proof, 3/3 green.
- scripts/test-sibling-frenzy-cap.js (new): CLASS 5 proof, 2/2 green.

## For Steve / coordinator
1. The dead leadership-vector inputs (shareFood/hoardFood/hearGossipAboutSelf/legendSurface) are a design decision: wire them (outward sharing, hoarding, legend moments, legend page) or accept the vector as inward-only. I did not wire — that's your call.
2. ~15 tombstoned dead methods across ledger.js/game.js are deletion candidates for a future --force-delete cleanup (needs coordinator approval per the guard).
3. No live player-facing bugs found in this sweep — the classes from today's runs are closed.
