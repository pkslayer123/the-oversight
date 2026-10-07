# The Moderator — escalation played pass (2026-10-07)

Worker B, flesh-out loop. Played AS A PLAYER through a node harness
(`scripts/play-feel-20261007-moderator.js`, 49 assertions, green on seeds
20261007 and 777). Engine loaded from HEAD via `git show` (hot-tree safe).
Seeded mulberry32, deterministic. All HP/position shortcuts disclosed in-run.

## Verdict: PASS — a different LEAGUE, not a reskin

Wave 1 (Highbeam Deer) asks: **read the freeze, leave the lane** — positional.
Wave 2 (The Moderator) asks: **manage your own habits** (the mute chases your
most-used verb), **manage space** (the suppression field), **manage obedience**
(comply and Notices graze 8–12; defy and every violation stacks +3), and
**respect a new phase economy** (shadowban widens the field 2→3, the ground
itself rejects you for 2, Deplatform telegraphs a full round out). The wave-1
answer — dodge the telegraph — fails *by design*: Notices are unavoidable
direct ("Removal Notice finds you — no dodging it"). New verbs, new demands.

## What I played (blind first contact, then codex-known rematch)

**Observing (rounds 1–3).** `"CONTENT UNDER REVIEW." It draws a circle on the
dirt — purple, the color of a bruise. It is reading everything you have ever
done.` Weak ranging chips (10, 9 — in the 6–10 band), unavoidable. The field
draws visibly on the grid (20 tiles at r=2 around its position). It felt like
being sized up, not attacked — good dread.

**Muting (round 4+).** It muted MOVE first (I'd walked twice), then STRIKE once
I started swinging — the flip game works live. The announcement on first
contact used the KNOWN coaching because the pattern was learned on the first
Notice resolve: `"🔇 STRIKE MUTED inside the suppression field. (It mutes what
you lean on — vary your verbs, or step out of the purple. Comply with the mute
and its Notices GRAZE; defy it and every violation hits +3 harder.)"` Generous
for first contact, but it is exactly the codex-gating design (coaching after
the pattern is learned).

**The violation.** Deliberately swung with STRIKE muted inside the field:
`"🚫 STRIKE IS MUTED inside the suppression field. Your swing dies in your
hands — flagged as a violation. (PRIOR VIOLATIONS: 1 — its Notices hit +3
harder. Step OUT of the purple field, or vary your verbs to flip the mute.)"`
Turn spent, flagged, defiant. The coaching is honest.

**The field escape.** Stepped out; the muted verb was no longer a violation.
BUT: field radius 2 == spear range 2, so from outside a spear **cannot reach**
the moderator ("can't reach that far"). "Step out" unblocks the verb but only
converts to damage with a ranged weapon — melee must re-enter and play the
flip/lift game. Geometry, not a bug, but Steve should know the "step out"
advice is half an answer for melee.

**The flip.** Flooded 5 MOVEs → mute chased to MOVE. Then the trap: with MOVE
muted, stepping INTO the field is legal, but walking out is the violation —
and the text coaches it truly: `"You cannot walk out while MOVE is muted —
STRIKE or WAIT to flip the mute, then move."` (No lie. Good.)

**The lift.** Five real `tbPlayerWait`s → `"The hammer hovers — then lowers.
It lost the thread. The mute LIFTS. (Quiet works. Vary your verbs and it keeps
losing you.)"` Silence as a verb the algorithm cannot moderate — the
Undertale-ish trick, and it works. (Harness lesson: a bare endTurn does NOT
note 'wait' — only the real Wait action slides the window. My first pass
falsely "failed" the lift because of this.)

**Compliance vs defiance.** Obeyed the mute: Notice declared [14,18]
(8–12+6 at 2 violations — the graze). Defied it: [21,27] (12–18+9 at 3
violations — full, stacked). The economy is legible and the numbers prove it.

**Shadowban (half HP).** `"SHADOWBAN." The air tastes like a dead channel.`
Field widened 20→35 tiles (r=3), black-edged. Stepping on it: `"The
shadowbanned ground rejects you. (2) The black field is the tell — get out of
it."` Deplatform: `"DEPLATFORMED." The hammer rises — lighter than it could.
Compliance buys inches, not mercy. (It falls next round.)` — windup=2,
declared R37, landed R39 for 23 (in the 14–18+9 compliant band). A real tell,
not a gotcha. The hardest single hit in the game, survivable when obeyed.

**The kill.** Won via the flip game (flood moves → 3 free strikes), not
attrition. Death: `"The hovering shape... falls. It is a machine. Do not eat
the machine. It would flag you for it. ✨ ALIEN LOOT: Fusion cell."`
modDown audio fired. Loot-as-action on the body.

**Codex-known rematch.** With the pattern slain, `encTelegraphKnown` true, the
knownCue coached the full counterplay. Gating works.

**Loot economy (200 seeded rolls).** Moderator: 34–35/200 (~0.17), always tier
4 — high risk, high reward, not raining. Bulldozer (wave-1 base): tier ≤ 2.
Veteran bulldozer post-wave-2-unlock: tier ≤ 3, never 4. The wave-2 loot rule
holds exactly.

**Audio.** modNotice, modNoted, modMute (+:lift), modViolation, modRemoval
(+:final for Deplatform), modShadow, modDown — all fire.

## Wave-1 benchmark (Highbeam Deer, same harness)

Played with real dodge reactions (sidestep the freeze, 3-tile slides during
the beam). Findings: the freeze telegraph reads great; the beam's DWELL
multiplier (2.5–3.5× on 22–32 → ticks of 77–112, "it SITS on you") melted a
500-HP player who dodged every round — result: **lost**. The deer is fearsome
(its stats are not questioned — it is the benchmark), and it makes the
Moderator's unavoidability feel like a deliberate escalation rather than
cheapness: wave 1 punishes your feet, wave 2 punishes your habits.

## Flagged for Steve (not fixed — engine off-limits)

1. **Dead content?** The UNKNOWN mute text (`"STRIKE — REMOVED FOR VIOLATING
   COMMUNITY STANDARDS"`) appears unreachable in normal play: the first
   Notice always resolves (unavoidable) before muting starts, so the pattern
   is always learned first. First contact always gets the full coaching.
   Intended generosity or vestigial branch — Steve's call.
2. **Melee geometry** (above): field r=2 == spear range. "Step out of the
   field" needs a ranged weapon to become damage. Consider whether the
   weakness text should hint this.
3. **Declare cue text is grid-only by design** (`sayTelegraphOnce`: "The visual
   telegraph on the grid is the warning") — verified, not a bug, but it means
   the "distinct telegraph text" bar for the Moderator lives in phase
   announcements + resolve/coaching text, not per-attack declares.
4. **Darkness counter unimplemented?** Weaknesses list "darkness — it cannot
   moderate what it cannot see" and there's a fearful cue for it, but no
   combat mechanic keys off darkness that I could find (fear field only drives
   the pre-combat stance cue). The advertised counter doesn't bite.

## Harness notes (for future workers)

- `scripts/play-feel-20261007-moderator.js` — 49 assertions, exit non-zero on
  failure, green on seeds 20261007 and 777. Run: `node scripts/play-feel-20261007-moderator.js [SEED=…]`.
- Turn hygiene: after the policy, end the turn ONLY if the round did not
  advance during the policy (compare `Game.tbfight.round` before/after) —
  strikes/violations/tbPlayerWait advance internally; a blind endTurn double-
  advances and runs the monster at 2× speed. This bug cost two full debug
  cycles (phantom HP drain, scrambled Notice pairing).
- `expectDefiant` must be set BEFORE the violating strike — the strike's
  internal `tbAfterPlayerAction` runs the monster turn synchronously.
- `Game.tbPlayerWait()` is the only wait that notes 'wait' (slides the mute
  window). Bare endTurn waits never lift the mute.
- `tbEnd` nulls `tbfight`; wrap it to capture the result.
