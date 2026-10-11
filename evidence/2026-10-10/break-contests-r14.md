# Break-it: contests — round 14 (2026-10-10)

Target: the contests system (`src/js/contests.js`). Canon read first:
`docs/CANON.md`, `docs/CONTESTS.md` ("Ineligibility: the gravely wounded,
the very young/old, and anyone currently exiled"; "who can go, AND WHY",
r12). Prior rounds: r11 (cheer-trap, dead `_cxWin`/`_cxLose`, arena-death
hygiene, genRoster dead-leak), r12 (held-counter terminals, eligibility
panel off-the-board, co-winner share), r13 (ratings-dip dead signal,
`_cxChance`, dead broadcastWatching, arena-fled comment). This round went
where they didn't: the resolve-time eligibility bar, prize-grant
idempotency, countdown-skip probes, and a full pool reachability + beat
census.
Proof: `scripts/test-break-contests-r14-20261010.js` — 38 checks × 3 seeds
(424242 / 777 / 31337), all green (BEFORE: the two kills failed as
documented).

## Kills (2)

### K1 — ELIGIBILITY BYPASS at the grab: the countdown honored a weaker bar than the cast
**Attack:** eligibility is checked at three moments — cast (`fireContest`
casts from `contestEligible()`), entry, and resolve (`resolveContest`
re-runs the recast loop at dawn). The recast keep-path checked
`this.isMember(who)` — roster + alive + not severed — while
`contestEligible()` ALSO excludes the gravely wounded (hp≤20), the too
young/old, and the away-from-Haven.
**Break:** a contestant cast healthy at the countdown announcement, then
mauled overnight (hp 100→8) or gone from Haven, KEPT their slot and got
televised — the System casting someone its own rules (and its own r12
eligibility panel) list as OFF THE BOARD. Proved: gravely-wounded V stays
in `finalIds`, no recast line, no reason.
**Fix:** the keep-path re-checks the FRESH `eligible` set at resolve time —
the same bar as the cast, one source of truth. Newly-ineligible
contestants get the recast treatment (recast from the living eligible, or
the show cancelled with the System's disappointment on the record), and the
announcement says the honest r12 off-the-board reason ("gravely wounded",
"away from Haven", "dead", …) instead of hiding behind "gone". Player bar
unchanged — a battered scholar IS eligible (health>0), per
`contestEligible`'s own "The System is not kind" rule. Ontology rule
`recast_eligibility` added.
**Proof:** K1a pins the old rule (faithful model: isMember-only keeps the
wounded, panel says 'gravely wounded'); K1b wounded→recast with the reason
said out loud; K1c away-from-Haven→recast; K1d dead player at countdown→
recast to the living (no corpse televised); K1e healthy contestants keep
slots (no recast churn); K1f battered player keeps the slot; K1g nobody
left→honest cancellation.

### K2 — REWARD DUPLICATION: a re-entrant `_contestEnd` granted the prize twice
**Attack:** `_contestEnd` had no idempotency — only `_cxCountHeld` had the
`_heldCounted` guard (r12). The multi-take verdict restores
`state.activeContest` per contestant, so any dup participant or re-entrant
terminal re-runs the whole 'won' branch.
**Break:** proved — two `_contestEnd(ac,'won',true)` calls on one ac
granted the winner's share TWICE (pantry 5→6→7, two share lines). The
player path (alien-loot prize table) re-rolled and re-granted identically.
**Fix:** `ac._prizeGranted` per (ac, participant) — one grant per
contestant per contest; event records (notability, gossip, fan favor)
stay loud. The guard is keyed on `ac.participant`, which the verdict loop
mutates per contestant, so r12's co-winner parity is intact (two real
winners → two shares, K2b). Sibling, same class: `_contestResolveOthers`
resolves once per ac (`ac._othersResolved`) — no re-rolled fates, no
re-granted co-winner shares. Ontology rule `prize_idempotent` added.
**Proof:** K2a re-entrant win grants exactly once; K2b two different
winners each get their share; K2c `_contestResolveOthers` second call is
a no-op. No live path to the double-grant was found (verdict participants
are splice/takenSet-deduped), but the terminal now can't double-fire —
same defensive class as r12's `_heldCounted`.

## Held (documented, not fixed)

- **Countdown skips (all hold):** sleeping +3 days resolves the pending
  contest exactly once (pendingContest cleared, interruption lands); a
  mid-countdown save/load JSON-round-trips and resolves once; the day-14
  embargo, one-interruption-at-a-time, and 2/week budget gates all hold.
- **Pool reachability (DEAD CODE check):** all 44 pool contests are drawn
  within 8000 seeded draws at their eligible waves; wave gates honest
  (extreme never at wave 1; gauntlet/siege never below wave 3; all 6
  extreme drawable at wave 5). No dead pool entries.
- **Beat census (DEAD CODE + HONESTY):** all 44 pool ids have
  Declare/Escalate/Climax/Resolve in CX_BEAT_DEFS (audio r11's 14-contest
  backfill verified complete), and every beat declared on any playable
  phase resolves — no silent `_cxBeat` no-ops left for pool contests.
- **Playability:** every pool contest returns a non-empty phase array from
  `contestPlayable` — none falls through to `_contestGeneric`.
- **Fear honesty:** refusal is a played sequence with teeth (+5 trauma,
  showmanship notability, "NOTED… THE AUDIENCE WILL REMEMBER"); the grab
  fires "no matter what you were doing" (dawn-only, modal); bets are a
  fixed 200 kcal, once per contest, real stakes — no free-kcal angle.

## Sibling sweep
Same bug classes hunted in related systems: `isMember`-as-cast-gate
nowhere else re-checks at resolve (ledger.js `warnChallenge` is the dead
legacy scheduler, marked superseded 2026-10-08, no eligibility logic);
show terminals (`_showEnd`) are single-terminal modal flows guarded by
`phase==='done'`; the ratings-summons care package is rate-limited inside
`apCarePackage`. No second worker needed.

## Regressions
test-break-contests-r14 38/38 × 3 seeds · r11 suite 50/50 · r12 suite 34/34
· r13 suite 23/23 · ontology 62/62 validates · `node --check` clean
(contests.js). No live push — merged locally, pending ship.
