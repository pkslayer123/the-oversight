# Glasswing Darter + Sunbasker — played play-audit (2026-10-07)

Proof script: `scripts/play-feel-20261007-glasswing.js` (seeded mulberry32, default seed 20261007;
also run with SEED=77 — green across both seeds except the two flagged findings below).
Engine loaded read-only from HEAD (`git show HEAD:<path>`); full production script list in
index.html order minus DOM-only app.js/sprites.js/tile-scenes.js/move-anim.js. As a player:
spear, dodge-the-shadow brain (glasswing), pressure-the-bask brain (sunbasker).

## Verdicts per mechanic

### Glasswing Darter

| Mechanic | Verdict | Evidence |
|---|---|---|
| Pre-combat dive trap (shadow grows on every action) | **PASS/FUN** | 3/3 ticks narrated ("A shadow on the ground — darker…"), `glasswingShadowClose` audio escalates x2. Moving off the tile dodges cleanly (hp unchanged, trap cleared). Standing still eats 26–27 dmg (direct 20+rand10) and combat entry does not throw. |
| In-combat dive telegraph (shadow IS the warning) | **PASS/FUN** | `gwDiveShadow()` grid contract valid 8/8 samples: `{phase:'dive', tile:{x,y}, turnsLeft, streak[]}`. Dodge-the-tile → miss → grounded, 7/7. The shadow + fall-path streak reads; moving feels like the intended skill. |
| Circle → dive → grounded phases | **PASS/OK** | Far-spawn fight: circle (high, whine) → closes → dive declared → dodge → grounded → kill. First-contact fight also exercised hit-dive: 15 dmg → "snatches at you and climbs" → circle → re-dive. Distinct from nevermore (lane) / nightcourt (double-dive) / statickite (3x3 mark): single-tile shadow drop. |
| Circling = out of reach | **PASS** | Spear strike at circling darter: 0 dmg, "It's high overhead — out of Fire-hardened spear reach. Watch the shadow, not the bug." (known) — honest, action spent, codex-gated coaching. Sling/bow (range 4–5) is the built counter. |
| Grounded punish window | **PASS/OK** | Miss → grounded, +50% dmg, "GROUNDED. Now." — the window is real. **But:** one spear hit (41–47 dmg vs 18–26 HP) ends it; every fight was dodge → one-shot, 2–3 turns. See Steve's-call below. |
| knownCue coaching | **PASS** | Taught (patterns learned by surviving the bite/dive — `tbLearnPattern`, the honest gate): "The shadow detaches — it's diving at YOUR tile. MOVE. (Watch the shadow, not the bug.)" x6–7. First contact: dread only ("A shadow moves wrong against the sun — circling…"), zero coaching. |
| Audio hooks | **PASS** | `glasswingCircle/Dive/Land/Climb/ShadowClose` all fired and all resolve in the CombatAudio registry with real synths. |

### Sunbasker

| Mechanic | Verdict | Evidence |
|---|---|---|
| Bask-to-charge legibility | **PASS/FUN** | Charge builds 1 → 2 over held turns; scales dull brown → gold → molten; `sbHeatKeys()` halo contract valid (charge + monster + chebyshev ring); grass blackens where it basks (terraform). The meter is the monster's glow — readable without numbers. |
| Break the bask (hit it) | **PASS/FUN** | Any damaging hit zeroes charge: "The blow knocks the charge out of its scales — dull brown again. The bite starves." + `baskBreak` audio. Mid-windup strike (charge 2 → 0): the declared bite then landed for 8–14 (base) instead of 16–22 (charged). Counterplay is pressure, and it works exactly as fiction says. |
| Break the bask (shade it) | **PASS** | Tree-canopy shade → flattens, "No sun, no fight.", `baskFlatten` audio, `sbHeatKeys()` → null. Flattened lizard still killable. Sun-aware approach routes around shade; won't voluntarily leave sun ("No sun, no fight" cuts both ways — nice). |
| Tracking bite | **PASS/OK** | Declared bite: "It tracks: hit it NOW and the charge dies before it lands." Moving 2 tiles during windup did NOT dodge it (bite still landed ~16–22). Honest — the counterplay is the charge, not footwork. |
| knownCue coaching | **PASS** | After surviving one bite: "Fully gold — Sun-Charged Bite incoming. It tracks: hit it NOW…" First-timers get "Its scales go molten gold. Heat shimmers…" — dread, not lecture. |
| Audio hooks | **PASS** | `baskCharge` (charge-scaled), `baskBreak`, `baskFlatten` all fired, all registered, all have synths. |
| No silent turns | **FAIL/BROKEN (minor)** | 2 silent monster turns in 59–62: repeat turns while `sbFlat` — the flatten branch (game.js ~22723) only narrates on the transition; subsequent flat turns say nothing. First flatten is narrated; the 2nd/3rd flat turns are dead air. |
| Audio registry completeness | **FAIL/BROKEN (minor)** | `knowledgeReveal` fired 47× this run (game.js:4157, 5373, 5382, 10711, 10843, 15713, 24787) but has **no CombatAudio registry entry and no synth** in app.js — plays mute. game.js:24787 even comments it's "the audio worker's mapped hook (app.js)" — the mapping was never added. |

## Bugs flagged (engine READ-ONLY — not fixed)

1. **game.js:22723–22731** (HEAD `015cb07`): sunbasker flatten branch — `if (!m.sbFlat) { …say… }` then bare `tbRefreshTelegraphUI(); tbEndCheck(); return;`. Repeat flat turns produce zero narration (2 observed). Suggest a repeat line ("It lies flat in the shade, dull brown. Still breathing.") or confirm silence is intended.
2. **app.js CombatAudio registry (~9025–9315)** (HEAD `015cb07`): `knowledgeReveal` missing from the registry object AND no `function knowledgeReveal` synth exists anywhere in app.js, while game.js fires it from 7 sites. Orphaned hook — every knowledge/slot/synergy/technique reveal plays mute.

## Steve's-call items (tuning vs bug — not decided)

- **One-shot grounded darter:** spear deals 41–47 (with +50% grounded) vs 18–26 HP — the "kill it when it lands" window always ends in one hit, fights run 2–3 turns. Same for sunbasker (20–28 HP vs ~20–26 spear hits; the bask never builds under spear pressure — which IS the counterplay working). Wave-1-appropriate fragility, or should the punish window need 2 hits to feel earned? Fists-only players would see the full loop; spear players skip it.
- **Charge cap 3 is unreachable:** bite declares at charge ≥ 2, and the windup blocks further basking, so `sbCharge` never reaches 3 — `Math.min(3, …)` never binds. Harmless defensive code; flagging in case charge-3 was meant to be reachable (e.g. declare at 3 instead of 2).
- **Name stays unknown after learning:** display name remained "a shadow moving wrong against the sun" with stage=observed + patterns learned — by design (`monsterDisplayName`: true name only after System arrival or a villageName). Noted as observed-and-intended.

## Feel notes (played, not just executed)

- The trap is the scary part and it works: the darkening shadow + escalating audio + "move" instinct lands before combat even starts. The in-combat dive is the same trick a second time — fine for wave 1, it teaches once and then it's a solved puzzle (dodge → punish).
- Sunbasker is the better fight of the two: the charge loop has a real decision (pressure vs. eat the bite), the tracking bite punishes the wrong instinct (dodging), and shade-flatten gives the clever player a third answer. The terraform scorch marks are a nice touch — the fight leaves a scar.
- Both fights are short with a spear. The drama is all in the telegraphs, which is where it should be.

## Files

- Proof script: `scripts/play-feel-20261007-glasswing.js`
- Seed 20261007: 27/29 assertions PASS; Seed 77: 27/29 PASS (same 2 findings). Exit code 1 on failure (verified).

## Addendum (post-commit re-verification)

HEAD moved during the audit (sibling commits landed; parent is now `00188bd`).
Both flagged findings re-verified at `00188bd`:
1. Flatten branch still transition-only narration — now game.js:22737–22745.
2. `knowledgeReveal` still 0 occurrences in app.js — still orphaned.
The audit itself ran against `015cb07`; no engine code was touched by this worker
(new files only), so there is no stale-base revert hazard from this commit.
