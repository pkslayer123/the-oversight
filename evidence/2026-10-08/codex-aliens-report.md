# Codex ALIENS section — worker report (2026-10-08)

Worker: codex-aliens. Worktree: ~/workspace/worktrees/codex-aliens.

## What was built

The ALIENS codex section was written by apCodexEntry but never rendered. It now renders in `codexScreen` (src/js/app.js):

- New helper `codexAliensSection(aliens)` defined just above `codexScreen`. Returns `''` when there are no alien entries — the section appears only once the player has met an alien player (knowledge gating: if you don't know, it doesn't show).
- Mirrors the BEASTS section pattern: stage labels encountered / identified / understood, per-entry cards.
- **No knowledge leaks by construction**: the renderer prints `entry.title/species/disposition/note` verbatim and never consults `apPersona`. The gate lives in `alienPlayers.js apCodexEntry` (pre-reveal: title 'stranger', species/disposition 'unknown', suspicion-only note). Pre-reveal the species/disposition line is omitted entirely when the value is the gated placeholder.

## Proof

`scripts/test-codex-aliens-20261008.js` — node harness (mulberry32 seeded BEFORE eval, window stubbed for eval then deleted, full production script list minus DOM-only modules). Extracts the SHIPPED `codexAliensSection` from app.js source and evals it, so the test exercises the real template.

26/26 checks green on seeds 7 and 99:
- empty map → empty section; section appears after first forced `apOnCombatEnd` encounter
- pre-reveal: title 'stranger', species/disposition 'unknown', stage 'encountered', suspicion note shown; real title ('Trophy Hunter, Third Dynasty') and species ('Vexari') confirmed absent from rendered HTML
- 3rd encounter auto-reveals → stage 'identified', truth renders
- 5th encounter → stage 'understood', motivation renders
- `codexScreen` wires the section in
- dead-ref checks (below)

## Cleanup sweep (retired monster ids in app.js)

Verified each flagged item; removed only what was actually dead:

**Removed (dead):**
- `pepBurst` telegraph bucket — hype_horn retired, no monster in monsters.json carries `burstStyle: 'pep'` (verified: only detonation/exposure/flash/resonant/swarm exist). Removed the bucket set, the `pep: 'pepBurst'` STYLE_BUCKETS entry, the grid render branch, and the glyph comment. Left a removal-record comment. **Note: `main.css` `.cell.pepBurst` rule is now orphaned** — CSS was out of scope for this worker (touch-list limited to app.js); a future pass can drop it.
- The `camera_swarm ? ' w2aSwarm'` class mapping — already gone; verified absent.
- The `delegate_beast` charge-routing — already gone; verified absent (only removal-record comments remain).

**Kept (verified live via call-site grep):**
- `serviceRush()` synth + hook — game.js fires `audioEvent('serviceRush')` at two rush-resolve sites. Live.
- `holdMusic()` — fired by contests.js (5 beats) and game.js (4 sites). Live.
- `hypeInflate()` — fired by contests.js (3 beats) and game.js. Live.
- Remaining comment mentions of retired ids are attached to live code or are removal records — left alone.

## Verification

- `node --check src/js/app.js` — OK
- `node scripts/validate-ontology.js` — all 46 systems validated
- Worktree `git status` clean after commit (coordinator to verify on landing)
