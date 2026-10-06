# Exile founding-arc feel-check — a player's diary (2026-10-06)

**Auditor:** flesh-out-loop worker. **Method:** played the full post-exile founding arc as a
player via `scripts/play-exile-found-20261006.js` — real foraging (`_cellInteract`), real
identification (`testCautiously`), real eating (`eatOne`), real sleeping (`Game.sleep`),
no debug shortcuts. Four runs: two learning runs, one competent run that died of thirst
on night 4, one full 11-day run that founded. READ-ONLY audit: no game code touched.

**Verdict up front:** days 1–5 are a real gritty fresh-start survival story. Days 6–11 are
a chore — a treadmill, not an arc. And dying mid-arc breaks the fiction completely
(the mantle passes to one of your exilers; see Bug 1).

## The diary

**The walk.** "Exiled. You leave with what you carry — nothing more. Behind you, Haven
keeps its fire. Ahead: the world, which just got much bigger." Then the severing, said
plainly: "The pantry is closed to you. The book stays behind. To Haven, you are not one
of ours anymore." Traumatic, narrated, social — not mechanical. The journal writes
"Exiled. Walking." I walked out past the treeline like the game told me to. It felt like
an ending and a beginning in the same breath. **This part is good.**

**Day 1.** Claimed the campsite: "You walk the ground until it feels right — water near,
wood near, wind wrong. You mark it with a cairn and a cut branch. This is yours now."
Then timber — "Green wood is heavy and honest work" (−400 kcal, half a day, named cost)
— and raised the lean-to. Foraged blind: "Unfamiliar unknown shoots — into the bag.
(Unknowns lump together; sort them at camp.)" No true names leaked. Tested a lump
cautiously in the afternoon (64 ticks, honestly spent) and learned Blackberry. Ate.
Slept on the cold ground. **This is the game. It works.**

**Day 2.** Felled more timber, raised the HUT — "Good enough to found on." Foraged,
tested four lumps, identified White Oak Acorns ("your gut is clear: cook it") and
Mayapple. The knowledge→food→power loop is alive and I could feel it working.

**Days 3–5.** The land near camp thins out. I walked further, tested Purslane ("Food.
Real food, and now it has a name"), and on day 8 of the long run, Ghost Pipe: "Lips:
numbness, spreading. You spit it out. NOT food — and now you know its name the hard
way." That beat is *excellent* — the cautious test has real teeth. But the foraging
returns are collapsing (+3490 one day, +60 the next), and I'm clicking "Cache food"
every day for ~1000 kcal from a pack that refills itself overnight. I am surviving.
I am not progressing.

**Days 6–11.** The treadmill. Forage the stripped tiles (+0, +0, +100, +0). Click Cache
(+832…+1187 — the number goes up, nothing changes). Tap Wait at dawn because sleep
refuses ("It's barely dawn. The day is yours") and there's nothing left to do. Sleep
on the ground at 0 hydration, wake weaker. Eleven days of this to fill 10,000 kcal at
~1,040/day. The hut was done on day 2. Everything after day 5 is waiting-room gameplay.
**This chores.** The requirement isn't hard — it's *long*, and no amount of skill makes
it shorter.

**The founding.** "You pick the spot you claimed weeks ago. The cache is full, the hut
you raised with your own hands stands against the wind. Emberhold — day one, again, but
this time you know what a day costs. Behind you, Haven keeps its fire without you."
The fork is REAL (verified, not just narrated): new village object, old Haven archived
into `pastVillages`, new name, founder-only roster, fresh trust, clean gossip, exile
over, pack and codex crossed. **This part is good — genuinely moving.**

**Week one in Emberhold.** Forage, eat, sleep — alone. Day 3: "Riders on the ridge — no,
a cart. A TRADER." A weathered trader visits (notability 55 ≥ 40 — the system works).
Day 7: a remote application arrives ("📨 Word came…"). So the week isn't silent — but
note: Emberhold sits on land I stripped bare for 11 days. I had to walk far for every
bite. Founding where you stand means founding on worked-out ground.

## Checklist verdicts

- **Exile sequence:** traumatic, narrated, social. PASS. (Trauma recorded, membership
  severed legibly, journal writes "Exiled. Walking.")
- **Founding discoverability:** the camp surface shows claim/timber/shelter/cache/found
  as always-visible self-bar buttons; the found button's hint names every missing
  requirement ("Not yet — need: …"). PASS.
- **Real fork:** PASS, all 8 identity checks green (see run 5 log).
- **Days 1–7 solo:** days 1–5 play well; days 6+ treadmill (see above). PARTIAL.
- **Knowledge gating:** holds everywhere checked — blind forage shows no true names,
  examine() leaks nothing, new-haven gossip/met clean, taught carries only founder
  knowledge. PASS. (One lovely beat: a watching NPC learns what you identify — knowledge
  spreads honestly.)
- **No-stuck:** every day resolved; the arc never stranded the player. PASS, with one
  asterisk: at dawn with depleted tiles and no kcal, sleep refuses and the game suggests
  nothing — a player who doesn't think of Wait stares at the screen (friction 3).
- **One-screen (390×844):** the exile camp surface is 5 buttons in the always-visible
  self bar (labels 8–31 chars — wraps to ~2 rows, in-flow, no scroll, no sheet). The
  foundhaven hint carries the requirements. PASS. (Moot dossier density is still
  social-audit rec #1; not re-litigated here.)
- **Audio:** hooks exist and are specific — exileWalk (footsteps receding), claimSite
  (cairn clicks, the wind bending a semitone flat), chopWood, buildShelter, foundHaven
  (the new hearth catching, the old haven's hum answering once). Not auditioned in
  node; the code reads freaky-not-generic. PASS by inspection.

## Friction list

1. **The cache is time-gated, not skill-gated.** `cacheFood` draws from the abstract
   daily pack (`packKcal`, ~800–1,300/day, regenerates from nothing — game.js:3235),
   not from foraged food. 10,000 kcal ÷ ~1,040/day = 8–12 days *minimum*, and a
   brilliant forager waits exactly as long as a lucky clicker. Days 6–11 had no
   decisions in them. (Design-feel; see proposal 1.)
2. **Eleven days, zero human contact.** No drifter, no wanderer, no voice but the
   journal. The solitude is atmospheric on day 2 and dead by day 8. (Proposal 2.)
3. **The cache can't save you.** I starved next to 4,000+ kcal of my own cached food
   with no way to eat from it (no un-cache action). A desperation tap — even at a
   cost — would be honest. (Design question.)
4. **Dawn stall with no guidance.** Depleted tile + 0 kcal + sleep refused at dawn =
   "It's barely dawn. The day is yours — sleep is for later." A player who doesn't
   know about Wait has no path. The line is honest; it just doesn't help.
5. **Dehydration whiffs.** My creek-seeking failed repeatedly ("walked to the creek
   for water — hydration now 0"); arrival-drinks work when travel lands, creek tiles
   as destinations can block ("no crossing without a bridge or a swim" — the swim
   option on the blockage card wasn't exercised). Water is findable but fiddly; the
   −15/night dehydration spiral is survivable-but-grindy at 0 hydration for a week.
6. **Founded on stripped land.** The new haven sits where you ground it — 11 days of
   foraging means the home tile's region is worked out on day one of Emberhold.

## Bugs filed (not fixed — read-only audit)

**Bug 1 — MAJOR, fiction-breaking: mantle transfer after exile-death collapses the exile.**
Repro: `debugScenario('exile')`, walk out, set health low, `Game.sleep()` → endDay kills
via `resolveDay` → `playerDeath('the night')` (src/js/ledger.js:261). The mantle passes
to the highest-trust NPC — one of your *exilers* (observed: `gen_fm7y7jw` → `emma_larsen`,
`james_okonkwo`). Then: `playerDeath` pins the map to the OLD haven
(`this.map.px = this.state.village.px`, ledger.js), while `scholar.exiled` stays true
and `scholar.founding` persists. The new bearer gets "The village is glad to see you"
AND "The pantry is not yours anymore. Exile means exile" in the same breath, sleeps in
the hall (heal 20), and is offered the exile camp actions (claim/camp/found). The old
village's `severed` record names the dead ID; the new bearer was never severed — yet
`isMember` blocks them via the scholar flag. The exile is over in fiction and still
running in mechanics. Per Steve's hard-reset law, the exile died with the old body;
the new bearer is a Haven member in good standing and the game should treat them as one
(clear `scholar.exiled`/`justiceState().exiled`, drop or convert the founding project —
Steve's call on the exact shape).

**Bug 2 — minor, fiction: exiled players sleep in the exilers' hall.** `sleepQuality()`
(src/js/game.js ~10830) returns `'hall'` whenever `playerTile().type === 'haven'`, with
no exile guard. The exile scenario's own fiction says the walk starts "out of the hall,
on the grounds" — but `Game.sleepQuality()` on the haven tile while exiled returns
`'hall'` (heal 20 > ground 12). Repro: `debugScenario('exile')`, don't travel,
`Game.sleepQuality()` → `'hall'`. (Also reachable if an exile walks back.)

**Bug 3 — design-feel: the founding cache can't be accelerated by play.** `cacheFood`
(src/js/betrayal.js ~1908) moves `min(3000, packKcal)` from the virtual daily pack;
`foundingReqs().stockpileKcal = 10000` (src/js/betrayal.js ~1768). Observed: ~1,040
kcal/day across 10 days, zero correlation with foraged yield (run 3 cached ~1,000/day
with +0 foraged). The cost is honest but the payment is waiting. See proposal 1.

## Beat-addition proposal (prioritized — the back half chores, so this is warranted)

Per the audit's own rec #2 ("add beats rather than cutting the cost"):

1. **Let skill pay the cache.** Allow `cacheFood` to also move real foraged surplus
   (pack inventory kcal → cache, same daily cap): a great forager founds day 8, a poor
   one day 12. Keeps the 10,000 cost; restores skill expression. (Structural; biggest
   lever on the treadmill.)
2. **A visitor at the cairn (days 4–6).** A drifter finds the claimed site — a real
   conversation, maybe a trade, maybe a warning about the land. Eleven solo days need
   one human voice; the strangers system already exists, just never fires for exiles
   (`considerStrangers` returns early while exiled — betrayal.js).
3. **A storm night that tests the shelter.** The lean-to/hut tiers currently differ
   only in the requirement checkbox; a named storm beat (choice: burn wood for a
   roaring fire vs. shiver through) would make the hut *felt*.
4. **Word from Haven.** Once mid-arc, the gossip about you arrives via a traveler
   ("the story's getting bigger than what happened" exists as an overheard-at-haven
   line — give the wild its own version). The exile's social consequences should reach
   the exile.
5. **A choice that matters.** E.g. a wounded animal at the cache: spend 500 cache kcal
   to save it vs. let it die — with a real consequence either way. The back half has
   no decisions; one would carry it.
6. **Desperation un-cache.** Let the founder eat from their own cache at a cost
   (spoilage? a "you ate the seed corn" beat the new village remembers?). Starving
   next to your own food with no action is the wrong kind of helpless.

## Files
- Play script: `scripts/play-exile-found-20261006.js` (5 acts, honest play, no shortcuts)
- This note: `evidence/2026-10-06/exile-founding-feel-20261006.md`
- Results JSON: `evidence/2026-10-06/exile-founding-feel-20261006.json`
- Grid visuals: `evidence/2026-10-06/exile-found-grid-walk.svg`,
  `evidence/2026-10-06/exile-found-grid-newhaven.svg` ("Emberhold — day one")
- Full run logs (ephemeral): /tmp/exile-play{,2,3,4,5}.log — run 5 is the completed arc
