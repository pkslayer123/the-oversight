# Audio emitter wiring audit — 2026-10-07

Worker: flesh-out loop, queue item #8 (audio emitter wiring audit).
Re-check: `node scripts/test-audio-wiring-audit-20261007.js` (exit 1 while orphans exist, 0 when clean; deterministic per HEAD).

**Audit HEAD:** `d2b66234a82480f6ca9bb782659e2a5de426ec10`
(all queries ran against this one captured SHA; the tree was extremely hot —
7+ HEADs landed during the audit, so line numbers are HEAD-pinned, not live).

**Scale:** 293 literal `audioEvent('name')` fire-sites (169 distinct hooks),
4 `encAudio` sites, **201 CombatAudio registry keys** (app.js),
29 monsters.json audio values, 6 drama.js audioFor values, 14 contest
composites, 3 direct `Game.audio.*()` calls.

**Dispatcher semantics (game.js `audioEvent`):** if `this.audio[name]` is not a
function, the call is a silent no-op. There is NO generic fallback — an
orphaned emitter means the player hears **silence** (except `encAudio`, which
has an explicit fallback table).

## 1. ORPHANED emitters — fire, no synth, player hears silence

### `knowledgeReveal` — 7 sites, all in src/js/game.js (CONFIRMED orphan)
| line | moment (from surrounding code) |
|---|---|
| 4084 | ability slots increase ("Neural depth … I can hold more of you now") |
| 5300 | neural integration level-up (codex-linking clarification) |
| 5309 | integration level-up, second branch |
| 10641 | skill gained (`kind: 'skill'`) |
| 10773 | technique unlocked (`kind: 'technique'`) |
| 15608 | synergy discovered (`kind: 'synergy'`) |
| 24646 | plant identified in codex (`kind: 'plant'`) |

No `knowledgeReveal` entry exists anywhere in the CombatAudio return block
(app.js). The comment at game.js:24644-24646 claims "'knowledgeReveal' is
the audio worker's mapped hook (app.js)" — **false at HEAD**; the same
comment admits "the emitter no-ops safely until the synth lands."

**Feel judgment:** silence at the game's core progression beat. Knowledge →
food → power is the central loop, and every "you learned something" moment
plays mute. This is the most-heard missing sound in the game.

### `synergyDiscovered` — 1 site, src/js/game.js:15615 (CONFIRMED orphan)
Fires immediately after the `knowledgeReveal` (kind:synergy) at line 15608 —
the synergy-discovery hero moment double-fires into **double silence**. The
comment at 15609-15614 promises "the audio worker gets a distinct
'synergyDiscovered' hook so the fanfare can sound different from a quiet
codex reveal" — neither the fanfare nor the quiet reveal exists.

**Feel judgment:** silence where the design explicitly calls for a fanfare.
The text/📺 SYSTEM celebration still prints; only the audio is missing.

## 2. Orphan WITH fallback — never silent

### `animalPanic` — 4 sites, src/js/encounters.js (1397, 1416, 1433, 1512)
No registry entry, but `G.encAudio` (encounters.js:161-181) maps it to
`['animalBolt', 'animalRustle']`, both registered. The comment documents the
intent: "if app.js ever ships a real animalPanic synth it wins automatically."

**Feel judgment:** NOT silent — the player hears bolt-thrash + brush-rustle.
Just not a dedicated panic voice. Lowest wiring priority.

## 3. Runtime-registered contest composites — wired, statically invisible

14 composite beats self-register on `Game.audio` at first fire via
`G._cxBeat` (contests.js): contestSort, contestWitness, contestCache,
contestDice, contestLock, contestMap, contestAlibi, contestEcho, contestTide,
contestWind, contestPrice, contestImpress, contestExchange, contestAuction.
**Every composite part resolves in the registry** (contestCall,
justiceVerdict, horrorSting, contestSpared, contestTaken, exileWalk, rushHit,
levelup). The player hears the composed parts; nothing is silent.

Caveat for future audits: these names never appear as literal
`audioEvent('…')` fire-sites and have no static registry entries, so a naive
grep-based sweep flags them as orphans. The re-check script handles them
explicitly.

## 4. DEAD registry entries — synth exists, nothing fires it

- `woundEnraged`, `woundCunning`, `woundDesperate` (app.js return block).
  Zero references outside app.js at HEAD: no literal emitter, no
  monsters.json/drama/contest reference, no bare string literal, no dynamic
  `'wound' + temperament` construction anywhere in src/js. (An earlier
  worktree note described an encounters.js wound-shift emitter; it is not
  present at HEAD — either never landed or was removed.)
- NOT dead: `delegateDebrief` — fired dynamically via the tbFifoBreather
  specs table (game.js:20445, `this.audioEvent(audio)` with the string
  constant in the table). Invisible to literal-emitter grep; the re-check
  script rescues such names via a bare-string-literal pass.

Stale comment: app.js:1767-1768 claims the wound synths are "wired:
encounters.js fires on wound-state shifts" — false at HEAD.

## 5. Resolved (verified, no action)

- All 29 monsters.json audio-ish values resolve in the registry.
- All 6 drama.js `audioFor` values (victory, impact, defeat, levelup,
  exileWalk, justiceVerdict, confront, horrorSting) resolve.
- Direct calls `Game.audio.horrorSting/isMuted/toggleMute` resolve.
- `patternWindup`/`patternResolve` are documented public sibling API;
  `isMuted`/`toggleMute`/`ensureAudio` are controls — none are dead.

## 6. Prioritized wiring list for the engine owner

1. **Ship a `knowledgeReveal` synth** (app.js CombatAudio return block).
   7 sites already firing; highest value per line of synth. Fix the false
   "mapped hook" comment at game.js:24644.
2. **Ship a `synergyDiscovered` synth** — the synergy hero moment currently
   double-silences (15608 + 15615).
3. **Wound temperaments: pick a direction.** Either re-add the wound-shift
   emitter in encounters.js (the 3 synths are good, per the earlier
   worktree note) or delete the 3 dead entries + fix the stale "wired"
   comment at app.js:1767-1768. Dead synths are harmless but misleading.
4. **animalPanic: optional.** The bolt+rustle fallback covers it; a real
   synth is polish.
5. **Consider static registry entries for the 14 contest composites** so
   future static audits see them without special-casing.

## 7. Method note for future workers

`git grep <sha>` prefixes match lines with the full 40-hex SHA, not the
literal string `HEAD`. Line parsers must accept `^(?:HEAD|[0-9a-f]{40}):`.
(Debugging this cost real time: a `^HEAD:`-anchored parser silently matched
zero lines.)
