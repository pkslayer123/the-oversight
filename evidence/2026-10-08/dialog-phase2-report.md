# Dialog Rethink Phase 2 — Implementation Report
**Date:** 2026-10-08 | **Branch:** `dialog-phase2` (worktree `~/workspace/worktrees/dialog-phase2`, registered) | **Steering:** Steve 2026-10-08 ("Continue")
**Base:** 1ee7091 (current master, rebased clean — no conflicts)

## Commits (3, on top of 1ee7091)
- `d75f963` — Phase 2a: Scene module + full consequence migration + contract opt-outs + alive handler + universal t2clock + data legibility fixes
- `2d9dec6` — Phase 2b: beat-matrix contract fix, you_said/spoke_ read sites, validator data-opt-out acceptance, alive menu placement
- `153b633` — Phase 2c: ontology header citation fix + docs regen + play-pass script

## What was built (5 mission items)

### 1. Scene-state unification — `Game.getScene(vid)` (new `src/js/convo-scene.js`)
One snapshot composing want {id, stage, resolution} + mood (-3..3) + moodBand + bond {trust, tier, relDays, receptivity, memoryCount} + beat {thread, topic, pendingQ/reactiveQ/genericQ flags, heldBeats, choosingSubject, questionHangs} + disposition + escalated. Computed fresh per call, never stored, never mutated. Deterministic for same state (tested).

### 2. One consequence resolver — `Game.resolveConsequence(vid, spec)` (same module)
The single place every conversation consequence attaches. Migrated ~25 sites across `conversation.js` (convoTurn branches: ans, deflect_q, react, gq, ask, theorize, compare_maps, nv gestures, offer_help, teach, rumor, speak_back ×3, foreign reacts, agree, joke, silence, endConvo ×2) and `convo-dialogue.js` (all 8 dlg: handlers). Rules, unified:
- **Talk cap:** gains cap at 40 ("words only go so far"); real acts pass `talk:false`
- **Penalties land whole**, never softened
- **Mediation halves** positive gains (kept from trustGain)
- **Warmth follows trust** by default (no separate data)
- **Out-of-character cost mult** via dispositionCostMult
- **Memory writes** flow through it too
Behavior changes (documented, principled): dlg: trust gains now cap at 40 (were uncapped via trustGain — a repeat-comfort trust farm); reactive/generic trust now respects mediation halving. No content relied on >40 talk trust (all gates ≤40).

### 3. Label legibility pass (`src/data/characterGen.json`)
- Stripped all 21 `Deflect — ` prefixes; 20 tagged `temper:'cruel'` (the engine already treats them as cruel-temper). The 1 with `honest_opt_out:true` ("I'd rather not say.") stays neutral — it's the graceful boundary, not a dodge.
- Parenthesized 3 stage-direction labels to match the action convention: `(tell them your trade)`, `(mention someone specific)`, `(tell them something funny)`.
- Audit asserts: zero `Deflect —` prefixes, zero stage directions, all cruel answers carry their line.

### 4. Ask/Answer Contract as a validate gate — `Game.validateAskContract(vid)`
Behavioral gate: builds the actual menus for all 36 bespoke + all reactive defs + all 4 generic kinds, asserting honest answer + boundary + silence on each. **Caught a real bug:** the beat matrix was overriding reactive/generic answers (menu showed beat replies instead of the answers to the hanging question) — fixed by making the beat matrix yield when a direct question hangs. Also added the missing honest opt-outs to reactive (`react:<id>:honest_pass`) and generic (`gq:<kind>:honest_pass`) menus + graceful no-cost handlers.

### 5. Memory-driven "what's alive" menu — `Game.convoWhatsAlive(vid)`
Surfaces, most-alive-first: open threads (ledger, not current thread), fresh memories (10 labeled types, ≤7 days), want-driven questions (tier-gated, not while a question hangs), world events (lately system). Integrated to LEAD the menu (before the beat matrix). New `alive:` turn handler routes each kind: thread→resume+clear ledger, memory→specific acknowledgment line per type, want→want opener, event→lately topic. Never dead-ends.

### Bonus: universal "it's different now"
The t2clock pattern extended to bespoke questions: re-asked questions get `"You asked me that before. It's a different question now."` + (new read site) `"Last time you said [answer] — still true?"` via the `you_said` ledger.

### Telltale-theater audit
Every `remember()` write type in the conversation system now has a read site. Two orphans found and wired: `you_said` (read in the re-ask acknowledgment) and `spoke_<lang>` (read in `convoSpeakBackChoice` — repeat attempts label `(try your Italian again)`).

## Proof
- `scripts/test-dialog-phase2-20261008.js`: **35/35 × 3 seeds** (20261008, 424242, 777)
- `scripts/test-dialog-phase1-20261008.js` regression: **56/56 × 3 seeds**
- Ontology gate: **passes** (47/47 systems validated; header citation fixed pre-release)

## Play verdict
Reads like a person. Stranger menus are shallow small talk. A friend with history leads with "We never finished — their past (last time)." and "About what you brought me..." → "You didn't have to do that. I haven't forgotten." The honest boundary lands gracefully ("Fair enough. I shouldn't have pressed.") with zero trust movement. Deflecting a hard question costs trust, cools the room, shifts disposition cruel (-0.5). The scene snapshot is coherent (want/mood/band/trust/tier/thread/disposition in one object).

## Behavior changes to know about (all principled, documented above)
1. Talk-originated trust gains now uniformly cap at 40 (dlg: handlers were uncapped)
2. Reactive/generic trust gains now respect live-translate mediation halving
3. Reactive/generic questions now offer "I'd rather not say" (were missing)
4. Beat matrix yields to hanging direct questions (was overriding answers)
5. 20 data answers now carry temper:'cruel' (were untagged; the "Deflect —" prefix was the only signal)

## Not done / left out
- Phase 3 (want/memory attach conditions on the 36 questions; retiring global-pool draws) — separate mission
- Data temper tagging beyond the 20 deflect answers (remaining ~90 default neutral — future content work, as noted in Phase 1)
- The `trustGain` primitive remains for non-conversation callers (unchanged behavior)

## Landing
**Ready for coordinated landing.** Do NOT bump the version (coordinator handles release). Suggested: `git merge --ff-only dialog-phase2` in the main tree, then the standard push + version-bump + two-endpoint live check.
