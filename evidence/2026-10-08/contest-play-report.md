# Contest playtest report — 2026-10-08

Played ALL 44 contests as a player in a seeded node harness (full module list,
window stub deleted before play, sync combat path). Regression tests:
`scripts/test-contest-play-20261008.js` — **1007/1007 assertions green on 2
seeds** (20261008, 7). Raw logs: `evidence/2026-10-08/contest-play-seed1.log`,
`contest-play-seed2.log`.

Scope played per contest: TAKEN path (fire → pending → resolve → full choice
sequence), WATCH path (villager taken, cheer/study/bet/comfort agency), plus
grab-matrix (sleep/endDay, mid-combat, mid-conversation, mid-expedition),
refuse, multi-take, knowledge coaching, hardened variant, and a static
branching analysis (theater vs real choices).

## Headline

- **Zero stuck states.** Every phase of every contest has ≥1 choice; every
  sequence terminates; `activeContest` is always cleared. No modal with no way
  forward anywhere in 176 full playthroughs (44 taken + 44 watch × 2 seeds).
- **Choices are real, not theater.** Static analysis: 3 phases per contest
  (4 for drop/box/whoate/confession/quiet/guest/lockpick/tidepool/windfall),
  9–12 choices, 3–4 distinct next-targets each, effects spanning
  dmg/die/dieWounds/kcal/trauma/fracture/unity/notability/prize. Outcomes vary
  across seeds (oath/beastmaster/price/impress/auction flip between seeds) —
  risk is rolled, not scripted.
- **The interruption law holds from every player state:** sleeping (real
  `endDay` countdown path), mid-combat (fight still live and playable after),
  mid-conversation (convo still active after — it resumes, not eaten),
  mid-expedition (player position unchanged, not teleported).
- **Watch mode is a real show.** All 44 put on contest-specific beats that
  name the taken villager; cheer moves odds, study teaches, bets are real
  kcal, comfort lands as trust/mourning; on-camera deaths remove the villager
  from the roster for real.
- **Refusal is a sequence**, not a skip (trauma +5, notability, the others are
  still taken). Multi-take names everyone taken and rolls each their own fate.
  Knowledge: 2 plays → level 2 + 📚 coaching cue in the intro; level 3 reads
  hits coming. Hardened variant renames, bumps risk, announces itself.

## Per-contest verdicts (seed 1 taken run; seed 2 noted where it differs)

**BLOOD** — pit: classic, escalates well, fun. gauntlet: wounds-feed-closer
with displayed odds is the best tension device in the pool — scary, fair.
duel: opponent written human ("scared, like you, but hiding it worse") —
delight. tithe: brutal self-bleed (~75 dmg), dread done right. siege: holding
the line while the village watches — fear + pride, good.

**ENDURANCE** — drop: night beat ("one of the others is crying, quietly, like
it's a secret") — real texture, fun. starve: broth-stealing vs water-sharing —
social choices with teeth. maw: "the tunnel going quiet ahead of you" — the
scariest quiet contest; fear high. exchange: Gray Hollow's "slightly inhuman"
runner — delight + rivalry. vigil: sounding the alarm ENDS the vigil (lose,
not die) — fiction-honest, fair; the cautious reading of the rules is
rewarded with survival.

**MOOT** — moot: televised trial, solid. lies: scanner escalation, fun.
oath: swearing with fingers crossed kills you in one phase — deserved, the
fiction told you ("WE WILL KNOW"); seed 2 played it straight and won.
confession: false-confession detective, lost fairly. quiet: thought-broadcast
social horror, trauma 18 — the most psychologically frightening contest in
the pool. price: the village votes who pays — social horror at its best;
extreme risk is extreme.

**WEIRD** — cookfight: "the ingredients fight back," negotiating with your
dinner — pure delight. fetch: sabotage option is the fun one. hide: the seeker
telegraphed by *absence of sound* (birds going quiet) — brilliant, fear
extreme; confronting a wave-2 predator kills you, correctly. beastmaster:
cruelty is punished by the fiction ("Do not hurt it. It remembers.") —
deserved death; seed 2 gentle play won. guest: alien dinner etiquette —
delight, lost gracefully. impress: "they have catalogued 40,000 emotions" —
great premise; died seed 1, won seed 2 — medium risk bites sometimes, honest.

**PUZZLE** — box: nested boxes + the audience holding the manual — delight.
pattern: "your stomach is a democracy in crisis" — fun. riddle: memory-cost,
the mouths lean close — scary. sorting: "the fever-root bundle... Dull as
dirt" vs the sorter's fire — the best triage tension in the pool.
lockpick: 4 phases of escalating tumbler dread, won. wrongmap: found the lie
(the dry river), lost anyway — fair, the System lies well.

**DETECTIVE** — whoate: classic whodunnit, solid. informant: "the exits are
watched. The clock is loud." — tension. witness: fabrication forensics with
bespoke beat audio — good. alibi: "a kindness that became a lie that became a
chain" — the best single line in the pool; delight. echo: the village splits
over two tellings — social fallout done right; lost.

**FORAGE** — calorie_run: solid. pantry_raid: "the locals object" — fear with
a foraging skin. honey: queen cell as prize-and-death — good. cache: moving
the winter store under surveyor drones — heist tension, good. tidepool: the
gull-cry clock (one... two... THIRD) — the best countdown device in the pool;
fear high. windfall: rot race, preservation triage — delight, systems-y in
the right way.

**CHANCE** — wheel: pure chance, lost, fine. lottery: pure luck, lost, fine.
secrets: folding ends it in 1 phase — honest (walking away is a real choice)
but the thinnest contest in the pool; the brave/draw path wasn't sampled this
run. longodds: Vex the smug champion, stakes escalation — delight. auction:
bidding childhoods and lungs — the cruelest show; died seed 1, won seed 2.

## Friction (cosmetic / polish, reported read-only)

1. **Intro repeats the desc when the 30%-choice branch fires.** The grab
   choice phase says "name. desc" and the playable intro says "name. desc"
   again back-to-back (seen in drop/lies/hide/lottery runs). Cosmetic.
2. **Audio gap: 30 older contests have no per-phase beat declarations.**
   Only contestCall/contestTaken fire for pit…vigil; the 14 newer contests
   have bespoke composed beats (contestSort/Witness/Cache/Dice/Lock/Map/
   Alibi/Echo/Tide/Wind/Price/Impress/Exchange/Auction). The "freaky not
   generic" bar suggests the older 30 want named beats too. For a later run.
3. secrets is thin (fold = instant end); acceptable for a chance game but the
   draw path deserves a look in a future pass.

## Bugs found in src

None. All 5 initial test failures were harness bugs (missing statusEffects.js
in the module list, convoUI(vid) arg, drain accumulation, choice-branch
announce text) — fixed in the script, src untouched (read-only per task).

## Grab matrix results

- **Sleep** (real path: pendingContest + endDay): interruption fired, played
  to a clean end, day advanced. PASS.
- **Mid-combat** (live hushwolf fight): interruption fired, contest played to
  a clean end, fight still live after, player can still act. PASS.
- **Mid-conversation** (live startConvo): interruption fired, contest played
  to a clean end, convoUI(vid).active still true after — the conversation
  resumes, not eaten. PASS.
- **Mid-expedition** (player at 7,7 far from haven): interruption fired,
  contest played to a clean end, player still at 7,7 — not teleported. PASS.
