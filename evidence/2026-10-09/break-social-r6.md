# Break-it: social systems (r6, 2026-10-09)

Hostile run against social systems, fresh ground only (r5 covered deal/appeal,
trust bands, exile fork, bribery, gossip dedupe, names, moot guards).
Four proof scripts: scripts/test-social-r6-rumor-farm.js,
test-social-r6-whogossip.js, test-social-r6-edge.js, test-social-r6-wiring.js.

## KILL 1 — generous-rumor trust farm (EXPLOIT)
`spreadRumor` seeded who-gossip with `noTrust: false`. Every gossip hop ran
`applyRep(subject, {generous:+N}, 0.4, false)` — the applyRep trust-drift paid
the SUBJECT trust-of-player ~+2/hop (progressive), PLUS an unscaled 40% ripple
to their whole group. Distortion (>=2 hops) amplified dims x1.6. The player
could re-spread the same rumor every daypart (partKey dedupe is per-daypart).
The "caught lying" trace (-2 trust, -3 honest, 15%/hop) was a joke against it.
Measured BEFORE (3 seeds): target trust 10 -> 52/51/65 (+41..+55), village-wide
+61..+90 trust, from 2 days of free words.
Fix: rumors move REP, not TRUST. `noTrust: true` on the spreadRumor seed, and
structurally in `spreadGossip`: `applyRep(..., g.noTrust || !!dims.who)`.
After: target delta <= 0 (only the trace punishment moves it, negative), village
delta <= 0; generous rep still lands (84-100, capped) — the mechanic survives.
Proof: 4/4 x 3 seeds.

## KILL 2 — who-gossip trust BLEED (same bug class, sibling sweep)
`mootAccuserAftermath` seeds 'moot_weak_case' gossip with `dims.who=accuser`
and NO noTrust flag. Every hop paid the accuser's trust-of-player -4 (penalties
land whole) + 40% group ripple — third-party talk ABOUT someone moved their
trust OF the player. Measured BEFORE: accuser 40 -> 14/15 (-25..-26), village
-37..-50, from ONE acquittal's gossip. Killed by the same structural fix
(dims.who => noTrust). After: delta 0, rep still lands (honest -18..-20).
Proof: 3/3 x 3 seeds.

## KILL 3 — phantom talk (SOFTLOCK-adjacent)
`removeVillager` drops the roster but leaves `rosterChars`, so `vpOf` still
resolved exiled/dead villagers and `startConvo` opened FULL conversations with
ghosts — talk, teach, trade with people who were gone. Measured: startConvo
returned a live convo for exiled AND dead villagers, 3/3 seeds.
Fix: roster guard at the startConvo funnel ("{name} isn't here anymore.").
Sibling sweep, same class: `giveFood`/`comfort` (carexplore.js overrides)
resolved killed records from data.villagers (dead=true but present) — same
roster guard added. Grid/UI were already roster-filtered (npcsOnNode).
Proof: 8/8 x 3 seeds (edge script).

## KILL 4 — absentia weregild drains an exiled player's pack (EDGE)
An open player case + exile via a non-moot path: `playerCaseTick` fires the
moot anyway; a weregild sentence silently deducted 3000 kcal from a pack
walking the wilds (no line, no collector — the sentence is spoken to an empty
fire). Measured BEFORE: exiled player 9000 -> 6000. Fix: weregild transfers
only when the accused player is present (not exiled); NPC-accused path
unchanged. After: 9000 -> 9000 exiled, 9000 -> 6000 present. Proof: 3/3 seeds.

## HONESTY — founding hint now states the hard reset
"Found your haven" hinted "Day one." — never said what day one MEANS.
Hint now: "Day one — a new fire, new faces. What you carried is what you have:
yourself, your pack, and everything you learned." The founding narration and
the exile line ("You leave with what you carry — nothing more.") were already
honest; verified, not changed.

## HELD — and why
- MOOT VOTE FARM: no player-initiated NPC accusation path exists (grep clean).
  Player votes only on NPC-vs-NPC cases from plots: one active plot max, day>=6,
  motive>=45, ~40%/day, 2 accomplices needed. Measured in a HOSTILE village
  (trust 5): 2-9 votes / 60 days, each +6 with one side and a grievance (-22/-16)
  with the other. NPC-paced, socially priced — not a farm.
- Double-vote: `castPlayerVote` requires `awaitingPlayerVote`; finishTrial sets
  terminal status (resolved/acquitted), and `callMoot` refuses non-open cases.
- 2-person moot: resolves (schism), no crash, 3/3 seeds.
- Vote after own exile: no crash; player stays exiled once.
- Talk-request queue: `expireTalkRequests` (2-day expiry) + one initiative per
  daypart — 3 requests left after 40 ignored days. Bounded.
- Cyclic gossip chains A->B->C->A: impossible per rumor (heard-set); re-seeding
  is per-daypart and moves rep only (clamped ±100). spreadGossip is iterative —
  no recursion depth risk. Rep pinning via endless re-seeding costs 4 convo
  threads/day forever for mostly-descriptive rep (talk lines, murder-dims
  weighting) — propaganda with a real price, held by design.
- Moot during contest countdown: the moot state machine (open -> trial ->
  resolved/acquitted) shares no state with the contest countdown; conductTrial
  is instant. No interaction, no softlock.
- NPC exile holding founding project: N/A — founding is player-side
  (s.founding); exilePlayer already nulls it by design.
- DEAD CODE: 267 method defs across conversation/justice/betrayal scanned for
  call sites — the 5 zero-in-src candidates all serve tests/playtests
  (memoryAidActive->test-speak-it-back.js, npcVoiceFingerprint->
  test-npc-age-voice.js, talkTo->playtest scripts, plotAwareness->
  play-feel-20261007-social.js, recentTrauma->sim-trial-frequency.js).
  Wiring proof 16/16: all four modules in index.html in eval order with valid
  @ontology headers; startConvo/justiceState/openCase->callMoot->vote all
  reachable at runtime; drama.js publishes Scattering.Drama and every emitted
  social drama type (moot, liar, vote, exile) has a handler.

## Design calls made (Steve: decide + document, he can overrule)
- Subject-targeted gossip moves REP only, never TRUST — trust of the player
  moves via direct acts, the resolver, or the caught-lying trace. Nothing else.
- Absentia moots can't collect: no payer present, no payment.

## Regressions
- test-social-r6-rumor-farm.js: 4/4 x 3 seeds
- test-social-r6-whogossip.js: 3/3 x 3 seeds
- test-social-r6-edge.js: 8/8 x 3 seeds (6/6 on one seed — the mid-case-exile
  bonus path didn't trigger awaitingPlayerVote that seed)
- test-social-r6-wiring.js: 16/16
- test-social-breakit-deal-appeal-20261009.js: 12/12
- test-social-exile-fork-20261009.js: 14/14
- test-social-breakit-r2.js: 7/7
- validate-ontology.js: 50/50, release permitted
