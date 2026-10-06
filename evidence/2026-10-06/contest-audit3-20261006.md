# Contest playtest audit 3 (Steve 2026-10-06)

Read-only audit — contests.js was dirty (sibling working), so NO fixes applied. All findings documented with file:line for the owner.
Proof: `scripts/play-contest-audit3-20261006.js`, `scripts/probe-contest-fairness-20261006.js` (plain node, no jest).
Prior runs covered: pit, maw, riddle, confession, honey, secrets, gauntlet, hide(watch), oath, siege, starve, duel(refuse), quiet, guest, vigil, pantry_raid. This run plays only contests NO prior run has played.

## Structural sweep — all 34 pool ids (scripted)
Every contest: all phases have ≥1 choice, every `next` resolves (index in bounds or WIN/LOSE/DIE/REFUSE/VERDICT), death line exists, 3 bespoke watch beats (0 generic fallbacks — pool fully fleshed), and the givesChoice prepend SHIFT never self-points or goes out of bounds.
**Result: 0 structural issues.** No stuck states anywhere in the pool.

## PLAY 1: THE DROP — grabbed, multi-take (you + Giovanni, Aisha)
**PLAYABLE ✓. FEAR: high and honest.**
- Interruption is unavoidable and says so: `📺 You — you're grabbed. No choice. The cameras are already rolling.` + `📺 Taken with you: Giovanni and Aisha. Different lights. Same cameras.`
- Intro sets stakes: `People die in this one. Regularly.` / `They drop you on a ridge with nothing. The beacon is three miles through snow and attitude.` / `Two others hit the ground near you. Nobody waves.`
- Choices are all honest about cost (no silent actions — the rule holds):
  - `Move fast (burn bright)` / `Forage as you go (slow, fed)` / `Follow the others (let them break trail)`
  - `Keep moving at night (dangerous, gains ground)` / `Shelter and shiver (lose time, live)` / `Eat snow (hydration, cold core)`
  - `Sprint the last mile (everything left)` / `Pace it home (steady)` / `Collapse short (so close)`
- Smart-aggressive run WON: hp 100→59, kcal 3000→1800, trauma 0. Damage and hunger are the price; trauma 0 feels slightly cheap for "people die regularly" but the hp/kcal bill is real.
- Others' fates roll at your sequence end: `📺 While you fought your fight, they fought theirs.` → Sarah survived; rigged-death Brooklyn: `📺 Brooklyn didn't come home.` + contest-specific death line (`The beacon kept blinking. Brooklyn stopped walking toward it a mile out. The snow does the rest — quietly, the way it does for everyone.`) + real roster removal + `☠ Brooklyn is gone. The village will say the name for a long time.` + trauma +8.
- **Feel seam (Steve-call):** the fiction is a RACE against Giovanni and Aisha to one beacon (`First back to the beacon eats. The others... walk.`), but their fates resolve as independent off-screen contests (win/lose/die rolls), not as finishing positions relative to you. The intro's "Two others hit the ground near you" and the resolution's "you had your own arena" (that line is the watch-mode one; here it's "they fought theirs") don't quite agree on whether you're racing each other. Works mechanically; fiction could be tightened.
- Nit: `📺 Sarah survived. Barely, by the look of them when the lights came up.` — generic "them" for a named villager. (Singular-they is fine; reads slightly flat after a name.)

## PLAY 2: THE BOX — choice offered, you PARTICIPATE
**PLAYABLE ✓. FUN: puzzley, the chat mechanic is the joke and it lands.**
- Choice phase prepends cleanly: `[Participate (step into the light)] / [Refuse (say no on camera)]`, numeric nexts shifted +1, REFUSE routes to the refusal sequence (verified structurally for all 34, played here via Participate).
- Puzzle phases: `Study it first (patience)` / `Trust the chat (crowdsource)` / `The elegant solution (beauty)`. Won: hp 100→85, trauma 0.
- **Reward is knowledge-gated and diegetic — no leak:** `📺 The System presses something humming into your hands: Spare battery. Powers System tech. You have no System tech. Still: dense, valuable, faintly warm.` — names it, tells you what it ISN'T, never what it does. This is the rule working.
- Codex after win: `{seen:2, wins:1, level:1}` — doing teaches double, no instant veteran. Progression pacing holds.

## PLAY 3: COOKFIGHT — WATCH MODE. Connor + Carol taken, you spared.
**PLAYABLE ✓. FUN: the funniest watch of the run. FEAR: real when rigged.**
- Announced properly (interruption principle for the spared): `📺 Connor and Carol have been taken. The village holds its breath.` + `📺 You watch. The cameras love this part.`
- Contest-specific beats, not filler:
  - `Two cooks. One counter. The ingredients are alive and they object to the menu.`
  - `Cooking With Teeth — the sauté pan just bit Connor and Carol. The crowd roars.`
  - `Two plates go up. One of them is still moving. The judges taste. The galaxy holds its breath — the wrong presentation here costs more than the prize.`
- Watcher agency is REAL, not decorative: `Cheer them on (loud — the cameras notice)` → +5% win odds and `the cameras swing toward YOU for a second`; `Bet 200 kcal on Connor (the System honors wagers)` → real kcal moved (lost run: kcal 3000→2800, `Your 200 kcal is gone. The house always eats.`); `Study the pattern (learn without bleeding)` → teaches; `Go to them (after)` → trust/mourning.
- Rigged-death run: BOTH died on camera (medium base 0.03, rigged 0.01). `📺 The Death Reel will be tasteful. It won't be.` + `☠ Jacob is gone. The village will say the name for a long time.` ×2, both off roster, player trauma 34. **The fear lands.** A medium-risk cooking show can still bury two villagers and the game doesn't flinch. That's FEARED.

## PLAY 4: SHOW — WHY DO THEY EAT? (villager pull-away)
**PLAYABLE ✓ as a gossip beat.** `📺 The cameras want Lena. No reason. Lena is going on television.` / `📺 Lena will be back by morning. Probably.` — the "Probably" is the whole joke and it works. Showmanship notability feeds the eligibility panel (verified: `audience favorite (2×)` surfaces). Shows are texture, not gameplay; they do their job.

## PLAY 5: MOOT — natural flow fire (day 15) → resolve (day 16)
**PLAYABLE ✓.** Announcement: `📺 CONTEST: The Moot. Televised trial. Defend yourself against accusations (true or not). The audience is the jury.` + arena + `📺 You have been chosen. The village holds its breath.` → pendingContest firesDay 16 → next-day resolve interrupts into the playable sequence. Blind run: `Tell the truth (radical)` → `Double down (commit)` → `The whole truth (burn it down)` → WON, hp 100→87, trauma 13. Winning a moot costs you socially (trauma) — the social-costs rule is alive here.

## PROBE: judge selection / RNG fairness
- Eligibility panel is legible: with 5 villagers placed, 6 eligible, notability notes surface earned fame — `slew a wave-2 beast`, `audience favorite (2×)`, `won 1 contest(s)`. (Children/old/dead/severed excluded — the "rare mercy" rule.)
- First-pick: no-whim (90%) → always the player. Whim (10%) → uniform over eligible — verified taking a villager: `📺 The System's whim: Sofia is *interesting*.`
- Multi-take is real: lottery takes 5 — `The System has taken You, Omer, Scarlett, Siobhan and Leah.`
- **Feel note (Steve-call):** the System prefers YOU ~9:1 by design ("it finds you interesting"). That's the fiction, but it means the player is interrupted constantly while villagers mostly watch. Multi-take spreads the fear somewhat. Whether 90% is too player-centric is a design call, not a bug.

## Knowledge-gating spot sweep (played contests)
Level-0 intros and watch beats for drop/box/cookfight/moot: **no 📚 leaks.** Prize announce names the item without mechanics. Judge commentary in beats (`The judges are taking notes with very long utensils`) reveals nothing learnable. Verdict rolls don't display odds. The rule holds on every surface played.

## Mobile one-screen
Max phase text across all played contests: 268–404 chars; max 4 choice buttons. The contest box (phase text + inline buttons, modal over the narration surface) fits comfortably — nothing near scroll territory. ✓

## Bugs found (DOCUMENT ONLY — contests.js dirty, do not fix)
- **B1 (minor, src/js/contests.js:134):** `` `won ${deeds.contestWin} contest(s)` `` renders `won 1 contest(s)` in the eligibility panel. Suggested: `` `won ${n} contest${n>1?'s':''}` ``. Only `(s)` instance in the file.
- **B2 (nit, _contestResolveOthers):** `📺 Sarah survived. Barely, by the look of them when the lights came up.` — named villager + generic "them". Suggested: `by the look on their face` is fine, or drop the clause.
- **No stuck states, no leaks, no double-📺, no bad nexts** — verified across all 34, not just the played five.
- Probe artifact (not a game bug): my first fairness probe placed no villagers on the grid → only the player was eligible. Villagers need `village.positions` entries to be contest-eligible (by design — debug scenarios place them). Re-ran correctly.

## Verdicts
| Scenario | Playable | Feel |
|---|---|---|
| The Drop (grabbed, multi-take) | ✓ | FEAR high; honest costs; fiction seam on the race-vs-arenas (Steve-call) |
| The Box (choice→participate) | ✓ | FUN; chat-crowdsource joke lands; prize gating exemplary |
| Cookfight watch (2 taken) | ✓ | FUN + FEAR; watcher agency real; watched deaths land hard |
| WHY DO THEY EAT? show | ✓ | gossip texture; "Probably." |
| Moot natural flow | ✓ | social costs on winning; countdown→interrupt flow clean |
| Judge selection | n/a | legible panel; 90% player-preference is the design (Steve-call if too much) |

Nothing here blocks play. B1/B2 are polish. The race-fiction seam and the 90% player-preference are the two judgment calls worth Steve's eyes.
