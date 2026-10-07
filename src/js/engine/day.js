// @ontology
// system: day-engine
// description: Day resolution order + the expedition clock. One day, one turn; named time costs; day-part texture; night watches.
// provides:
//   - PHASES (code: day.js)
//   - newDay(scholar)
//   - MINUTES_PER_DAY (code: day.js)
//   - CLOCK_PARTS (code: day.js)
//   - PART_SPAN (code: day.js)
//   - PART_MINUTES (code: day.js)
//   - DAYLIGHT_MINUTES (code: day.js)
//   - ACTION_MINUTES (code: day.js)
//   - ACTIVE_ANCHOR (code: day.js)
//   - PART_MOOD (code: day.js)
//   - makeRng(seed)
//   - costLabel(minutes)
//   - fmtMinutes(minutes)
//   - costDetail(minutes)
//   - costFor(actionId)
//   - labeledCost(actionId)
//   - dayPartOf(minuteOfDay)
//   - partMinutes(partName)
//   - daylightLeft(clock)
//   - nightLeft(clock)
//   - dayBudget()
//   - spendMinutes(clock, minutes, opts)
//   - partMood(partName)
//   - weatherRoll(rng)
//   - dawnBeat(day, opts)
//   - eveningTick(opts)
//   - waterStage(waterL)
//   - planWatches(members, opts)
//   - resolveNightWatch(roster, night, rng)
//   - curiosityStage(level)
//   - hungerState(scholar, need)
// rules:
//   - no-silent-actions: every cost has a name; costFor returns null for unknown actions, never a silent default (code: costLabel)
//   - dawn-is-a-moment: day rollover returns a dawn beat with title/lines/prompt, not a bare counter (code: spendMinutes)
//   - starvation-is-slow: hunger stages span ~a day each; damage stays in calories.resolveDay, never here (code: hungerState)
//   - watches-are-voluntary: villagers refuse when hurt/exhausted; refusal is a shown beat, never silent (code: planWatches)
//   - curiosity-escalates: monster curiosity rises every night, faster unwatched, until hunger — villagers who watch confront, never cower (code: resolveNightWatch)
// consumes:
//   - scholar (read-only state root)
/* Day resolution order + the expedition clock. The turn structure — one day, one turn.
   Order is load-bearing; document changes in DECISIONS.md.

   A day:
     1. MORNING — status check, System message roll, weather
     2. ACTIONS — player spends AP (4): forage/hunt/craft/explore/rest/treat_water
     3. EVENING — eat (player allocates food), spoilage tick, water check
     4. METABOLISM — calories.resolveDay (scholar + village)
     5. VILLAGE TICK — 1 expedition day = 1 village day (morale, projects, events)
     6. NIGHT — save, codex updates, death check

   Slice 1 implements: morning status, 4 AP actions (forage/rest/treat_water/explore),
   evening eat, metabolism, save. Village tick, hunting, crafting, events arrive later.

   This engine is pure: no DOM, no game state writes beyond what newDay already did.
   Every function takes plain data and returns plain data; game.js wires it to the UI.
   Nothing here changes PHASES or newDay — a sibling is wiring against them. */
(function (global) {
  'use strict';

  // --- turn structure (UNCHANGED — sibling wiring target) ---
  const PHASES = ['morning', 'actions', 'evening', 'metabolism', 'village', 'night'];

  function newDay(scholar) {
    scholar.day += 1;
    scholar.ap = 4;
    return { day: scholar.day, phase: 'morning', log: [] };
  }

  // --- the expedition clock ---
  const MINUTES_PER_DAY = 1440;
  // Four nested day parts. Names and order match game.js DAY_PARTS so the
  // dayPart index wires straight through: CLOCK_PARTS[game.dayPart].
  const CLOCK_PARTS = ['dawn', 'midday', 'dusk', 'night'];
  // Minute-of-day spans (24h clock). Night wraps midnight.
  const PART_SPAN = { dawn: [300, 480], midday: [480, 960], dusk: [960, 1200], night: [1200, 1440] };
  const PART_MINUTES = { dawn: 180, midday: 480, dusk: 240, night: 540 };
  // The expedition budget: dawn + midday + dusk. Night is for sleep and watches.
  const DAYLIGHT_MINUTES = 900;
  // Balance anchor (Steve 2026-10-04): a human needs ~2,000 kcal/day; a real
  // village haul is 400-800. Mirrors calories.ACTIVE_DAY; kept local so this
  // engine stays dependency-free (game.js owns the live value).
  const ACTIVE_ANCHOR = 2200;

  // --- named time costs (no silent actions) ---
  // Anchor: 4 AP ≈ midday's 480 min, so 1 AP ≈ 120 min. Hunt is 1.5 AP —
  // high risk, high reward, and the button must say so.
  const ACTION_MINUTES = {
    forage: 90, hunt: 180, explore: 120, rest: 120, scout: 60,
    treat_water: 30, talk: 15, eat: 15, cook: 45, butcher: 60,
    mend: 60, identify: 30, build: 240, sleep: 420,
  };

  // Honest cost names. Expensive buttons name their cost; cheap inspection
  // stays cheap. Thresholds sit on the 120-min ≈ 1 AP anchor.
  function costLabel(minutes) {
    if (minutes == null || minutes < 0) return 'unknown cost';
    if (minutes < 20) return 'a moment';
    if (minutes < 60) return 'a short spell';
    if (minutes < 180) return 'a while';
    if (minutes < 360) return 'much of the day';
    return 'most of the day';
  }

  function fmtMinutes(minutes) {
    if (minutes == null) return '?';
    if (minutes < 60) return minutes + ' min';
    const h = Math.round((minutes / 60) * 2) / 2;
    return (Number.isInteger(h) ? String(h) : h.toFixed(1)) + ' h';
  }

  // Vague AND exact — the name for the button, the number for the planner.
  function costDetail(minutes) {
    if (minutes == null || minutes < 0) return 'unknown cost';
    return costLabel(minutes) + ' (≈' + fmtMinutes(minutes) + ')';
  }

  // Minutes for a known action; null for unknown — never a silent default.
  function costFor(actionId) {
    return Object.prototype.hasOwnProperty.call(ACTION_MINUTES, actionId)
      ? ACTION_MINUTES[actionId]
      : null;
  }

  // Ready-made button label: "Forage (a while (≈1.5 h))".
  function labeledCost(actionId) {
    const m = costFor(actionId);
    const cap = String(actionId).replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());
    if (m == null) return cap + ' (cost unknown)';
    return cap + ' (' + costDetail(m) + ')';
  }

  // --- clock queries ---
  function dayPartOf(minuteOfDay) {
    const m = ((minuteOfDay % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
    if (m >= 300 && m < 480) return 'dawn';
    if (m >= 480 && m < 960) return 'midday';
    if (m >= 960 && m < 1200) return 'dusk';
    return 'night';
  }

  function partMinutes(partName) {
    return Object.prototype.hasOwnProperty.call(PART_MINUTES, partName)
      ? PART_MINUTES[partName]
      : null;
  }

  // Daylight left today (minutes until dusk ends). 0 at night.
  function daylightLeft(clock) {
    const m = ((clock.minute % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
    return (m >= 300 && m < 1200) ? 1200 - m : 0;
  }

  // Night left (minutes until dawn). 0 in daylight.
  function nightLeft(clock) {
    const m = ((clock.minute % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
    if (m >= 1200) return MINUTES_PER_DAY - m + 300;
    if (m < 300) return 300 - m;
    return 0;
  }

  function dayBudget() { return DAYLIGHT_MINUTES; }

  // Advance a {day, minute} clock. Returns the new clock plus events:
  // part-boundary crossings (with the arrival mood) and, on day rollover,
  // a 'dawn' event carrying the full dawn beat — dawn is a moment, not a threshold.
  function spendMinutes(clock, minutes, opts) {
    opts = opts || {};
    const fromPart = dayPartOf(clock.minute);
    let day = clock.day;
    let minute = clock.minute + minutes;
    const events = [];
    if (minute >= MINUTES_PER_DAY) {
      minute -= MINUTES_PER_DAY;
      day += 1;
      events.push({ type: 'dawn', day, beat: dawnBeat(day, opts) });
    }
    const toPart = dayPartOf(minute);
    if (toPart !== fromPart) {
      events.push({ type: 'part', from: fromPart, to: toPart, mood: partMood(toPart) });
    }
    return { clock: { day, minute }, events };
  }

  // --- day-part texture: what each part feels like ---
  // glyph for the grid/status, audioHook names the synth voice to trigger.
  const PART_MOOD = {
    dawn:   { glyph: '🌅', tone: 'wake',   audioHook: 'dawn-chorus', line: 'The world wakes before you do.' },
    midday: { glyph: '☀️', tone: 'work',   audioHook: 'midday-hum',  line: 'Honest work hours. Heat builds.' },
    dusk:   { glyph: '🌇', tone: 'settle', audioHook: 'dusk-settle', line: 'Shadows lengthen. Animals stir.' },
    night:  { glyph: '🌙', tone: 'watch',  audioHook: 'night-quiet', line: 'Camp. Rest — or risk the dark.' },
  };

  function partMood(partName) {
    return Object.prototype.hasOwnProperty.call(PART_MOOD, partName)
      ? PART_MOOD[partName]
      : null;
  }

  // Seeded PRNG (mulberry32) so beats are reproducible in proof tests.
  function makeRng(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const WEATHERS = [
    'Clear and cold.', 'Low mist on the creek.', 'Dry wind out of the west.',
    'Overcast — rain by midday.', 'Damp heat already building.',
    'Bird-loud and bright.', 'A thin, high haze.',
  ];

  function weatherRoll(rng) {
    const r = rng || Math.random;
    return WEATHERS[Math.floor(r() * WEATHERS.length)];
  }

  // The System's dawn voice: alien, twisted, genuinely trying its best.
  // Callers may pass opts.systemNote to use the live System line instead.
  const SYSTEM_DAWN = [
    'SYSTEM: [cheerful static] GOOD MORNING, SCHOLAR. THE SUN HAS BEEN LOCATED.',
    'SYSTEM: Hydration is a journey. Today is a good day for it.',
    "SYSTEM: Yesterday's data was delicious. More, please.",
    'SYSTEM: The village dreams in aggregate. You dream alone. Interesting.',
  ];

  // Dawn is a beat the player feels: title, status, weather, System, prompt.
  // opts: {weather, systemNote, statusLine, rng}
  function dawnBeat(day, opts) {
    opts = opts || {};
    const rng = opts.rng || Math.random;
    const weather = opts.weather != null ? opts.weather : weatherRoll(rng);
    const sys = opts.systemNote != null
      ? opts.systemNote
      : SYSTEM_DAWN[Math.floor(rng() * SYSTEM_DAWN.length)];
    const lines = ['The world wakes before you do.'];
    if (opts.statusLine) lines.push(opts.statusLine);
    lines.push('Weather: ' + weather);
    lines.push(sys);
    return {
      title: '— DAY ' + day + ' DAWN —',
      lines, prompt: 'Plan the day.',
      glyph: '🌅', audioHook: 'dawn-chorus',
    };
  }

  // --- evening: spoilage tick + water check ---
  function waterStage(waterL) {
    if (waterL <= 0) return { stage: 'empty', label: 'No water.', urgent: true };
    if (waterL < 2) return { stage: 'critical', label: 'Water critical.', urgent: true };
    if (waterL < 6) return { stage: 'low', label: 'Water low.', urgent: false };
    return { stage: 'ok', label: 'Water holds.', urgent: false };
  }

  // opts: {day, items: [{name, spoilageDay}], waterL}
  function eveningTick(opts) {
    opts = opts || {};
    const day = opts.day || 1;
    const spoiled = [], spoiling = [];
    for (const it of (opts.items || [])) {
      if (it.spoilageDay == null) continue;
      if (it.spoilageDay <= day) spoiled.push(it.name);
      else if (it.spoilageDay === day + 1) spoiling.push(it.name);
    }
    return {
      spoiled, spoiling,
      water: waterStage(opts.waterL == null ? 0 : opts.waterL),
    };
  }

  // --- night: the watch decision ---
  // members: [{id, name, adult, injured, exhausted}]. The scholar can be
  // included as a member ({id:'you', name:'You', adult:true}) — the caller's call.
  // Villagers act: hurt or exhausted people refuse, and the refusal is shown.
  function planWatches(members, opts) {
    opts = opts || {};
    const able = [], refused = [];
    for (const m of (members || [])) {
      if (!m.adult) continue;
      if (m.injured) { refused.push({ id: m.id, name: m.name, reason: 'hurt' }); continue; }
      if (m.exhausted) { refused.push({ id: m.id, name: m.name, reason: 'exhausted' }); continue; }
      able.push(m);
    }
    const first = able[0] || null;
    const second = able[1] || null;
    const takes = n => (n === 'You' ? 'take' : 'takes');
    let note;
    if (!first) note = 'No one fit to watch. The night goes unwatched.';
    else if (!second) note = first.name + ' ' + takes(first.name) + ' the whole night alone — and will feel it tomorrow.';
    else note = first.name + ' ' + takes(first.name) + ' first watch, ' + second.name + ' the second.';
    return { first, second, refused, note, watched: !!first };
  }

  // Monster curiosity: unseen → curious → prowling → hungry (Steve's directive:
  // curiosity escalates to hunger; monsters were sent to fight). Curiosity rises
  // every night — faster unwatched. At 'hungry' a watched camp is confronted
  // (defenders act, never cower); an unwatched camp is attacked.
  // Returns {outcome, curiosity, stage, lines, sleepDebt} — the caller persists
  // curiosity on state and applies sleepDebt as tomorrow's energy cost.
  function resolveNightWatch(roster, night, rng) {
    night = night || {};
    rng = rng || Math.random;
    const watched = !!(roster && roster.watched);
    let curiosity = night.curiosity || 0;
    curiosity += watched ? 1 : 2;
    const lines = [];
    const sleepDebt = [];
    if (roster && roster.first) sleepDebt.push(roster.first.id);
    if (roster && roster.second) sleepDebt.push(roster.second.id);
    let outcome;
    const stage = curiosityStage(curiosity);
    if (stage === 'hungry') {
      if (watched) {
        outcome = 'confronted';
        curiosity = 2; // driven off — but it learned the camp is defended
        lines.push('Something comes hungry out of the dark — and the watch meets it. It does not go quietly, and neither do they.');
      } else {
        outcome = 'attacked';
        lines.push('Something comes hungry out of the dark, and no one is awake to meet it.');
      }
    } else if (stage === 'prowling') {
      outcome = 'prowled';
      lines.push(watched
        ? 'Eyes at the treeline, circling. The watch holds; it keeps its distance — for now.'
        : 'Eyes at the treeline, circling. No one sees them but the dark.');
    } else {
      outcome = 'quiet';
      lines.push(watched
        ? 'A quiet night. The watch hears the woods breathe and lets it.'
        : 'A quiet night. Something may have passed; nothing proves it.');
    }
    return { outcome, curiosity, stage: curiosityStage(curiosity), lines, sleepDebt };
  }

  function curiosityStage(level) {
    if (level <= 0) return 'unseen';
    if (level <= 2) return 'curious';
    if (level <= 4) return 'prowling';
    return 'hungry';
  }

  // --- hunger pacing: visible, honest, slow ---
  // Design correction (Steve): starvation takes people slowly — not the wound
  // system. Each stage spans roughly a day of buffer. Damage stays in
  // calories.resolveDay; this only names what the player can see.
  function hungerState(scholar, need) {
    const needKcal = need || ACTIVE_ANCHOR;
    const kcal = Math.max(0, scholar.kcal || 0);
    const daysToSpiral = Math.round((kcal / needKcal) * 10) / 10;
    let stage, label, note;
    if (kcal >= needKcal) {
      stage = 'fed'; label = 'Fed';
      note = 'A full day in the tank. The bank can take the rest.';
    } else if (kcal >= needKcal / 2) {
      stage = 'lean'; label = 'Lean';
      note = 'Tomorrow needs food. Not yet an emergency.';
    } else if (kcal > 0) {
      stage = 'hungry'; label = 'Hungry';
      note = 'The spiral starts within the day. Eat today.';
    } else {
      stage = 'starving'; label = 'STARVING';
      note = 'The spiral has started — slow, visible, and honest.';
    }
    return { stage, label, note, daysToSpiral, need: needKcal };
  }

  global.Scattering = global.Scattering || {};
  global.Scattering.day = {
    PHASES, newDay,
    MINUTES_PER_DAY, CLOCK_PARTS, PART_SPAN, PART_MINUTES, DAYLIGHT_MINUTES,
    ACTION_MINUTES, ACTIVE_ANCHOR, PART_MOOD,
    makeRng, costLabel, fmtMinutes, costDetail, costFor, labeledCost,
    dayPartOf, partMinutes, daylightLeft, nightLeft, dayBudget, spendMinutes,
    partMood, weatherRoll, dawnBeat, eveningTick, waterStage,
    planWatches, resolveNightWatch, curiosityStage, hungerState,
  };
})(typeof window !== 'undefined' ? window : globalThis);

// ---------------------------------------------------------------------------
// WIRING NOTES (game.js — the sibling owns the wiring; this engine only exposes)
// ---------------------------------------------------------------------------
// - this.dayPart index <-> CLOCK_PARTS: game.js DAY_PARTS is ['dawn','midday',
//   'dusk','night'], matching CLOCK_PARTS order, so CLOCK_PARTS[this.dayPart]
//   names the current part and dayPartOf(minute) names any clock minute.
// - Honest buttons: labeledCost('forage') -> "Forage (a while (≈1.5 h))"; use
//   for action buttons (Steve: no silent actions; expensive buttons name cost).
//   Unknown actions label as "(cost unknown)" — investigate, don't silently act.
// - Day rollover: spendMinutes(clock, minutes, opts) returns a 'dawn' event
//   carrying dawnBeat(day, opts) — render the beat (title/lines/prompt), don't
//   just tick the counter. Dawn is a moment. opts passes {weather, systemNote,
//   statusLine, rng} through to the beat.
// - Part transitions: 'part' events carry partMood(to) — glyph + tone +
//   audioHook (dawn-chorus / midday-hum / dusk-settle / night-quiet) for the
//   status row and synth triggers. One screen, no scroll for the moment.
// - Evening: eveningTick({day, items, waterL}) -> {spoiled, spoiling, water} —
//   fold into the evening phase. game.js owns state.weather and the pantry;
//   weatherRoll(rng) is a pure helper the live roll may adopt or ignore.
// - Night: planWatches(members) -> roster -> resolveNightWatch(roster,
//   {curiosity}, rng) -> {outcome, curiosity, stage, lines, sleepDebt}.
//   Persist curiosity on state (it escalates across nights); apply sleepDebt
//   as tomorrow's energy cost. Villagers refuse when hurt/exhausted — show the
//   refusal, never silence it. 'confronted'/'attacked' at hungry: villagers act.
// - Hunger UI: hungerState(scholar) -> {stage, label, note, daysToSpiral} —
//   visible, honest, slow. Damage still lives in calories.resolveDay (untouched).
// - Time budget: dayBudget() = 900 daylight minutes; daylightLeft(clock) and
//   nightLeft(clock) for "timeBudget remaining" displays.
