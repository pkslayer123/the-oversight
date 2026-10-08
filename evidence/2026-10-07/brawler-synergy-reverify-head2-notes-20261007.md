# Brawler synergy discovery — re-verify at HEAD 253a3bf (2026-10-07 22:14 CDT)

## Purpose
Re-verify the 21:28 CDT audit (which passed 84/84 at base a5e9328) at the
current HEAD, specifically because commit 6a3c79c "Add Character page" reworked
how abilities/skills/synergies DISPLAY in app.js. The question: did the
Character page rework break the pack-panel hint surfacing
(`renderSynergyStirrings`, the attempt-2 coaching line) or just move it?

## Method
- Pristine `git archive HEAD` extract (/tmp/headx). No worktree reads, no
  shared-index contact, no commits.
- Ran the proof script FROM HEAD (`scripts/test-brawler-synergy-discovery-20261007.js`)
  with REPO_ROOT=/tmp/headx, SEED=1, SEED=2, SEED=3.

## Results — 84/84 on all three seeds, 0 failures

Per-section check counts (identical across seeds):

| Section | Checks | What it covers | Result |
|---------|--------|----------------|--------|
| A. discovery_method on every brawler synergy | 36 | every brawler synergy has a discovery_method; teases/hints present | ok |
| B. leg resolution | 7 | leg ids resolve to abilities/synergies, incl. requires_any paths | ok |
| C. modifier consumption | 20 | every brawler modifier target has an engine call site | ok |
| D. discovery machinery (static) | 6 | checkSynergyDiscovery gating, synergyTease, attempt-2 hint, unlockSynergy, synergyMods activeSynergies gate, renderSynergyStirrings in app.js | ok |
| E. behavioral: play the discovery loop (seeded) | 15 | trade_of_blows attempt 1/2/3 + tease1/tease2 verbatim + unlock + x1.25 mod; unstoppable via requires_any; fear_itself/one_person_army stay unmodified undiscovered | ok |

## Section D deep check (the actual question)
`renderSynergyStirrings` — **MOVED BUT WORKING**, not broken:

- The function BODY is byte-identical between a5e9328 and HEAD
  (app.js lines 11245-11280 vs old 11242-11277 — same attempt-1 tease,
  same attempt-2 `dm.hint` line, same pips, same requirements-held check).
- The CALL SITE moved with the rework:
  - a5e9328: inside `renderInvInline` (pack panel), old line 11526.
  - HEAD 253a3bf: inside `renderCharacterInline` (new Character page),
    line 11696 — `${renderSynergyStirrings()}` next to
    renderSynergiesSection()/renderBuildIndicator().
- The Character page is reachable: new "🧬 You" button
  (`data-lm="character"`, app.js line 288) → action 'character' → 
  `characterSheet()` (app.js line 301) → `renderCharacterInline`.
  Pack ("🎒 Pack") is now items-only per the 6a3c79c commit message.
- The proof's section-D check (function exists + `n === 2 && dm.hint` in
  app.js) passes on all seeds; the manual diff confirms the hint line
  itself is untouched.

UX note (not a regression): synergy coaching now lives one tap away behind
the "You" button instead of inside Pack — arguably better placement (tease
sits next to the abilities/skills/synergies it coaches). Pack is now
purely inventory.

## Conclusion
No regression found. No src/js changes made (none warranted). The 84/84 audit
still holds at HEAD; the Character page rework relocated, but preserved, the
synergy hint surfacing.

## Full output
- /tmp/syn-full-seed1.txt (full 84-check run, seed 1; seeds 2 and 3 were
  identical in structure, all green)
- Proof script: HEAD's scripts/test-brawler-synergy-discovery-20261007.js
  (run against /tmp/headx via REPO_ROOT)
