/* FOOD REALITY SYSTEM
 *
 * Steve's design: the foraging loop felt like "wander out there and grab
 * unlimited free food." Now food is a system to learn, not a number to grab:
 *
 * 1. KNOWLEDGE-GATED RECOGNITION — an unfamiliar plant isn't food until you
 *    know it's edible (identify it, be taught, read about it). Unknown hauls
 *    sit in your pack as "unfamiliar plant," uncounted and uneaten.
 * 2. FOOD STATES — raw < cleaned < cooked < preserved. Each step costs time,
 *    tools, knowledge; each step changes net calories and disease risk.
 *    - nuts: in-shell (not food) -> shelled (net < gross; shells weigh)
 *    - game: carcass (not food, spoils fast) -> cleaned raw (40% kcal, risky)
 *      -> cooked (100%, safe) -> preserved (90%, keeps ~a month)
 * 3. TECHNIQUE KNOWLEDGE — cleaning/cooking/preserving require knowing how.
 *    Backgrounds grant it; specialists teach by example (watch twice, learn);
 *    attempting blind works but messy — and teaches.
 * 4. SPECIALIST ECONOMY — villagers hone what they're good at (occupation ->
 *    specialty). Haul everything to the pantry; let the butcher clean, the
 *    cook cook, the preserver smoke. They do it better than you.
 * 5. PREY FLEES — turkey/deer/rabbit react to approach (graze -> wary ->
 *    bolt) and to the strike itself. Hunting is stalking, not statues.
 * 6. PANTRY CAPACITY — the pantry and water store have real caps, expandable
 *    with materials + labor. Storage is a goal, not a given.
 *
 * Self-attaching module: attaches methods to Game, wraps a few. Game.js
 * gets only tiny surgical hooks (marked FOOD REALITY).
 */
(function () {
  'use strict';
  const G = (typeof globalThis !== 'undefined' && globalThis.Scattering && globalThis.Scattering.Game)
    ? globalThis.Scattering.Game
    : (typeof Game !== 'undefined' ? Game : null);
  if (!G) return;

  // ---------- data ----------

  // Nuts: detected from preparation text (crack/shell) + explicit ids.
  const NUT_IDS = { hickory_nut: 1, acorn_white_oak: 1 };
  const NUT_RE = /crack|shell|husk/i;
  // Plants that MUST be cooked (raw is a gamble).
  const MUST_COOK_RE = /must be cooked|must leach/i;

  // Occupation -> food specialties. Emergent, not classes: your old life is
  // what you know. skill 1 = competent, 2 = good, 3 = master.
  const SPECIALTIES = {
    butcher: [ // cleaning/gutting game
      { m: 'hunter', s: 3 }, { m: 'line cook / hunter', s: 3 },
      { m: 'veterinary tech', s: 3 }, { m: 'veterinarian', s: 3 },
      { m: 'fisherman', s: 2 }, { m: 'chef', s: 2 }, { m: 'sushi chef', s: 2 },
      { m: 'farmer', s: 2 }, { m: 'park ranger', s: 2 }, { m: 'butcher', s: 3 },
    ],
    cook: [ // cooking: more kcal, safer
      { m: 'chef', s: 3 }, { m: 'sushi chef', s: 3 }, { m: 'line cook / hunter', s: 2 },
      { m: 'cafeteria manager', s: 2 }, { m: 'cook', s: 2 }, { m: 'baker', s: 2 },
    ],
    preserver: [ // smoking/drying/salting: keeps longer
      { m: 'chef', s: 2 }, { m: 'fisherman', s: 3 }, { m: 'farmer', s: 2 },
      { m: 'park ranger', s: 1 },
    ],
    spotter: [ // plant identification help (future: faster ID)
      { m: 'botanist', s: 3 }, { m: 'gardener', s: 2 }, { m: 'farmer', s: 2 },
      { m: 'hiker', s: 2 }, { m: 'park ranger', s: 2 }, { m: 'herbalist', s: 3 },
    ],
    builder: [ // pantry/storage upgrades: cheaper, faster
      { m: 'carpenter', s: 3 }, { m: 'construction worker', s: 3 },
      { m: 'engineer', s: 2 }, { m: 'mechanic', s: 1 },
    ],
  };

  // Occupation -> processing techniques the PLAYER starts knowing.
  const TECHNIQUE_GRANTS = {
    clean: ['hunter', 'line cook / hunter', 'veterinary tech', 'veterinarian', 'fisherman', 'chef', 'sushi chef', 'farmer', 'park ranger', 'butcher'],
    cook: ['chef', 'sushi chef', 'line cook / hunter', 'cafeteria manager', 'cook', 'baker', 'camper', 'scout', 'hiker'],
    preserve: ['chef', 'fisherman', 'farmer', 'smoker'],
    shell: null, // everyone knows: crack and pick. Obvious.
  };

  const TECHNIQUE_NAMES = { clean: 'cleaning game', cook: 'cooking', preserve: 'preserving food', shell: 'shelling nuts' };

  // Disease profiles.
  const RISK = {
    rawMeat: { p: 0.35, dmg: 12, note: 'raw meat' },
    mustCook: { p: 0.25, dmg: 8, note: 'raw (it needed cooking)' },
    acornRaw: { p: 0.10, dmg: 5, note: 'raw acorn (white oak is mildest — red oak would be worse)' },
  };

  // Lump forms: one opaque stack per form. The field bag, honestly lumped.
  const LUMP_FORMS = {
    shoots: { name: 'unknown shoots', unit: 'handful' },
    berries: { name: 'unknown berries', unit: 'handful' },
    roots: { name: 'unknown roots', unit: 'piece' },
    nuts: { name: 'unknown nuts', unit: 'handful' },
  };

  const methods = {

    // ---------- technique knowledge ----------

    techniques() {
      const c = this.state.codex;
      if (!c.techniques) {
        c.techniques = { clean: false, cook: false, preserve: false, shell: true };
        // background grants: your old life taught you.
        const v = (this.data.villagers || []).find(x => x.id === this.villagerId);
        const occ = String((v && v.formerOccupation) || '').toLowerCase();
        for (const t of ['clean', 'cook', 'preserve']) {
          const grants = TECHNIQUE_GRANTS[t] || [];
          if (grants.some(g => occ.includes(g))) c.techniques[t] = true;
        }
      }
      return c.techniques;
    },

    knowsTechnique(t) {
      return !!this.techniques()[t];
    },

    learnTechnique(t, source) {
      const tech = this.techniques();
      if (tech[t]) return false;
      tech[t] = true;
      const how = source === 'watched' ? 'You\'ve watched it done twice now — your hands know the motions.'
        : source === 'trial' ? 'Messy, but it worked. Next time will be cleaner.'
        : 'You learn ' + (TECHNIQUE_NAMES[t] || t) + '.';
      this.say(`\u2605 Learned: ${TECHNIQUE_NAMES[t] || t}. ${how}`);
      return true;
    },

    // ---------- item construction ----------

    // A foraged plant, knowledge-gated. Unknown plants aren't food yet.
    foodForageItem(plant, isKnown, units, kcal, day) {
      const isNut = NUT_IDS[plant.id] || NUT_RE.test(plant.preparation || '');
      const mustCook = MUST_COOK_RE.test(plant.preparation || '');
      const base = {
        plantId: plant.id, units, kg: 0.1,
        unit: plant.unit, spoilDay: day + (plant.spoilageDays || 2),
      };
      if (!isKnown) {
        return Object.assign(base, {
          foodKind: 'plant', foodState: 'unknown', edible: false,
          kcalEach: 0, hiddenKcal: plant.caloriesPerUnit,
          name: plant.description || 'unfamiliar plant',
          prep: 'Unknown. Identify it before trusting it as food.',
        });
      }
      if (isNut) {
        return Object.assign(base, {
          foodKind: 'nut', foodState: 'in_shell', edible: false,
          kcalEach: 0, hiddenKcal: plant.caloriesPerUnit,
          name: plant.name + ' (in shell)',
          prep: 'Needs shelling — crack and pick the nutmeats. (Shell action)',
        });
      }
      const item = Object.assign(base, {
        foodKind: 'plant', foodState: 'ready', edible: true,
        kcalEach: plant.caloriesPerUnit,
        name: plant.name,
      });
      if (plant.preparation) item.prep = plant.preparation;
      if (mustCook) {
        item.needsCooking = true;
        item.diseaseRisk = Object.assign({}, RISK.mustCook);
        item.prep = (item.prep ? item.prep + ' ' : '') + '\u26A0\uFE0F Risky raw — cook it.';
      }
      if (plant.id === 'acorn_white_oak') {
        // shelled acorn still carries a whisper of tannin risk for the unknowing
        item.diseaseRisk = Object.assign({}, RISK.acornRaw);
      }
      return item;
    },

    // A killed animal: carcass, not food. Clean it quickly — it spoils fast.
    foodCarcass(animal, kcal, day, how) {
      return {
        plantId: 'meat_' + animal.id, foodKind: 'meat', foodState: 'carcass',
        edible: false, units: 1, kcalEach: 0, hiddenKcal: kcal,
        spoilDay: day + 2, unit: 'carcass',
        name: animal.name + (how === 'trapped' ? ' (trapped)' : ' (carcass)'),
        prep: 'Gut it quickly — clean with a knife. Spoils in ~2 days.',
        kg: Math.max(0.5, kcal / 1000),
      };
    },

    hasCuttingTool() {
      const inv = (this.state.scholar.inventory || []).concat(this.state.scholar.tools || []);
      return inv.some(i => /knife|machete|sharpened|blade/i.test(String(i.name || '') + ' ' + String(i.recipeId || '')));
    },

    // ---------- lumped unknowns ----------
    //
    // Steve's rule: unknown forageables do NOT split into per-species piles.
    // Same-form unknowns lump into ONE stack ("unknown shoots ×12"), like
    // reality. The stack secretly tracks its true species composition; the
    // player can't see through it in the field. Identification happens back
    // at camp, by people with knowledge — emptying the bag is a ritual.

    // One stack per form. The field bag is honest: you don't know what's what.
    // (Form comes from plants.json; falls back to shoots.)

    lumpFormOf(plant) {
      const f = plant && plant.form;
      return (f && LUMP_FORMS[f]) ? f : 'shoots';
    },

    lumpFormName(plant) {
      const f = this.lumpFormOf(plant);
      return (LUMP_FORMS[f] && LUMP_FORMS[f].name) || 'unfamiliar shoots';
    },

    findLump(container, form) {
      return (container || []).find(it => it && it.foodState === 'unknown' && it.lump && it.lumpForm === form) || null;
    },

    // addUnknownToLump: the game never loses track of what is what, even
    // though the player sees one opaque stack.
    addUnknownToLump(plant, units, day, container) {
      const cont = container || this.state.scholar.inventory;
      const form = this.lumpFormOf(plant);
      const F = LUMP_FORMS[form];
      let lump = this.findLump(cont, form);
      if (!lump) {
        lump = {
          plantId: null, lumpForm: form, name: F.name,
          units: 0, unit: F.unit, foodKind: 'plant', foodState: 'unknown',
          edible: false, kcalEach: 0, kg: 0.1,
          spoilDay: day + (plant.spoilageDays || 2),
          lump: {},
          prep: 'Lumped together the way you gathered them. No telling what\'s what out here — sort it at camp with someone who knows plants.',
        };
        cont.push(lump);
      }
      const comp = lump.lump;
      const e = comp[plant.id] || { units: 0, day };
      e.units += units;
      e.day = Math.min(e.day, day);
      comp[plant.id] = e;
      lump.units += units;
      lump.spoilDay = Math.min(lump.spoilDay, day + (plant.spoilageDays || 2));
      lump.kg = Math.max(0.1, Math.round(lump.units * 0.1 * 10) / 10);
      return lump;
    },

    // splitLumpOut: a species is identified — pull its units out of the lump
    // as a real item. The remainder stays lumped, composition updated.
    splitLumpOut(lump, pid, container) {
      if (!lump || !lump.lump) return null;
      const comp = lump.lump;
      const e = comp[pid];
      if (!e || e.units <= 0) return null;
      const p = (this.data.plants || []).find(x => x.id === pid);
      if (!p) return null;
      const cont = container || this.state.scholar.inventory;
      const isNut = NUT_IDS[pid] || NUT_RE.test(p.preparation || '');
      const notFood = (p.edibility || 'safe') === 'avoid';
      const item = {
        plantId: pid, units: e.units, kg: 0.1, unit: p.unit,
        spoilDay: e.day + (p.spoilageDays || 2),
        foodKind: isNut ? 'nut' : 'plant',
        foodState: isNut ? 'in_shell' : 'ready',
        edible: !isNut && !notFood,
        kcalEach: (isNut || notFood) ? 0 : p.caloriesPerUnit,
        hiddenKcal: isNut ? p.caloriesPerUnit : null,
        name: isNut ? p.name + ' (in shell)' : p.name,
        prep: notFood
          ? (p.preparation || 'Identified — not food. But nothing is trash; the Codex knows its uses.')
          : isNut ? 'Needs shelling — crack and pick the nutmeats.'
          : (p.preparation || 'Edible. The Codex knows it now.'),
      };
      if (!isNut && !notFood && MUST_COOK_RE.test(p.preparation || '')) {
        item.needsCooking = true;
        item.diseaseRisk = Object.assign({}, RISK.mustCook);
        item.prep += ' \u26A0\uFE0F Risky raw — cook it.';
      }
      delete comp[pid];
      lump.units -= e.units;
      let minSpoil = Infinity;
      for (const cpid of Object.keys(comp)) {
        const cp = (this.data.plants || []).find(x => x.id === cpid);
        if (cp && comp[cpid]) minSpoil = Math.min(minSpoil, comp[cpid].day + (cp.spoilageDays || 2));
      }
      lump.spoilDay = isFinite(minSpoil) ? minSpoil : this.state.scholar.day;
      lump.kg = Math.max(0.1, Math.round(lump.units * 0.1 * 10) / 10);
      cont.push(item);
      if (lump.units <= 0) {
        const ix = cont.indexOf(lump);
        if (ix >= 0) cont.splice(ix, 1);
      }
      return item;
    },

    // migrateLumps: old saves have per-species "unfamiliar plant" piles.
    // Fold them into lumps once.
    migrateLumps() {
      const s = this.state.scholar;
      if (!s || s._lumpsMigrated) return;
      s._lumpsMigrated = true;
      const inv = s.inventory || [];
      const olds = inv.filter(it => it && it.foodState === 'unknown' && !it.lump && it.plantId);
      for (const it of olds) {
        const p = (this.data.plants || []).find(x => x.id === it.plantId);
        if (!p) continue;
        const ix = inv.indexOf(it);
        if (ix >= 0) inv.splice(ix, 1);
        const lump = this.addUnknownToLump(p, it.units || 1, s.day, inv);
        if (it.spoilDay) lump.spoilDay = Math.min(lump.spoilDay, it.spoilDay);
      }
    },

    // ---------- processing ----------

    // SHELL: hands or a stone. Net < gross — shells weigh.
    shellNuts(idx, container) {
      const inv = container || this.state.scholar.inventory;
      const targets = (idx === undefined ? inv.map((it, i) => i) : [idx])
        .filter(i => inv[i] && inv[i].foodKind === 'nut' && inv[i].foodState === 'in_shell');
      if (!targets.length) { this.say('No unshelled nuts.'); return null; }
      let n = 0;
      for (const i of targets) {
        const it = inv[i];
        const net = Math.round((it.hiddenKcal || it.kcalEach || 0) * 0.75);
        it.kcalEach = net; it.hiddenKcal = null;
        it.foodState = 'shelled'; it.edible = true;
        it.name = it.name.replace(' (in shell)', '');
        it.prep = 'Shelled nutmeats. Ready to eat.';
        // acorn keeps its tannin whisper even shelled
        if (it.plantId === 'acorn_white_oak') it.diseaseRisk = Object.assign({}, RISK.acornRaw);
        n++;
      }
      this.tickAction(4);
      this.say(`You crack and pick ${n} lot${n > 1 ? 's' : ''} of nuts. Shells everywhere — the net is less than the gross looked. (4 ticks)`);
      return null;
    },

    // CLEAN: gutting. Needs a knife + knowing how. Blind attempts are messy but teach.
    cleanCarcass(idx, container) {
      const inv = container || this.state.scholar.inventory;
      const targets = (idx === undefined ? inv.map((it, i) => i) : [idx])
        .filter(i => inv[i] && inv[i].foodState === 'carcass');
      if (!targets.length) { this.say('No carcasses to clean.'); return null; }
      if (!this.hasCuttingTool()) { this.say('You need a knife (or a sharp edge) to clean game.'); return null; }
      const knows = this.knowsTechnique('clean');
      let n = 0;
      for (const i of targets) {
        const it = inv[i];
        const gross = it.hiddenKcal || 0;
        // yield: known 40%, blind-messy 30%. 4 portions.
        const yfrac = knows ? 0.40 : 0.30;
        const per = Math.round(gross * yfrac / 4);
        it.foodKind = 'meat'; it.foodState = 'cleaned'; it.edible = true;
        it.units = 4; it.unit = 'portion';
        it.kcalEach = per; it.hiddenKcal = gross; // full gross remembered for cooking
        it.diseaseRisk = Object.assign({}, RISK.rawMeat);
        it.spoilDay = this.state.scholar.day + 2;
        it.name = it.name.replace(' (carcass)', '').replace(' (trapped)', '') + ' (cleaned)';
        it.prep = '\u26A0\uFE0F Risky: raw meat. Cook it, or preserve it. Spoils in ~2 days.';
        it.kg = Math.max(0.2, gross * yfrac / 1000);
        n++;
        if (!knows) {
          it._messyCleans = (it._messyCleans || 0) + 1;
          if (it._messyCleans >= 1) this.learnTechnique('clean', 'trial');
        }
      }
      this.tickAction(8 * n);
      this.say(knows
        ? `Cleaned ${n} carcass${n > 1 ? 'es' : ''} — quick, practiced cuts. 4 portions each, raw. (${8 * n} ticks)`
        : `You hack at it clumsily — it takes a while and you waste some. But it worked, and your hands learned. (${8 * n} ticks)`);
      this.noteToolUse && this.noteToolUse();
      return null;
    },

    // PRESERVE: smoking/drying. Needs fire + knowing how. ~a month of safety.
    preserveFood(idx, container) {
      if (!this.nearFire()) { this.say('Need a fire to smoke meat.'); return null; }
      const inv = container || this.state.scholar.inventory;
      const targets = (idx === undefined ? inv.map((it, i) => i) : [idx])
        .filter(i => inv[i] && inv[i].foodKind === 'meat' && (inv[i].foodState === 'cleaned' || inv[i].foodState === 'cooked'));
      if (!targets.length) { this.say('Nothing to preserve (cleaned or cooked meat).'); return null; }
      const knows = this.knowsTechnique('preserve');
      let n = 0;
      for (const i of targets) {
        const it = inv[i];
        const wasCooked = it.foodState === 'cooked';
        const eff = knows ? 0.95 : 0.80;
        it.kcalEach = Math.round(it.kcalEach * eff);
        it.foodState = 'preserved';
        it.diseaseRisk = null; it.safe = true;
        it.spoilDay = this.state.scholar.day + (knows ? 30 : 15);
        it.name = it.name.replace(' (cleaned)', '').replace(' (cooked)', '') + ' (smoked)';
        it.prep = 'Smoked. Keeps ~a month. The pantry\'s future.';
        n++;
        if (!knows) {
          it._messyPreserves = (it._messyPreserves || 0) + 1;
          if (it._messyPreserves >= 2) this.learnTechnique('preserve', 'trial');
        }
      }
      this.tickAction(16);
      this.say(knows
        ? `Smoked ${n} batch${n > 1 ? 'es' : ''} low and slow. This keeps. (16 ticks)`
        : `You rig a smoky fire and hope. It sort of works — drier, safer, but you know a real preserver would do better. (16 ticks)`);
      return null;
    },

    // UI marker for an item's food state.
    foodMarker(it) {
      if (!it) return '';
      if (it.foodState === 'unknown') return '? unknown \u2014 not food yet';
      if (it.foodState === 'in_shell') return 'needs shelling';
      if (it.foodState === 'carcass') {
        const t = this.knowsTechnique('clean');
        return t ? (this.hasCuttingTool() ? 'needs cleaning' : 'needs cleaning (no knife)') : 'needs cleaning (you don\'t know how)';
      }
      if (it.diseaseRisk) return '\u26A0\uFE0F Risky: ' + (it.diseaseRisk.note || 'raw');
      if (it.foodState === 'preserved') return 'smoked \u2713';
      if (it.foodState === 'cooked') return 'cooked';
      if (it.needsCooking) return '\uD83C\uDF73 needs cooking';
      return '';
    },

    // ---------- specialist economy ----------

    // Everyone in the village, resolved: {id, name, formerOccupation}
    villagePeople() {
      const v = this.state.village;
      const out = [];
      for (const id of (v.roster || [])) {
        if (id === this.villagerId) continue;
        const rc = (v.rosterChars || {})[id];
        const vd = (this.data.villagers || []).find(x => x.id === id);
        const bg = (this.data.background_survivors || []).find(x => x.id === id);
        const src = rc || vd || bg;
        if (!src) continue;
        out.push({
          id,
          name: String(src.name || 'Someone').split(' ').slice(0, 2).join(' '),
          formerOccupation: src.formerOccupation || 'survivor',
          _src: src,
        });
      }
      return out;
    },

    specialistSkill(person, task) {
      const occ = String(person.formerOccupation || '').toLowerCase();
      let skill = 0;
      for (const s of (SPECIALTIES[task] || [])) {
        if (occ.includes(s.m)) skill = Math.max(skill, s.s);
      }
      // practice: they hone what they do.
      const xp = (person._src && person._src.foodXp && person._src.foodXp[task]) || 0;
      if (skill > 0 && xp >= 5) skill = Math.min(3, skill + 1);
      return skill;
    },

    // Specialists of a task who are HERE (same node as you).
    specialistsHere(task) {
      const here = [];
      for (const p of this.villagePeople()) {
        const skill = this.specialistSkill(p, task);
        if (skill <= 0) continue;
        let node = null;
        try { node = this.npcNode(p.id); } catch (e) {}
        if (node && (node.nx !== this.map.px || node.ny !== this.map.py)) continue;
        here.push({ id: p.id, name: p.name, skill, occupation: p.formerOccupation });
      }
      here.sort((a, b) => b.skill - a.skill);
      return here;
    },

    // Ask a specialist to process your item. They're better at it than you.
    // Costs your time (hauling, watching); watching twice teaches you.
    askSpecialist(vid, idx, container, forceTask) {
      const inv = container || this.state.scholar.inventory;
      const it = inv[idx];
      if (!it) return null;
      const task = forceTask
        || (it.foodState === 'carcass' ? 'butcher'
        : (it.foodKind === 'meat' && (it.foodState === 'cleaned' || it.foodState === 'cooked')) ? 'preserver'
        : (it.rawKcal || it.needsCooking || (it.foodKind === 'meat' && it.foodState === 'cleaned')) ? 'cook'
        : null);
      if (!task) { this.say('Nothing a specialist would do with that.'); return null; }
      const spec = this.specialistsHere(task).find(s => s.id === vid)
        || this.specialistsHere(task)[0];
      if (!spec) { this.say('No specialist for that here.'); return null; }
      const person = this.villagePeople().find(p => p.id === spec.id);
      const src = person && person._src;
      const tech = task === 'butcher' ? 'clean' : task; // butcher->clean, cook->cook, preserver->preserve
      const day = this.state.scholar.day;
      if (task === 'butcher') {
        if (it.foodState !== 'carcass') { this.say('That\'s already cleaned.'); return null; }
        const gross = it.hiddenKcal || 0;
        const yfrac = 0.40 + 0.04 * spec.skill; // 44/48/52% — better hands, more meat
        const per = Math.round(gross * yfrac / 4);
        it.foodKind = 'meat'; it.foodState = 'cleaned'; it.edible = true;
        it.units = 4; it.unit = 'portion';
        it.kcalEach = per; it.hiddenKcal = gross;
        it.diseaseRisk = Object.assign({}, RISK.rawMeat);
        it.spoilDay = day + 2;
        it.name = it.name.replace(' (carcass)', '').replace(' (trapped)', '') + ' (cleaned)';
        it.prep = '\u26A0\uFE0F Risky: raw meat. Cook it, or preserve it.';
        it.kg = Math.max(0.2, gross * yfrac / 1000);
        this.say(`${spec.name} (${spec.occupation}) cleans it in minutes — neat cuts, nothing wasted. ${4 * per} kcal of raw portions. You watch closely.`);
      } else if (task === 'cook') {
        const mult = 1 + 0.05 * spec.skill;
        if (it.rawKcal) {
          it.kcalEach = Math.round((it.cookedKcal || it.rawKcal * 1.5) * mult);
          it.rawKcal = null; it.safe = true;
        } else if (it.foodKind === 'meat' && it.foodState === 'cleaned') {
          // hiddenKcal is TOTAL; kcalEach is per unit.
          const units = it.units || 1;
          const total = it.hiddenKcal || it.kcalEach * 2.5 * units;
          it.kcalEach = Math.round(total * mult / units);
          it.hiddenKcal = null;
          it.foodState = 'cooked'; it.diseaseRisk = null; it.safe = true;
          it.spoilDay = day + 5;
          it.name = it.name.replace(' (cleaned)', '') + ' (cooked)';
          it.prep = 'Cooked through. Safe.';
        } else if (it.needsCooking && it.diseaseRisk) {
          it.diseaseRisk = null; it.safe = true; it.needsCooking = false;
          it.prep = (it.prep || '').replace(/\u26A0\uFE0F Risky raw \u2014 cook it\./, '').trim();
        }
        it.wellMade = true; // a specialist made this — it burns hotter as fuel
        this.say(`${spec.name} (${spec.occupation}) takes it to the fire. It comes back transformed — better than you could do.`);
      } else if (task === 'preserver') {
        it.kcalEach = Math.round(it.kcalEach * (0.95 + 0.02 * spec.skill));
        it.foodState = 'preserved'; it.diseaseRisk = null; it.safe = true;
        it.spoilDay = day + 30 + 5 * spec.skill;
        it.name = it.name.replace(' (cleaned)', '').replace(' (cooked)', '') + ' (smoked)';
        it.prep = 'Smoked by knowing hands. Keeps well over a month.';
        it.wellMade = true; // a specialist made this — it burns hotter as fuel
        this.say(`${spec.name} (${spec.occupation}) smokes it low and slow. This will keep for weeks.`);
      }
      // practice makes the specialist better; watching teaches you.
      if (src) {
        src.foodXp = src.foodXp || {};
        src.foodXp[task] = (src.foodXp[task] || 0) + 1;
        src.foodWatch = src.foodWatch || {};
        const w = (src.foodWatch[tech] || 0) + 1;
        src.foodWatch[tech] = w;
        if (w >= 2 && !this.knowsTechnique(tech)) {
          this.learnTechnique(tech, 'watched');
        } else if (w === 1 && !this.knowsTechnique(tech)) {
          this.say(`(Watch ${spec.name} once more and you'll pick up ${TECHNIQUE_NAMES[tech]}.)`);
        }
      }
      this.tickAction(8); // hauling, watching, learning — your time, honestly spent
      return null;
    },

    // Village-wide: does ANYONE here know this task? (coarse sim for the
    // village's own overnight cooking/processing.)
    villageHasSpecialty(task) {
      return this.villagePeople().some(p => this.specialistSkill(p, task) > 0);
    },

    // ---------- the camp ritual: sorting the bag ----------
    //
    // Steve's rule: identification happens BACK AT CAMP, by people with
    // knowledge. Emptying the bag is a ritual — a knowledgeable person picks
    // through the lump and names things. They identify what THEY know; the
    // player learns by watching (teaching, per the knowledge design).
    // Staring at the pile does nothing. Identification requires an ACTION.

    atCamp() {
      const v = this.state.village;
      return v && this.map.px === (v.px ?? 3) && this.map.py === (v.py ?? 3);
    },

    // villagerKnowsPlants(vid): background knowledge — the seed that breaks
    // the chicken-and-egg. Someone arrived knowing things.
    villagerKnowsPlants(vid) {
      const v = this.state.village;
      return (v && v.plantKnowledge && v.plantKnowledge[vid]) || [];
    },

    // seedBackgroundPlantKnowledge: the 12 arrive with what they know.
    // Relevant backgrounds know local plants; anyone might know one.
    // Called once at game start. The player seeds via their codex.
    seedBackgroundPlantKnowledge() {
      const v = this.state.village;
      if (!v || v.plantKnowledge) return;
      v.plantKnowledge = {};
      const plants = this.data.plants || [];
      if (!plants.length) return;
      const pick = (n) => {
        const pool = plants.slice();
        const out = [];
        for (let i = 0; i < n && pool.length; i++) {
          out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0].id);
        }
        return out;
      };
      for (const id of (v.roster || [])) {
        if (id === this.villagerId) continue;
        let person = null;
        try { person = this.villagePeople().find(p => p.id === id); } catch (e) {}
        const occ = String((person && person.formerOccupation) || '').toLowerCase();
        let n = 0;
        if (/botanist|herbalist/.test(occ)) n = 3;
        else if (/forager|farmer|gardener|park ranger|hiker/.test(occ)) n = 2;
        else if (/chef|cook/.test(occ)) n = 1;
        else if (Math.random() < 0.15) n = 1;
        if (n > 0) v.plantKnowledge[id] = pick(n);
      }
      // the player arrives with it too, if their background warrants
      try {
        const me = this.villagePeople().find(p => p.id === this.villagerId);
        const occ = String((me && me.formerOccupation) || '').toLowerCase();
        let n = 0;
        if (/botanist|herbalist/.test(occ)) n = 3;
        else if (/forager|farmer|gardener|park ranger|hiker/.test(occ)) n = 2;
        if (n > 0) {
          const mine = pick(n);
          for (const pid of mine) {
            if (!this.plantKnown(pid)) {
              this.state.codex.plants[pid] = { identifiedDay: 0, level: 1, harvests: 0, tastings: 0, by: 'background' };
            }
          }
          const names = mine.map(pid => { const p = plants.find(x => x.id === pid); return p ? p.name : pid; });
          this.say(`You arrive knowing a few things your old life taught you: ${names.join(', ')}.`);
        }
      } catch (e) {}
    },

    // whoKnowsLump(lump): villagers HERE (camp) who know >=1 species in it.
    whoKnowsLump(lump) {
      const comp = (lump && lump.lump) || {};
      const pids = Object.keys(comp);
      const out = [];
      for (const p of this.villagePeople()) {
        const known = this.villagerKnowsPlants(p.id);
        const knows = pids.filter(pid => known.includes(pid));
        if (!knows.length) continue;
        let node = null;
        try { node = this.npcNode(p.id); } catch (e) {}
        if (node && (node.nx !== this.map.px || node.ny !== this.map.py)) continue;
        out.push({ id: p.id, name: p.name, knows: knows.length, occupation: p.formerOccupation });
      }
      out.sort((a, b) => b.knows - a.knows);
      return out;
    },

    // sortBag(vid, idx, container): the camp ritual. vid null = you sort alone.
    // The sorter names what THEY know; you learn by watching.
    sortBag(vid, idx, container) {
      const cont = container || this.state.scholar.prepStash || [];
      const lump = cont[idx];
      if (!lump || !lump.lump) { this.say('Nothing to sort there.'); return null; }
      if (!this.atCamp()) { this.say('Sorting takes a flat surface and good light — do it at camp.'); return null; }
      const comp = lump.lump;
      const pids = Object.keys(comp);
      if (!pids.length) { this.say('The bag is already empty.'); return null; }
      let sorterName, knowsFn;
      if (!vid) {
        sorterName = 'You';
        knowsFn = (pid) => this.plantKnown(pid);
      } else {
        let person = null;
        try { person = this.villagePeople().find(p => p.id === vid); } catch (e) {}
        if (!person) { this.say("They're not here."); return null; }
        sorterName = person.name;
        const known = this.villagerKnowsPlants(vid);
        knowsFn = (pid) => known.includes(pid);
      }
      const named = [], taught = [];
      for (const pid of pids.slice()) {
        if (knowsFn(pid)) {
          const item = this.splitLumpOut(lump, pid, cont);
          if (item) {
            named.push(pid);
            if (!this.plantKnown(pid)) {
              this.identifyPlant(pid, 'taught');
              taught.push(pid);
            }
          }
        }
      }
      this.tickAction(8);
      const pName = (pid) => { const p = (this.data.plants || []).find(x => x.id === pid); return p ? p.name : pid; };
      if (!named.length) {
        const remaining = Object.keys(lump.lump || {}).length;
        // unskilled sorting: you notice the plurality, but that's all.
        let alike = '';
        if (!vid && remaining) {
          let bestPid = null, bestN = 0;
          for (const [cpid, ce] of Object.entries(lump.lump)) {
            if (ce.units > bestN) { bestN = ce.units; bestPid = cpid; }
          }
          if (bestN >= 3) alike = ` ${bestN} of the shoots look identical — probably the same plant, whatever it is.`;
        }
        this.say(`${sorterName} ${vid ? 'picks' : 'pick'} through the bag, frowning. Nothing ${vid ? 'they' : 'you'} can name with confidence.${alike} (8 ticks)`);
        return null;
      }
      const bits = named.map(pid => pName(pid) + (taught.includes(pid) ? ' \u2605' : ''));
      this.say(`${sorterName} spread${vid ? 's' : ''} the bag on a flat stone and ${vid ? 'starts' : 'start'} naming: ${bits.join(', ')}.`);
      if (taught.length) this.say(`You watch closely — ${taught.map(pName).join(', ')} ${taught.length > 1 ? 'are' : 'is'} yours now too.`);
      const left = lump.units || 0;
      if (left > 0) this.say(`${left} shoot${left > 1 ? 's' : ''} still a mystery.`);
      else this.say('The bag is empty. Everything named.');
      return null;
    },

    // ---------- breaking the chicken-and-egg ----------
    //
    // Steve's rule: the specialist may not exist. Staring at the pile doesn't
    // identify it. Knowledge must ENTER the system: cautious testing (always
    // available), watching animals (a hint, not proof), arriving with it
    // (backgrounds), books. The System names but never feeds.

    // testCautiously(idx, opts): the universal edibility test, gamified.
    // Real protocol: inspect -> skin -> lips -> taste -> meal, with waits.
    // Costs an afternoon. Small honest risks; rushing raises them a lot.
    // Targets the lump's plurality species ("a few that look alike").
    testCautiously(idx, opts, container) {
      opts = opts || {};
      const rush = !!opts.rush;
      const cont = container || this.state.scholar.inventory;
      const lump = cont[idx];
      if (!lump || !lump.lump) { this.say('Nothing to test there.'); return null; }
      const comp = lump.lump;
      const pids = Object.keys(comp);
      if (!pids.length) { this.say('The bag is empty.'); return null; }
      let pid = pids[0], best = -1;
      for (const c of pids) { if (comp[c].units > best) { best = comp[c].units; pid = c; } }
      const p = (this.data.plants || []).find(x => x.id === pid);
      if (!p) return null;
      if (this.plantKnown(pid)) { this.say('You already know this one — no need to test.'); return null; }
      const ed = p.edibility || 'safe';
      const hint = lump.hint;
      let riskMult = 1;
      if (hint) {
        const correct = (hint.kind === 'safe' && (ed === 'safe' || ed === 'caution')) ||
                        (hint.kind === 'avoid' && (ed === 'avoid' || ed === 'cook'));
        riskMult = correct ? 0.5 : 1.6;
      }
      if (rush) riskMult *= 2.5;
      const R = (base) => Math.random() < base * riskMult;

      const s = this.state.scholar;
      const queasy = (severe) => {
        // honest failure: nausea, a bad day. Not death.
        const eLoss = severe ? 40 : 20;
        s.energy = Math.max(0, (s.energy || 100) - eLoss);
        s.kcal = Math.max(0, (s.kcal || 0) - 200);
        this.say(severe
          ? 'By evening you are thoroughly, educationally sick. The lesson is learned the hard way. (-40 energy, -200 kcal)'
          : 'Your stomach knots an hour later. Not dangerous — educational. (-20 energy)');
      };
      const identifyAs = (verdict) => {
        // verdict: 'safe' | 'caution' | 'cook' | 'avoid'
        this.identifyPlant(pid, 'tested');
        const entry = this.state.codex.plants[pid];
        if (entry) entry.tested = verdict;
        const item = this.splitLumpOut(lump, pid, cont);
        if (item && verdict === 'avoid') {
          item.prep = (p.preparation || '') + ' NOT food — your body told you so. The Codex keeps it for its other uses.';
        } else if (item && verdict === 'cook') {
          item.prep = (item.prep || '') + ' Your test says: cook it, or else.';
        }
        return item;
      };

      if (rush) {
        this.say('You skip the waits — impatience with a side of hubris. Straight to tasting.');
        this.tickAction(16);
        // rushed: no early warnings; straight to the dangerous part
        if (ed === 'avoid' && R(0.55)) {
          queasy(true);
          this.say('That was a mistake. But now you KNOW: not food.');
          identifyAs('avoid');
          return null;
        }
        if (ed === 'cook' && R(0.45)) {
          queasy(false);
          this.say('Raw was wrong. Cooked, it might be fine — your gut is fairly sure.');
          identifyAs('cook');
          return null;
        }
        if (ed === 'caution' && R(0.25)) { queasy(false); }
        this.say(`No disaster. ${ed === 'safe' ? 'It sits fine. Food.' : ed === 'cook' ? 'Edible — but your gut says cook it first.' : ed === 'caution' ? 'Edible, in care.' : 'You feel off. Not food.'}`);
        identifyAs(ed === 'avoid' ? 'avoid' : ed);
        return null;
      }

      // the careful protocol
      this.say('You set aside an afternoon. Inspect, skin, lips, taste, meal — with waits between. This is how you learn without dying.');
      this.tickAction(4);
      this.say('Inspect: color, smell, bruising. Nothing alarming. (The dangerous ones rarely announce themselves.)');
      this.tickAction(12);
      if (ed === 'avoid' && R(0.3)) {
        this.say('Skin test: where you rubbed it, the skin itches and reddens. Bad sign. You stop — wisely.');
        queasy(false);
        identifyAs('avoid');
        return null;
      }
      this.say('Skin test: two hours, no reaction. So far so good.');
      this.tickAction(8);
      if (ed === 'avoid' && R(0.35)) {
        this.say('Lips: numbness, spreading. You spit it out. NOT food — and now you know its name the hard way.');
        queasy(false);
        identifyAs('avoid');
        return null;
      }
      this.say('Lips: no numbness, no burn. Cautiously onward.');
      this.tickAction(16);
      if ((ed === 'avoid' && R(0.4)) || (ed === 'cook' && R(0.3)) || (ed === 'caution' && R(0.15))) {
        queasy(ed === 'avoid');
        this.say(ed === 'cook'
          ? 'Taste: your stomach objects. Raw is wrong — but cooked, this might be fine. Knowledge, purchased fairly.'
          : 'Taste: no. Your body votes no.');
        identifyAs(ed === 'avoid' ? 'avoid' : ed);
        return null;
      }
      this.say('Taste: a tiny nibble, chewed slowly. Nothing happens. The hardest part is waiting.');
      this.tickAction(24);
      if ((ed === 'avoid' && R(0.5)) || (ed === 'cook' && R(0.4)) || (ed === 'caution' && R(0.2))) {
        queasy(ed !== 'caution');
        this.say('The small meal disagrees with you. Lesson learned — honestly, not fatally.');
        identifyAs(ed === 'avoid' ? 'avoid' : ed);
        return null;
      }
      this.say(`The meal sits fine. ${ed === 'safe' ? 'Food. Real food, and now it has a name.' : ed === 'cook' ? 'Food — but your gut is clear: cook it.' : 'Edible, with care.'} (64 ticks, an afternoon honestly spent)`);
      identifyAs(ed);
      return null;
    },

    // watchFauna(idx): spend time watching what the animals eat. A HINT, not
    // proof — animals tolerate things you can't. Sometimes wrong. The game
    // says so.
    watchFauna(idx, container) {
      const cont = container || this.state.scholar.inventory;
      const lump = cont[idx];
      if (!lump || !lump.lump) { this.say('Nothing to watch there.'); return null; }
      const comp = lump.lump;
      const pids = Object.keys(comp);
      if (!pids.length) { this.say('The bag is empty.'); return null; }
      let pid = pids[0], best = -1;
      for (const c of pids) { if (comp[c].units > best) { best = comp[c].units; pid = c; } }
      const p = (this.data.plants || []).find(x => x.id === pid);
      if (!p) return null;
      this.tickAction(16);
      const ed = p.edibility || 'safe';
      const trulySafe = (ed === 'safe' || ed === 'caution');
      // 80% the hint is right, 20% it's wrong. You never know which.
      const correct = Math.random() < 0.8;
      const hintKind = correct ? (trulySafe ? 'safe' : 'avoid') : (trulySafe ? 'avoid' : 'safe');
      lump.hint = { kind: hintKind, day: this.state.scholar.day };
      if (hintKind === 'safe') {
        this.say('You spend a while watching. Deer browse leaves like these; a rabbit works a patch without hesitation. Suggestive — not proof. Animals tolerate things you can\'t. (16 ticks)');
      } else {
        this.say('You spend a while watching. Nothing touches the stuff like this — not deer, not rabbits, not even the bold squirrel. Suspicious. Suggestive — not proof. (16 ticks)');
      }
      this.say('A hint upgrades your testing odds. It doesn\'t replace testing.');
      return null;
    },

    // askSystemAbout(idx): post-Day 7. The System names perfectly and feeds
    // never. Characterization, not a help system.
    askSystemAbout(idx, container) {
      if (!this.state.systemArrived) { this.say('The sky is quiet. Nothing to ask yet.'); return null; }
      const cont = container || this.state.scholar.inventory;
      const lump = cont[idx];
      if (!lump || !lump.lump) { this.say('Nothing to ask about.'); return null; }
      const comp = lump.lump;
      const pids = Object.keys(comp);
      if (!pids.length) { this.say('The bag is empty.'); return null; }
      let pid = pids[0], best = -1;
      for (const c of pids) { if (comp[c].units > best) { best = comp[c].units; pid = c; } }
      const p = (this.data.plants || []).find(x => x.id === pid);
      if (!p) return null;
      const sci = p.scientific || 'unclassified';
      const lines = [
        `SYSTEM: Oh! *${sci}*. Widespread in this biome. Fascinating vascular structure.`,
        'YOU: ...is it edible?',
        'SYSTEM: Edible? Why do you keep asking about putting things in the face-hole?',
        'SYSTEM: Have you considered fusion? ANY matter works. Rocks. Dirt. Regolith.',
        'SYSTEM: The audience finds the face-hole question ENDLESSLY funny, by the way.',
      ];
      for (const l of lines) this.say(l);
      this.tickAction(2);
      return null;
    },

    // ---------- pantry & water capacity ----------

    pantryCapKcal() {
      const v = this.state.village;
      if (!v.pantryCapKcal) v.pantryCapKcal = 120000; // ~5 days for 12. Tight, not cruel.
      return v.pantryCapKcal;
    },

    waterCapL() {
      const v = this.state.village;
      if (!v.waterCapL) v.waterCapL = 40;
      return v.waterCapL;
    },

    storageTier() {
      return this.state.village.storageTier || 0;
    },

    // EXPAND STORAGE: materials + labor. A builder halves the material cost.
    expandStorage() {
      const v = this.state.village;
      const tier = this.storageTier();
      const builders = this.specialistsHere('builder');
      const hasBuilder = builders.length > 0;
      // cost scales per tier
      const need = {
        branch: Math.round((10 + tier * 8) * (hasBuilder ? 0.5 : 1)),
        stone: Math.round((6 + tier * 5) * (hasBuilder ? 0.5 : 1)),
        vine: Math.round((4 + tier * 3) * (hasBuilder ? 0.5 : 1)),
      };
      const inv = this.state.scholar.inventory;
      const count = (m) => inv.filter(i => i.material === m).reduce((t, i) => t + (i.units || 0), 0);
      const missing = [];
      for (const [m, n] of Object.entries(need)) {
        if (count(m) < n) missing.push(`${n - count(m)} more ${m}`);
      }
      if (missing.length) {
        this.say(`Not enough materials: ${missing.join(', ')}. (Branches, stone, vine for lashing.${hasBuilder ? ` ${builders[0].name} the ${builders[0].occupation} halves the cost.` : ' A builder would halve the cost.'})`);
        return null;
      }
      for (const [m, n] of Object.entries(need)) {
        let left = n;
        for (const i of inv) {
          if (i.material !== m || left <= 0) continue;
          const take = Math.min(i.units || 0, left);
          i.units -= take; left -= take;
        }
      }
      this.state.scholar.inventory = inv.filter(i => (i.units || 0) > 0 || !i.material);
      v.storageTier = tier + 1;
      v.pantryCapKcal = Math.round(this.pantryCapKcal() * 1.5);
      v.waterCapL = this.waterCapL() + 20;
      const ticks = hasBuilder ? 24 : 48;
      this.tickAction(ticks);
      this.say(hasBuilder
        ? `${builders[0].name} directs the build — raised racks, sealed bins, a bigger cistern. Pantry ${v.pantryCapKcal.toLocaleString()} kcal, water ${v.waterCapL}L. (${ticks} ticks)`
        : `You lash together raised racks and seal bins with clay. Crude but roomy. Pantry ${v.pantryCapKcal.toLocaleString()} kcal, water ${v.waterCapL}L. (${ticks} ticks)`);
      return null;
    },

    pantryKcal() {
      return (this.state.village.pantry || []).reduce((t, i) => t + (i.kcalEach || 0) * (i.units || 0), 0);
    },

    // ---------- prey behavior ----------

    preyWariness(adef) {
      const d = (adef && adef.difficulty) || 'medium';
      return d === 'easy' ? 0.45 : d === 'hard' ? 0.75 : 0.6;
    },

    // The animal reacts to your strike. Called before the hunt resolves.
    // Returns true if it got away clean.
    // FRAMEWORK (encounters.js owns the loop): descriptor-gated, awareness-
    // based. A calm animal can be caught flat-footed; a wary one explodes.
    // Bolting moves ONE tile (the chase is real); stamina runs out.
    preyReaction(a) {
      const s = this.state.scholar;
      const label = (this.encAnimalLabel ? this.encAnimalLabel(a) : 'an animal');
      const cap = (this.encCap ? this.encCap(label) : label);
      const px = s.mx ?? 4, py = s.my ?? 4;
      const dist = Math.max(Math.abs(a.mx - px), Math.abs(a.my - py));
      if (a.aware == null) a.aware = 0.6; // struck at unawares: at least wary
      if (a.stamina == null && this.encPreyCfg) a.stamina = this.encPreyCfg(a.id).stamina;
      if (!a.pstate) a.pstate = 'graze';
      if (a.edgeTurns == null) a.edgeTurns = 0;
      // winded prey can't explode — it's spent.
      if (a.pstate === 'winded') return false;
      // it SAW you move: no clean shot, ever.
      let fleeP = (a.aware >= 0.9) ? 1 : a.aware * 0.9;
      let trackLvl = 0;
      try { trackLvl = this.abilityLevel ? this.abilityLevel('tracker') : 0; } catch (e) {}
      fleeP -= trackLvl * 0.12; // stalking skill matters
      const villager = (this.data.villagers || []).find(v => v.id === this.villagerId);
      if (villager && String(villager.formerOccupation || '').toLowerCase().includes('hunter')) fleeP -= 0.10;
      if (this.isNight && this.isNight()) fleeP -= 0.08; // dark hides you
      if (dist <= 1) fleeP -= 0.10; // point blank: less time to react
      // cornered: nowhere to run. Desperate, not gone.
      const dx = Math.sign(a.mx - px), dy = Math.sign(a.my - py);
      const detail = this.genDetail(this.map.px, this.map.py);
      const BLOCKS = { wall: 1, water: 1, bigtree: 1, tree: 1, tent: 1, fire: 1 };
      const canBolt = (() => {
        for (const [mx, my] of [[a.mx + dx, a.my + dy], [a.mx - dy, a.my + dx]]) {
          const nx = Math.max(0, Math.min(8, mx)), ny = Math.max(0, Math.min(8, my));
          const cell = detail[ny] && detail[ny][nx];
          if (!BLOCKS[cell]) return true;
        }
        return false;
      })();
      if (!canBolt) fleeP = Math.min(fleeP, 0.08);
      if (Math.random() < fleeP) {
        // it bolts — one tile, framework state
        const tryMove = (nx, ny) => {
          nx = Math.max(0, Math.min(8, nx)); ny = Math.max(0, Math.min(8, ny));
          const cell = detail[ny] && detail[ny][nx];
          if (!BLOCKS[cell]) { a.mx = nx; a.my = ny; return true; }
          return false;
        };
        tryMove(a.mx + dx, a.my + dy) || tryMove(a.mx - dy, a.my + dx) || tryMove(a.mx + dx, a.my);
        a.aware = 1; a.pstate = 'bolt';
        a.stamina = Math.max(0, (a.stamina || 1) - 1);
        if (a.stamina <= 0) {
          a.pstate = 'winded';
          this.say(`${cap} explodes away — but it's winded already, sides heaving.`);
        } else {
          if (a.mx === 0 || a.mx === 8 || a.my === 0 || a.my === 8) {
            a.edgeTurns = (a.edgeTurns || 0) + 1;
            if (a.edgeTurns >= 2) { s.animal = null; this.say(`${cap} melts into the treeline. Gone.`); }
            else this.say(`${cap} catches your move and explodes away!`);
          } else {
            a.edgeTurns = 0;
            this.say(`${cap} catches your move and explodes away!`);
          }
        }
        s.kcal = Math.max(0, s.kcal - 50); // the lunge cost you
        return true;
      }
      return false;
    },

    // ---------- THE BANK: food is humanity's superpower ----------
    // Digesting organic matter grants mana reserves other species can't match.
    // ONE pool: your kcal bar IS the bank. The fiction is conservation of
    // energy — food in, everything else out. No second pool, no second row.
    // Baseline humans bank ~a day. Skillsets raise the CAP: extra stomachs,
    // furnace guts — the glutton-warrior is a real build. Eat well → hit
    // harder. The pipeline stays visible: FEASTBURN says what happened.
    // (Endgame payoff: later.)

    // bankMult: skillsets that expand the bank. food.bank_mult is the live
    // target; food.eat_target_mult (extra_stomach, legacy) counts too.
    bankMult() {
      return this.modTarget('food.bank_mult', 1) * this.modTarget('food.eat_target_mult', 1);
    },

    // kcalCap: the one number. Baseline 2400 (~a day); skillsets multiply it.
    kcalCap() {
      const s = this.state.scholar || {};
      const mult = this.metabolicMult((s.abilities || []).concat(s.backgroundAbilities || []));
      return Math.round(2400 * mult * this.bankMult());
    },

    // fullLine: "fed". kcal banked above this line is the war chest.
    fullLine() {
      const s = this.state.scholar || {};
      const mult = this.metabolicMult((s.abilities || []).concat(s.backgroundAbilities || []));
      return Math.round(2400 * mult);
    },

    // banked: the stockpile above fed. This is what FEASTBURN spends.
    banked() {
      return Math.max(0, Math.round(this.state.scholar.kcal || 0) - this.fullLine());
    },

    maxBank() { return Math.max(0, this.kcalCap() - this.fullLine()); },

    // What food is worth as FUEL. Cooked > raw; specialist-made > yours.
    mealQuality(it) {
      if (!it) return 0.7;
      if (it.wellMade) return 1.3;               // a specialist made this
      if (it.foodState === 'preserved') return 1.1;
      if (it.diseaseRisk) return 0.5;            // raw and risky
      if (it.foodKind === 'meat') return 1.0;    // cooked meat
      if (it.rawKcal) return 1.0;                // cooked (legacy)
      return 0.7;                                // safe raw plants
    },

    // blendKcalQuality(kcalAdded, q): the pool remembers what it was built
    // from. Specialist fuel burns hottest — even mixed into the bank.
    blendKcalQuality(kcalAdded, q) {
      const s = this.state.scholar;
      if (!s || !(kcalAdded > 0)) return;
      const before = Math.max(0, s.kcal || 0);
      s.kcalQ = before <= 0 ? q
        : (((s.kcalQ || 1) * before) + q * kcalAdded) / (before + kcalAdded);
    },

    feastState() {
      const b = this.banked(), mb = this.maxBank();
      if (mb <= 0 || b <= 0) return 'empty';
      if (b >= mb * 0.75) return 'gorged';
      if (b >= mb * 0.25) return 'feasting';
      return 'sated';
    },

    feastLine() {
      const st = this.feastState(), q = this.state.scholar.kcalQ || 1;
      if (st === 'gorged') return q >= 1.3
        ? 'Specialist cooking burns clean and hot. You feel dangerous.'
        : 'The furnace roars. You feel dangerous.';
      if (st === 'feasting') return 'Warmth spreads to your fingertips. Power, waiting.';
      if (st === 'sated') return 'A little extra in the tank.';
      return '';
    },

    // FEASTBURN: the visible pipeline. Called when the player unleashes power.
    // Burns BANKED kcal for a stated damage multiplier. Returns it (0 = no burn).
    // Quality matters: specialist fuel burns hottest, scraps burn dirty.
    feastBurn() {
      const s = this.state.scholar;
      const b = this.banked();
      if (b < 300) return 0;
      const gorged = this.feastState() === 'gorged';
      const burn = Math.min(b, gorged ? 400 : 300);
      s.kcal = Math.max(0, (s.kcal || 0) - burn);
      const q = s.kcalQ || 1;
      let mult = gorged ? 1.75 : 1.5;
      if (q >= 1.3) mult *= 1.15;
      else if (q < 0.7) mult *= 0.85;
      mult = Math.round(mult * 100) / 100;
      const qnote = q >= 1.3 ? ' Specialist fuel burns hottest.' : q < 0.7 ? ' Scraps burn dirty.' : '';
      this.say(`FEASTBURN (−${burn} banked, ×${mult}): the feast was the weapon.${qnote}`);
      return mult;
    },

    // overnightBankBurn: the war chest leaks 20% overnight — use it or lose
    // it. The body pool below "fed" is untouched; only banked kcal burns off.
    overnightBankBurn() {
      const s = this.state.scholar;
      const b = this.banked();
      if (b <= 0) return 0;
      const lost = Math.round(b * 0.2);
      s.kcal = Math.max(0, (s.kcal || 0) - lost);
      if (lost > 0) this.say(`Overnight the bank burns −${lost} kcal. Feast again, or spend it.`);
      return lost;
    },

    // ---------- the prep stash: the kitchen counter ----------
    //
    // Steve's rule: everything unprocessed lands in the stash FIRST — the
    // lumped "unknown shoots," the carcass, unshelled nuts — each with a
    // visible spoilage clock. Only correctly identified, prepped food goes
    // to the pantry. The stash UI auto-sorts by urgency (what's rotting
    // first). This is the mission board, not a storage dump.
    //
    // Prep is three decisions, never chores:
    //   1. WHAT FIRST (triage): the stash shows spoilage urgency; you pick
    //      the order. One decision for the pile, not per-item babysitting.
    //   2. WHO (delegation): you do it (fast, worse yield, you LEARN) or
    //      "Ask {specialist}" (slower, better yield, they might be busy).
    //      Trade-off stated upfront, never forced.
    //   3. HOW FAR (depth): raw now (fast, risky, low yield) / cook (safe,
    //      full, ~5d) / smoke (90-95%, ~30d, more time + fire). Yield, time,
    //      and shelf life stated BEFORE committing.

    prepStash() {
      const s = this.state.scholar;
      if (!s.prepStash) s.prepStash = [];
      return s.prepStash;
    },

    // isUnprocessed: belongs on the counter, not in the pantry.
    isUnprocessed(it) {
      if (!it || !it.foodKind) return false;
      if (it.foodState === 'unknown') return true;
      if (it.foodState === 'carcass') return true;
      if (it.foodState === 'in_shell') return true;
      if (it.foodState === 'cleaned') return true; // raw meat: the how-far decision
      if (it.needsCooking) return true;
      return false;
    },

    // isFinishedFood: correctly identified, prepped — pantry-worthy.
    isFinishedFood(it) {
      if (!it || (it.kcalEach || 0) <= 0) return false;
      if (it.edible === false) return false;
      if (this.isUnprocessed(it)) return false;
      return true;
    },

    // stageForPrep: unprocessed items move pack -> prep stash. Batch.
    stageForPrep() {
      const s = this.state.scholar;
      const stash = this.prepStash();
      const inv = s.inventory || [];
      let n = 0;
      for (let i = inv.length - 1; i >= 0; i--) {
        const it = inv[i];
        if (!this.isUnprocessed(it)) continue;
        if (it.lump) {
          const target = this.findLump(stash, it.lumpForm);
          if (target) {
            for (const pid of Object.keys(it.lump)) {
              const e = it.lump[pid];
              const te = target.lump[pid] || { units: 0, day: e.day };
              te.units += e.units;
              te.day = Math.min(te.day, e.day);
              target.lump[pid] = te;
            }
            target.units += it.units;
            target.spoilDay = Math.min(target.spoilDay, it.spoilDay);
            target.kg = Math.max(0.1, Math.round(target.units * 0.1 * 10) / 10);
          } else {
            stash.push(it);
          }
        } else {
          stash.push(it);
        }
        inv.splice(i, 1);
        n++;
      }
      if (n) this.say(`You lay ${n} unprocessed haul${n > 1 ? 's' : ''} on the counter — the clock is ticking on each.`);
      else this.say('Nothing unprocessed to stage.');
      return null;
    },

    // stashUrgency: the triage order — what's rotting first.
    stashUrgency() {
      const day = this.state.scholar.day;
      return this.prepStash()
        .map((it, idx) => ({ it, idx, left: (it.spoilDay ?? 9999) - day }))
        .sort((a, b) => a.left - b.left);
    },

    // prepNeeds(it): the mission-board "needs" line — short, honest.
    prepNeeds(it) {
      const needs = [];
      if (it.lump) needs.push('identify — sort it');
      if (it.foodState === 'carcass') {
        needs.push('clean');
        if (!this.hasCuttingTool()) needs.push('a knife');
        if (!this.knowsTechnique('clean')) needs.push('know-how (or ask)');
      }
      if (it.foodState === 'in_shell') needs.push('shell');
      if (it.foodState === 'cleaned') needs.push('decide: raw / cook / smoke');
      if (it.needsCooking) needs.push('cook');
      if (!this.nearFire() && (it.foodState === 'cleaned' || it.needsCooking || it.foodState === 'carcass')) needs.push('fire nearby');
      if (it.hint) needs.push(`hint: ${it.hint.kind === 'safe' ? 'animals eat it' : 'animals avoid it'}`);
      return needs.length ? needs.join(' · ') : 'ready to put away';
    },

    // stashClock(it): the visible spoilage clock.
    stashClock(it) {
      const left = (it.spoilDay ?? 9999) - this.state.scholar.day;
      if (left < 0) return 'spoiled';
      if (left === 0) return 'SPOILING TODAY';
      if (left === 1) return 'spoils tomorrow';
      return `spoils in ${left}d`;
    },

    // putAwayFinished: batch — finished food goes to the pantry.
    putAwayFinished() {
      const stash = this.prepStash();
      let n = 0, kcal = 0;
      for (let i = stash.length - 1; i >= 0; i--) {
        const it = stash[i];
        if (!this.isFinishedFood(it)) continue;
        this.pantryAdd(it);
        kcal += (it.kcalEach || 0) * (it.units || 1);
        stash.splice(i, 1);
        n++;
      }
      if (n) this.say(`Put away: ${n} finished batch${n > 1 ? 'es' : ''} (${this.fmtKcal ? this.fmtKcal(kcal) : kcal + ' kcal'}) → pantry. The counter breathes.`);
      else this.say('Nothing finished to put away — the counter is all work-in-progress.');
      return null;
    },

    // eatStashOne: eat a single unit from the stash — the "raw now" depth
    // option. Honest risk, honest feedback, one bite.
    eatStashOne(idx) {
      const stash = this.prepStash();
      const it = stash[idx];
      if (!it || (it.kcalEach || 0) <= 0 || it.edible === false) { this.say('Nothing edible there.'); return null; }
      const s = this.state.scholar;
      if (it.diseaseRisk && Math.random() < it.diseaseRisk.p) {
        s.health = Math.max(0, (s.health || 100) - it.diseaseRisk.dmg);
        this.say(`The ${it.name} was ${it.diseaseRisk.note || 'risky'}. Fever by nightfall. (-${it.diseaseRisk.dmg} health)`);
      }
      const kcal = it.kcalEach;
      if (this.blendKcalQuality) this.blendKcalQuality(kcal, this.mealQuality ? this.mealQuality(it) : 1);
      s.kcal = Math.min(this.kcalCap(), (s.kcal || 0) + kcal);
      it.units -= 1;
      this.say(`You eat it raw, fast. ${kcal} kcal.${it.diseaseRisk ? ' Risky — you knew the odds.' : ''} (2 ticks)`);
      if (it.units <= 0) stash.splice(idx, 1);
      this.tickAction(2);
      return null;
    },

    // pantryAdd: one finished item into the real pantry (shared shape).
    pantryAdd(item) {
      const vv = this.state.village;
      vv.pantry = vv.pantry || [];
      vv.pantry.push({
        name: item.name || 'Finished food', plantId: item.plantId,
        kcalEach: item.kcalEach, units: item.units,
        spoilDay: item.spoilDay || 9999, unit: item.unit,
        safe: item.safe !== false, kg: item.kg || 0.2, prep: item.prep,
        foodKind: item.foodKind, foodState: item.foodState, edible: item.edible,
        diseaseRisk: item.diseaseRisk, needsCooking: item.needsCooking,
        wellMade: item.wellMade,
      });
      vv.pantryKcal = vv.pantry.reduce((t, i) => t + (i.kcalEach || 0) * (i.units || 1), 0);
    },

    // howFarOptions(it): the depth decision — stated BEFORE committing.
    // Returns [{id, label, detail}] for the UI.
    howFarOptions(it) {
      const opts = [];
      const day = this.state.scholar.day;
      if (it.foodKind === 'meat' && it.foodState === 'cleaned') {
        const total = (it.hiddenKcal || Math.round(it.kcalEach * 2.5 * (it.units || 1)));
        const units = it.units || 1;
        const cookKcal = Math.round((this.knowsTechnique('cook') ? total : Math.round(total * 0.85)) / units);
        const smokeKcal = Math.round(cookKcal * (this.knowsTechnique('preserve') ? 0.95 : 0.80));
        opts.push({
          id: 'raw',
          label: 'Eat raw now',
          detail: `fast, no time · risky (35% sick) · ${it.kcalEach}/portion · spoils in ${(it.spoilDay ?? day) - day}d`,
        });
        opts.push({
          id: 'cook',
          label: this.knowsTechnique('cook') ? 'Cook it' : 'Cook it (you\'re learning)',
          detail: `${this.nearFire() ? '' : 'NEEDS FIRE · '}32 ticks${this.nearFire() ? '' : ''} · safe · ~${cookKcal}/portion · keeps ~5d`,
          blocked: !this.nearFire() ? 'needs fire' : null,
        });
        opts.push({
          id: 'smoke',
          label: this.knowsTechnique('preserve') ? 'Smoke it' : 'Smoke it (you\'re learning)',
          detail: `${this.nearFire() ? '' : 'NEEDS FIRE · '}16 ticks · safe · ~${smokeKcal}/portion · keeps ~${this.knowsTechnique('preserve') ? 30 : 15}d`,
          blocked: !this.nearFire() ? 'needs fire' : null,
        });
      } else if (it.needsCooking) {
        opts.push({
          id: 'raw',
          label: 'Eat raw now',
          detail: `fast · risky (${it.diseaseRisk ? Math.round(it.diseaseRisk.p * 100) : 25}% sick) · ${it.kcalEach} kcal each`,
        });
        opts.push({
          id: 'cook',
          label: 'Cook it',
          detail: `${this.nearFire() ? '' : 'NEEDS FIRE · '}safe · full calories · keeps longer`,
          blocked: !this.nearFire() ? 'needs fire' : null,
        });
      }
      return opts;
    },

    // whoOptions(it, task): the delegation decision — stated upfront.
    // Returns [{id, label, detail}] — you vs the best specialist here.
    whoOptions(it, task) {
      const opts = [];
      const specs = this.specialistsHere(task);
      const spec = specs[0] || null;
      const TASK_VERB = { butcher: 'Clean it', cook: 'Cook it', preserver: 'Smoke it', shell: 'Shell them' };
      const verb = TASK_VERB[task] || 'Do it';
      if (task === 'butcher') {
        const gross = it.hiddenKcal || 0;
        const youKcal = Math.round(gross * (this.knowsTechnique('clean') ? 0.40 : 0.30));
        const specKcal = spec ? Math.round(gross * (0.40 + 0.04 * spec.skill)) : 0;
        opts.push({
          id: 'you',
          label: `${verb} yourself`,
          detail: `8 ticks · ~${youKcal} kcal · ${this.knowsTechnique('clean') ? 'practiced' : 'messy, but you LEARN'}`,
          blocked: !this.hasCuttingTool() ? 'needs a knife' : (!this.knowsTechnique('clean') ? null : null),
        });
        if (spec) {
          opts.push({
            id: 'spec:' + spec.id,
            label: `Ask ${spec.name}`,
            detail: `8 ticks of your time · ~${specKcal} kcal · better hands (${spec.occupation})`,
          });
        } else {
          opts.push({ id: 'nospec', label: 'Ask a specialist', detail: 'no butcher here — (find one, or do it yourself)', blocked: 'no butcher here' });
        }
      } else if (task === 'cook' || task === 'preserver') {
        const tech = task === 'preserver' ? 'preserve' : 'cook';
        opts.push({
          id: 'you',
          label: `${verb} yourself`,
          detail: `${task === 'cook' ? '32' : '16'} ticks · ${this.knowsTechnique(tech) ? 'you know how' : 'you\'re learning — worse yield'}`,
          blocked: !this.nearFire() ? 'needs fire' : null,
        });
        if (spec) {
          opts.push({
            id: 'spec:' + spec.id,
            label: `Ask ${spec.name}`,
            detail: `8 ticks of your time · ${task === 'cook' ? '+5%/level, safer' : 'keeps longer'} (${spec.occupation})`,
          });
        } else {
          opts.push({ id: 'nospec', label: 'Ask a specialist', detail: `no ${task === 'cook' ? 'cook' : 'preserver'} here`, blocked: 'none here' });
        }
      } else if (task === 'shell') {
        opts.push({ id: 'you', label: 'Shell them', detail: '4 ticks · net 75% of gross · everyone knows how' });
      }
      return opts;
    },

    // migrateReserve: one-time fold of the old separate reserve pool into the
    // single kcal bar. (2026-10-04: the reserve became the bank.)
    migrateReserve() {
      const s = this.state.scholar;
      if (!s) return;
      if ((s.reserveKcal || 0) > 0) {
        const cap = this.kcalCap();
        const add = Math.min(s.reserveKcal, Math.max(0, cap - (s.kcal || 0)));
        if (add > 0) { this.blendKcalQuality(add, s.reserveQ || 1); s.kcal = (s.kcal || 0) + add; }
      }
      delete s.reserveKcal; delete s.reserveQ;
    },
  };

  Object.assign(G, methods);

  // ---------- wrappers ----------

  // cookAll: fire is REQUIRED (was missing), meat pipeline, honest time cost.
  // Speaks once, clearly — the original's "Nothing raw to cook" is swallowed
  // when the fire actually cooked something.
  const origCookAll = G.cookAll;
  G.cookAll = function () {
    if (!this.nearFire()) { this.say('Need a fire to cook.'); return null; }
    const captured = [];
    const origSay = this.say;
    this.say = (m) => captured.push(String(m));
    // snapshot legacy raw items so messy cooking can scale what orig cooked
    const rawBefore = new Set((this.state.scholar.inventory || []).filter(i => i.rawKcal));
    let r;
    try { r = origCookAll.call(this); } finally { this.say = origSay; }
    const origCooked = captured.some(m => m.startsWith('Cooked '));
    // FOOD REALITY: cooking is a technique. Blind attempts work but uneven
    // (85%) — and teach. Specialists (askSpecialist) do it better.
    const knowsCook = this.knowsTechnique('cook');
    if (!knowsCook) {
      for (const item of (this.state.scholar.inventory || [])) {
        if (rawBefore.has(item) && !item.rawKcal) {
          item.kcalEach = Math.round((item.kcalEach || 0) * 0.85);
        }
      }
    }
    // meat pipeline: cleaned -> cooked (full kcal, safe).
    // (hiddenKcal is the TOTAL gross; kcalEach is per unit — don't mix them.)
    let n = 0;
    for (const item of (this.state.scholar.inventory || [])) {
      if (item.foodKind === 'meat' && item.foodState === 'cleaned') {
        const units = item.units || 1;
        const total = item.hiddenKcal || Math.round(item.kcalEach * 2.5 * units);
        const cookedTotal = knowsCook ? total : Math.round(total * 0.85);
        item.kcalEach = Math.round(cookedTotal / units);
        item.hiddenKcal = null;
        item.foodState = 'cooked'; item.diseaseRisk = null; item.safe = true;
        item.spoilDay = this.state.scholar.day + 5;
        item.name = item.name.replace(' (cleaned)', '') + ' (cooked)';
        item.prep = 'Cooked through. Safe. Better smoked for the long haul.';
        n++;
      } else if (item.needsCooking && item.diseaseRisk && item.foodKind === 'plant') {
        item.diseaseRisk = null; item.safe = true; item.needsCooking = false;
        item.prep = (item.prep || '').replace(/\u26A0\uFE0F Risky raw \u2014 cook it\./, '').trim() || 'Cooked. Safe.';
        n++;
      }
    }
    // legacy rawKcal items: scale the just-cooked ones when technique is missing.
    // (orig already cooked them; find what changed this call.)
    for (const m of captured) {
      if (n > 0 && m === 'Nothing raw to cook.') continue;
      this.say(m);
    }
    const anyCooked = n > 0 || origCooked;
    if (anyCooked) {
      this.tickAction(16); // tending the fire — honest time
      if (!knowsCook) {
        this.say(`A bit burnt in spots, underdone in others — but edible. You'll do better next time.`);
        this.learnTechnique('cook', 'trial');
      }
      if (n > 0) this.say(origCooked ? `Plus ${n} from the hunt, cooked through. (16 ticks)` : `Cooked ${n} over the fire. (16 ticks)`);
      if (this.state.scholar.week1) this.state.scholar.week1.cook++;
    }
    return r;
  };

  // cookFood (per-item): also handles cleaned meat.
  const origCookFood = G.cookFood;
  G.cookFood = function (idx, container) {
    const inv = container || this.state.scholar.inventory;
    const item = inv[idx];
    if (item && item.foodKind === 'meat' && item.foodState === 'cleaned') {
      if (!this.nearFire()) { this.say('Need a fire to cook.'); return null; }
      // hiddenKcal is TOTAL; kcalEach is per unit.
      const units = item.units || 1;
      const total = item.hiddenKcal || Math.round(item.kcalEach * 2.5 * units);
      const knows = this.knowsTechnique('cook');
      item.kcalEach = Math.round((knows ? total : Math.round(total * 0.85)) / units);
      item.hiddenKcal = null;
      item.foodState = 'cooked'; item.diseaseRisk = null; item.safe = true;
      item.spoilDay = this.state.scholar.day + 5;
      item.name = item.name.replace(' (cleaned)', '') + ' (cooked)';
      item.prep = 'Cooked through. Safe.';
      if (!knows) {
        this.say(`A bit burnt in spots — but edible. You'll do better next time.`);
        this.learnTechnique('cook', 'trial');
      }
      this.say(`Cooked ${item.name}. ${item.kcalEach} kcal now.`);
      this.tickAction(32);
      return null;
    }
    if (item && item.needsCooking && item.diseaseRisk) {
      if (!this.nearFire()) { this.say('Need a fire to cook.'); return null; }
      item.diseaseRisk = null; item.safe = true; item.needsCooking = false;
      item.foodState = 'cooked';
      item.prep = ((item.prep || '').replace(/\u26A0\uFE0F Risky raw \u2014 cook it\./, '').trim() + ' Cooked. Safe.').trim();
      item.spoilDay = this.state.scholar.day + 5;
      this.say(`Cooked ${item.name}. Safe now. (16 ticks)`);
      this.tickAction(16);
      return null;
    }
    return origCookFood.call(this, idx);
  };

  // refreshItemNames: identification flips unknown hauls into real food.
  // LUMPED UNKNOWNS: also splits identified species out of lumps (pack + stash).
  const origRefresh = G.refreshItemNames;
  G.refreshItemNames = function (pid) {
    const r = origRefresh.call(this, pid);
    const p = this.data.plants.find(x => x.id === pid);
    if (!p) return r;
    let flipped = 0, lumped = 0;
    for (const it of (this.state.scholar.inventory || [])) {
      if (it.plantId === pid && it.foodState === 'unknown') {
        const isNut = NUT_IDS[pid] || NUT_RE.test(p.preparation || '');
        it.foodState = isNut ? 'in_shell' : 'ready';
        it.edible = !isNut;
        it.kcalEach = isNut ? 0 : (it.hiddenKcal || p.caloriesPerUnit);
        if (isNut) it.name = p.name + ' (in shell)';
        it.prep = isNut ? 'Needs shelling — crack and pick the nutmeats.'
          : (p.preparation || 'Edible. The Codex knows it now.');
        if (MUST_COOK_RE.test(p.preparation || '') && !isNut) {
          it.needsCooking = true;
          it.diseaseRisk = Object.assign({}, RISK.mustCook);
          it.prep += ' \u26A0\uFE0F Risky raw — cook it.';
        }
        flipped++;
      }
    }
    for (const cont of [this.state.scholar.inventory || [], this.state.scholar.prepStash || []]) {
      for (const it of cont.slice()) {
        if (it.lump && it.lump[pid]) {
          this.splitLumpOut(it, pid, cont);
          lumped++;
        }
      }
    }
    if (flipped) this.say(`Your pack's unfamiliar haul resolves into ${p.name} — food now, not mystery.`);
    if (lumped) this.say(`From the lumped bag: ${p.name} — named, and out.`);
    return r;
  };

  // huntAnimal: the strike reaction lives in the encounter framework now
  // (encounters.js huntAnimal calls preyReaction itself). No wrapper needed.

  // donateToPantry: the pantry has a real cap now.
  const origDonate = G.donateToPantry;
  G.donateToPantry = function (idx) {
    const item = this.state.scholar.inventory[idx];
    if (item && (item.kcalEach || 0) > 0) {
      const cap = this.pantryCapKcal();
      if (this.pantryKcal() + (item.kcalEach * (item.units || 1)) > cap) {
        this.say(`The pantry is full (${Math.round(cap).toLocaleString()} kcal cap). Expand storage to take more.`);
        return null;
      }
    }
    return origDonate.call(this, idx);
  };

  // fillWater: haven draws come from the shared cistern (see game.js fillWater).
  // The cistern cap is enforced where water ENTERS (haulers), not where the
  // player draws — the old wrapper blocked creek fills when the cistern was
  // full, which was backwards. No wrapper needed.

  // newGame: seed background plant knowledge once the roster exists.
  // Someone arrived knowing things — the chicken-and-egg breaker.
  const origNewGame = G.newGame;
  G.newGame = function (...args) {
    const r = origNewGame.apply(this, args);
    try { this.seedBackgroundPlantKnowledge(); } catch (e) {}
    return r;
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = methods;
})();
