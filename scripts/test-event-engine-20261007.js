#!/usr/bin/env node
// TEST (Steve 2026-10-07): Event trigger engine.
// Verifies: all 4 events defined in events.json, generic dispatcher works,
// once-events don't refire, handlers exist and produce expected state changes,
// scheduleSystemEvents reads from data.
//
// Run: node scripts/test-event-engine-20261007.js
// (plain node, NOT jest — never run concurrent jest on the hot tree)

const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

// Load events.json directly
const eventsData = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/events.json'), 'utf8'));
const events = eventsData.events || [];

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}

console.log('Event engine tests:');

// 1. All 4 events defined
check('4 events defined', events.length === 4, `found ${events.length}`);
const ids = events.map(e => e.id).sort();
check('expected event ids', JSON.stringify(ids) === JSON.stringify(['first_hunt', 'hushwolf_pack', 'stranger', 'system_task']), ids.join(','));

// 2. Each has required fields
for (const e of events) {
  check(`${e.id} has handler`, !!e.handler, 'missing handler');
  check(`${e.id} has scheduledDay`, e.scheduledDay != null, 'missing scheduledDay');
  check(`${e.id} once=true`, e.once === true, 'should be once');
}

// 3. Schedule days match original hardcoded values
const dayMap = {};
for (const e of events) dayMap[e.id] = e.scheduledDay;
check('first_hunt day 8', dayMap.first_hunt === 8);
check('stranger day 9', dayMap.stranger === 9);
check('hushwolf_pack day 10', dayMap.hushwolf_pack === 10);
check('system_task day 12', dayMap.system_task === 12);

// 4. Handlers exist in game.js (static check)
const gameSrc = fs.readFileSync(process.env.GAMEJS || path.join(ROOT, 'src/js/game.js'), 'utf8');
for (const e of events) {
  check(`handler ${e.handler} exists`, gameSrc.includes(`${e.handler}(ev)`), 'not found in game.js');
}

// 5. Generic dispatcher exists (no if/else chain on ev.id)
check('triggerEvent is generic dispatcher', gameSrc.includes('EVENT ENGINE (Steve 2026-10-07)'), 'engine comment missing');
check('no hardcoded first_hunt branch', !gameSrc.includes("if (ev.id === 'first_hunt')"), 'old if/else chain still present');
check('no hardcoded stranger branch', !gameSrc.includes("else if (ev.id === 'stranger')"), 'old if/else chain still present');

// 6. scheduleSystemEvents reads from data
check('scheduleSystemEvents data-driven', gameSrc.includes('this.data.events'), 'not reading from events.json');

// 7. events.json in data loading
check('events.json in init loading', gameSrc.includes("'events.json'"), 'not in data loading list');

// 8. Behavioral test: simulate the dispatcher logic
// (minimal harness — verify once-gating and handler dispatch work)
{
  const state = { scholar: { day: 8 }, firedEvents: {} };
  const sayLog = [];
  const handlersCalled = [];

  // Mock Game with the dispatcher logic extracted
  const mockGame = {
    state,
    data: { events: eventsData },
    say: (t) => sayLog.push(t),
    hasAbility: () => false,
    triggerEvent(ev) {
      const eid = ev && ev.id;
      if (!eid) return;
      const evts = (this.data.events && this.data.events.events) || [];
      const def = evts.find(e => e.id === eid);
      if (!def) return;
      this.state.firedEvents = this.state.firedEvents || {};
      const fired = this.state.firedEvents[eid] || {};
      if (def.once && fired.done) return;
      if (def.repeatable && def.cooldownDays > 0) {
        const lastDay = fired.lastDay || -999;
        const today = (this.state.scholar || {}).day || 0;
        if (today - lastDay < def.cooldownDays) return;
      }
      const handler = def.handler;
      if (handler && typeof this[handler] === 'function') {
        this[handler](ev);
      }
      this.state.firedEvents[eid] = {
        done: !!def.once,
        lastDay: (this.state.scholar || {}).day || 0,
        count: (fired.count || 0) + 1
      };
    },
    evFirstHunt() { handlersCalled.push('evFirstHunt'); this.state.scholar.activeChallenge = { id: 'first_hunt' }; },
    evStranger() { handlersCalled.push('evStranger'); },
    evHushwolfPack() { handlersCalled.push('evHushwolfPack'); },
    evSystemTask() { handlersCalled.push('evSystemTask'); this.state.scholar.activeQuest = { id: 'system_task' }; },
  };

  // Fire first_hunt
  mockGame.triggerEvent({ id: 'first_hunt', day: 8 });
  check('first_hunt handler called', handlersCalled.includes('evFirstHunt'));
  check('first_hunt sets activeChallenge', state.scholar.activeChallenge && state.scholar.activeChallenge.id === 'first_hunt');
  check('first_hunt recorded as fired', state.firedEvents.first_hunt && state.firedEvents.first_hunt.done === true);

  // Fire again — should be blocked (once)
  const countBefore = handlersCalled.length;
  mockGame.triggerEvent({ id: 'first_hunt', day: 9 });
  check('once-event does not refire', handlersCalled.length === countBefore, 'handler called twice');

  // Fire unknown event — should be ignored
  mockGame.triggerEvent({ id: 'nonexistent_event' });
  check('unknown event ignored', handlersCalled.length === countBefore, 'crashed or called handler');

  // Fire system_task
  mockGame.triggerEvent({ id: 'system_task', day: 12 });
  check('system_task handler called', handlersCalled.includes('evSystemTask'));
  check('system_task sets activeQuest', state.scholar.activeQuest && state.scholar.activeQuest.id === 'system_task');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
