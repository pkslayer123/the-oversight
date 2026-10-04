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

    // ---------- processing ----------

    // SHELL: hands or a stone. Net < gross — shells weigh.
    shellNuts(idx) {
      const inv = this.state.scholar.inventory;
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
    cleanCarcass(idx) {
      const inv = this.state.scholar.inventory;
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
    preserveFood(idx) {
      if (!this.nearFire()) { this.say('Need a fire to smoke meat.'); return null; }
      const inv = this.state.scholar.inventory;
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
    askSpecialist(vid, idx) {
      const inv = this.state.scholar.inventory;
      const it = inv[idx];
      if (!it) return null;
      const task = it.foodState === 'carcass' ? 'butcher'
        : (it.foodKind === 'meat' && (it.foodState === 'cleaned' || it.foodState === 'cooked')) ? 'preserver'
        : (it.rawKcal || it.needsCooking || (it.foodKind === 'meat' && it.foodState === 'cleaned')) ? 'cook'
        : null;
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
    preyReaction(a) {
      const s = this.state.scholar;
      const adef = (this.data.animals || []).find(x => x.id === a.id) || {};
      const aname = (adef.name || 'animal').toLowerCase();
      const px = s.mx ?? 4, py = s.my ?? 4;
      const dist = Math.max(Math.abs(a.mx - px), Math.abs(a.my - py));
      let fleeP = this.preyWariness(adef);
      fleeP -= this.abilityLevel('tracker') * 0.12; // stalking skill matters
      const villager = (this.data.villagers || []).find(v => v.id === this.villagerId);
      if (villager && String(villager.formerOccupation || '').toLowerCase().includes('hunter')) fleeP -= 0.10;
      if (this.isNight && this.isNight()) fleeP -= 0.08; // dark hides you
      if (dist <= 1) fleeP -= 0.10; // point blank: less time to react
      // cornered: nowhere to run. Desperate, not gone.
      const dx = Math.sign(a.mx - px), dy = Math.sign(a.my - py);
      const detail = this.genDetail(this.map.px, this.map.py);
      const BLOCKS = { wall: 1, water: 1, bigtree: 1, tree: 1, tent: 1, fire: 1 };
      const canBolt = (() => {
        for (const [mx, my] of [[a.mx + dx * 2, a.my + dy * 2], [a.mx + dx, a.my + dy]]) {
          const nx = Math.max(0, Math.min(8, mx)), ny = Math.max(0, Math.min(8, my));
          const cell = detail[ny] && detail[ny][nx];
          if (!BLOCKS[cell]) return true;
        }
        return false;
      })();
      if (!canBolt) fleeP = 0.08;
      if (Math.random() < fleeP) {
        // it bolts
        const tryMove = (nx, ny) => {
          nx = Math.max(0, Math.min(8, nx)); ny = Math.max(0, Math.min(8, ny));
          const cell = detail[ny] && detail[ny][nx];
          if (!BLOCKS[cell]) { a.mx = nx; a.my = ny; return true; }
          return false;
        };
        tryMove(a.mx + dx * 2, a.my + dy * 2) || tryMove(a.mx + dx, a.my + dy);
        a.alerted = true; a.bolted = true;
        if (a.mx === 0 || a.mx === 8 || a.my === 0 || a.my === 8) s.animal = null;
        this.say(`The ${aname} catches your move and explodes away!`);
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
  G.cookFood = function (idx) {
    const item = this.state.scholar.inventory[idx];
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
    return origCookFood.call(this, idx);
  };

  // refreshItemNames: identification flips unknown hauls into real food.
  const origRefresh = G.refreshItemNames;
  G.refreshItemNames = function (pid) {
    const r = origRefresh.call(this, pid);
    const p = this.data.plants.find(x => x.id === pid);
    if (!p) return r;
    let flipped = 0;
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
    if (flipped) this.say(`Your pack's unfamiliar haul resolves into ${p.name} — food now, not mystery.`);
    return r;
  };

  // huntAnimal: the animal reacts to the strike. Stalkers eat; the clumsy watch lunch leave.
  const origHunt = G.huntAnimal;
  G.huntAnimal = function () {
    const s = this.state.scholar;
    const a = s.animal;
    if (!a) return origHunt.call(this);
    if (this.preyReaction(a)) return null; // it bolted
    return origHunt.call(this);
  };

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

  // fillWater: the cistern has a real cap too.
  const origFill = G.fillWater;
  G.fillWater = function () {
    const w = this.state.village.water || { clean: 0, dirty: 0 };
    if ((w.clean || 0) + (w.dirty || 0) >= this.waterCapL()) {
      this.say(`The cistern is full (${this.waterCapL()}L). Expand storage for more water.`);
      return null;
    }
    return origFill.call(this);
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = methods;
})();
