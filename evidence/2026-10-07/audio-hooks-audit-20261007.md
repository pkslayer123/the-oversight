# Audio hook wiring audit — 2026-10-07

**Scope:** static, read-only audit of audio hook wiring at HEAD `ffba5a1`
(flesh-out loop queue item #8, Steve 2026-10-05). Built from a
`git archive HEAD src` extract; engine files untouched.
**Proof:** `scripts/test-audio-hooks-static-20261007.js` (deterministic, no RNG) —
PASS, exit 0, against both the HEAD extract and the worktree.

**Headline numbers:** 368 call sites (incl. data-driven) · 203 defined voices in
the `Game.audio` (CombatAudio) registry · **6 fired-but-undefined** (all
accounted, see backlog) · 17 defined-never-fired · 7 monsters on the generic
`deerAggro` declare fallback.

## Verdict

**No crashes.** `Game.audioEvent(name, data)` (game.js:18121) is a guarded
no-op when the hook has no registry function, `encAudio()` has a documented
fallback composition, and `_cxBeat` lazy-registers its composites. Every gap
below is **runtime silence**, not an exception — which is why they survived:
nothing throws, the game just goes quiet where it shouldn't.

Two claims checked and closed:
- **Wave-2c hummice flag — CONFIRMED and SYSTEMIC.** `hummice` declares no
  `aggroAudio`, but it is not alone: 7 of 28 monsters have zero encounter audio
  (gallowdeer, mirrormoth, lockpick_raccoon, hummice, nightlight_catfish,
  glasswing, sunbasker) and all declare with the deer bellow via the
  `|| 'deerAggro'` fallback (game.js:20123, 20161, 24436, 24472). New wave-2
  content (glasswing, sunbasker, nightlight_catfish) bellows like a deer.
- **Glasswing audit claim ("telegraph/round/impact/humRise fired, unmapped, by
  design") — REFUTED at HEAD.** All four are defined in the registry; `telegraph`
  and `impact` are pattern-aware dispatchers. The genuinely-by-design silence is
  the `'ambush'` pattern in `telegraph()` (app.js:9142, "deliberately silent: no
  warning") and `animalPanic`'s documented `ENC_AUDIO_FALLBACK` composition
  (encounters.js).

## Per-system gaps

**1. Status effects are mute (silence).** `statusApplied` (statusEffects.js:167)
and `statusCured` (statusEffects.js:257) fire on every apply/cure; no synths
exist. Every buff/debuff in the game lands silently.

**2. Four data-declared monster voices are missing (silence, worse than generic).**
`monsters.json` declares them, the registry doesn't define them, and because
the values are truthy the `deerAggro` fallback never fires — the declare goes
fully silent:
- `kiteUnfold` — statickite aggroAudio
- `nevermoreUnfold` — nevermore aggroAudio
- `nightcourtTurn` — nightcourt aggroAudio
- `nightcourtDive` — nightcourt declareAudio

**3. Drama A/V sync audio path is dead (whole subsystem).** game.js:14429 calls
`D.audioFor(kind, args[0])` inside try/catch, but `Drama.audioFor` does not
exist in drama.js (zero matches for "audio" in the file) and all 33
`dramaEffects.json` effects carry `audio: null`. The comment describes the
design; neither side was implemented. Every drama visual fires with no audio
mate. (Caught by the proof script's drama-subsystem check, not the hook
cross-match — worth keeping as a separate assertion.)

**4. Seven monsters declare as deer (generic).** Listed above. Includes wave-2
glasswing/sunbasker/nightlight_catfish.

**5. Dead registry weight (harmless, flag for cleanup).** `woundEnraged`,
`woundCunning`, `woundDesperate` had zero callers at HEAD — note: a sibling's
uncommitted work (encounters.js:2099, `audioEvent('wound' + suffix)`) wires
them up, which resolves these three correctly. `patternWindup`/`patternResolve`
are public API with no callers (telegraph/impact dispatch inline instead).

**By design, not gaps:** 14 `CX_BEAT_DEFS` contest composites (contests.js:761 —
lazy runtime registration, all parts verified in-registry); `animalPanic`
fallback composition; `ambush` pattern silence; per-pattern dispatcher
internals (`beamCharge`, `rushHit`, etc. — called from `telegraph()`/`impact()`).

## Backlog (engine owner, prioritized: silence > generic > dead)

1. **SILENCE — define the 4 missing monster voices** (`kiteUnfold`,
   `nevermoreUnfold`, `nightcourtTurn`, `nightcourtDive`) or remove the
   data declarations so the `deerAggro` fallback fires. Silent declares are
   worse than wrong ones.
2. **SILENCE — add `statusApplied`/`statusCured` synths** (or a single
   kind-aware dispatcher). High-frequency events; currently 100% mute.
3. **SILENCE — implement `Drama.audioFor` or remove the dead call site.**
   Right now the schema, the comment, and the call site all promise wiring
   that doesn't exist. Either wire the 33 effects' `audio` fields or delete
   game.js:14421-14431 so the next reader isn't misled.
4. **GENERIC — give the 7 voiceless monsters aggro voices**, starting with
   wave-2 (glasswing, sunbasker, nightlight_catfish). Steve's bar is freaky,
   not generic; the deer bellow on a glasswing is a knowledge-leak-class
   fiction break (wrong monster's voice).
5. **DEAD — confirm the sibling's `wound*` wiring lands** (it resolves the
   three dead wound voices correctly); delete `patternWindup`/`patternResolve`
   if nothing will call them.

## Method

Inventories built from the HEAD extract (`git archive HEAD src`):
- Defined: 203 methods in the CombatAudio export block (app.js:9122–9419), no
  duplicate keys.
- Fired: 171 literal `audioEvent('x')` sites + 41 data-driven
  (`monsters.json` encounter audio) + 14 contest composites + 3 specs-table +
  3 direct `Game.audio.*` refs + 1 encAudio fallback key + beat parts.
- Dynamic dispatches (`dcfg.aggroAudio || 'deerAggro'`, `rcfg.resolveAudio`,
  `tdCfg.deathAudio`, `scCfg.noticeAudio`, `dcfg.declareAudio`, `b.audio`,
  specs-table 5th elements) all resolved through `mdef.encounter` configs —
  every reachable value is in the inventory above. No template-literal or
  concatenation fires at HEAD (the one worktree concatenation is a sibling's
  uncommitted edit, handled as informational by the script).
