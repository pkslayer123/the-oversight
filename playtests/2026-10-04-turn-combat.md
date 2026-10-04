# Turn-based combat — implementation report (2026-10-04)

## What shipped (commit 481fb1f)

**Core:** grid-based turn combat on the 9x9. Speed-order turns. Move (speed squares) + one action (Strike/Study/Scream/Flee/End Turn/ability). Replaces the old menu combat entirely.

**Party:** nearest 4 villagers within 4 squares join. AI from temperament: bold→brave (closes, strikes), cautious→cautious (keeps distance, flees when hurt), else helpful (patches player +12 HP once, harries). They act in speed order, not as followers.

**No red squares (Steve's critical refinement):** attacks are never shown as danger cells. The monster gives behavioral cues only ("It freezes. Light gathers behind its eyes."). The player learns patterns by surviving — Codex records ("Ocular Discharge — fires in a straight line from itself") and future cues include the knowledge. First encounter terrifying, fifth tactical.

**Windup:** heavy attacks (deer beam, heron strike) charge over 2 rounds. Cue escalates ("still gathering…" → "about to loose!"). Tracking attacks re-aim at fire time — knowledge tells you the shape, positioning saves you.

**Dodge detection:** if you were in the path at declare time and aren't there at resolve → "Clean dodge." + style points.

**Terror audio (Web Audio, synthesized):** heartbeat during combat (72bpm), speeds up on telegraph (80 → 145bpm as it charges), silence-then-impact boom, victory/defeat stings.

**Visual mode shift:** combat vignette (darkened pulsing edges), desaturated grid, pulsing danger bar. Body class `in-combat`.

**LOS stealth:** walls/trees/tents block vision (Bresenham). Monsters only chase with LOS; without it they wander, and after 6 blind actions lose your trail entirely (despawn). Stealth is valid.

**System televises (post day-7):** ROUND announcements, gambler reactions, style points (+5 hit, +20 kill, +15 dodge), style score at victory.

**Debug mode:** `?debug=1` → 🐞 button. Spawn any monster, trigger combat, skip to day 7, grant abilities, heal, teleport, kill foes, end combat.

## Verification
- 10/10 monsters simulated (2-3 runs each): no crashes. Telegraphs, learning, party AI all fire.
- White Noise killed a passive bot (21 rounds) — high stakes real.
- Speedbump ambush dropped player to 11 HP — ambushes hurt.
- Deer windup verified: 2-round charge, escalation, re-aim, flee at 50%.
- Content gate: OK. Main-loop sims: clean.
- Bugs fixed during testing: party zerg (capped 4), duplicate "falls" message, direct-telegraph crash in tbDangerCells, fled≠won (no loot for routed monsters).

## Known limitations / future hooks
- Hostile survivors: engine supports kind 'hostile' but no trigger yet.
- Rush/ambush patterns give no telegraph (by design — their identity).
- Villager AI uses true danger cells (instinct); player never sees them.
- Audio requires user gesture (tap) — fine for a tap game.
- Debug mode is URL-param only, no in-game discovery.
