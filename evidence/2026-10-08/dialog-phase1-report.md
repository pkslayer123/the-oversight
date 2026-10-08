# Dialog Rethink Phase 1 — Implementation Report
**Date:** 2026-10-08 | **Branch:** `dialog-fix` | **Steering:** Steve 2026-10-08 ("Continue")

## What was built (9 items)

### 1. One menu builder
- Deleted stale `convoChoices` in game.js (~2192), dead `dialogueResponses` in convo-dialogue.js, dead `dialogueBeatKind` overrides, and the load-order override chain.
- `Game.buildMenu(vid)` is now the single builder. `convoChoices(vid)` is a thin wrapper (additive wrappers in betrayal.js/party-formal.js/truth.js unaffected).
- Beat-matrix dispatch (`beatMenuResponses`) is now an explicit call inside the pipeline, not a load-order override.
- All focused branches (pendingQ, trade, hawker, rumor, choosingSubject, nonverbal, final) go through `finalizeMenu`.

### 2. Honest opt-out, revised per Steve's corrections
- Honesty always AVAILABLE: every bespoke question guarantees "I'd rather not say."
- "I'd rather not say" = low-consequence boundary, gracefully received (no trust cost, no mood cool, warm react: "Understood. A quiet beat that isn't awkward — just room.").
- Honest-hard answers ("I don't trust you"-style, `temper: 'honest-hard'`) DO move the relationship: default -1 trust, -1 mood, marks escalation. Data can override with explicit `trust`/`mood` fields.
- Lying stays available (deflect_q), cheap now / expensive socially.

### 3. Deflect→engaged fixed
- `convoResolveWant` now respects an already-set `want.resolution`. Deflecting sets `resolution='deflected'`, stage=3 — it can never become 'engaged'.
- Wired the dead `HURT_KINDS: 'deflected'` slot: `dlg:cant` writes a `deflected` memory entry.

### 4. Dead seeds
- `repay` gets a real want def (seed-driven only, `pick()` returns 0 — debts surface only when owed).
- `closeness` cut: the closeness from an engaged `curious` lives in the trust the engagement built; no fake seed.

### 5. Want↔mood wired
- `dlg:cant` (refusing a favor): cools mood -1 AND writes `deflected` memory.
- Seed-driven conversations open one mood band cooler (unfinished business has weight).

### 6. Count-bypasses killed
- `convoVoiceTier`: trust + `relDays` (was trust OR convo count).
- `t2gate`: trust + `relDays` (was trust OR count).
- buildMenu depth gates (`pastOpen`, `goalOpen`, `gossipOpen`, `theorizeOpen`, `compare_maps`, `observe`): trust-tier OR relationship age, never convo count.
- `c.firstDay` set on first conversation; `relDays(vid)` helper added.

### 7. "..." everywhere
- `finalizeMenu` ensures `silence` ("...") on every menu via existing `convoMoodSilence` machinery. One generic react per mood, no bespoke branches.

### 8. Disposition filter (Principle 4)
- `playerDisposition()`: -3 (cruel) to +3 (kind). Baseline from temperament (warm/gentle=+2, cautious=+1, prickly/intense=-1, else 0). Shifts ±0.5 on kind/cruel picks.
- `temper` tags: kind/neutral/cruel/honest-hard. Engine tags its choices (deflect_q='cruel', honest_pass='neutral', etc.). Data answers default 'neutral'.
- `finalizeMenu`: stable reorder by disposition match (content only; leave/goon/subject pinned).
- Room-fit (Principle 5): cruel options suppressed vs close friends (trust 35+) unless `escalated`. deflect_q always available (the legible rude dodge).
- Out-of-character costs more: `dispositionCostMult` doubles negative deltas on mismatched picks. `markEscalated` lifts suppression in-scene.

### 9. Strangers get small talk (Principle 12)
- `finalizeMenu`: tier 'new' filters out `confront:` and `dlg:doubt`.
- `convoSelectWant`: strangers only get `share_news`/`just_company` (deep wants gated).

## Proof
- `scripts/test-dialog-phase1-20261008.js`: 56 asserts, 3 seeds (20261008, 424242, 777) — all green.
- `scripts/play-dialog-phase1-20261008.js`: 5 scenarios played, transcripts read as human (see below).

## Play verdict
Reads like a person, not a spreadsheet. The opt-out lands gracefully ("Understood. A quiet beat that isn't awkward — just room."). Deflecting has a real, legible cost ("Okay. Something shutters, just slightly." + trust -1). Stranger menus are appropriately shallow. Seed openers acknowledge history with a cooler mood.

## Wording choices (ambiguous)
- honest_pass react: "Understood. A quiet beat that isn't awkward — just room." (graceful, not effusive)
- deflect_q react: kept "Okay. Something shutters, just slightly." (already good)
- repay opener: "I've been thinking about what you did for me. I don't like owing." (direct, human)
- Seed cooler: silent -1 mood shift, no extra text (the opener line carries it)

## Deliberately left out
- **Phase 2** (Scene unification, consequence resolver) and **Phase 3** (character-driven questions): out of scope per task.
- **Data temper tagging**: only engine choices tagged; 100+ data answers default 'neutral'. Future content loops should tag kind/cruel/honest-hard answers.
- **Disposition reorder**: implemented but subtle (menus are short); the cost multiplier and room-fit are the load-bearing parts.
- **`ask:fears` at trust 40**: t2 `minTrust: 25` — working as designed (trust-tier gating, not count).

## Commits (branch dialog-fix, NOT merged)
- ca8ea29: deflect fix, repay want, closeness cut, dlg:cant mood+memory, seed cooler
- 5a64f74: one menu builder, dead layers deleted, disposition foundation
- 1ce5b34: count-bypasses killed, stranger gating, firstDay
- f629ec5: proof test (56x3 green)
- a5dcaaf: play-pass script
