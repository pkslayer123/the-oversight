# Wave-2 theater group 2 — played pass (2026-10-07)

Worker, flesh-out loop. Played AS A PLAYER through a node harness
(`scripts/play-feel-20261007-wave2b.js`, 132 assertions, green on seeds
20261007 and 777). Engine loaded from HEAD via `git show` (hot-tree safe —
the worktree holds in-flight sibling changes; nothing here touches them).
Seeded mulberry32, deterministic. All HP/position/weapon shortcuts disclosed
in-run.

## The wave-2 bar, honestly

Wave 1 (Highbeam Deer) asks: **read the freeze, leave the lane** — positional,
and the dwell punishes. These five ask five NEW things:

- **Understudy**: manage your ARSENAL (it steals your most-used move — switch weapons)
- **Landlord**: manage the GROUND (the lease is the weapon — keep moving, kill it before foreclosure)
- **Heckler**: manage your TEMPO (spend a turn answering back, or the shame compounds)
- **Paparazzo**: manage the CLOCK (kill it before the fourth frame, or break line of sight)
- **Union Rep**: manage TARGET PRIORITY (union-bust the rep, or the picket line out-scales you)

The escalation is cognitive and theatrical, not numerical — said plainly, per
Steve's rule. None of these five can kill a competent player through good
play the way the deer can; all five punish *bad habits* the deer never tests.
That is a genuine step up on its own terms.

## Per-monster verdicts

### 🎭 The Understudy — PASS, FUN

**Blind first contact.** `A blank shape at the tree line. It is watching
{you} fight. Learning.` No coaching — correct. It keeps its distance while it
watches (steps away when you close). Chase it for 3 turns without landing a
move and the COLD READ fires: `It stops watching. It stands the way you
stand. It is coming at you. (Done waiting — hit it first.)` — the anti-stall
prod works; a passive player cannot wait it out.

**The played arc (U1).** Started adjacent, fed it spear strikes. Phases in
order: watching → rehearsing → performing → improv (all four, verified via
phase hook). At 3 observations: `It stands the way you stand. Moves the way
you move. "I've got it now." Your Fire-hardened spear — it has seen that one
3 times. It knows where it lands. (OPENING STEAL: your next Fire-hardened
spear strike is anticipated — switch weapons.)` The steal fired on the next
spear strike: halved, and `It answers with YOUR Fire-hardened spear.` Below
30% HP: `"No no no—" It stumbles, the copy breaking. Then it comes at you
with ALL of it at once. (DESPERATE IMPROV: it chains everything it learned —
two of your moves, badly, frantically.)` Kill: won, player 500→456.

**Telegraph.** Distinct, never generic: blind — `It goes still. It is doing
the thing you do before you do it.` Known — `"MIRROR STRIKE." Your
Fire-hardened spear — played back at you at 50%.` (fidelity climbs 50→80%).

**Knowledge.** Fully working — better than the perf-review worker feared.
Surviving its hit teaches the pattern (`📖 Codex: Your Move — locks onto one
target — moving won't dodge it. You won't forget this.` — the shared
telegraph resolve calls tbLearnPattern for direct hits too), and the data
knownCue surfaces on later declares: `It only knows what you've SHOWN it.
Switch weapons and the copy falls apart — the familiar is what kills you.
Never let it get a clean read on your favorite move.` The dead-knownCue class
does NOT apply here — only review_drone's tbBatch4Cue interception killed its
cue. Slain-stage known voice also works (`It is watching you fight. Taking
notes. In your handwriting.`).

**Phases/badges.** 👁 WATCHING / 📝 REHEARSING / 🎭 PERFORMING / 🎲
IMPROVISING — all distinct. Note: the 2-observation rehearsing branch (`It
copies at 50% — it learns fast.`) is rare in open ground (the monster kites
at speed 4 vs your 3, so the cold read usually wins the race); verified via a
disclosed seeded-usSeen branch check (U1b). Both branches narrate the phase
change — no silent transitions.

**Audio.** understudyWatch → understudyRehearse → understudyPerform →
understudyCopy (fidelity-tagged: 0.5/0.6/0.8) — all fire, all bespoke.

**Loot.** 26/200 drops (~0.13, not raining), always tier 3 per the data.

### 🏚️ The Landlord — PASS, GOOD (borderline FUN)

**Blind first contact.** `"THIS PARCEL IS NOW LEASED." It hammers a sign into
the dirt. The sign has your name on it.` No coaching — correct. Stand still
and it serves notice ON YOUR POSITION: `"NOTICE SERVED — CURRENT OCCUPANT."
Your ground is being bought out from under you. (MOVE — rent comes due.)` —
the ring closes around you (snapshot: `~` tiles ringing the player).

**The played arc (L1).** The ground is the weapon, honestly: ending a turn on
claimed ground charges rent (`The leased ground takes its cut. (8)`),
undodgeable. Addenda widen the lease in waves (`"ADDENDUM #3: this agreement
now covers a WIDER AREA."`), claimed peak 14 tiles, phases
surveying → claiming → collecting → foreclosing in order. On claimed ground it
heals (`It stands on its own land, and the land pays rent. (+5)`). Kill: won
by striking THROUGH the eviction — the direct is undodgeable, so footwork is
the wrong answer and trading pre-foreclosure is the right one.

**The honest clock.** A bad first run (my policy tried to move onto the
landlord's tile and stalled adjacent) died at foreclosure: rent 8–10/round +
eviction 18–26/round, every round, undodgeable. That is the design ("kill it
before foreclosure") working as intended — the anti-turtle has teeth. A
competent player trades and wins in ~5 strikes; a slow one gets foreclosed.
Said plainly: the step up here is a hard DPS clock, the most numerical of the
five.

**Telegraph.** Distinct: `It hammers another sign into the dirt. The sign has
your name on it. It always had your name on it.` Known: `"EVICTION NOTICE."
It serves the paperwork. Personally. (Heavy direct — move.)`

**Knowledge.** Working: surviving the eviction teaches it, and the data
knownCue surfaces: `The ground is the weapon, not the landlord. Rent comes
due every round you end on leased ground — and every Addendum raises it. Keep
moving; never let it serve notice on your position.` Slain-stage voice works
(`"RENT'S DUE."` / `"NOTICE SERVED — CURRENT OCCUPANT."`).

**Grid visual.** The claimed-terrain snapshot shows the lease as a visible
ring — the grid IS the telegraph here. Eviction (direct, target-locked) has
no lane cells, which is correct for the pattern.

**Phases/badges.** 📋 SURVEYING / 📌 CLAIMING / 💰 COLLECTING / 📜
FORECLOSURE — all distinct.

**Audio.** landlordClaim → landlordEvict → landlordSpread — all fire.

**Loot.** 44/200 drops (~0.2, not raining), always tier 3 per the data.

### 🗣️ The Heckler — PASS, FUN

**Blind first contact.** `something in the dark, laughing at you
specifically.` First jibe: `It laughs at you. Specifically at you. The laugh
has notes.` No coaching — correct.

**The played arc (H1).** The most theatrical fight of the five. Every jibe
stacks SHAME: `The words stick. Your arms feel heavier. (SHAME 2: -2
damage.)` — and the words lie about your arms honestly (strike damage
reduced). Striking it guarantees a jibe next turn (`"Do it again! Do it
again, I want to see if it gets worse."` — the set feeds on your effort).
At 3 shame: `"Oh, we've got a LIVE ONE!" It has your number now. (3+ SHAME:
answer back next turn or act and take +2.)` — HEADLINER, with PILE-ON
(`The laugh multiplies — a whole crowd that isn't there, and every throat is
laughing at you. (PILE-ON: +2 SHAME)`) and the words CUTTING (`The words
find the soft places. (10 psychic — the mockery cuts.)`). The compulsion is a
real choice: WAIT answers back (`"Oh, you want to TALK about it?" You answer
back — it costs the turn, but the words lose their weight. (-3 SHAME)`),
acting through it feeds it (`"See? SEE? Can't even listen." The defiance
feeds it. (+2 SHAME)`). Shame peaked at 8 in the played run. Kill: won —
fragile, the mouth is the whole monster.

**Telegraph.** Distinct: blind — `It leans in, grinning. "Oh, this ought to
be good."` Known — `"You call that a swing?" It demonstrates. Poorly. On
purpose. (Light direct.)`

**Knowledge.** Working: the headliner explicitly teaches the pattern
(`📖 Codex: You Call That A Swing? — ... You won't forget this.` — the one
monster of the five with an explicit tbLearnPattern call in its AI block),
and the data knownCue surfaces on later declares: `Its words are the weapon
— SHAME is what hurts, not the swing. Answer back (WAIT) to clear it before
the HEADLINER compulsion lands, or end it fast: it's all mouth, no armor.`

**Phases/badges.** 🎤 WARMING UP / 🗣️ HECKLING / ⭐ HEADLINER — all distinct.
(The warming_up phase was previously set-but-never-narrated; the beat now
reads.)

**Audio.** hecklerJibe (shame-tagged) → hecklerPileOn → hecklerTaunt →
hecklerHeadliner — all fire. **GAP: hecklerLaugh NEVER fires** (see wiring
backlog).

**Loot.** 20/200 drops (~0.1, not raining), always tier 2 per the data — the
only one of the five consistent with Steve's stated wave-2 loot rule.

### 📷 The Paparazzo — PASS, GOOD

**Blind first contact.** `a single eye in the dark. it has been watching for
a while.` First declare: `The lens steadies. You hear the shutter think
about it.` No coaching — correct.

**The played arc (P1a — the dodge).** The flash is a telegraphed burst
centered on your position: 5×5 (25 cells, radius 2) at low prediction.
Sprinting 3 tiles out of the frame: `You're not where it landed. Clean
dodge.` — footwork works pre-exclusive, and the miss still teaches it
(`Click. It missed — but the shutter keeps clicking. (Prediction 2/4 anyway
— it learns from the miss too.)`). Kill: won before the model maxed — the
codex counterplay ("kill it before the fourth frame") is real, though the
played kill was close (prediction peaked at 4).

**The played arc (P1b — the punishment path).** Stood still on purpose:
prediction 0→2→4 (double when still — `"Hold still. Yes. Just like that."
Standing still makes it learn you FASTER. (Prediction climbing double.)`),
`"WIDENING THE SHOT." The flash covers more ground.` (7×7, 49 cells),
then `"GOT IT. The money shot." It knows exactly where you'll go.
(PREDICTION 4: the flash is now UNBLOCKABLE — break line of sight.)` The
flash freezes (`FLASH. The world goes white — you're frozen mid-step.` —
stunned, lose-movement-keep-action), and the dazzled-player close-up rule
means it moves in so you can still strike back (no freeze-lock). 414 damage
taken over 28 rounds of standing still — the punishment path is survivable
but stupid, exactly as designed.

**Telegraph.** Distinct: blind — the shutter line. Known — `"Say cheese."
The lens steadies. (Flash incoming — freeze 1 turn. Prediction 3/4.)`
Unavoidable — `The shutter doesn't even bother aiming. It knows.
(UNAVOIDABLE flash — break line of sight or eat it.)` The burst geometry
snapshot shows the 5×5 frame on the grid; the 7×7 widening is visible.

**Knowledge.** Working: surviving a flash teaches the pattern, and the data
knownCue surfaces: `Every shot refines its model — dodging the flash won't
slow it down. Four shots is all it needs: the money shot can't be dodged.
End it fast, or be in reach when it comes.`

**Phases/badges.** 📷 CANDID / 🎯 TRACKING / ⭐ EXCLUSIVE — all distinct.

**Audio.** paparazzoShutter (prediction-tagged per shot) → paparazzoExclusive
sting — all fire.

**Loot.** 26/200 drops (~0.13, not raining), always tier 3 per the data.

### 📋 The Union Rep — PASS, FUN

**Blind first contact.** `It is holding a meeting. About you.` No coaching —
correct.

**The played arc (R1).** The most systemic fight of the five. Organizing beat
first (the phase is no longer entered silently). Held at range for 4 turns —
it declared `Grievance Filed` (the attack it "never uses" while you crowd
it; on-fiction: it doesn't fight, it organizes). The organizing window is
real: 2 turns before `"PICKET LINE!" A {wave-1 monster} lumbers in, holding
a tiny sign.` — a genuine union-bust window. Solidarity: `"STAND TOGETHER!"
The other monsters stand straighter. (+3 damage to allies — kill the rep
first.)` (ally bonus verified at +3). I played the WRONG answer on purpose
(killed the ally first): at half HP the rep went `"WALKOUT! WALKOUT!" It
climbs onto the bullhorn and stops fighting entirely — full-time
coordination. (Allies +8 damage. The rep is UNTARGETABLE while
coordinating.)` Striking it: `You can't get a clean shot — it's behind the
picket line, bullhorn up, coordinating. (Untargetable during WALKOUT — break
the line first.)` — the refusal is honest, not silent. Killed the last ally:
`"The line — the LINE is broken!" The bullhorn wavers. Nobody is chanting
anymore. It climbs down, pencil out. (The walkout collapsed — it is
TARGETABLE again. End it.)` Kill: won. The walkout/line-break arc is the best
phase system of the five — no infinite stalemate, no unwinnable-by-design
second half.

**Telegraph.** Distinct: blind — `It licks the pencil. "Let's put this one
in writing."` Known — `"Grievance filed." It licks the pencil. (Modest
direct — the allies are the threat.)`

**Knowledge.** Working (with a caveat): holding at range let it declare, the
pattern was learned, and the data knownCue surfaces: `Kill the rep before it
organizes. Every ally it rallies hits +3 harder — and at WALKOUT they hit +8
while the rep goes UNTARGETABLE behind the picket line.` Caveat: in a normal
crowding fight the rep never declares (it organizes instead), so the
knownCue is reachable only via the at-range line — the known/unknown cueText
switch (`Union-bust it before the picket forms.`) carries the coaching in
the common path.

**Phases/badges.** 📋 ORGANIZING / ✊ PICKETING / 🚨 WALKOUT — all distinct.

**Audio.** unionBullhorn → unionPicket → unionWalkout → unionRepWhistle —
all fire.

**Loot.** 35/200 drops (~0.18, not raining), always tier 3 per the data.

## Loot vs the wave-2 loot rule

Steve's rule: only veteran wave-1 variants (post-unlock) + the apex may drop
wave-2 loot (tier 3+); base wave-1 stays tier 1–2. Four of these five regular
wave-2 monsters carry **tier 3** in monsters.json (understudy, landlord,
paparazzo, union_rep); only the heckler is tier 2. Same tension the
perf-review pass flagged (review_drone at tier 2 vs the task's "should drop
tier 3+" expectation, resolved the other way). The data note on all five says
"Alien loot: low chance, tier scales with monster strength (Steve
2026-10-05)" — the older rule. The two rules conflict; stats are off-limits
this run. **For Steve's judgment.**

## Wiring backlog (engine/data off-limits this run — for the engine owner)

1. **hecklerLaugh never fires.** `encounter.aggroAudio` only plays on
   threat-queue-front changes (pain/scan paths); a 1v1 fight never changes the
   front, and the heckler's AI block has no first-turn audio call (unlike the
   understudy's watching beat or the landlord's claim). Suggested: play
   hecklerLaugh on the first jibe, mirroring the understudy pattern.
2. **Data noticeTexts never surface.** `startCombat` notices in-range fighters
   SILENTLY (`encNoticeFighter(mo, o.key, true)`), so the `encounter.noticeText`
   lines ("Laughter in the dark — aimed at you, specifically.", "A shutter
   clicks somewhere near you. Just one. For now.", ""Brothers, sisters,
   monsters — GATHER ROUND." You are the agenda.") are dead text. The bespoke
   first-turn lines cover the fiction, so this is data hygiene, not a
   player-facing gap.
3. **Generic `telegraph` audioEvent fires on direct declares** for
   understudy/landlord/union_rep alongside their bespoke synths — flagged, not
   a bug (the urgency tick is the shared layer; each phase has its own voice
   too).

## Harness notes (for future workers)

- `scripts/play-feel-20261007-wave2b.js` — 132 assertions, exit non-zero on
  failure, green on seeds 20261007 and 777. `SEED=777 node scripts/...`
- The dead-knownCue finding from the perf-review pass does NOT generalize:
  the shared telegraph resolve calls `tbLearnPattern` for direct hits too
  (game.js ~21420), so all five monsters' data knownCues surface once the
  pattern is learned. Only review_drone's tbBatch4Cue interception kills its
  cue.
- Phase hooks must be installed BEFORE `newFight` (the opening phase is set
  inside `startCombat`), and matched by monster id — the fighter object
  doesn't exist yet during the init.
- First-contact asserts must run AFTER the first turns (the notice/patter
  fires on the monster's turn, not in the fight intro) — use the `mark()` /
  `since()` transcript-window helpers.
- `liveMonster()` after a finished fight is meaningless — gate kill asserts on
  `lastFightResult === 'won'` via the tbEnd wrapper.
- The landlord's direct is undodgeable and its tile is occupied: a
  move-to-best-tile policy that doesn't exclude the monster's tile stalls
  adjacent and dies at foreclosure. Strike through it.
- The paparazzo's flash IS footwork-dodgeable (player speed 3 vs radius 2) —
  sprint out of the frame, don't sidestep.
