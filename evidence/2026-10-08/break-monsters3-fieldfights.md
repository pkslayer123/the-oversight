# Break-it: monsters RUN 3 — the real-fights engine (2026-10-08)

Hostile-player run against the brand-new real-fights engine (`src/js/fieldFights.js`,
commits f06255f/abd802f — never adversarially tested until now). Runs 1–2 attacked
code paths that no longer exist; this run read `break-monsters.md`, `real-fights.md`
and `parity-hunt.md` first and went deeper into the new engine. Three catches, all
fixed + proven. Everything else held.

## CATCH 1 — Fight wounds silently dropped on wins (EXPLOIT + HONESTY) — FIXED

**The break:** `resolveWildMonsterEncounter` (game.js) and `expeditionMonster`
(villager-agency.js) applied `rec.vTaken` through `hurtVillager` ONLY on
vFlee/vDie. On vKill and mFlee the villager walked away at FULL health while
the gossip/deeds announced "3 rounds, 44 taken" — copy lied about wounds that
never landed. Worse, it was farmable: a strong villager could chain fights
forever at zero attrition, banking trust (+4/+2 per fight) and bravery XP for
free. The "hard fight" Steve ordered had no cost when you won it.

**The fix:** both routers now call `hurtVillager(vid, rec.vTaken, 'monster')`
on vKill and mFlee too. Non-lethal by construction (vTaken < starting HP
whenever the outcome isn't vDie — the vDie check fires first), so it can only
wound, never silently kill; the lethal path still routes through the real
death pipeline (registerDeath → removeVillager('killed') → gossip → fallen).

**Sibling sweep:** the only two `fieldFight` consumers are the two routers —
both fixed. `rec.vTaken` is now consumed on every non-evade outcome in both.
No other fight-record readers exist.

**Proof:** `scripts/test-break-monsters3-fieldfights-20261008.js` §1–3 —
canned vKill/mFlee records drop health by exactly vTaken in both routers
(100→63, 100→78, 100→59, 100→85), exactly once (no double-application), while
XP/deeds/kill-counts still grant. Also forced an update to
`scripts/test-parity-combat-20261008.js`: its outcome buckets were inferred
from the stubbed `hurtVillager` ("hurt > 0 ⇒ mauled"), which the fix
invalidated — it now classifies by the fight's real outcome and asserts the
new contract ("every win cost blood", 6/6).

## CATCH 2 — The pack never broke when the lead fell (HONESTY, engine) — FIXED

**The break:** `fieldFight` promoted `members[1]` to a second lead when the
lead died and kept fighting — contradicting the module's own doc ("the pack
dies/scatters with it"), the data (hushwolf weakness: "broken coordination
(wound the lead)"), the evidence doc ("pack breaks when the lead drops"), and
the tactical engine ("THE LEAD FALLS: without it, the pack melts away" —
60% flee each, rest broken). Second-order damage: `m.hp` persistence then
wrote the DEAD lead's 0 HP onto the live world entity while phantom pack
members (fresh-rolled HP each fight) kept fighting under it — a 0-HP zombie
leading ghost fighters, encounter after encounter.

**The fix:** when `members[0]` (the world entity, the true lead) drops, the
fight ends immediately as vKill — the pack dies/scatters with it, logged
honestly ("The lead falls — the pack's coordination shatters."). Members never
promote. The wound-below-threshold path (mFlee) already keyed on the true lead
and is unchanged. With the lead always alive at persistence time, the zombie
case is structurally unreachable.

**Proof:** §4 — deterministic rig (1-HP pack, 0-damage monster): lead dies
round 1 ⇒ vKill in exactly 1 round with the shatter line in the log (before:
3 rounds grinding phantom members). §5 — 300-fight battery against a live
world entity: zero 0-HP-live entities, `m.hp` tracks the lead on every mFlee.

## CATCH 3 — Dead 'standoff' outcome (DEAD-CODE) — FIXED

**The break:** the 15-round cap always resolves to vFlee/mFlee ("the worse-off
side disengages"), so 'standoff' could never be returned — but three sites
still branched on it: `fieldFightSummary`, the game.js router, and the
expedition router's comment. Unreachable branches that a future reader would
treat as live.

**The fix:** removed from the outcome enum, the summary, and both callers.

**Proof:** §6 — 2000 seeded fights never return 'standoff'; source checks
confirm zero remaining references in the three files.

## Attacked and HELD (solid notes)

- **Exploit — damage double-count:** fieldFight never persists villager HP
  back to state (only `m.hp`); each router applies `rec.vTaken` exactly once
  via `hurtVillager`. Proven: health drops by exactly vTaken, never 2× (§3).
  The player never enters fieldFights (villagerMonsterTick skips the player's
  tile; the player fights through the tactical engine) — no cross-engine
  double-dip.
- **Exploit — XP farming:** bravery/tracking XP per fight are small integers
  with capped benefit (vBreak bottoms at 0.15, evade bonus caps at +0.30);
  every contact now costs real wounds; evade yields no bravery, no kills, no
  meat. Fights teach AND cost — no infinite loop.
- **Exploit — infinite wins:** wins now accumulate real wounds, so chaining
  ends in retreat or the real death path. Trust/bravery gains are bounded by
  survival.
- **Honesty — awareness inputs:** evade formula audited against data — all 28
  monsters carry behavior/speed/noticeRange (size is sparse: 2/28, nearly
  constant +0.05 — noted, not a lie). Measured: novice vs hushwolf <10%
  evade ("the silence is the weapon" holds), veteran tracker 3× better,
  bulldozer easier to spot than hushwolf at equal tracking (§7). The
  "~12%/~42%" claims from the real-fights build verified within rounding.
- **Honesty — lethal routing:** vDie → `hurtVillager(500)` → registerDeath +
  removeVillager('killed') + death gossip + fallen record; expedition vDie →
  expedDeath (same pipeline directly). Player-character lethal hurt →
  playerDeath (mantle succession). No silent vanishes.
- **Honesty — Highbeam Deer benchmark:** 0 solo kills in 100 (§8) and in the
  parity suite — 160 HP untouched, never framed as a wave-2 bar anywhere.
- **Honesty — wave escalation / loot tiers:** no conflation found in
  code/comments/data (grep clean); the telegraph-visual run's "phantom
  W2A_IDS/encircle references" note is STALE — current app.js routes only
  live wave-2 ids and the exposure/detonation buckets it asked for now exist.
- **Softlock — termination:** every fight ends (15-round cap, exhaustive
  outcomes); villagerMonsterTick fights one random NPC per monster per tick
  off a copied array — a removed monster can't be re-fought by a second NPC
  in the same tick. No stuck states, no replayable fight ids. (A mauled
  villager left on a monster's node may be fought again next tick — world-sim
  abstraction, terminates in retreat or death, not a lock.)
- **Dead-code — full sweep:** fieldFights.js loaded in index.html (line 60);
  fieldFightSummary has its live caller; zero old-table vars
  (killP/driveP/mauledP/dieP/deathP/hurtP); zero slimmed-engine fn references;
  `monsterWaveAvailable` fully gone. Ontology: 49/49 validated.

## Design gaps observed, NOT fixed (Steve's call)

- **Field-fight kills produce no carcass.** vKill → removeWorldMonster with no
  meat/trophy/loot (the tactical path gives corpses + loot-as-action). The
  village cheers but gains zero calories in a food-scarce game. Adding meat
  has food-economy-wide balance implications — flagged, not implemented.
- **vFlee doesn't relocate the villager.** The fiction says they fled; the
  world leaves them on the monster's tile. Villager movement belongs to the
  objectives system; forcing moves here could break expeditions — noted.

## Regression status
- New proof: `scripts/test-break-monsters3-fieldfights-20261008.js` — 24/24
  (seeds 20261008, 7, 99).
- Updated: `scripts/test-parity-combat-20261008.js` — 6/6 (seeds ×3).
- Untouched suites all green: real-fights 15/15, villager-agency 43/43,
  wave-gate 9/9, sunbasker 3/3, patterncells 11/11, lockpick 9/9, deadcode
  9/9, ambushzone 11/11, corpse-rot 9/9, kill-grants 8/8, wave-system 26/26.
- `validate-ontology.js`: 49/49, release permitted.

## Files changed
- src/js/fieldFights.js (pack-lead break, standoff removal, ontology rule)
- src/js/game.js (wounds on vKill/mFlee, standoff removal)
- src/js/villager-agency.js (wounds on vKill/mFlee, comment)
- scripts/test-break-monsters3-fieldfights-20261008.js (new, 24/24)
- scripts/test-parity-combat-20261008.js (outcome-based buckets + wins-cost-blood)
- evidence/2026-10-08/break-monsters3-fieldfights.md (this file)
