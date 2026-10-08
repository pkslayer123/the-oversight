# Telegraph proof — batch 3: coverage audit + missing pairs (2026-10-07)

Base SHA: `1ed08817def01e378d23d503ff901a2dec76e55f`
Engine: pristine HEAD extract (`git archive HEAD | tar -x -C /tmp/tgproof-b3`), real combat in node, `tbAllTelegraphCells()` bucket routing extracted from `src/js/app.js` (same fn `renderDetail` uses). PNG raster via cairosvg. Headless Chromium broken in this VM — not used, per standing note.

Harness notes: FULL `index.html` module order minus DOM-only (`app.js`, `sprites.js`, `tile-scenes.js`, `move-anim.js`); `drama.js` ALSO excluded — it touches `document` at load-time and cannot run in node (the only non-loadable module; all telegraph systems live elsewhere). `global.window=global` during eval only, deleted before playing so combat takes the sync path. Player held at (2,4), never moved (interior tiles, no edge-flee risk). 80-round drive per target, capture at first `m.telegraph` declare.

## Full coverage table — all 28 monsters in HEAD's `src/data/monsters.json`

| id | name | proof status |
|---|---|---|
| bulldozer | Bulldozer | ✅ **PAIR this run** (`telegraphs/tg-bulldozer-{known,unknown}`); legacy learned-only single `tg-bulldozer.svg` (2026-10-06) superseded |
| hushwolf | Hushpuppy | ⏭️ no telegraph BY DESIGN (rush gives no warning) — `tg-hushwolf-nodesign` (worktree) |
| gallowdeer | Highbeam Deer | ✅ HEAD pair `tg-deer-known/unknown` |
| mirrormoth | Flashbulb Moth | ✅ **PAIR this run** (`telegraphs/tg-mirrormoth-{known,unknown}`); legacy learned-only single `tg-flashbulb.svg` superseded |
| belltoad | Choir Toad | ✅ pair `tg-belltoad-known/unknown` (worktree, pending commit) |
| lockpick_raccoon | Lockpick | ⏭️ no grid telegraph BY DESIGN (theft loop via `tbLockpickTurn`; never sets `m.telegraph`) — existing `tg-lockpick.svg` is formation-only |
| white_noise_heron | White Noise | ✅ pair `tg-heron-known/unknown` (worktree, pending commit) |
| hummice | Hummice | ✅ pair `tg-hummice-known/unknown` (worktree, pending commit) |
| speedbump_turtle | Speedbump | ⏭️ no telegraph BY DESIGN (code comment: "turtle never declares"; the snap is the ambush) — `tg-speedbump-nodesign` (worktree) |
| nightlight_catfish | Nightlight | ✅ pair `tg-catfish-known/unknown` (worktree, pending commit) |
| voice_mimic_radio | Static | ✅ pair `tg-voicemimic-known/unknown` (worktree, pending commit) |
| mirror_stag | Grief Counselor | ✅ pair `tg-mirrorstag-known/unknown` (worktree, pending commit) |
| review_drone | Performance Review | ✅ pair `tg-reviewdrone-known/unknown` (worktree, pending commit) |
| bright_idea | Inspiration | ✅ HEAD pair `tg-inspiration-known/unknown` (+`-bihot` variant) |
| memory_projector | Nostalgia | ✅ HEAD pair `tg-nostalgia-known/unknown` |
| warranty_caller | Extended Warranty | ⏭️ no grid telegraph BY DESIGN ("THE PITCH: the rush. No grid telegraph — the ring was the warning") — `tg-warrantycaller-nodesign` (worktree) |
| glasswing | Glasswing Darter | ✅ HEAD pair `tg-glasswing-known/unknown` |
| sunbasker | Sunbasker | ✅ HEAD pair `tg-sunbasker-known/unknown` |
| understudy | The Understudy | ✅ HEAD pair `tg-understudy-known/unknown` |
| landlord | The Landlord | ✅ HEAD pair `tg-landlord-known/unknown` |
| heckler | The Heckler | ✅ HEAD pair `tg-heckler-known/unknown` |
| paparazzo | The Paparazzo | ✅ HEAD pair `tg-paparazzo-known/unknown` |
| union_rep | The Union Rep | ✅ HEAD pair `tg-unionrep-known/unknown` |
| moderator | The Moderator | ✅ HEAD pair `tg-moderator-known/unknown` (+`-known-shadowban`) |
| nevermore | Nevermore | ✅ **PAIR this run** — previously NOTHING |
| nightcourt | Night Court | ✅ **PAIR this run** — previously NOTHING |
| statickite | The Static Kite | ✅ HEAD pairs `tg-statickite-{mark,hot,dip}-known/unknown` |
| ducks_in_a_row | ducks in a row | ✅ pair `tg-ducks-known/unknown` (worktree, pending commit) |

Stale (proof targets an id not in HEAD data): `tg-middlemanager-*` (HEAD, 2026-10-06) targets legacy `delegate_beast`. Recorded, not touched.

**Result: after this run, every monster in HEAD data has a proof pair or an honest by-design reason.** 27/28 have pairs; lockpick_raccoon + hushwolf + speedbump_turtle + warranty_caller have no grid telegraph by design (documented above).

## Rendered this run (8 files, 4 pairs)

Scenario per monster: `debugScenario('<id>')` — player (2,4), monster 3–4 tiles east. Captured at the first declare; player HP pinned at 99999 so the fight runs clean.

- **nevermore** (`tg-nevermore-unknown/known`): THE UNKIND CUT — strafe declare. Line lane, length 3 × width 1, locked at declare (`commitCells`), windup 1. Known: 3 red line-bucket cells through the player tile; cue "The shadow detaches — a black lane across the ground. It's strafing THAT lane. MOVE OFF IT." + learned coaching ("It always lands after a run, hit or miss. Punish the landing."). Unknown: same moment, zero highlights (gate), first-contact cue "Its shadow slides off the branch without it — a straight black lane, growing." then the nevermoreVoice line.
- **nightcourt** (`tg-nightcourt-unknown/known`): ADJOURNMENT — dive declare. Single tile at the player's position (the moon-shadow), windup 1. Known: 1 bright-red target-tile cell; cue "The moon-shadow is growing under you. Silent dive. MOVE." + coaching ("dodge TWICE. Then it's spent." — the redive). Unknown: no highlight, "No sound. The shadow on the ground is growing."
- **bulldozer** (`tg-bulldozer-unknown/known`): CHINA-SHOP CHARGE — charge declare. 5-cell charge lane, windup 1. Known: 5 yellow charge-lane cells; cue + coaching ("Sidestep the lane — never try to outrun it."). Unknown: no highlight.
- **mirrormoth** (`tg-mirrormoth-unknown/known`): WING FLASH — flash declare. 5×5 burst (25 cells), windup 1, routed to the `flashBurst` style bucket (white) by the game's own style-voice routing. Known: 25 white cells; cue + coaching ("Wing Flash only fires FORWARD — it must face you. Circle behind it."). Unknown: no highlight.

Known cues all carry the earned "You know this one:" coaching tail (verified in `telegraph-proof-batch3-20261007.json`).

## Telegraph-truth checks (all against HEAD engine behavior)

1. **Bucket routing == declare data.** Known captures: bucket cells exactly equal declared `telegraph.cells` (3 / 1 / 5 / 25 — set-equality by construction of the render; no extra or missing cells).
2. **Unknown renders show NO highlight — BY DESIGN.** Same knowledge gate as the statickite batch (`tbAllTelegraphCells`: pattern not learned → skip entirely).
3. **First-contact naming.** First-ever declares name the attack `the attack` (generic); nevermore-known/nightcourt-known still show `the attack` as the header because the harness's `learn()` bypasses the observed-stage path (`attacksSeen`). In real play one resolved attack flips naming to "The Unkind Cut"/"Adjournment" via `tbLearnPattern`. Harness artifact, not a game bug — but the pairing makes the mechanism visible.
4. **All 64 `tg-*.svg` in evidence/ are well-formed XML; all PNGs have valid magic, 390px wide** (checked this run).

## Gaps / friction (recorded, not fixed — per assignment)

- **GAP 1 (fiction/UI friction, same class as wave-2 batch GAP 1):** unknown cues narrate a *visible* lane — "a straight black lane, growing", "the shadow on the ground is growing" — while the gate deliberately renders zero highlights. A player reading "black lane" looks for a lit lane and finds none. Steve/design call whether narration should say "a lane you can't read" instead.
- **GAP 2 (coordinator):** 8 worktree proof pairs (belltoad, catfish, ducks, heron, hummice, mirrorstag, reviewdrone, voicemimic) are still uncommitted; the index shows staged deletions on them (sibling churn) — verify worktree copies before committing.
- **GAP 3 (coordinator):** legacy singles `tg-bulldozer.svg` / `tg-flashbulb.svg` are superseded by the new pairs — safe to remove when the pairs land.
- **GAP 4 (roster/doc drift, standing):** `tg-middlemanager-*` in HEAD targets removed `delegate_beast`; `docs/MONSTER-WAVES.md` still lists design-concept wave-2 monsters (Influencer, Motivational Speaker, Customer Service, Terms & Conditions) not in `monsters.json`.
- **GAP 5 (harness note for future runs):** `drama.js` cannot be eval'd in node (top-level `document` access). The "full module list" harness must exclude it; everything telegraph-related loads fine without it.
