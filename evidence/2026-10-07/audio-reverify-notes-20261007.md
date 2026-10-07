# Audio wiring re-verification at HEAD (2026-10-07)

Re-verified the 2026-10-07 audio-hooks audit backlog against pristine HEAD
(934169e) after sibling fix commits 64bc952 and 583b4f6. Method: proof script
`scripts/test-audio-hooks-static-20261007.js` (restored byte-identical from
4f1d164) run with HEAD_EXTRACT pointing at a read-only `git archive HEAD`
extract — never the dirty worktree.

## Proof result

- call sites (incl. data-driven): 368
- defined voices (Game.audio registry): 209 (was 203 — the 6 new synths)
- **fired-but-undefined: 0 (0 unexpected)** — no NEW gaps
- defined-never-fired: 17 (same list as the audit backlog)
- monsters on deerAggro fallback: 7 (same as audit)
- **Proof exit: FAIL (6)** — all 6 KNOWN_GAPS entries no longer fire-or-are-now-defined.
  This is the EXPECTED failure mode: the 6 old gaps are resolved, but the script's
  KNOWN_GAPS backlog was never updated by the fixing commits. A follow-up should
  zero out KNOWN_GAPS (or mark them resolved) so the proof is green again.

## Per-finding verdicts

| # | Finding | Verdict | Evidence |
|---|---------|---------|----------|
| a | 4 monster voices (kiteUnfold, nevermoreUnfold, nightcourtTurn, nightcourtDive) | **FIXED** | Defined in app.js registry 9540–9543 with synths at 8548–8658; data declares match (statickite/nevermore aggroAudio, nightcourt aggroAudio+declareAudio in monsters.json); dispatch via game.js 20210/20248/24536–24537/24572–24573; proof fired-but-undefined = 0 |
| b | statusApplied/statusCured synths | **FIXED** | Fired at statusEffects.js:167 / :257; defined app.js 9544–9545 with (data) param |
| c | Drama.audioFor dead code (game.js:14421-31 / now 14458-14464) | **STILL BROKEN** | Block still calls `D.audioFor(kind, args[0])` at game.js:14462; Drama.audioFor does NOT exist (proof: MISSING); try/catch swallows the TypeError. Neither removed nor implemented. Comment claiming "map to null in D.audioFor" describes a mapping table that doesn't exist |
| d | hummice aggroAudio | **STILL BROKEN** | monsters.json hummice has NO aggroAudio/declareAudio; proof still lists hummice among the 7 deerAggro-fallback monsters |
| e | antlerThrash double-run | **STILL BROKEN** | gallowdeer has `preTurnHooks: ["antlerThrash"]` (monsterBehaviors.json). On a non-firing turn: game.js:21298 mbRunPreTurn dispatches the hook → tbAntlerThrash (run #1, monsterBehaviors.js:43); hook returns false → falls through to game.js:21303 `if (isDeer && m.beamPhase !== 'firing')` → `this.tbAntlerThrash(m)` (run #2). Two runs per turn, same as the original bug |
| f | hushwolf/turtle knownCue carriers | **FIXED** | hushwolf: game.js:17334-17338 appends data knownCue ("They go quiet before the rush…") when codex-known; turtle (speedbump_turtle): game.js:24349-24354 appends data knownCue ("It's slow but the snap is fast. Don't stand in front of it.") when learned |

## Still-open backlog (unchanged, accounted for in audit note)

- 7 deerAggro-fallback monsters (gallowdeer, mirrormoth, lockpick_raccoon, hummice, nightlight_catfish, glasswing, sunbasker) — unchanged
- 17 defined-never-fired voices — unchanged list, includes the wound* trio

## NEW gaps found this re-verify (were not in the original audit)

1. **wound* wiring comment is false at HEAD** (app.js:1767–1768 claims
   "wired: encounters.js fires on wound-state shifts" for
   woundEnraged/woundCunning/woundDesperate) — zero references to those
   voices in encounters.js or anywhere outside app.js. The voices remain
   defined-never-fired; the comment should be corrected or the wiring added.
2. **Drama E1 comment doubly stale** (game.js:14455–14460): lists
   "enrage->wound*" as a mapping in D.audioFor — neither D.audioFor nor any
   wound* firing exists. When (c) is fixed, this comment must be rewritten
   to match reality.
3. **KNOWN_GAPS in the proof script is stale** — the 6 entries are all
   resolved; the script now exits 1 on every run until the backlog is
   updated. Next worker: empty KNOWN_GAPS (keep the structure) and re-run
   to confirm green.
4. gwDive is NOT dead code (sibling claim "removal of dead gwDive"): 
   game.js:12913 gwDiveShadow + game.js:22926 + app.js grid overlay
   12628–12687 are live glasswing-dive visuals. Only Drama.audioFor was
   actually dead.

## Restored artifacts

- scripts/test-audio-hooks-static-20261007.js — byte-identical to 4f1d164 blob
- evidence/2026-10-07/audio-hooks-audit-20261007.md — byte-identical to 4f1d164 blob
  (both had been deleted by cda7946 stale-tree damage)

Scoreboard: 3 of 6 sibling fix claims landed at HEAD (a, b, f); 3 did not (c, d, e).
