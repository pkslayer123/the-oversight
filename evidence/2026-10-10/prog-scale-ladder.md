# Scale ladder: national/global felt transitions (prog-scale, 2026-10-10)

## Design decisions (canon: docs/SCALE.md, new)
- **National bar:** a polity = one primary + ≥3 active subordinates (four fires is a
  realm; two is a pact). The "three villages plus surplus" sketch Steve rejected as
  gameable becomes a bar about *relationships held* — each subordinate is a live
  trust/tribute link that can snap.
- **Two roads (per contract):** LEAD (Haven primary of ≥3 — the built realm) and
  BELONG (valued subordinate — trust ≥60, arrears 0, link ≥21d — to a primary whose
  realm holds ≥4 villages). The belong bar sits one notch below
  `kingdomEndingEligible`'s 70/0/21 — national is the doorway, the ending is the room.
- **The region climbs without you:** foreign polities form off-screen weekly
  (~22%/wk, seasonal) among known unlinked villages; Haven hears through traders
  (delayed, possibly wrong). This is what makes the BELONG road reachable — NPC-NPC
  links don't otherwise exist in the engine.
- **Beats:** LEAD → "The First Court" (feast 5,000 kcal / host court 7 days / cold
  ink: tribute +10%, trust −12). BELONG → "The Binding" (swear 3,000 kcal / serve
  7 days / **walk** — refusal is real: the link breaks, national stays unachieved).
  Staged the morning after the deed (day boundary, like rumor delivery); dies aloud
  if the realm dissolves mid-beat.
- **Global bar (provisional v1):** nationalLive + viewership ≥ 40 (deed-reactive via
  recordMoment/show stunts). Beat: "The Watchers" — champion / feast / **decline**
  (decline still lands global: the scale is the world's attention, not compliance;
  viewership −10, remembered). Pre-table only; the table is the ending.
- **Mechanical unlocks (real, small, honest):** national → subordinate tribute grain
  arrives ×1.25 via System logistics (arrival line says the true amount — copy and
  engine agree); national → weekly polity news; global → weekly world feed.
- **Anti-speedrun:** the table is a weekly verb, trust is deed-earned, tribute is
  real food, foreign polities grow slowly. No calendar path to any rung.
- Tuning numbers (4 fires, 60 trust, 40 viewership, ×1.25) documented as provisional
  v1 per Steve's "specs are v1 until playtesting proves otherwise."

## What was built
- `src/js/hierarchy.js` only (per scope): `scaleRank()`, `polityOf()`,
  `_havenPolity()`, `foreignPolities()`, `_foreignPolitySim()`, `_checkNational()`,
  `stageNationalBeat()`, `answerNationalChoice()`, `_checkGlobal()`,
  `stageGlobalBeat()`, `answerGlobalChoice()`, `polityNews()`, `worldFeed()`; wired
  into `hierarchyDaily()`; ×1.25 logistics bonus in `linkTick()`; @ontology header
  updated (provides + 6 new rules). Ontology validator: "All 52 systems validated."
- `docs/SCALE.md`: the full ladder canon (identities, felt beats, unlocks, API
  contract for other workers, UI wiring contract for app.js —
  `state.pendingNational`/`pendingGlobal` + answer functions, same pattern as
  `pendingAccord`).
- `scripts/test-scale-ladder-20261010.js`: 52 assertions; green on seeds 11, 222, 3333.
- NOTE for coordinator: app.js UI wiring for `pendingNational`/`pendingGlobal`
  buttons is NOT built (different worker's file) — the beats work standalone via
  `Game.answerNationalChoice` / `Game.answerGlobalChoice`, same as the Regional
  Dawn's accord pattern.

## Proof results
- A regional baseline: rank village→regional through the real `_formLink` path;
  Regional Dawn copy fired; no regression.
- B national via LEAD: 3rd subordinate link → next `hierarchyDaily()` stages The
  First Court; governance-layer copy; rank national after answering; feast cost
  ≥5,000 real pantry kcal; +10 trust per sub link; beat stages exactly once.
- C logistics bonus: trust-100 subordinate link → tribute grain arrived as a real
  spoil-dated pantry item at 5,000 kcal (4,000 × 1.25).
- D national via BELONG: subordinate link + foreign realm of 4 + trust earned via
  6× `proveWorth` (30→66, the deed path) + 25-day-old link → The Binding staged;
  oath → national, trust 78.
- E walk: Binding answered 'walk' → link broken, nationalLive false, rank back to
  regional. Refusal is a real choice.
- F global: nationalLive + viewership 45 → The Watchers staged ("not the table");
  decline → globalLive true, rank global, viewership 35.
- G ladder order: viewership 100 without national → no global beat. No skipping.
- H foreign sim: polity formed off-screen within the window; "Word comes late" rumor.
- I regressions: `payTribute` moves real food; `proposeLink` still refuses duplicate
  links; `kingdomEndingEligible` guards its bar; `polityNews`/`worldFeed` run clean.
- One test-only fix during the run: an absolute-trust assertion (40) was wrong
  because the honest weekly `linkTick` moves trust ± before the feast — asserted the
  feast's +10 delta instead. Engine behavior correct; test was wrong.
- Harness: full index.html-order eval incl. engine/* (missed on first pass — the
  initial grep pattern didn't match `src/js/engine/*.js`; fixed), Math.random seeded
  pre-eval (mulberry32), window stubbed for eval then deleted.

## Follow-ups for the coordinator
- app.js worker: wire `pendingNational`/`pendingGlobal` buttons (see docs/SCALE.md
  "UI wiring" contract).
- Wave-4/5 + endgame deed gate workers: read `Game.scaleRank()` defensively.
- Tuning: 40-viewership global bar and ×1.25 logistics bonus are v1 guesses.
