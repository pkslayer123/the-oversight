#!/usr/bin/env node
/* Proof test: events-pool expansion (Steve 2026-10-05).
 *
 * Applies hidden_files/events-expansion-20261007.json to a SCRATCH copy of
 * HEAD's src/data/events.json (under os.tmpdir(), never the repo) and proves:
 *  (a) the merged file is valid JSON and conformant to every schema field the
 *      event loader reads (Game.scheduleSystemEvents / checkTimedEvents /
 *      triggerEvent). NOTE: scripts/validate-data.js CRASHES on events.json at
 *      HEAD (TypeError at line 157: the file is a wrapper object, not an
 *      array, so .forEach does not exist) -- pre-existing breakage, so the
 *      loader-field assertion is the gate, as the task spec allows.
 *  (b) the loader path loads all events without exceptions;
 *  (c) each new event's trigger parses and fires in a simulated day-advance;
 *  (d) no duplicate ids.
 *
 * Deterministic: no RNG anywhere in the dispatch path. The six ev* handler
 * bodies are implemented in game.js at merge time (the documented workflow in
 * events.json's _comment); this test stubs them to prove dispatch reaches the
 * named handler for every new event.
 *
 * Usage: node scripts/test-events-expansion-20261007.js <fragment.json> <base-events.json>
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

const failures = [];
const ok = (cond, label) => { console.log((cond ? '  PASS ' : '  FAIL ') + label); if (!cond) failures.push(label); };

const fragmentPath = process.argv[2];
const basePath = process.argv[3];
if (!fragmentPath || !basePath) {
  console.error('usage: node test-events-expansion-20261007.js <fragment.json> <base-events.json>');
  process.exit(2);
}

const fragment = JSON.parse(fs.readFileSync(fragmentPath, 'utf8'));
const base = JSON.parse(fs.readFileSync(basePath, 'utf8'));
ok(Array.isArray(fragment), 'fragment is a JSON array');
ok(fragment.length === 6, `fragment holds 6 new events (got ${fragment.length})`);
ok(base._schema === 'events/1', 'base file carries _schema events/1');

// Merge onto a scratch copy -- never the repo.
const merged = { _comment: base._comment, _schema: base._schema, events: [...base.events, ...fragment] };
const scratchDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evt-merge-'));
const scratch = path.join(scratchDir, 'events.json');
fs.writeFileSync(scratch, JSON.stringify(merged));
const reparsed = JSON.parse(fs.readFileSync(scratch, 'utf8'));
ok(reparsed.events.length === base.events.length + 6,
   `merged file is valid JSON with ${base.events.length}+6=${reparsed.events.length} events`);

// (a) Loader-field schema assertion: the exact fields the engine dereferences
// (def.id/.name/.type/.description/.handler/.scheduledDay/.once/.repeatable/.cooldownDays).
const ALLOWED = ['cooldownDays', 'description', 'handler', 'id', 'name', 'once', 'repeatable', 'scheduledDay', 'type'];
const FILE_TYPES = ['challenge', 'drama', 'monster', 'quest']; // convention used by events.json at HEAD
for (const e of reparsed.events) {
  const keys = Object.keys(e);
  ok(keys.length === ALLOWED.length && ALLOWED.every(k => keys.includes(k)),
     `${e.id}: exact loader field set (no invented fields, none missing)`);
  ok(keys.join(',') === [...keys].sort().join(','), `${e.id}: keys alphabetical (file style)`);
  ok(typeof e.id === 'string' && e.id.length > 0, `${e.id}: id is a non-empty string`);
  ok(typeof e.name === 'string' && e.name.length > 0, `${e.id}: name is a non-empty string`);
  ok(typeof e.type === 'string', `${e.id}: type is a string`);
  ok(typeof e.description === 'string' && e.description.length > 0, `${e.id}: description is a non-empty string`);
  ok(typeof e.handler === 'string' && /^ev[A-Z][A-Za-z]*$/.test(e.handler),
     `${e.id}: handler follows evCamelCase convention`);
  ok(Number.isInteger(e.scheduledDay) && e.scheduledDay >= 1, `${e.id}: scheduledDay is a positive integer`);
  ok(typeof e.once === 'boolean' && typeof e.repeatable === 'boolean', `${e.id}: once/repeatable are booleans`);
  ok(typeof e.cooldownDays === 'number' && e.cooldownDays >= 0, `${e.id}: cooldownDays is a non-negative number`);
}
for (const e of fragment) {
  ok(FILE_TYPES.includes(e.type), `${e.id}: type matches events.json convention (${e.type})`);
  ok(/day-part|kcal/i.test(e.description), `${e.id}: description names a real cost (day-part/kcal)`);
  ok(!/[^\x00-\x7F]/.test(e.description), `${e.id}: description is ASCII-only (file escaping style)`);
}

// (d) No duplicate ids; unique scheduled days (no same-day clumping).
const ids = reparsed.events.map(e => e.id);
ok(new Set(ids).size === ids.length, 'no duplicate ids across merged set');
const days = reparsed.events.map(e => e.scheduledDay);
ok(new Set(days).size === days.length, 'scheduledDay values unique across merged set');

// (b)+(c) Simulate the loader path. Logic transcribed from HEAD game.js
// (scheduleSystemEvents / checkTimedEvents / triggerEvent, ~lines 14579-14645).
function makeGame(data) {
  const g = {
    data,
    state: { scholar: { day: 0 }, firedEvents: {} },
    calls: [],
    say() {},
    scheduleSystemEvents() {
      const s = this.state.scholar;
      s.timedEvents = s.timedEvents || [];
      const events = (this.data.events && this.data.events.events) || [];
      for (const def of events) {
        if (def.scheduledDay == null) continue;
        if (s.timedEvents.some(e => e.id === def.id)) continue;
        s.timedEvents.push({ day: def.scheduledDay, type: def.type, id: def.id, done: false });
      }
    },
    checkTimedEvents() {
      const s = this.state.scholar;
      if (!s.timedEvents) return;
      for (const ev of s.timedEvents) {
        if (!ev.done && s.day >= ev.day) {
          ev.done = true;
          this.triggerEvent(ev);
        }
      }
    },
    triggerEvent(ev) {
      const eid = ev && ev.id;
      if (!eid) return;
      const events = (this.data.events && this.data.events.events) || [];
      const def = events.find(e => e.id === eid);
      if (!def) return; // unknown event -- ignored silently (defensive)
      this.state.firedEvents = this.state.firedEvents || {};
      const fired = this.state.firedEvents[eid] || {};
      if (def.once && fired.done) return;
      if (def.repeatable && def.cooldownDays > 0) {
        const lastDay = fired.lastDay || -999;
        const today = (this.state.scholar || {}).day || 0;
        if (today - lastDay < def.cooldownDays) return;
      }
      const handler = def.handler;
      if (handler && typeof this[handler] === 'function') this[handler](ev);
      this.state.firedEvents[eid] = {
        done: !!def.once,
        lastDay: (this.state.scholar || {}).day || 0,
        count: (fired.count || 0) + 1
      };
    },
  };
  // Stub handlers (old 4 + 6 new) recording dispatch. Real bodies are
  // implemented in game.js at merge time per the events.json _comment workflow.
  for (const e of data.events.events) {
    const def = e;
    g[def.handler] = function (ev) {
      this.calls.push({ id: ev.id, day: this.state.scholar.day, handler: def.handler });
    };
  }
  return g;
}

// In the real game, this.data is the whole data bundle and this.data.events is
// the parsed events.json wrapper ({_comment,_schema,events}). Mirror that here.
const game = makeGame({ events: reparsed });
let threw = null;
try {
  game.scheduleSystemEvents();
  for (let d = 1; d <= 30; d++) { game.state.scholar.day = d; game.checkTimedEvents(); }
} catch (e) { threw = e; }
ok(!threw, 'loader path runs days 1-30 with no exceptions' + (threw ? ` (${threw.message})` : ''));

const expected = [
  [8, 'first_hunt'], [9, 'stranger'], [10, 'hushwolf_pack'], [12, 'system_task'],
  [14, 'fan_package'], [16, 'quiet_woods'], [18, 'cooking_lesson'],
  [21, 'river_trader'], [24, 'trial_offer'], [27, 'storm_front'],
];
ok(game.calls.length === expected.length, `all 10 events fired exactly once (got ${game.calls.length})`);
expected.forEach(([day, id], i) => {
  const c = game.calls[i];
  ok(!!c && c.id === id && c.day === day, `firing #${i + 1}: ${id} dispatched on day ${day}`);
});
const newIds = new Set(fragment.map(e => e.id));
for (const c of game.calls) {
  if (newIds.has(c.id)) {
    ok(typeof game[c.handler] === 'function', `${c.id}: dispatch reached named handler ${c.handler}`);
  }
}
// Once-semantics: re-checking at day 30 fires nothing new.
const before = game.calls.length;
game.checkTimedEvents();
ok(game.calls.length === before, 'no refire on repeated checkTimedEvents (once honored)');
// Defensive paths: unknown / null / empty triggers do not throw.
try {
  game.triggerEvent({ id: 'nope' });
  game.triggerEvent(null);
  game.triggerEvent({});
  ok(true, 'unknown/null triggers ignored silently (defensive path)');
} catch (e) { ok(false, `unknown/null triggers ignored silently (${e.message})`); }
// firedEvents bookkeeping recorded for every event.
ok(Object.keys(game.state.firedEvents).length === 10, 'firedEvents recorded for all 10 events');
ok(Object.values(game.state.firedEvents).every(f => f.done === true && f.count === 1),
   'firedEvents: done=true, count=1 for every event');
// New handler names do not collide with existing ones.
const newHandlers = fragment.map(e => e.handler);
ok(new Set([...newHandlers, 'evFirstHunt', 'evStranger', 'evHushwolfPack', 'evSystemTask']).size === 10,
   'new handler names do not collide with existing handlers');

console.log(failures.length ? `\nRESULT: ${failures.length} FAILURE(S)` : '\nRESULT: ALL GREEN');
process.exit(failures.length ? 1 : 0);
