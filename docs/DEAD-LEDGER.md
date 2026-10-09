# The Oversight — Dead Ledger

Steve 2026-10-09: "Can we see what isn't being used?" This is the standing
answer. Every dead-code / dead-data / write-only finding goes here with its
disposition. Break-it and flesh-out runs: **update this file when you find or
resolve one** — it is the ledger, not a one-off report.

Dispositions: **FIXED** (wired up / repaired), **REMOVED** (deleted),
**FLAGGED** (known dead, awaiting a call), **DESIGN** (needs Steve's design
call before anything happens).

## Entries

### npcGrantAbility write-only → FIXED (wiring in progress)
- **What:** `npcGrantAbility` (src/js/game.js) had zero callers — villagers
  could never earn abilities, so the entire villager-bearer phoenix half
  (~200 lines: phoenixVillagerTrigger, give/pull-away) was unreachable in
  real play; only test scripts populated it.
- **Found:** break-it godhood kickoff, 2026-10-09.
- **Disposition:** FIXED — Steve's directive: villagers earn abilities via XP
  leveling from many sources, deterministic grants, never RNG. Wiring worker
  fe715feb (villager-xp) in progress as of 2026-10-09.

### joinVillage / leaveVillage dead → REMOVED
- **What:** old `joinVillage`/`leaveVillage` in game.js had zero live callers
  (courtship retargeted to `joinVillageReal`).
- **Found:** shows+regional audit, 2026-10-09.
- **Disposition:** REMOVED — gap sweep, commit e64c8161.

### alienPlayers.json rivalry/voice fields never read → FLAGGED
- **What:** dead data — fields exist in the JSON, no code reads them.
- **Found:** break-it alien r5, 2026-10-09.
- **Disposition:** FLAGGED — small cleanup, no design question.

### combatStripHTML, panelCombat dead → FLAGGED
- **What:** defined, never called (party panel audit).
- **Found:** party panel 5461e5d6, 2026-10-09.
- **Disposition:** FLAGGED — remove in a cleanup pass.

### observe('caught_you_stealing') dead no-op → FLAGGED
- **What:** the action is absent from the observation table, so the call does
  nothing.
- **Found:** seen-crime 28b39511, 2026-10-09.
- **Disposition:** FLAGGED — remove or wire.

### villageLives() dead filter → FIXED
- **What:** the autonomous-villager filter matched nobody after the unified
  person system (2026-10-06) — the "1–2 villagers forage per day" system
  never ran.
- **Found:** idle-village sim, 2026-10-09.
- **Disposition:** FIXED — filter retargeted to unassigned roster members
  via getPerson().

### exile-arc state machine deliberately removed → DOCUMENTED
- **What:** `exileArcState`, `roadDaily`, `forkVillage`, `seekReadmission`,
  `genSettler`, `foodSupportsSpeech`, `pantryAccess` — test expected them,
  they don't exist.
- **Found:** gap sweep, 2026-10-09 (test rot investigation).
- **Disposition:** DOCUMENTED — Steve deliberately removed them in ab148efc;
  not dead code, a design removal. Test rewritten against current systems.

## How to add an entry
What (one line), where found (run + date), disposition + commit. If it needs
Steve, mark DESIGN and say what the call is. If it's a cleanup, mark FLAGGED.
