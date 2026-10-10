# Break-it: persistence (save/load) — NINTH PASS — 2026-10-10

Hostile-player ninth pass on the save/load system. Passes 1–8 killed 30+
(save-leak wipe, _seSeq collision, mid-uprising continue, two-tab
resurrection, quarantine stamps, beam-cooldown save-scum, contest _cxSeed,
Map/Set/Date fidelity, migration registry, saveSeq monotonicity, alien r7
state, stash, fires, disease mirrors...).

CANON NOTE: no docs/PERSISTENCE.md exists (re-confirmed — the manifest lists
none; docs/STORAGE.md is about stashes). Behavior inferred from CANON.md
(no silent actions, honesty on every surface) plus the save/load code.

This pass attacked the FRESH surface — commits landed after pass 8's check:
camps r11 (exile clears insideTent), alien players r11 (apKnowsAlien gate,
group-chain announce-before-confirm), monsters r13, contests r12
(held-contest counter, _cxWinnerShare), socialite r11 (inConvo flags,
v.conv rewire), survivalist r5 (nearest-fire fuel), explorer playtest
(walk-price, fog), gap3 breadth (ruin-book 30% first-search, codex counts),
gap4 bloodair (sealed arena), social r11 (moot trial), knowledge r2.
Proof: `scripts/test-break-persistence9-20261010.js` — seeded (mulberry32,
SEED env, default 20261010), full index.html module order, BEFORE=1 via git
HEAD (game.js + betrayal.js). 23 checks AFTER green x3 seeds
(20261010/7/42); all three kills demonstrated in BEFORE mode.

## KILL

### K9. STALE CONVERSATION ACTIVE — talk locked out after Continue (SOFTLOCK/HONESTY) — HIGH
`v.conv[vid].active` persists on `state.village` (convoGet stores it there —
the socialite r11 rewire confirmed the key), but the chat UI is DOM-only.
After Continue no chat is open, yet the person card hides the Talk button
while active (app.js: `talkLabel = convo.active ? null : ...`). A
mid-conversation save locked that villager out of talk forever — the only
recovery was talking to someone else, whose one-at-a-time sweep fired a
dishonest "You turn away from X mid-conversation" line for a conversation
days old. The `engaged` freeze self-heals (batch-countdown decay); `active`
had no decay, no load reset, no sweep — only endConvo (needs the chat UI)
or the sweep could clear it.
Proven: startConvo → 1 exchange → save → load → active=true,
convoUI.active=true (Talk hidden). Also reproduced the pre-r11 multi-active
shape (empty convos).
**Fix:** `Game.load()` settles stale actives — a save/load is a walk-away.
Substantive convos (exchanges>=1 or transcript) go through the tested
`endConvo(vid,'left')` path: stipend/XP/open-thread planting all scale with
what actually happened, so no new farm exists (identical to tapping leave
before closing — verified no double-grant: post-settle endConvo is a noop).
Empty convos (0 exchanges, no transcript) are quietly cleared. One framing
say line explains the settle. Pre-r11 saves with many stale actives settle
each once, bounded by their own exchanges.
**Files:** src/js/game.js (load).

### K10. ARENA VOID ON GHOST-FIGHT — stranded show (SOFTLOCK) — MEDIUM
A mid-arena-fight save whose fighters ALL drop on load (corrupt player
entry + ghost monster def — the documented drop classes) said "The fight
you left is gone" but left `activeContest.arenaSuspended=true` and
`state.arenaContest` set with no fight. `contestChoose` drops every input
while suspended (`{arena:true}`), the post-arena phases are unreachable by
choice, and tbEnd never fires — the contest could never resolve, and
autosave kept re-saving the stranded state.
Proven (tampered blob): after load, suspended=true, arenaContest set,
tbfight=null, contestChoose(0)→{arena:true}.
**Fix:** in load()'s no-fighters branch, release the arena: clear the
suspension + arenaContest, honest line ("The gate stands empty — the beast
you faced is gone from the world. The System voids the bout."), then
`_contestEnd(ac,'lost',false)` — the startCombat-throw precedent for the
identical fiction. The r12 held-counter counts the void (the contest was
held); `_heldCounted` prevents double-count.
**Files:** src/js/game.js (load).

### K11. SCAM LEDGER ID COLLISION (sibling sweep) — LOW/MEDIUM
`recordScam` minted `'scam_'+Date.now().toString(36)+Math.floor(R()*99)`.
Two scammed wares bought in the same millisecond collide with p=1/99, and
scamLedger lookups are by id (`vis.scamRef`, `vis.pendingConfront`,
`ware.scam.ledgerId`) — the wrong entry's discovered/resolved flags flip and
confrontations target the wrong face. Demonstrated deterministically: 200
same-ms mints → 86 unique ids (BEFORE).
**Fix:** widen to the fight-id shape: timestamp + `Math.floor(R()*1e9).toString(36)`.
200/200 unique AFTER x3 seeds.
**Files:** src/js/betrayal.js (recordScam).

### Sibling sweep (id-minting audit — the _seSeq lesson)
Grep over src/js for session-unique minting. `_seSeq` (pass 8) remains the
only volatile counter; it reseeds from the persisted max. All others use
wall-clock+random with no reset-on-load collision class:
- `vis_` (timestamp only): one-at-a-time + day-apart spawning — effectively unique. HELD.
- `link_`, `app_` (timestamp+R*999): player-paced / day-paced actions. HELD.
- `d_`, `gossip_` (7 base36), cache `c` (day+5), `corpse_` (day+6), `gen_`
  villagers (7), fight ids (timestamp+1e9), alien item ids: wide-random. HELD.
- `scam_`: COLLIDED (K11 above).
- No new Game-level volatile state in any fresh commit (grep of the 16
  fresh diffs for `this._`/`G._` shows only method calls) — nothing that
  should have been persisted or lazily re-derived.

## HELD (attacked, resisted)

- **H1 ruin books:** `t.bookChecked` is set BEFORE the 30% roll on the map
  tile, and map tiles persist — a failed first search can't be re-rolled by
  save/load. (Closing before the post-search autosave loses the whole
  action — the inherent class, not a gate reset.)
- **H2 alien knowledge:** `apKnowsAlien` → `apState().known` (persisted);
  round-trips across save/load. No cover-name fields exist to leak.
- **H3 group chain:** `state.alienGroup` {pids,current} round-trips; the
  chain fires synchronously at combat end, so no save can land mid-chain —
  a mid-chain-fight save resumes the fight and the chain fires on win.
- **H4 tents:** `scholar.insideTent` round-trips; camps r11's exile-clear was
  proven by its own suite (67/67 re-run green). Death path already cleared
  (ledger.js camps-3).
- **H5 codex counts:** gap3 breadth counts derive live from entries
  (monsters/animals/recipes/techniques) — no counters to desync; entries
  round-trip.
- **H6/H7/H8:** empty convos clear without crash; moot `trial`
  (awaitingPlayerVote + 2-day backstop) round-trips; r12 `contestsHeld`
  round-trips (`||0`-guarded for old saves — no migration needed).
- **H9/H10 arena:** live mid-arena fight restores (arenaSuspended +
  arenaContest + tbfight, pass-8 re-proven); monster ghost-drop with live
  player keeps the documented ghost policy (honest line, fight continues —
  same as wild fights; the walkover-win on a data-update is kinder and more
  consistent than voiding).
- **Fresh-commit volatile state:** none added (see sweep).
- **Gap4 sealed arena:** `noFlee` is a synchronous fieldFight opt (villager
  sims) — no save can land mid-resolution. The player's tactical arena uses
  the persisted arenaSuspended/arenaContest/tbfight triple (H9).
- **Monsters r13:** no src changes — held by absence.
- **Honesty:** nothing promises "safe to close"; saveLocationLabel is
  location-honest; no new S.state exports (dead-code sweep clean).

## Verification

- `node scripts/test-break-persistence9-20261010.js` → 23/23 x3 seeds
- `BEFORE=1 ...` → all three kills demonstrated (K9 active stuck, K10
  stranded, K11 86/200 ids)
- pass-8 suite 59/59, socialite r11 all pass, contests r12 34/34, camps r11
  67/67, ontology 52/52
- `node --check` clean on game.js, betrayal.js, the test

## Files changed

- `src/js/game.js` — load(): stale-conversation settle + arena void
- `src/js/betrayal.js` — recordScam(): widened id mint
- `scripts/test-break-persistence9-20261010.js` — new 23-check proof
- `evidence/2026-10-10/break-persistence-9.md` — this file

No [needs-eyes]: engine-level load hygiene + id minting, no feel/combat/UI
changes. The settle line only appears on Continue when a stale convo existed.
