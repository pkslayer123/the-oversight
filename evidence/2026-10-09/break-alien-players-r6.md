# Break-it: alien players — r6 (2026-10-09)

Target index 7. Attacked `src/js/alienPlayers.js` (2492 lines, 68 exported methods).
Proof: `scripts/test-alien-breakit-20261009.js` — 75 checks × 3 seeds, all green post-fix
(full production script list, seeded RNG pre-eval, window stub deleted before play).

**Canon note:** no ALIEN-PLAYERS.md exists in docs/ — nothing invented; worked from the
@ontology header (Steve 2026-10-07: they impersonate HUMANS, not monsters; exclusive
pool, separate from monsters) plus CANON.md / MONSTER-WAVES.md / DIRECTIVES.md.

## Catches (2), both fixed + proven red→green

**D — SOFTLOCK/PHANTOM: `apStartEncounter` outer catch left a phantom `state.alienEncounter`.**
The two inner failure paths clear the encounter state, but the outer `catch (e) { return false; }`
didn't. Any throw between the state write and the guarded paths (combat intro, beam readout,
`startAlienCombat` itself) left a phantom encounter behind. The next *unrelated* `tbEnd` then
read it as a real fight's persona and recorded a phantom encounter: favor gain, met-count
increment, armor strip, codex entry — for combat that never began. Fix: `delete
this.state.alienEncounter` in the outer catch. Proof: monkeypatched `startAlienCombat` to
throw — before: `state.alienEncounter` left set; after: cleared.

**E — HONESTY/canon: playground raid's "trust sabotage" wrote `v.trust[target] -= 15` directly.**
An off-screen gossip campaign bypassing the entire social resolver — violates CANON.md's
Trust≠rep rule (break-it 2026-10-09): gossip/rumors move REP only, never trust.
Fix: the raid now seeds a real rumor —
`seedGossip('alien_smear', {honest:-8, generous:-5, who: player}, [target], true)` —
the village's *opinion* sours and spreads through the gossip system; trust untouched.
The social damage is real; it just lands where talk lands. Proof: before, trust 40→25 with
no gossip seeded; after, trust 40→40 and a rumor is seeded.

## Held — real attacks that resisted

- **Dead code:** module loaded in index.html; all 68 ontology methods exist. Call sites
  verified with runtime spies on the dynamic `this.apX` lookups (string-matching fails —
  tbEnd/endDay are multi-wrapped by justice/party/betrayal/ledger). Every method has ≥1
  internal or external caller — zero truly dead methods. The 2026-10-08 disasters (unwired
  group chain, unloaded module) are confirmed fixed.
- **Favor farming:** clamps ±100, drifts 1/day toward 0; sporting rules (2-day/persona,
  14-day group cooldown, 8%/15% encounter rates) bound wins. No infinite loop.
- **Drop/package farming:** dead-drop 3-day gate and care-package 4-day + favor≥20 gates
  hold under forced-always-succeed RNG.
- **Beam honesty:** damage scales on the player's maxHp (target is always the player —
  consistent); the 0.7^n resist math matches the copy; all 5 salvage armor pieces carry
  `beamResist:true` in items.json; stasis covers the only legitimate mid-combat flee path
  (`tbBarrierExit`, per game.js).
- **Sibling sweep:** `apStartGroupEncounter` clears `alienGroup` on failure (clean); no
  other direct trust writes in the module; `apPlaygroundBurn` refuses Haven tiles
  (unbreakable-havens rule holds); village gossip/feed/contact-warning are knowledge-gated
  and make no false mechanical promises; `trackedBy` persisting is fictionally consistent
  (personas resleeve — "death is an inconvenience"); progression capped at level 5 and
  gated on real encounters (the phantom fix closed the inflation vector).

## Landing

- Commit `ffe8905` (rebased; worktree's own safe-commit.sh, `git show --stat` verified).
- **Mid-run sibling landing:** oversight-idle-village landed `59e3724` on master while the
  worker ran → non-fast-forward. Zero file overlap (sibling: game.js villageLives wiring +
  sim harness; worker: alienPlayers.js + test script). Resolved with a clean rebase, proof
  test re-run green on the new base, ontology 50/50 — no conflict, no forcing.
- Version bump `ffe8905-20261009-130928`; live verified on BOTH
  raw.githubusercontent.com/steve-vitale/the-oversight/master/version.json and
  https://the-oversight.vercel.app/version.json (github raw cache lagged ~2 min, then agreed).
- Worktree `break-alien` released (merged), removed, branch deleted. Main tree clean.
- Next target index: 8 (audio).
