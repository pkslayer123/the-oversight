# Break-it: social systems, round 10 (2026-10-10)

Target index 3 (social). Hostile-player pass, fresh ground only. Prior rounds
killed: comfort/tellSide/makeAmends/confront word-farms (r2), interpreter
farm + giveFood landmine + promise settled-block + rumor-trace dead write (r4),
deal/appeal/trust-bands/bribery (r5), generous-rumor farm + who-gossip bleed +
phantom talk + absentia weregild (r6), mediate/theft/intimidation double-pays +
truth.js/betrayal seed skims + unkeepable promises (r7), mood-residue farm (r8),
trivial-gift farm + theft→apology loop (r9).

Canon applied: docs/CANON.md (Trust ≠ reputation; "if you don't know it doesn't
show"; no silent actions), docs/CONVERSATIONS.md, docs/PARTY.md, docs/TRUTH.md,
docs/CORRUPTION.md. No dedicated SOCIAL.md exists — the six docs above cover
the area; no canon gaps found this run (the corruption "Televised" claim,
fear→contempt collapse, and cannibalism fast-track are all wired: darkShowBeat/
darkCarePackageTick, fearWeakness, charge rank 5 in forcePlayerAccusation).

Proof: scripts/test-break-social-20261010.js — 14 checks, 13 FAIL on pre-fix
code with exactly the predicted values, ALL GREEN × 3 seeds
(20261010/777/424242) post-fix.

## KILL 1 — yieldChallenge flat +10, no progressive scaling (EXPLOIT)
`Game.yieldChallenge` wrote `t[cid] = min(100, (t[cid] || 10) + 10)` — the only
trust gain in the game bypassing `trustGainProgressive`. Measured BEFORE: trust
95 → 100 in one yield (breaks the 90-100 "one point at a time" law), and a
real-0 trust resurrected to 20 via `|| 10`. Farmable: contender heat rebuilds
player-paced via delegate → leadershipFriction (40%/order for bold/prickly/
intense contenders) → challenge → yield → repeat.
Fix: `this.bumpTrust(cid, 10, 'yielded leadership challenge')` — progressive
scaling, trust.gain_mult, and 0-preservation. Yielding stays a real act (no 40
words-cap; a domain changes hands), but it scales like every other gain.
After: 95 → 96, 0 → 13 (full-rate progressive × open disposition — a real act
earning real trust from nothing, no resurrection). Proof T1/T2.

## KILL 2 — 0-resurrection sibling sweep, 4 sites (same bug class bumpTrust fixed)
The `(t[x] || N)` pattern resurrects a real-0 trust to N±n. All measured BEFORE:
- `standGround`: `(t[cid] || 10) - 5` → 0 → 5. Standing your ground against
  someone who hates you made them like you slightly.
- `leadershipFriction`: `(t[cid] || 10) - 2` → 0 → 8. Watching you give orders
  made a hater like you — a penalty that pays.
- `declineInvite` (betrayal.js): `(t[vid] || 10) - 1` → 0 → 9. Declining their
  invitation paid a hater.
- `crowdingTick` (membership.js): `(t[id] || 20) - 1` → 0 → 19. Overcrowding
  made haters like you.
Fix: bumpTrust in all four (gains progressive, penalties whole, real 0 stays
0). After: all stay 0. Proof T3/T4/T5/T11.
Extended sweep, same class: `trustAll` (abilityOnAcquire: fear_aura -10 on a
hater → 0 → 5), `mediator` ability (`|| 15` + g → 0 → 15+g), `_evTrustAll`
(`|| 15` → 0 → 5 on penalties / 15+g on gains), `conflictIncident` corner/message
beats (`|| 10` → 0 → 12). The Object.keys loops needed no default at all (key
exists); conflictIncident now uses bumpTrust. Proof T12/T13/T14. Left alone:
wake-up finder +5 (first meeting — trust genuinely unset, `|| 10` correct),
`v.trustIn` phoenix paths (properly defaulted reads), ledger.js mantle 60%
(different vid — new face, less baggage, by design), all `else`-branch
fallbacks (unreachable; convo-scene.js always loaded).

## KILL 3 — ghost challenge/heat/allies survive removeVillager (SOFTLOCK/phantom)
`removeVillager` never cleared `v.heat[vid]`, `v.challenge` (when cid was the
removed), or `v.allies` entries. Measured BEFORE: exiling a challenged
contender left `v.challenge` pointing at a ghost — `agencyLeadershipTick`
early-returns while any challenge is set (no new challenges until the ghost's
challenge aged out ~8 parts), yield/standGround spoke lines to someone who'd
walked out, and `askSupport` rallied support against the exiled contender's
stale heat (returned `{ok:true}` with lines about a ghost). The r6 phantom-talk
class, one layer deeper.
Fix: removeVillager (the one removal choke point) now clears heat, a
challenge naming the removed, and ally entries naming them. After: challenge
null, heat {}, allies {}, askSupport returns null ("There's no challenge to
your lead right now."). Proof T6/T7.

## KILL 4 — v.allies written, never read (DEAD CODE → wired)
`askSupport` wrote `v.allies[vid] = target` with the comment "allies expect to
be treated well" — nothing in src ever read it (verified: only write site).
The promise was dead copy. Fix: the alliance is now spent at challenge
resolution. Yielding to a contender someone backed you against records an
`abandoned_alliance` grievance (severity 14 — feeds motiveBetween like every
other grievance, so betrayal plots can grow from it), a `betrayed_ally`
memory, and a spoken line; the alliance clears. Standing your ground spends the
alliance well: `stood_together` memory, no grievance. The three memory types
got Telltale-theater read sites in `convoMemoryAbout` ('ally', 'betrayed_ally',
'stood_together'). Proof T8/T9.

## HELD — and why
- **askSupport spam**: +5 words, resolver-capped at 40, no kcal/tick cost — but
  bounded by heat supply (each ask burns 2 heat; at 0 with no challenge it
  refuses). Words, not a farm.
- **Moot vote farm**: no player-initiated NPC accusation path (re-verified via
  grep); votes are NPC-paced with grievance pricing both ways. Per r6.
- **Gossip distortion**: honestly surfaced — "The story's getting bigger than
  what happened" at distortion ≥ 2, journal labels rumors "Rumor:". Not changed.
- **Corruption canon honesty**: darkShowBeat/darkCarePackageTick (televised
  dark runs), fearWeakness (fear→contempt collapse), cannibalism charge rank 5
  ("outranks murder") all verified wired, not copy-only.
- **Schism feud groups**: live data — read by gossip mate-finding
  (betrayal.js:1372, game.js:12458). Not dead.
- **Non-verbal gestures/draw/read**: 10 kcal each, nvTrust 40-capped. Words.
- **Party invite/dismiss**: no trust payout on invite; dismiss costs −8. No loop.

## Regressions
- test-break-social-20261010.js: 14/14 × 3 seeds (20261010/777/424242);
  13/14 FAIL on pre-fix code (T10 is a wiring check, passes both)
- test-leadership-challenge.js: 34/34 (2 stale assertions updated to the
  corrected math: yield now asserts progressive scaling; askSupport asserts
  progressive +5 — the old ≥+5 pinned the r2-killed coalition drift)
- test-social-r7-trustbleed.js: 17/17; test-social-r7-promises.js: 15/15
- test-social-r6-rumor-farm.js / whogossip / edge: green
- test-social-breakit-r2.js: 7/7; attack-socialite-r4-20261009.js: ALL GREEN
- test-village-membership.js: 53/53
- validate-ontology.js: 52/52, release permitted

## Files changed
- src/js/game.js: yieldChallenge (bumpTrust + allies-spent wiring),
  standGround (bumpTrust + alliance vindication), leadershipFriction
  (bumpTrust), trustAll/mediator/_evTrustAll (drop ||15 resurrection),
  conflictIncident (bumpTrust)
- src/js/betrayal.js: declineInvite (bumpTrust), removeVillager (leadership
  hygiene: clear heat/challenge/allies)
- src/js/convo-scene.js: convoMemoryAbout labels for ally/betrayed_ally/
  stood_together
- src/js/membership.js: crowdingTick (bumpTrust)
- scripts/test-break-social-20261010.js: new proof suite
- scripts/test-leadership-challenge.js: 2 stale assertions → corrected math

## Design calls made (Steve: decide + document, he can overrule)
- Yielding a leadership challenge is a real act (no 40 words-cap) but its trust
  gain scales progressively like every other gain — "the math should be one math."
- Abandoning an ally who backed you against a contender is a grievance-grade
  betrayal (severity 14), not just a mood hit — it can seed future plots.
- A removed contender's challenge dies with them immediately (no 8-part ghost);
  the exile/moot ceremony already narrates the leaving.
