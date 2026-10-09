# break-it: camps & structures, round 5 (2026-10-08)

Worker: break-camps worktree. Proof: `scripts/test-camps5-breakit-20261008.js`
(37 checks, ALL GREEN × 4 seeds: 20261008, 1, 777, 20261009).
Before-fix run: 6 FAILURES — every catch below demonstrated red, then green.

Context: rounds 1–4 killed phantom camps ×2, lying breakCamp messages,
phantom "let it go", breach menu hole, sweepDeadFires eating tents, grid-fed
tent fires, save-scummed breaches, pack→re-pitch free fire, destroyCell fire
purge, death/mantle stale room, INFINITE BURY, stale tent secrets. This pass
attacked what they left alone: pitch validity, shredded-tent state, room
eviction invariants, travel persistence, occupant overlap, the unbreakable
rule, contest/camp separation, dead code. Result: 2 catches + 3 sibling
fixes, all broke, all fixed.

## CATCH 1 — SHREDDED REPAIR LOOP (exploit + honesty) — BROKE, FIXED
**Attack:** the beam (Highbeam Deer, scorchCells) shreds your tent. Every
label agrees it's done: "Shredded. Useless." (app.js:1242), "The tent is
shredded — wind and teeth. Not usable. You leave it." (examine), "The tent
is shredded — wind and teeth. No shelter in that." (enterTent). enterTent
refuses. But packTent never checked condition — and pitchTent always writes
`condition: 'good'`.
**Result:** pack the shredded tent (16 ticks) → re-pitch (48 ticks + 50
kcal) → a pristine tent. A free full repair contradicting every label, and
contradicting the found-tent rule (found shredded tents can't even be
taken — yours was repairable). The tile menu even offered "Pack up tent" on
wreckage.
**Fix (game.js):** packTent refuses shredded tents ("The canvas is
shredded — ribbons, not shelter. Not worth packing. You leave the
wreckage."); cellActions hides 'Pack up tent' on shredded tents (honest
buttons: impossible actions never render). Shredded is terminal, as the
copy always said. Proof G1–G4 red→green; G5 control (good tents pack fine)
green throughout.

## CATCH 2 — SHREDDED EVICTION HOLE (honesty) — BROKE, FIXED
**Attack:** scorchCells shreds tents in the beam lane but never evicts the
room. validateInsideTent enforced "cell is a tent + secret yours" — not
"tent intact".
**Result:** you could live, sleep (quality 'tent', +25, "Sheltered. Decent
rest."), and cook inside a tent every label calls useless. enterTent
refuses shredded tents, but nothing evicted you from one shredded around
you — the room outlived the shelter.
**Fix (game.js):** shredded counts as gone in validateInsideTent — the
every-status() choke point, so it covers scorchCells and any future shred
path. Eviction says why ("The tent shreds around you — canvas coming apart
in ribbons. No shelter in that. You crawl out into the open."), clears
tentSmoke like every other dump. Proof H1–H4 red→green; H5 control (intact
tent keeps the room) green throughout.

## SIBLING SWEEP — wreckage must not count as a tent anywhere else
Same bug class (tent condition not respected), swept every tent-state
reader:
- **hasTentNearby** excluded shredded tents: a beam-shredded tent nearby
  used to offer "Set up camp" ("Tent up, fire going" — over ribbons). Now
  wreckage is not camp-eligible. (Proof S1.)
- **sleepQuality** excluded shredded tents: sleeping next to wreckage used
  to rate 'tent' (+25, "Sheltered. Decent rest."). Only explicitly-shredded
  secrets are excluded — unexamined tents still count, as before. (Proof S2.)
- **Already clean:** enterTent (refuses), cellActions 'Enter tent' (hidden),
  'Rest (a while)'→'Use' branch, examine copy, wreckTent/destroyCell/
  breakCamp (destroy regardless — correct), atCamp/sort ritual (camp-based,
  not tent-based).

## Held (attacked, resisted / verified)
- **EXPLOIT — pitch on occupied cells:** no occupant check — the tent lands
  on a villager's or monster's cell without crashing; positions stay
  separate (v.positions / scholar.monster untouched). Cosmetic overlap, no
  mechanical break. Held, documented. (Proof I1–I2.)
- **SOFTLOCK — pitch then travel away:** tent cell + secret persist on the
  tile; walking back, it's still yours and enterable. No claim needed. Held.
  (Proof J.)
- **SOFTLOCK — exile/founding:** _forkNewHaven still doesn't clear
  state.camp (round 3 judged "not broken, just theirs" — the tent stands,
  the claim points at the old tile, nothing is granted remotely; setting up
  a new camp auto-abandons the old via the round-2 rule). The founding
  buttons live in the self bar, which the tent-room screen doesn't render —
  founding-while-inside is UI-unreachable. exilePlayer doesn't clear
  insideTent, but exile fires through the moot (world screen), not the tent
  room. Held, documented.
- **SOFTLOCK — contest grab while insideTent:** contests are UI-phase
  sequences, not world moves — the tent room renders narrationBoxHTML, so
  the contest plays fine from inside the tent. No stuck state. Held.
- **HONESTY — unbreakable rule:** destroyCell list unchanged
  (hall/bunk/door/haven/sanct/base — haven buildings + pre-emptive alien
  'base'); storm only ever breaks the player camp, never haven buildings;
  no fire-spread mechanic exists (nothing to lie about). Player campfires
  still breakable (round-1 carve-out intact). (Proof K.)
- **HONESTY — sleep preview:** insideTent sets mx/my to the tent cell, so
  sleepQuality reads 'tent' → preview 25 matches the actual heal path
  (sealed-vent smoke numbers verified round 4).
- **EXPLOIT — contest rewards:** prize/trauma/notability/notes only — no
  camp/tent/structure state touched. Held.
- **EXPLOIT — strangers in your tent:** no NPC tent-entry mechanic exists;
  enterTent is player-only and refuses non-yours. Held by absence.
- **DEAD-CODE:** caller audit over all 28 camp/tent/sleep functions —
  every one has ≥1 real call site (pitchTent←app.js tile tap,
  setUpCamp←app.js, breakCamp←packTent/storms/destroyCell/wreckTent/setUpCamp,
  destroyCell←bulldoze lane only, scorchCells←beam sweep only, …). No
  orphans, no zero-caller helpers. index.html loads every camp module.

## Regressions
Green: test-camps5 (37 × 4 seeds), test-camp-phantom, test-camp-storm-break,
test-camps2-breakit, test-camps3-breakit, test-camps4-breakit, test-tent-breach,
test-tent-rooms, test-make-fire (26), test-fireside-return-guarantee (11).
test-sleep-preview-tonight 10/11 — the hydration-36 threshold, failing
identically with changes stashed (round 3: water/fire reality numbers,
unrelated to camps). Ontology 50/50 validated.

## Files
- `src/js/game.js` — packTent shredded refusal; cellActions 'Pack up tent'
  gating; validateInsideTent shredded eviction; hasTentNearby wreckage
  exclusion; sleepQuality wreckage exclusion
- `scripts/test-camps5-breakit-20261008.js` — 37-check proof (before: 6 red)
- `evidence/2026-10-08/break-camps-5.md` — this file
