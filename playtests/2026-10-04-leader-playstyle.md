# Playtest: Leader Playstyle — 2026-10-04

## What was built

Delegation system: tap a person → "📋 Assign task" → pick forage/hunt/wood/water/scout/patrol/rest.
Assignments resolve at end of day-part. Haven panel shows who's assigned to what.

## Test results

**Unit tests: 24/24 pass** (`/tmp/test-leader.js`)
- State init, 7 task types, competence calc, trust gating (refuse <20, reluctant 20-40)
- All 7 task resolvers work, patrol with/without monster threat
- Knowledge flow to codex, System recognition, dead-villager cleanup
- Multiple simultaneous assignments

**Viability: 5/5 pure-leader bots survived 10 days** (`/tmp/test-leader-viable.js`)
- Bot never personally foraged, hunted, or fought. Only delegated + talked + ate from pantry.
- All 12 villagers alive in all runs. Pantry stayed positive.
- Leader playstyle axis: 14-62 signals per run.

**Content gate: OK.** Sims run clean, no regressions.

## Design notes

- **Competence matters:** hunter → 1.4× on hunt; librarian → 0.7×. Occupation keywords + temperament.
- **Trust gates:** <20 refuse outright. 20-40 reluctant (40% refuse, 0.7× results). 70+ eager (1.2×).
- **Risk is real:** hunt 8-22% injury. Patrol vs monster can kill the villager.
- **Knowledge sharing:** villagers have 25% chance to learn a plant while foraging → village pool → flows to player Codex post-day-7 with System commentary.
- **System recognition:** 3+ delegations post-arrival → "Ooh! A DELEGATOR! The audience LOVES a mastermind!"

## Open questions

- Patrol balance: simplified auto-resolve, not full combat sim. May feel less tactical than personal combat.
- Leader still needs to eat/drink personally (from pantry/well) — correct, but the UI flow for "take from pantry" could be smoother for leaders.
- No way to assign multiple villagers to the same task in one tap (must do individually).
