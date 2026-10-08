# Alien Players integration — evidence report (Steve 2026-10-08)

Worker: alien-players-integration · base 9e84450 · worktree ~/workspace/worktrees/alien-players-integration

## The big find (read first)

**`src/js/alienPlayers.js` is not in `index.html`.** The script list (lines 23–67) never
loads it. The data (`alienPlayers.json`) loads via fetch, but the module — every
`ap*` function, the endDay wrap, all of it — does not exist at runtime. The coordinator
verified the six integration functions were "never called outside alienPlayers.js";
the deeper truth is the module itself never loads, so even its self-wraps
(`endDay` → `apDailyTick`, the old `_contestVerdict` wrap) never install.

This is **out of my file scope** (index.html), so I did not touch it. The coordinator
needs one line in `index.html`, right after the contests.js tag (line 43):

```html
<script src="src/js/alienPlayers.js?v=<tag>"></script>
```

Placement reasoning: after `contests.js` (no longer strictly required since the
self-wrap is gone, but keeps related systems together and after `game.js` so
`Game` exists), and the endDay self-wrap chains correctly from anywhere after
`game.js`. The version-bump script stamps the `?v=` like the others.

Everything below is wired and proven in the harness, which evals alienPlayers.js
in exactly that position. **Nothing below takes effect in the live build until
the script tag lands.**

## What I wired

### 1. Contests — `apContestInterference(ac)` called directly in `_contestVerdict`
**File:** `src/js/contests.js` (`G._contestVerdict`, ~line 3085).

Before the per-participant verdict loop, one call:
`apInt = this.apContestInterference(ac)` (guarded — safe when the module isn't loaded).
`apWinMod` is added to `winOdds` alongside the existing cheer modifier, clamped
`[0.01, 0.95]`. On the death branch, `apDeathSave && pid === 'player'` converts the
death roll into a **loss** via `_contestEnd(ac, 'lost', false)` instead of
`_contestDie(...)`.

Fiction reasoning: the interference note is already spoken by the module (rigged
judge, 3-second static lifeline, chanting/booing crowd). The verdict math now
honors it. The death save is player-only — the benevolent ally is saving *you*,
not random villagers. Contest interruption law holds: the sequence still runs to
a verdict, nobody skips; a saved player still loses, just lives.

Also in `src/js/alienPlayers.js`: **removed the module's own `_contestVerdict`
self-wrap.** It stashed `ac._apWinMod`/`ac._apDeathSave` that nothing read, and
keeping it alongside the direct call would double-fire interference (double
messages, double RNG, double 5-day/7-day limits).

### 2. Codex — `apCodexEntry(pid)` fires at the discovery moments
**File:** `src/js/alienPlayers.js` (internal call sites — the module provides them).

- `apOnCombatEnd`: after the encounter record is stored, `apCodexEntry(pid)` →
  stage `encountered`. Every fight is discoverable truth.
- `apRevealAlien`: after `known[pid]` is set, `apCodexEntry(pid)` → stage
  `identified`. The book catches up to the truth.

**Knowledge-gating fixes in `apCodexEntry` itself** (this was leaking):
- `entry.species` was written unconditionally (`Vexari`, `K'thari`, …) — now
  `known ? p.species : 'unknown'`.
- `entry.title` (`Trophy Hunter, Third Dynasty`, …) — now `known ? p.title : 'stranger'`.
- Pre-reveal note was `"That wasn't a person. It moved like someone wearing a
  human suit."` — the alien truth stated outright. Now suspicion only:
  `"A stranger crossed you out in the wild. Moved wrong — too smooth, too
  practiced. You can't place why."` The conclusive line is kept for post-reveal.
- `understood` stage (5+ encounters) now also requires `known` (was implied by
  the 3rd-encounter auto-reveal, now explicit).

`apKnowsAlien` delegates to the unified `canShow('alien', pid, 'name')`, which
reads `apState().known` — one gate, no parallel truth.

**Remaining follow-up (out of scope):** `codexScreen` in `app.js` has no ALIENS
section — it renders plants/skills/people/techniques/deeds/contest/beasts from
`state.codex.*` directly. `state.codex.aliens[pid]` is now written correctly, but
nothing renders it yet. One section in `codexScreen` (mirroring BEASTS, reading
the gated fields) will make it visible.

### 3. Gossip — `apVillageGossip()` in the village gossip flow
**File:** `src/js/game.js`, `spreadGossip()` (~line 9862), right after
`spreadMonsterNews()`:

```js
try { if (this.apVillageGossip) this.apVillageGossip(); } catch (e3) {}
```

Fiction reasoning: `spreadGossip` is where the day's talk travels the social
lines; alien-player rumors ("Do you think they're watching right now?",
"Mara swears she met a stranger who knew things…") belong there, next to the
monster-news spread. Self-limited inside the module (post-System/wave-2
eligibility, 2-day cooldown, 40% chance), and it only names personas the player
actually knows (`ap.known`) — pre-reveal gossip stays anonymous. The existing
`apDailyTick` call is kept too; the internal cooldown makes the second call a
no-op, so no double-speak. Edit is in the gossip section, far from the
declare/audio regions (~21700–25400).

### 4. Audit of the rest — deliberately left where they are

All three already run from `apDailyTick` (via the module's `endDay` wrap, which
installs once the script tag lands). They are off-screen daily-life systems; the
daily tick is the right home, not contests/codex/gossip. Verified each by
playing it in the harness:

- `apContactedVillager` — day ≥ 20, 30% chance, roster ≥ 3. A villager is
  contacted once; fiction: they dreamed a warning, don't understand it.
- `apContactWarning` — needs an established contact; 4-day cooldown. Dream
  warnings ("north", teeth).
- `apCarePackage` — favor ≥ 20 gate, 4-day cooldown, quality scales with favor.
  Fiction: the fan club, wacky and available, not core.

No changes needed; no changes made.

### Not wired (needs files outside my scope — reported, not reached)

1. **index.html script tag** (above) — without it, none of this runs live.
2. **Encounter trigger:** `apRollEncounter()` ("called from the encounter phase")
   has no caller — alien-player encounters never spawn in the live game. Wiring
   it needs `encounters.js` (out of scope) or a debug scenario in
   `debug-scenarios.js` (out of scope). The gating (post-System, wave 2+, safe
   tiles, separate roll) is already in the module; it just needs one call site.
3. **Codex UI aliens section** in `app.js` `codexScreen` (above).

## Proof

`scripts/test-alien-players-integration-20261008.js` — seeded node harness
(mulberry32, SEED env override, default 20261008); full script list in
index.html order + alienPlayers.js after contests.js, minus DOM-only files and
drama.js; `global.window` stub for eval, deleted before play; Math.random seeded
before eval. 54 assertions, **GREEN on seeds 20261008, 7, 99, 1234.**

- **A — contests:** favor +100 vs 0 over identical scripted rolls → 240/300 vs
  0/300 wins (the +0.08 lean lands in the verdict math). Sadistic rigging fires
  its beat ("One of the judges is smiling too widely"), bends one verdict
  (0.30 roll loses at 0.28 odds), sequence terminates. Benevolent lifeline
  converts a scripted player death roll into a loss ("the killing blow...
  misses"), player survives; control (no lifeline) dies on the same roll.
- **B — codex:** `apOnCombatEnd` writes `state.codex.aliens.vex_marlowe`
  (`encountered`); reveal → `identified` with species/disposition; 3rd encounter
  auto-reveals ("you recognized the fighting style"); 5 encounters →
  `understood`.
- **C — gossip:** alien-player rumor surfaces via direct call and via
  `Game.spreadGossip()` (the game.js wiring); cooldown prevents double-speak;
  `apDailyTick` runs clean.
- **D — knowledge gating:** pre-reveal codex entry, combat intro, and fighter
  card scanned for 12 alien-truth words (species, titles, dispositions,
  "wearing a human suit", "wasn't human") — zero leaks. Fighter is "Stranger",
  kind `hostile` (a person), not `monster`.

Ontology validator: 46/46 systems valid after the change ("Release permitted").

## Commits

`alien players: wire contest/codex/gossip integration (Steve 2026-10-08)` via
`bash scripts/safe-commit.sh` — files: `src/js/contests.js`,
`src/js/alienPlayers.js`, `src/js/game.js`,
`scripts/test-alien-players-integration-20261008.js`, plus this report.
Worktree left clean (`git status --short` empty).
