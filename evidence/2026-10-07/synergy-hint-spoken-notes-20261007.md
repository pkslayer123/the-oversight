# Brawler honesty bundle — dm.hint spoken, unleash_rage honesty, one_person_army steepness

Date: 2026-10-07 (Steve 2026-10-05). Worker task: 3 items.

## What was done

**Item 1 — dm.hint spoken in-log (FIX, patch).** `Game.synergyTease`
(src/js/game.js) at attempt 2 with `dm.hint` previously spoke tease2 + the
shimmer line ("Something wants to happen... (2/3)") but never the literal
hint — the wording lived only in app.js's pack panel (`renderSynergyStirrings`).
Per the design doctrine ("attempts 1–2 reliably hint at what's possible
without saying how"), the n===2 branch now speaks `dm.hint` verbatim after
the shimmer line. The existing `seenKey` (`syn.id + '_teased_' + n`) already
prevents re-speak spam. 5 added lines, no behavior change for hintless
synergies or attempt 1.

**Item 2 — unleash_rage description/flavor honesty (FIX, patch).** The
`rage` block in src/data/abilities.json still promised "+100% damage, but
you attack the nearest thing (friend or foe)" with flavor joking about
hitting a friend — no friendly-fire targeting exists in the engine (sibling
commit 0e3e41c already removed the `frenzy` flag and made the impl say-text
honest). Spliced two strings only (escaped `\uXXXX` style preserved,
em dash as `\u2014`):
- description → "+100% damage for 3 rounds. The red comes down — hold on."
- flavor → "ANGRY! SO ANGRY! Three rounds of pure red! Hit the thing! THE THING! (You know the one. The one trying to kill you.)"
Red-rage voice kept; false targeting promise dropped. Matches the real impl
(`rageActive = { rounds: 3, dmgMult: 2.0 }`, "The red comes down. +100%
damage for 3 rounds.").

**Item 3 — one_person_army unlock steepness (REPORT ONLY, no changes).**
See §3 below.

## Proof

- Patch: `/tmp/patch-dmhint.patch` (unified diff, `patch -p1` clean).
- Script: `scripts/test-synergy-hint-spoken-20261007.js` (new file in worktree).
- Harness: seeded node (mulberry32, SEED env), full production module list
  (index.html order minus app.js/sprites.js/tile-scenes.js/move-anim.js/drama.js),
  window+document stubbed for eval then deleted, real `Game.init()` + real
  synergy data (`unstoppable`).
- Run against patched extract: **26/26 green on seeds 1, 2, 3, 7.**
- Negative control (same script vs pristine extract): 6 expected failures —
  attempt-2 doesn't speak the hint; old "nearest thing (friend or foe)" /
  hit-a-friend text present. The test detects both bugs.

## §3 — one_person_army steepness (report only)

`one_person_army` requires trade_of_blows + unbreakable + haymaker **all at
level 3** (minLevel 3 on the 3-leg requires_any path; wiring worker verified).

Measured at HEAD (real engine, `gainAbilityXP` thresholds: L1→L2 = 10 uses,
L2→L3 = 25 uses, overflow lost on level-up — 35 XP per leg):

- **Combat uses grant ZERO XP.** Enumerated every `gainAbilityXP` call site
  in src/js: diplomat (talk), tracker (hunt), camp_cook (cook), generous
  (donate ≥200 kcal), scrounger (scavenge), green_thumb (forage), and
  progression.js `channelSentiment` (dynamic a.id). No combat ability action
  — open_trade, brace, haymaker windup, unleash_rage, anything — grants XP.
  Behavioral check: `noteAbilityUse` (the path `useAbility` takes) leaves
  all three legs at 0 XP. So the answer to "how many fights" is **infinite**:
  brawling itself never deepens brawler abilities.
- **The only engine path is `channelSentiment`** (progression.js): +2 XP/day
  to *every* sub-L3 ability at once — requires a keepsake item, the
  sentimentTaught flag, trauma < 8, once per item per day.
- Simulated with the real `gainAbilityXP` (day-by-day loop until all three
  legs hit L3): **18 daily channels** with a base keepsake (+2/day),
  **13** with a chosen keepsake (+3/day), **10** with a wedding_ring (+4/day).

**Feel judgment (for Steve's call):** this isn't steepness, it's a
disconnect — the brawler pinnacle doesn't reward brawling. Worse, it's
inverted: `channelSentiment` with trauma ≥ 8 diverts to soothing (no XP),
and brawling *generates* trauma. The intended fantasy (fight → deepen →
become a one-person army) is unreachable through play; the actual gate is
"18+ days of grief-keepsake channeling while staying under 8 trauma." If
combat uses granted 1 XP each (the natural design), it'd be 35 uses/leg =
105 combined uses ≈ 21–35 fights of dedicated brawling — a real pinnacle
grind. No changes made; the call is Steve's.

## Tree-safety

- Specified base was 253a3bf; HEAD moved to d832bea mid-run (sibling audio
  commit 4258412 + version bump). Both patched regions verified
  byte-identical between the two commits; patch regenerated vs d832bea.
- No src/ files touched in the worktree (edits applied to /tmp extracts
  only). Shared index untouched (sibling has game.js staged — left alone).
  Stash stack untouched. Nothing committed, nothing pushed.
- New worktree files: `scripts/test-synergy-hint-spoken-20261007.js`,
  `evidence/2026-10-07/synergy-hint-spoken-notes-20261007.md`.
- Patch to land: `/tmp/patch-dmhint.patch`.
