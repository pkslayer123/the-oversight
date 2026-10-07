# Contest variant pool expansion 3 — notes (2026-10-07)

Steve 23:20 "add content to small pools" — the three smallest contest pools
(puzzle, detective, forage — 4 each) each gained two bespoke variants.
Pool is now 44 contests (38 -> 44); puzzle/detective/forage are 6 each.

## New variants

- **The Iron Pantry** (puzzle/high, `lockpick`) — alien vault-lock on a full
  pantry. Five tumblers that set in WEIGHT order (heavy to light, never
  1-2-3); force jams the lock. Knowledge-gated: veterans know the order,
  first-timers only know to listen.
- **The Wrong Map** (puzzle/medium, `wrongmap`) — a map with exactly one lie;
  the System always lies about WATER. Trust the terrain, not the ink.
  Knowledge-gated on the water lie.
- **The Alibi Chain** (detective/medium, `alibi`) — five villagers each vouch
  for the next; one link is false. The false link vouches first and loudest
  (knowledge gate). Naming it gently vs publicly is a real fracture/unity
  choice.
- **The Echo** (detective/high, `echo`) — one witness, two tellings; the noon
  telling always adds DANGER for the cameras. Believe the scared (dawn) one
  (knowledge gate). Blessing the performance arms the village for a monster
  that doesn't exist.
- **The Tide Clock** (forage/high, `tidepool`) — harvest the tidal pools
  before the causeway drowns. Third gull-cry = turn back (knowledge gate).
  Greed paths carry real die odds (0.08/0.12).
- **Windfall** (forage/medium, `windfall`) — a storm dropped a fortune; beat
  the rot. Knowledge-gated on the rot order (berries -> smoke meat ->
  dry fish -> fruit keeps).

Each has: pool entry, bespoke dispatch, 3-phase bespoke sequence with
`beat:` audio declarations (composed from existing synths only), 3 watch
beats (setup/turn/ending) with veteran `knows` coaching, bespoke death
lines (player + villager), and a level-2 coaching line. Not reskins — see
the ontology rule `pool_expansion_20261007`.

## Playtest feel verdicts (played as a player, 2 runs each + watch mode)

- **Iron Pantry: FUN.** Strongest of the six. The weight-order listening
  mechanic, the pantry glowing behind glass ("the village can smell it,
  which is the whole point of the glass"), and two distinct WIN textures
  (gentle pick vs screaming forced break) all land. High tension throughout.
- **The Echo: FUN.** "Believe the scared one" is a great line; the
  performance-for-cameras concept is distinct from every other detective
  variant. Watch mode works — the beats read like the actual show.
- **The Tide Clock: FEAR works.** The gull-cries count down and the causeway
  sequence is genuinely tense. Greedy path has teeth; the smart-exit path
  feels earned, not cheap.
- **The Alibi Chain: GOOD.** Real named villagers in the chain, real social
  stakes ("the village sleeps under whatever you leave standing"). The
  gentle-vs-public naming choice is a proper fracture/unity tradeoff.
- **The Wrong Map: GOOD, after fix.** The river-lie reveal is satisfying and
  the water knowledge gate is clean. FIXED in this run: "Dig at the X"
  used to proceed to "The cache is up" — narratively broken. Now digging
  at the lie ends the contest (LOSE) immediately.
- **Windfall: playable, flat-ish.** The rot-order gate is real and the feast
  ending is fun, but the middle reads chore-y (triage list). The
  narrate-the-method and feast choices carry it. Weakest of the six, still
  shippable.

No stuck states found. All 44 contests structurally terminate (DFS over all
choice paths) and drive to completion via the real path, player and watch.

## Proof test

`node scripts/test-contest-variants-20261007.js` — 36 passed, 0 failed.
Full src/js list in index.html order (minus DOM-only app.js/sprites.js/
tile-scenes.js/move-anim.js); window stubbed for eval, deleted before play.
