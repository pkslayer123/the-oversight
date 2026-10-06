# Token-People Audit — agency, not roles (Steve 2026-10-06)

Companion to `role-audit.md` (which covered assigned ROLES). This one covers
AGENCY: where NPCs are effectively tokens — uninfluenceable, unchanging, or
one-directional — versus real people who can be influenced and change paths.

Steve's question: "Where else are people just tokens and not people who can
be influenced and change paths?"

## Ranked findings (most player-visible first)

### 1. Background survivors are half the village but second-class people [WORST]
**Files:** `src/js/game.js:1176` (roster: 6 of 12), `:1257` ("generated have
dialogue; background have one-liners"), `src/js/conversation.js:888`

The village is 12: your pick + 5 generated + **6 background survivors** drawn
from 36 static records. Each bg survivor has exactly one `line` field — a
one-liner bio ("Mara's old colleague. Triages everything, including
arguments.").

What they DO get (credit): per-run goals, dark traits, intelligence,
languages, home culture, trust, memory, gossip participation, side-taking.

What they DON'T get: the prototype system. `convoOpening` (conversation.js:888)
looks up `this.data.villagers` for the want/know/feel/secret hooks — generated
characters are pushed there (game.js:713), bg survivors never are. So half
your village can never surface a want (30% hook), a secret (trust 40+),
or the synthesized personality beats. Their topic2 conversations work but
generate thinner: no secretFear (defaults to 'being forgotten'), no
quirk/habit/hope (t2fill slots fall back), no prototype.

The player feels this as: six villagers who are pleasant furniture. You can
talk to them, they respond, but they never *want* anything from you and never
trust you with anything real.

**Fix sketch:** synthesize a lightweight prototype for bg survivors at draw
time (game.js ~1188, where bgGoals/bgLangs are already synthesized per-run).
They already get per-run goals, dark traits, and intel — a want/secret/fear
draw from the same characterGen pools costs one more synthesis block and
makes the prototype lookup generic (`vpOf` instead of `data.villagers.find`).

### 2. The player's background is socially invisible
**Files:** (absence of evidence — searched game.js, conversation.js,
convoTopics.js for any NPC reference to player occupation/background)

The unique-person law says every player character is a unique person with a
per-life background. Mechanically the background grants abilities
(`scholar.backgroundAbilities`, game.js:1467). Socially it does not exist:
no NPC ever references your former occupation, no dialogue branch keys off
who you were, nobody treats the ex-doctor differently from the ex-convict.

The player feels this as: the character-select screen promises "who you are
matters," then the village treats you as a blank slate with a trust number.

**Fix sketch:** seed one `playerKnownAs` fact per run (occupation + one
lifeseed beat) into the gossip/memory system at game start — villagers
"heard" who you were. Gate a few t2gen lines off it ("You were a {occ}?
Then you know what tired looks like."). Cheap, high-visibility.

### 3. Reputation never decays — no forgiveness curve
**Files:** `src/js/game.js:8575` (`applyRep`), `:8198` (`repOf`)

Minds DO change with new evidence (the lens system in `observe` is genuinely
good — the same act reads differently to different people, and ripples hit
at 40%). But accumulation is permanent: a theft on day 2 weighs exactly as
much on day 40. There is no drift toward neutral, no "that was a long time
ago," no earned redemption arc in the numbers.

The player feels this as: one bad week early can brand you forever, and
there's no mechanical path back — only piling new positives on top.

**Fix sketch:** daily rep drift toward 0 (small, e.g. 1-2 points/day on
magnitudes > 10), with recent deeds weighted more. Trust already has
diminishing-returns logic for talk (game.js:2489); rep needs the time axis.

### 4. Gossip fallthrough is a fixed line
**File:** `src/js/game.js` (~3297, in the gossip branch of askAbout)

When the freshest heard gossip is about the player and isn't negative
(no dim < -3), the rendered line is ALWAYS:
`"Word is you're doing right by people. Keep it up."`
— regardless of what the gossip actually contains. Ordered people around
(honest: -1)? Hoarded a little (generous: -2)? Still "doing right by
people." The negative branch ("People are saying things. About you.")
is content-aware; the neutral/positive branch is a vending machine.

**Fix sketch:** render from the gossip's dims/action like the aboutOther
branch does — three or four templates keyed on the dominant dim
(generous/brave/honest/competent), each with a positive and neutral
variant. The machinery (dims, actions) already exists; only the last
`say()` is hardcoded.

### 5. Trust is mostly a dialogue number — NPCs never act FOR you
**Files:** trust consumers: conversation.js (bands, gates), game.js
(teaching, deals, mediation), betrayal.js:414 (recruit), :800 (belief),
villager-agency.js:734 (successor sort)

Trust changes what NPCs SAY (bands, question gates, secret-sharing) and a
few plot mechanics (who's recruitable, who believes accusations). But no NPC
ever DOES anything for the player unprompted: nobody shares food with you
when you're hungry (they only ASK — game.js:9022), nobody warns you about a
plot against you, nobody defends you in a moot because they like you, nobody
brings you a gift. The generosity axis is one-directional: you give, they
receive and remember.

The player feels this as: relationships are a meter you fill to unlock
dialogue, not bonds that produce behavior.

**Fix sketch (start small):** high-trust + witness NPCs warn the player
about plots/betrayals they hear (the talkReason system at game.js:8546
already has the "heard something" pattern — extend it to "heard something
ABOUT you, warning not confronting"). Food-sharing from high-trust NPCs
when the player is visibly starving is the second beat.

### 6. Daily routines ignore village events
**Files:** `src/js/game.js:9731` (`npcBatchTurn`), `src/js/villager-agency.js`
(`agencyTick`)

NPCs wander, needs tick up, initiative fires (food/fear/social/talk
requests). But nothing in the routine layer responds to village STATE:
deaths don't still anyone's feet, famine doesn't drive extra foraging
ranges, feasts/cheer don't gather people. The conversation layer
acknowledges events beautifully (`t2LatelyEvent`: mourning, threat,
hunger, gratitude) — but the body keeps wandering at the same speed.

The player feels this as: everyone says they're grieving, nobody acts it.

**Fix sketch:** two routine modifiers in npcBatchTurn: grief > 0 slows
wander speed and biases movement toward the fire/memorial; pantry <
threshold pushes ranging profiles one step outward in agencyTick. Small,
visible, honest.

## Verified NOT token-like (do not "fix")

- **The rep lens system** (game.js:8246 `observe`): the same act means
  different things to different people based on temperament, goal, and
  witness-vs-target. Genuinely person-like. ✓
- **NPC initiative** (game.js:8982): hunger/fear/social drives approaches;
  talk requests with real reasons (game.js:8546), including confronting the
  player about negative gossip. ✓
- **Gossip about the player** spreads via witnesses/hearsay with distortion
  (seedGossip), and NPCs act on it. ✓
- **Trust-gated dialogue depth** (t2band, minTrust gates, secret at 40+). ✓
- **Overheard NPC↔NPC conversations** that can pull the player in. ✓
- **Betrayal plots** recruit by motive + (low) trust, belief weighted by
  affinity. ✓
- **Minds change with evidence**: applyRep moves both directions; the
  `t2gen_you`/`t2fol_you` lines reference specific remembered deeds. ✓

## The pattern

Wherever the game models a person as *accumulated state + interpretation*
(rep dims, memory, trust, gossip), it feels alive. Wherever a person is a
*static record + one function* (bg survivor bios, player background socially,
fixed gossip lines, event-blind routines), they're a token. The fix shape is
consistent: give the static record a per-run synthesis step, or give the
fixed output a branch on existing state.
