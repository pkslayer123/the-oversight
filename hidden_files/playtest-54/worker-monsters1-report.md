# Playtest-54: Wave-1 monster fights (monsters1) — worker report

Date: 2026-10-07. Headless node harness (`hidden_files/playtest-54/run-one.js`), played as a player:
walk toward the monster via `pathStep`, then fight with `tbPlayerStrike` /
`tbPlayerMove` + `tbPlayerEndTurn` (turn hygiene: advance only while still the
player's turn; WAIT when no live foes so reinforcements can arrive). Interior
tiles only. No repo files modified; no commits.

**Score: 7 PLAYABLE / 4 NEEDS WORK / 0 BROKEN.** Zero exceptions, zero
`undefined`/`NaN` in any say-log across all runs. Every fight resolved
(kill, rout, flee, or player death → mantle transfer).

---

## headlight
Verdict: PLAYABLE
Setup: Gallowdeer grazing 5 tiles east at night, fire-hardened spear, 2 villagers nearby.
Played: Walked 4 tiles; deer noticed → "It freezes. Like a deer in headlights. Light gathers behind its eyes. It is not frozen. It is aiming." Combat with villagers joining; freeze → whine → beam; sidestepped the sweep ("The beam swings wide, scorching the earth where you were." ×4), then got pinned once: "🔥 the beam doesn't need to sweep — it SITS on you! (91)" → died → mantle transfer, fight cleaned up.
Found: Full phase machine works (graze → notice → FREEZE/aim → beam → recharge "sags — the light behind its eyes dims to embers"). First-contact has no beam-lane warning per spec; codex writes "Ocular Discharge" after surviving. Balance note: dwell mult (2.5+dwell, up to 3.5×) one-shot a ~full-HP player (91 and 112 observed in separate runs) from a single tracking lapse. Dodgeable but extremely punishing for the wave-1 flagship.
Fix: Tuning call for Steve — consider capping dwell mult (~2.5×) or softening the first discharge vs fresh characters.

## flashbulb
Verdict: NEEDS WORK
Setup: Mirrormoth drifting 4 tiles east at night, spear.
Played: Walked 4 tiles; world phase: "It spirals closer… It's interested in you. Specifically you." → "It lands. It folds its wings. The light in them is building." Combat started; player struck once for 26 → moth died. Fight over in 1 turn.
Found: The signature mechanic (fold → face you → FLASH → "get behind it before the wings open") NEVER fires. Moth HP is [15,22] (`src/data/monsters.json:329`) vs spear 25–30 — it always dies on the player's first strike before its first turn. The entire flash/facing/recover machine (game.js `tbMothApproach`, flash phase, "Its wings hang open and dull — the light spent") is unreachable with the scenario's own loadout.
Fix: Raise mirrormoth HP to ~35–45 so it survives one spear hit and gets its flash turn, or have the flash resolve as an interrupt on the fold. (Design decision for Steve.)

## choir
Verdict: PLAYABLE
Setup: Belltoad + friend (pack 2) at dusk, spear.
Played: Walked 2–7 tiles; combat. Killed toads → "Silence — then, from the dark, another croak answers. The chorus continues." → "Another throat joins the chorus — the pack answers the call." Croaks hit AoE ("The chorus lands as ONE sound" ×2/×3), stun ("Your ears ring — the world tilts. The croak hits like a wall. You lose your turn."), codex "Resonant Croak". Final toad: "Its croak echoes alone. No answer. The pack is broken." One run: player died to chorus ×3 (fair — hard fight). Another: WAITed through the incoming chorus, killed all 4, fight resolved cleanly.
Found: Reinforcement loop, stun, chorus scaling all legible and resolving. No issues.

## lockpick
Verdict: PLAYABLE
Setup: Lockpick raccoon 4 tiles east at night, spear, smoked fish in pack.
Played: Walked 4 tiles; world: "It's not looking at you. It's looking at your pack." Combat → "🖐️ Its hands blur — and suddenly it's holding your Fire-hardened spear! It's already running." Player struck unarmed (14, no weapon suffix — correct) → "It yelps — drops your Fire-hardened spear — and runs for its life, empty-handed." → routed ("It got away… now you know its moves.").
Found: Steal-first signature fires exactly as specced; spear recovered on hit; flee resolves. No issues.

## hummice
Verdict: PLAYABLE
Setup: 4 hummice humming 4 tiles east at night, spear.
Played: "The humming gets louder. It's coming toward the sound of you." Combat vs 4. Swarm Hum AoE ("💥 Swarm Hum!"), per-kill "A voice drops out of the choir — the hum stutters and thins.", dodge feedback ("You're not where it landed. Clean dodge."), codex "Swarm Hum". Killed all 4, took 10 total. Resolved.
Found: Text nit — "⚠️ 1 threats: the humming in the grass 1 (×4)" (grammar). See Fix below; red test at `hidden_files/playtest-54/tests/test-threatword-20261007.js`.
Fix: `src/js/party-formal.js:476` — `threatWord` handles 2 and 3 but not 1: add `n === 1 ? 'One threat' :`.

## nightlight
Verdict: NEEDS WORK
Setup: Nightlight catfish glow 3 tiles east at night, spear.
Played: FLAKY — 2 of 4 runs: the catfish faded with no fight ("The glow dims and sinks. The water forgets it was ever there."). When water was near: "The water goes still around the light. Too still." → combat → "💥 The glow LUNGES — teeth where the light was! LURE AND GRASP!" (locks on; codex: "moving won't dodge it") → 2 spear strikes (armor absorbs 4 each) → dead. That fight is PLAYABLE.
Found: `nightlightActive` requires water within 3 tiles (`src/js/game.js:11924`); the scenario does NOT guarantee water, so the debug scenario is a coin flip — sometimes a fight, sometimes a fade. (Compare sunbasker's SUN GUARANTEE in `src/js/debug-scenarios.js:514`.)
Fix: Give the nightlight scenario a WATER GUARANTEE mirroring the sunbasker pattern — relocate to the nearest water tile (or carve one) in `debugScenario` nightlight.

## glasswing
Verdict: PLAYABLE
Setup: Glasswing darter 3 tiles east at midday, spear.
Played: Walked 1–3 tiles; trap: "The air feels wrong. A high whine, circling — then nothing." → "A shadow on the ground — faint/darker. Something is falling." → stood ground → "Something SLAMS into you from above! 26 damage. Wings thrash — it's GROUNDED." → combat → "The darter thrashes on the dirt, wings tangled. NOW. While it's down. Kill it." → strike 25 + "Wings tangled — it takes the hit badly. (+50% while grounded)" → dead.
Found: The full intended loop (vanish → dive shadow → grounded punish window) works. Runner note: the trap sets `s.monster = null` via `removeWorldMonster` (game.js:10442), so a naive "walk to monster" loop stalls — the trap must be waited out with `tickAction`. Not a game bug.

## sunbasker
Verdict: NEEDS WORK
Setup: Sunbasker 3 tiles east at midday on a guaranteed sun tile, spear.
Played: "Its scales are going gold. It's charging." → combat → PATIENT AIM doubled first strike → 47 damage → one-shot kill → alien loot drop ("✨ ALIEN LOOT: Spare battery").
Found: The signature loop (bask → solar charge builds +dmg/turn → charged bite; shade flattens) NEVER runs. HP [20,28] (`src/data/monsters.json:631`), armor 5 — a spear does 25–30 (52 with Patient Aim); it dies on turn 1 every time. The SUN GUARANTEE and charge machinery are unreachable.
Fix: Raise sunbasker HP to ~45–60 so it survives 2 spear strikes and gets a charged bite off (Steve's tuning call).

## bulldozer
Verdict: PLAYABLE
Setup: Bulldozer 3 tiles east at midday, spear.
Played: "It lowers its head. Paws the earth. This is the warning." → combat → charge lane telegraph → "💥 It slams through!" → "You're not where it landed. Clean dodge." → "It stands at the end of its lane, sides heaving. Flanks soft." → codex "China-Shop Charge" → flank strike 22 + "You catch it on the flank — soft, unarmored." → dead. Charge churned terrain slowed movement ("The charge leaves the ground churned and broken").
Found: Charge-lane → dodge → punish loop fully legible; terraform slow works. No issues.

## hushpuppy
Verdict: PLAYABLE
Setup: Hushwolf pack (3) circling 3 tiles east at night, spear.
Played: "The woods go silent — not quiet. Silent." → combat → "The dog-shaped silence at the treeline 3 is on you — no warning, just teeth." (15/14/18 — no grid rush indicator, per Steve's kill). Wounded the lead → "the pack's silence shatters into yips and snarls. Coordination broken. (WOUND THE LEAD: it worked.)" → pack feints/skirts. Killed lead → "Without the lead, another wolf melts back between the trees." Last wolf killed the player (Second Wind fired once). Resolved via death.
Found: Silent-rush fiction holds; pack coordination / lead-wound / melt-away mechanics all fire. Same "1 threats" grammar nit as hummice (same fix).

## whitenoise
Verdict: NEEDS WORK (mild)
Setup: White-noise heron 3 tiles east at dusk, spear.
Played: "It unfolds to its full height. The air goes staticky. Leave the creek." → combat → "It unfolds further — impossibly tall. The air goes staticky; the creek goes flat. It has decided." → player struck twice (27, 27) → dead in 2 turns.
Found: The unfold telegraph is distinct, but the heron's STRIKE ("a needle out of the white noise", game.js:19554) never resolved — 30–40 HP (`src/data/monsters.json:1861`) dies to two spear hits before its strike turn. The scenario's "Do not listen too long" threat is toothless against the scenario's own spear.
Fix: ~45–55 HP so the strike lands at least once, or an earlier strike beat (Steve's tuning call).

---

## Cross-cutting notes
- Runner lessons (for future workers, not game bugs): (1) glasswing trap nulls `s.monster` — wait out `s.gwTrap` with `tickAction`; (2) belltoad pending chorus only spawns on round advance — WAIT when no live foes; (3) territorial monsters step onto the player's tile — jiggle aside so the stance machine gets turns; (4) nightlight needs water within 3 or it fades by design.
- Hot-tree churn observed mid-run: `src/js/convo-dialogue.js` briefly had a syntax error (sibling mid-edit) that broke harness loads; resolved itself. Also saw transient "walk blocked at spawn" maps — RNG, not a bug.
- Red test: `hidden_files/playtest-54/tests/test-threatword-20261007.js` — currently RED (exit 1), demonstrates the "1 threats" bug via `Game.offerSplit` with a stubbed context.
- Raw per-scenario JSON (say-logs, actions, fighters): `hidden_files/playtest-54/out/<name>.json`.
- Runner: `hidden_files/playtest-54/run-one.js` (plays one scenario, writes JSON).
