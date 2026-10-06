# Wave-2 Escalation Audit — The Real Wave-2 Bar
**Date:** 2026-10-06 · **Auditor:** worker (read-only — no game code touched)
**Context:** Steve's correction — the Highbeam Deer (160 HP, wave 1) cannot be the wave-2 bar. Wave 2 must be defined on its own terms: a genuine step up from wave 1 in threat AND complexity, not reskins.

**Method:** Static inventory of all 11 wave-2 monsters (monsters.json + game.js AI blocks + app.js audio registry) plus headless as-a-player playtests of the strongest candidate (Landlord), the weakest candidate (Heckler), and the Understudy (most novel mechanic). Harness pattern from `scripts/play-feel-20261006-warranty.js`, with one harness bug found and corrected (see §5).

---

## 1. Wave-1 baseline (what wave 2 must step up from)

| Tier | HP | Example | Threat note |
|---|---|---|---|
| Trash | 10–35 | hummice (10–14), hushwolf (25–35) | pack/niche |
| Mid | 40–70 | bulldozer (40–55, charge 18–26), speedbump_turtle (50–70) | honest bruisers |
| **Ceiling** | **150–170** | **Highbeam Deer (Ocular Discharge 22–32, sweeping beam, 5 phases: stalk→aim→charge→firing→cooldown)** | the wave-1 boss |

Wave-1 median HP ≈ 30. The deer's bar: distinct telegraph text, 9-tile sweeping beam with 6 fireTurns, named phases, full audio suite (notice/aggro/snort/charge/fire/sweep-pan/sweep-stop/blocked/down), `knownCue` coaching, psychic resistance 0.5, pain-switch, relentless.

---

## 2. THE WAVE-2 BAR (concrete, checkable)

A wave-2 monster **meets the bar** iff it clears ALL of A–I. Numbers are testable; experience beats are play-verified.

**A. Threat floor.** HP ≥ 55 (above wave-1 median ~30) AND sustained damage ≥ wave-1 mid tier (≥ 14/round).
**B. Apex slot.** The roster's apex member must exceed the deer on raw pressure: HP ≥ 150 **or** sustained throughput ≥ 25/round with a harder-to-answer counterplay. ⚠️ *Currently NOBODY — the deer remains the game's scariest fight. This is the roster's biggest structural gap.*
**C. Novel trick.** A mechanic wave 1 doesn't have — not a charge/beam/burst/rush reskin with new paint.
**D. Reachable second act.** The fight visibly changes phase mid-combat, and the second act fires within a normal fight (≤ 8 rounds vs a specced player), **play-verified**, not just code-present.
**E. Telegraph.** Monster-specific declare text; grid-visible pattern or persistent world-change (projected line, claimed tiles, prediction radius).
**F. Phases.** ≥ 3 named phases the player can read (`encSetPhase`).
**G. Audio.** Zero silent `audioEvent` no-ops — every fired name resolves in `Game.audio`. Mechanical check: compare `audioEvent('x')` call sites in game.js against registry keys in app.js.
**H. Knowledge gating.** `encounter.knownCue` coaching that fires only after the pattern is learned; 3 codex stages; **codex slain text must not advertise moves the code doesn't implement** (mechanical check: grep move names from slain text in game.js).
**I. Armor/resistances.** Fiction-matched, never blank (armor 0 is fine if it's a deliberate statement, e.g. "fragile — the mouth is the whole monster").

---

## 3. Per-monster verdicts

| Monster | HP / dmg | Bar A–I | Verdict |
|---|---|---|---|
| **review_drone** | 80–110 / 18–28 beam | ✓ threat, ✓ predictive-aim trick, ✓ project→countdown→correct→recalc, ✓ bespoke codex-gated cues, ✓ armor 6 + electric res, ✓ audio all wired, ✓ knownCue | **MEETS** |
| **voice_mimic_radio** | 65–90 / 16–24 direct | ✓ lure→approach→reveal→REPLAY-rush trick, ✓ second act (revealed rusher), ✓ armor 3 + sonic/electric res, ✓ knownCue, ✓ audio wired | **MEETS** |
| **memory_projector** | 65–90 / 16–26 beam | ✓ watch→spell→static loop, ✓ HOMESICK escalation (still targets found faster), ✓ armor 2 + psychic res, ✓ knownCue, ✓ audio wired | **MEETS** (lightest of the six, but complete) |
| **warranty_caller** | 80–110 / 14–22 rush | ✓ dial→ring→pitch→redial, ✓ wrong-number dials villagers, ✓ bad-connection/call-drop counterplay, ✓ knownCue, ✓ audio wired, res psychic 0.25 (thin but present) | **MEETS** |
| **bright_idea** | 55–80 / 22–34 burst | ✓ settle→brighten→bloom→ember, ✓ REKINDLE (ember window shrinks 2→1→0), ✓ fears daylight, ✓ physical res 0.75 (you can't punch an idea), ✓ knownCue, ✓ audio wired | **MEETS** |
| **mirror_stag** | 80–110 / 20–30 charge | ✓ deer-evolution fiction, ✓ mirror/gaze-freeze charge (new vs deer), ✓ knownCue, ✓ armor 2 + psychic 0.75, ✓ audio wired | **MEETS** (threat below the deer it iterates on — odd for a "System iteration," but the gaze mechanic is new) |
| **understudy** | 70–95 / copies YOUR dmg | ✓ novel trick (learns weapon at 50/65/80% fidelity), ✓ watching→rehearsing→performing, ✗ no armor/resistances, ✗ no knownCue, ✗ 3 silent audio events, ✗ codex promises **Opening Steal + Desperate Improv — NOT IMPLEMENTED** | **NEAR** — play-verified escalation works (rehearsing @2 obs, performing @4 obs) but phases blow by in ~2 rounds; presentation gaps |
| **landlord** | 90–120 / 18–26 direct | ✓ terraforming jurisdiction, ✓ surveying→claiming→collecting, ✓ claimed tiles render (CSS `claimed`), ✗ no armor/resistances, ✗ no knownCue, ✗ 2 silent audio events, ✗ spread is ONE-SHOT (`llSpread` flag — "Jurisdiction Spread" never grows again), ✗ +2 heal never matters (dies in ~5 trading rounds before heal is relevant), ✗ codex "damages you for standing on claimed ground" — actually entry-only (1/step) | **NEAR** — tankiest wave-2, but threat ≈ bulldozer tier; trick only fires when it chases you (stand-and-trade skips it) |
| **paparazzo** | 65–85 / 12–18 burst | ✓ prediction stacks → unavoidable flash @5, ✓ flash freezes 1 turn, ✓ widening shot, ✓ candid→tracking→exclusive, ✗ no armor/resistances, ✗ no knownCue, ✗ 1 silent audio event (exclusive), ⚠️ prediction-5 reachability marginal (~3-round fights → exclusive rarely fires) | **NEAR** — mechanic complete, second act nearly out of reach |
| **union_rep** | 80–105 / 14–20 direct | ✓ best second act of the five (WALKOUT @half HP: untargetable, allies +8), ✓ organizes/buffs/summons wave-1 picket, ✓ organizing→picketing→walkout, ✓ all audio wired, ✗ no armor/resistances, ✗ no knownCue | **NEAR** — strongest of the new five on escalation; presentation gaps only |
| **heckler** | 55–75 / 10–14 direct | ✗ **signature escalation unreachable**: shame builds ~1/4 rounds (40% jibe chance) vs a 65-HP body that dies in 3 spear rounds — headliner (5+) and the compulsion NEVER fire in a normal fight; ✗ 2 silent audio events; ✗ no armor/resistances; ✗ no knownCue; ✗ codex promises **Pile-On — NOT IMPLEMENTED**; direct attack (10–14, unavoidable) out-threats the trick it's supposed to be the sideshow to | **DOES NOT MEET** |

**Veterans** (scarred/elder/pack-leader on 40% of wave-2 spawns): brace (−3 first strike), stun immunity, extra packmate +2 coordination — real tricks, fine as seasoning. Not bar members.

**Scoreboard: 6 meet · 4 near · 1 fails. Plus one structural gap: no wave-2 apex above the deer ceiling.**

### Feel-test notes (played, not simulated)
- **Landlord:** jurisdiction reads on the grid (claimed trail + one-shot spread). But: in a stand-and-trade the fight is just a 105-HP direct-18–26 bruiser (mutual death in ~5 rounds); the territory trick only appears when it chases you. +2 heal never fired. Eviction Notice is honest but unremarkable — same band as the bulldozer.
- **Heckler:** jibes land and read well ("My grandmother hits harder and she's a concept"), but the fight is over before SHAME reaches 2. The compulsion — the entire design point — is a ghost. Meanwhile its unavoidable 10–14/round chip is the actual threat. Wrong threat, unreachable trick.
- **Understudy:** the learn→rehearse→perform arc works and reads ("I've got it now"), and the copy CAN kill you back (17 at 80%). But it dies in ~3 rounds, so "performing" lasts one beat. Either it needs HP to survive its own arc, or the arc needs to compress (rehearse@1, perform@3).

---

## 4. Prioritized fix list (for future workers)

**P0 — bar-blocking (all five new monsters):**
1. **Wire 8 silent audio events** (mechanical check provided in §2-G): `understudyWatch/Rehearse/Perform`, `landlordSpread/Evict`, `hecklerJibe/Headliner`, `paparazzoExclusive`. Map to existing synths or write new ones. (union_rep's three are already wired.)
2. **Heckler escalation unreachable.** Pick one: lower headliner to 3 shame + raise jibe rate when it lands attacks; or raise HP to 85–100 and cut direct to 6–10 so the SHAME loop is the threat. As-is it's a 65-HP chip mob with a trick the player never sees.
3. **Codex-vs-code lies.** Implement or cut: understudy "Opening Steal / Desperate Improv," heckler "Pile-On." Landlord slain: "damages you for standing on claimed ground" → entry-only wording. (G-check: grep slain move names in game.js.)
4. **`encounter.knownCue` for all five new monsters** — the earned-coaching tail (`tbTelegraphCue` knownTail) currently fires for the six old wave-2 monsters only.
5. **Armor/resistances for the five** (never blank): e.g. understudy — none while watching, learns yours when performing; landlord — thick hide; heckler — 0, stated as fragility; paparazzo/union_rep — fiction-matched.

**P1 — escalation depth:**
6. **Landlord jurisdiction is a one-shot.** Spread fires once at llClaimed≥2, then never again; claim rate is 1 tile/move. Make the lease actually grow (spread on a timer or every N claims) or the "jurisdiction" framing is one beat.
7. **No wave-2 apex above the deer.** The deer (160 HP, 22–32 sweeping beam) is still the scariest fight in the game. Wave 2 needs an apex slot — HP ≥ 150 or throughput ≥ 25/round with harder counterplay. Candidates: promote landlord (bulk + lease) or union_rep walkout-into-picket as the apex encounter; or design one. Until then "wave 2" is harder-by-complexity but not by threat.
8. **Paparazzo exclusive reachability:** verify prediction-5 in play; if fights end at 2–3, drop exclusive to 4 or make flashes land more reliably.
9. **Understudy arc pacing:** it learns at 2/4 observations but dies in 3 rounds. Compress (rehearse@1, perform@3) or give it HP to survive its own second act.

**P2 — hygiene (found during audit):**
10. **Stale `tbBatch4Cue` branches** for deleted monsters (camera_swarm, hype_horn, delegate_beast) — dead code referencing the removed roster; will rot.
11. **Duplicated `usSeen` recording block** (game.js ~15037–15058) — copy-paste sibling; dedupe.
12. **Harness bug:** `scripts/play-feel-20261006-warranty.js` calls `Game.tbPlayerStrike('p')` — a no-op (must pass the target's fighter key). Any playtest built on it measured nothing. Grep for siblings.

---

## 5. Method notes / caveats
- Playtests were headless node harnesses (`/tmp/play-*.js`, NOT committed — read-only task). Turn hygiene per AGENTS.md: `endTurn()` advances exactly one AI round.
- The warranty playtest script in-repo uses `tbPlayerStrike('p')`, which returns false (target must be a monster/hostile fighter). My first three runs inherited this and measured monster behavior with a passive player; reruns with the correct target key gave the feel verdicts above. Note the earlier "mutual death" landlord observation was from the broken-harness run and should be disregarded.
- Audio registry check was mechanical (call sites vs registry keys); synth *quality* ("freaky not generic") was not judged here.
- Visual verification was grid-ASCII, not 390×844 screenshots — final mobile visual pass belongs to the visual worker.
- Tree was clean at audit start (`git status` empty); no commits made. This note is uncommitted by design (shared tree).
