// @ontology
// system: food
// description: Food reality system. Food must be known-edible AND in edible state. Processing changes net calories.
// provides:
//   - foodMarker()
//   - cleanCarcass()
//   - cookFood()
//   - preserveFood()
//   - cookTransform()
//   - cookClassFor()
//   - cookOutcome()
//   - consumeCookFire()
//   - downgradeOutcome()
//   - stacksMatch()       (fungibility gate for stack merging)
//   - spoilBonusDays()    (preservation_instinct shelf-life bonus)
//   - isSpoiled()         (bonus-aware spoilage boundary)
// rules:
//   - raw_penalty: true (code: food.js)
//   - processing_required: true (code: food.js)
// consumes:
//   - scholar.inventory
//   - state.codex.plants
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
  const MUST_COOK_RE = /must be cooked|must leach|never eat raw/i;

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
      // POISON: belltoad throat sac is toxic. Eating it poisons you.
      // (Purify cures it — every problem needs an answer.)
      const isToad = animal.id === 'belltoad';
      const charred = how === 'charred';
      return {
        plantId: 'meat_' + animal.id, foodKind: 'meat', foodState: 'carcass',
        edible: false, units: 1, kcalEach: 0, hiddenKcal: kcal,
        spoilDay: day + 2, unit: 'carcass',
        ...(charred ? { charred: true } : {}),
        name: animal.name + (how === 'trapped' ? ' (trapped)' : charred ? ' (charred remains)' : ' (carcass)'),
        prep: isToad
          ? 'Gut it carefully — the throat sac is POISON. Do not eat the throat sac.'
          : 'Gut it quickly — clean with a knife. Spoils in ~2 days.',
        kg: Math.max(0.5, kcal / 1000),
        ...(isToad ? { poisonRisk: { p: 0.5, note: 'throat sac toxin' } } : {}),
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
      // LUMP WEIGHT FIX (forager loop 2026-10-06, re-fixed 2026-10-07): kg is
      // PER-UNIT everywhere (packWeight sums units*kg). Storing the total
      // (units*0.1) here makes the lump weigh 0.1*N^2 kg — regressed via a
      // stale-tree revert; restored to per-unit 0.1.
      lump.kg = 0.1;
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
      // (forager loop 2026-10-06, re-fixed 2026-10-07): kg is per-unit — see addUnknownToLump.
      lump.kg = 0.1;
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
      const day = this.state.scholar.day;
      // SPOILAGE BOUNDARY: one boundary everywhere (isSpoiled, bonus-aware).
      const rotten = (it) => this.isSpoiled(it);
      // SPOILAGE (hunter loop, Steve 2026-10-05): rot is past saving. A
      // neglected kill is lost — honestly and visibly — never cleaned back
      // into food. Silent rot that could be scrubbed into dinner made the
      // whole spoilage clock a lie.
      const dropRotten = (i) => {
        this.say(`The ${inv[i].name} went bad — maggots, smell, the whole sad story. Beyond cleaning. You leave it for the flies.`);
        inv.splice(i, 1);
      };
      if (idx !== undefined) {
        const it = inv[idx];
        if (!it || it.foodState !== 'carcass') { this.say('No carcasses to clean.'); return null; }
        if (rotten(it)) { dropRotten(idx); return null; }
      } else {
        for (let i = inv.length - 1; i >= 0; i--) {
          if (inv[i] && inv[i].foodState === 'carcass' && rotten(inv[i])) dropRotten(i);
        }
      }
      const targets = (idx === undefined ? inv.map((it, i) => i) : [idx])
        .filter(i => inv[i] && inv[i].foodState === 'carcass');
      if (!targets.length) { this.say('No carcasses to clean.'); return null; }
      if (!this.hasCuttingTool()) {
        // HONEST PATH (hunter loop 2026-10-05): the knifeless message used to
        // be a dead end — no recipe existed for any knife. Now it points at
        // the stone knife recipe everyone knows.
        const knifeKnown = ((this.state.codex.recipes || {}).stone_knife || {}).level >= 3;
        this.say(knifeKnown
          ? 'You need a knife to clean game — knap a Stone knife (stone + vine) from Craft in your pack.'
          : 'You need a knife (or a sharp edge) to clean game.');
        return null;
      }
      const knows = this.knowsTechnique('clean');
      let n = 0;
      for (const i of targets) {
        const it = inv[i];
        const gross = it.hiddenKcal || 0;
        // yield: known 40%, blind-messy 30%. 4 portions.
        const yfrac = knows ? 0.40 : 0.30;
        const per = Math.round(gross * yfrac / 4);
        // MONSTER MEAT (Steve 2026-10-05): if you don't know it's safe, it doesn't show.
        // Weight is honest (kg always visible). Edibility and calories stay hidden
        // until you've learned this creature is food — via cautious testing,
        // a villager's word, or the Codex. No free knowledge from the UI.
        const meatId = (it.plantId || '').replace(/^meat_/, '');
        const isMonsterMeat = (this.data.monsters || []).some(m => m.id === meatId);
        const foodSafe = !isMonsterMeat || this.monsterFoodSafe(meatId);
        it.foodKind = 'meat'; it.foodState = 'cleaned';
        it.edible = foodSafe;
        it.units = 4; it.unit = 'portion';
        // Calories hidden until known-safe. The gross is remembered for when you learn.
        it.kcalEach = foodSafe ? per : 0;
        it.hiddenKcal = gross; // full gross remembered for cooking
        if (!foodSafe) {
          it.prep = '⚠️ Unknown flesh. You have no idea if this is food or poison. Test it cautiously, or ask someone who knows.';
        }
        it.diseaseRisk = Object.assign({}, RISK.rawMeat);
        it.spoilDay = this.state.scholar.day + 2;
        it.name = it.name.replace(' (carcass)', '').replace(' (trapped)', '').replace(' (charred remains)', '') + ' (cleaned)';
        // unknown flesh keeps its warning — the generic risky-raw prep would
        // bury the honest "you don't know if this is food" state.
        if (foodSafe) it.prep = '\u26A0\uFE0F Risky: raw meat. Cook it, or preserve it. Spoils in ~2 days.';
        it.kg = Math.max(0.2, gross * yfrac / 1000);
        // BUTCHERING YIELDS (Steve 2026-10-05): hide, bones, feathers, antlers,
        // shell — the parts the knowledge text promises. Charred remains give
        // nothing but the meat (the beam unmade the rest).
        if (!it.charred) {
          const aid = (it.plantId || '').replace(/^meat_/, '');
          const adef = (this.data.animals || []).find(x => x.id === aid) || {};
          const by = adef.butcher || {};
          const matName = { hide: 'Hide', bone: 'Bone', feather: 'Feather', antler: 'Antler', shell: 'Shell', quill: 'Quill', tusk: 'Tusk' };
          const matKg = { hide: 0.8, bone: 0.2, feather: 0.05, antler: 0.4, shell: 1.0, quill: 0.02, tusk: 0.3 };
          const got = [];
          for (const mk of Object.keys(by)) {
            const n2 = by[mk] || 0;
            if (n2 <= 0) continue;
            this.state.scholar.inventory.push({
              material: mk, units: n2, name: (matName[mk] || mk) + (n2 > 1 ? 's' : ''),
              kcalEach: 0, spoilDay: 9999, kg: (matKg[mk] || 0.3) * n2,
            });
            got.push(n2 + ' ' + (matName[mk] || mk).toLowerCase() + (n2 > 1 ? 's' : ''));
          }
          if (got.length) this.say('Butchering yields: ' + got.join(', ') + '.');
        }
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
      // AUDIO (Steve 2026-10-06): the butcher's beat — wet work, done.
      try { this.audioEvent('animalButcher'); } catch (e) {}
      this.noteToolUse && this.noteToolUse();
      return null;
    },

    // PRESERVE: smoking/drying. Needs fire + knowing how. ~a month of safety.
    preserveFood(idx, container) {
      if (!this.nearFire()) { this.say('Need a fire to smoke meat.'); return null; }
      const inv = container || this.state.scholar.inventory;
      const day = this.state.scholar.day;
      // SPOILAGE: rot can't be smoked back into food. Discard honestly.
      const dropRotten = (i) => {
        this.say(`The ${inv[i].name} went bad — smoking won't save it. You leave it for the flies.`);
        inv.splice(i, 1);
      };
      if (idx !== undefined) {
        const it = inv[idx];
        if (it && it.foodKind === 'meat' && (it.foodState === 'cleaned' || it.foodState === 'cooked')
            && this.isSpoiled(it)) { dropRotten(idx); return null; }
      } else {
        for (let i = inv.length - 1; i >= 0; i--) {
          const it = inv[i];
          if (it && it.foodKind === 'meat' && (it.foodState === 'cleaned' || it.foodState === 'cooked')
              && this.isSpoiled(it)) dropRotten(i);
        }
      }
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
      let m;
      if (it.foodState === 'unknown') m = '? unknown \u2014 not food yet';
      else if (it.foodState === 'in_shell') m = 'needs shelling';
      else if (it.foodState === 'carcass') {
        if (this.isSpoiled(it)) m = 'spoiled — beyond cleaning';
        else {
          const t = this.knowsTechnique('clean');
          m = t ? (this.hasCuttingTool() ? 'needs cleaning' : 'needs cleaning (no knife)') : 'needs cleaning (you don\'t know how)';
        }
      }
      else if (it.diseaseRisk) m = '\u26A0\uFE0F Risky: ' + (it.diseaseRisk.note || 'raw');
      else if (it.foodState === 'preserved') m = 'smoked \u2713';
      else if (it.foodState === 'cooked') m = 'cooked';
      else if (it.needsCooking) m = '\uD83C\uDF73 needs cooking';
      else m = '';
      // SPOIL CLOCK (food feel 2026-10-06): food near its deadline says so —
      // the player can see WHAT to eat first. Fully spoiled (left < 0) is
      // flagged by the pack/pantry rows themselves ('⚠ spoiled' / '⚠ SPOILED'),
      // so the marker speaks only for the countdown, never doubling the flag.
      const clock = this.spoilClockShort(it);
      return clock ? (m ? m + ' · ' + clock : clock) : m;
    },

    // spoilClockShort: the visible countdown for food near its spoilDay.
    spoilClockShort(it) {
      if (!it || it.spoilDay === undefined || it.spoilDay === null || it.spoilDay >= 9999) return '';
      const left = it.spoilDay + this.spoilBonusDays() - this.state.scholar.day;
      if (left < 0) return ''; // the UI rows flag spoiled items themselves
      if (left === 0) return '\u26A0 SPOILING TODAY';
      if (left === 1) return 'spoils tomorrow';
      if (left === 2) return 'spoils in 2d';
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
        const vd = this.getPerson(id);
        const src = rc || vd;
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
      const tech = task === 'butcher' ? 'clean' : task === 'preserver' ? 'preserve' : task; // butcher->clean, preserver->preserve
      const day = this.state.scholar.day;
      // SPOILAGE (adversarial forager 2026-10-08): the specialist won't touch
      // rot either — ANY task. Rot can't be cooked or smoked back into food
      // (the cook/preserver branches rewrote spoilDay to day+5 / day+30+ with
      // no check). Honest, visible loss — same as the butcher branch had.
      if (this.isSpoiled(it)) {
        const verb = task === 'butcher' ? 'cleaning' : task === 'cook' ? 'cooking' : 'smoking';
        this.say(`The ${it.name} went bad — ${spec.name} (${spec.occupation}) won't touch it. Beyond ${verb}. You leave it for the flies.`);
        inv.splice(idx, 1);
        return null;
      }
      if (task === 'butcher') {
        if (it.foodState !== 'carcass') { this.say('That\'s already cleaned.'); return null; }
        const gross = it.hiddenKcal || 0;
        const yfrac = 0.40 + 0.04 * spec.skill; // 44/48/52% — better hands, more meat
        const per = Math.round(gross * yfrac / 4);
        // MONSTER FOOD SAFETY: the specialist's knife doesn't grant knowledge —
        // same gate as self-clean. Unknown flesh stays unknown until tested.
        const meatId = (it.plantId || '').replace(/^meat_/, '');
        const isMonsterMeat = (this.data.monsters || []).some(m => m.id === meatId);
        const foodSafe = !isMonsterMeat || this.monsterFoodSafe(meatId);
        it.foodKind = 'meat'; it.foodState = 'cleaned'; it.edible = foodSafe;
        it.units = 4; it.unit = 'portion';
        it.kcalEach = foodSafe ? per : 0; it.hiddenKcal = gross;
        it.diseaseRisk = Object.assign({}, RISK.rawMeat);
        it.spoilDay = day + 2;
        it.name = it.name.replace(' (carcass)', '').replace(' (trapped)', '').replace(' (charred remains)', '') + ' (cleaned)';
        if (foodSafe) it.prep = '\u26A0\uFE0F Risky: raw meat. Cook it, or preserve it.';
        else it.prep = '\u26A0\uFE0F Unknown flesh. You have no idea if this is food or poison. Test it cautiously, or ask someone who knows.';
        it.kg = Math.max(0.2, gross * yfrac / 1000);
        if (!it.charred) {
          const aid2 = (it.plantId || '').replace(/^meat_/, '');
          const adef2 = (this.data.animals || []).find(x => x.id === aid2) || {};
          const by2 = adef2.butcher || {};
          const matName2 = { hide: 'Hide', bone: 'Bone', feather: 'Feather', antler: 'Antler', shell: 'Shell', quill: 'Quill', tusk: 'Tusk' };
          const matKg2 = { hide: 0.8, bone: 0.2, feather: 0.05, antler: 0.4, shell: 1.0, quill: 0.02, tusk: 0.3 };
          const got2 = [];
          for (const mk of Object.keys(by2)) {
            const n3 = by2[mk] || 0;
            if (n3 <= 0) continue;
            this.state.scholar.inventory.push({
              material: mk, units: n3, name: (matName2[mk] || mk) + (n3 > 1 ? 's' : ''),
              kcalEach: 0, spoilDay: 9999, kg: (matKg2[mk] || 0.3) * n3,
            });
            got2.push(n3 + ' ' + (matName2[mk] || mk).toLowerCase() + (n3 > 1 ? 's' : ''));
          }
          if (got2.length) this.say('Butchering yields: ' + got2.join(', ') + '.');
        }
        this.say(foodSafe
          ? `${spec.name} (${spec.occupation}) cleans it in minutes — neat cuts, nothing wasted. ${4 * per} kcal of raw portions. You watch closely.`
          : `${spec.name} (${spec.occupation}) cleans it in minutes — neat cuts, nothing wasted. But they won't vouch for the flesh: "Never seen its like. Test it before you trust it."`);
        // AUDIO (Steve 2026-10-06): the specialist's knife work — same beat as self-clean.
        try { this.audioEvent('animalButcher'); } catch (e) {}
      } else if (task === 'cook') {
        const mult = 1 + 0.05 * spec.skill;
        if (it.rawKcal) {
          // DIGESTIBILITY: the specialist's fire uses the same honest math —
          // skill buys better outcomes, never phantom energy.
          const sR = this.cookTransform(it, { knows: true, skillMult: 1 + 0.05 * spec.skill });
          if (sR) {
            it.kcalEach = sR.kcalEach;
            if (sR.outcome.key === 'burnt') it.burnt = true;
          } else {
            it.kcalEach = Math.round(it.rawKcal * (1 + 0.05 * spec.skill));
          }
          it.rawKcal = null; it.safe = true;
        } else if (it.foodKind === 'meat' && it.foodState === 'cleaned') {
          // hiddenKcal is TOTAL; kcalEach is per unit.
          // MONSTER FOOD SAFETY: the specialist's fire doesn't teach either.
          const sMeatId = (it.plantId || '').replace(/^meat_/, '');
          const sIsMonster = (this.data.monsters || []).some(m => m.id === sMeatId);
          const sFoodSafe = !sIsMonster || this.monsterFoodSafe(sMeatId);
          const units = it.units || 1;
          const total = it.hiddenKcal || it.kcalEach * 2.5 * units;
          it.kcalEach = sFoodSafe ? Math.round(total * mult / units) : 0;
          it.hiddenKcal = sFoodSafe ? null : total;
          it.foodState = 'cooked'; it.diseaseRisk = null; it.safe = sFoodSafe;
          it.spoilDay = day + 5;
          it.name = it.name.replace(' (cleaned)', '') + ' (cooked)';
          it.prep = sFoodSafe ? 'Cooked through. Safe.'
            : '\u26A0\uFE0F Cooked, but still unknown flesh. Test it cautiously before trusting it.';
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
      if (v && this.map.px === (v.px ?? 4) && this.map.py === (v.py ?? 4)) return true;
      return this.atPlayerCamp ? this.atPlayerCamp() : false;
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

    // plantFieldClick: have you handled this species enough that sorting it
    // at camp — in good light, unhurried — the name comes to you? Reads the
    // familiarity built by bumpPlantFamiliarity (field handling).
    plantFieldClick(pid) {
      if (this.plantKnown(pid)) return false; // already known; not a "click"
      const enc = (this.state.codex.encounters || {})[pid] || 0;
      const th = (this.state.codex.learnThreshold || {})[pid] || 3;
      return enc >= th;
    },
    // sortBag(vid, idx, container): the camp ritual. vid null = you sort alone.
    // The sorter names what THEY know; you learn by watching.
    sortBag(vid, idx, container) {
      this._packFullStreak = 0;
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
        // SOLO SORTING: you name what you know — plus what your hands have
        // learned. Enough field familiarity (threshold encounters) and the
        // name clicks in good light at camp. This is the self-reliant
        // identification path: forage blind, haul home, sort, learn.
        knowsFn = (pid) => this.plantKnown(pid) || this.plantFieldClick(pid);
      } else {
        let person = null;
        try { person = this.villagePeople().find(p => p.id === vid); } catch (e) {}
        if (!person) { this.say("They're not here."); return null; }
        sorterName = person.name;
        const known = this.villagerKnowsPlants(vid);
        knowsFn = (pid) => known.includes(pid);
      }
      const named = [], taught = [], clicked = [];
      for (const pid of pids.slice()) {
        if (knowsFn(pid)) {
          const item = this.splitLumpOut(lump, pid, cont);
          if (item) {
            named.push(pid);
            if (!this.plantKnown(pid)) {
              // field-click (solo, high familiarity) vs taught (watching a knower)
              const isClick = !vid && this.plantFieldClick(pid);
              this.identifyPlant(pid, isClick ? 'fieldwork' : 'taught');
              (isClick ? clicked : taught).push(pid);
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
      if (clicked.length) this.say(`Turning ${clicked.map(pName).join(', ')} over in good light — it clicks. You've handled enough of these to know them.`);
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

    // testMonsterMeat(idx, container): the cautious protocol for unknown flesh.
    // (Steve 2026-10-05): if you don't know it's safe, it doesn't show as food.
    // This is how you learn — inspect, smell, tiny taste, wait. Honest risk:
    // some monsters are poison. Costs time. Rushing is not offered; this one
    // you do right or not at all.
    testMonsterMeat(idx, container) {
      const cont = container || this.state.scholar.inventory;
      const it = cont[idx];
      if (!it || it.foodKind !== 'meat' || it.edible !== false) {
        this.say('Nothing to test there.');
        return null;
      }
      const mid = (it.plantId || '').replace(/^meat_/, '');
      const mdef = (this.data.monsters || []).find(m => m.id === mid);
      // KNOWLEDGE-GATED: the cautious test never speaks the true name — the
      // flesh is named by what the village calls it, descriptor until named.
      const mname = this.monsterNoun ? this.monsterNoun(mid) : 'something';
      if (this.monsterFoodSafe(mid)) {
        this.say('You already know this one is food.');
        return null;
      }
      this.say(`You set aside time with the ${mname} flesh. Look, smell, touch — then the smallest taste, and wait. This is how you learn without dying.`);
      this.tickAction(8);
      // Is this monster's flesh actually safe? Check the monster definition.
      // Most are edible; some (belltoad, etc.) are toxic.
      const toxic = mdef && (mdef.toxicFlesh || mid === 'belltoad');
      if (toxic) {
        // Honest failure: you learn it's poison. Small dose, bad lesson.
        const s = this.state.scholar;
        s.energy = Math.max(0, (s.energy || 100) - 30);
        this.say('Your tongue goes numb. Your stomach heaves. NOT food — the lesson is learned the hard way. (-30 energy)');
        this.say(`The Codex notes: the ${mname} flesh is POISON. You will not make this mistake twice.`);
        // Mark as known-poison (not safe, but known — UI can show "poison, not food").
        if (!this.state.codex.monsters) this.state.codex.monsters = {};
        const e = this.state.codex.monsters[mid] || {};
        e.foodSafe = false;
        e.foodTested = 'poison';
        this.state.codex.monsters[mid] = e;
        it.prep = '☠️ POISON. You tested it. Never eat this.';
        return null;
      }
      // Safe: the wait passes, no ill effects.
      this.tickAction(12);
      this.say('An hour passes. Your stomach is calm. Another hour. Nothing.');
      this.tickAction(12);
      this.say(`It sits fine. The ${mname} is food. You know it in your gut, literally.`);
      this.markMonsterFoodSafe(mid, 'tested');
      this.say('The Codex notes it. Your pack updates — the meat is food now.');
      return it;
    },

    // testCautiously(idx, opts): the universal edibility test, gamified.
    // Real protocol: inspect -> skin -> lips -> taste -> meal, with waits.
    // Costs an afternoon. Small honest risks; rushing raises them a lot.
    // Targets the lump's plurality species ("a few that look alike").
    testCautiously(idx, opts, container) {
      opts = opts || {};
      this._packFullStreak = 0;
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
      // FLEEDIFFICULTY (Steve 2026-10-08, animals-js-gaps): animals.json
      // carries fleeDifficulty (trivial..dangerous) on all 48 animals. Dead
      // data until the 2026-10-07 wiring into encPreyCfg chase tuning
      // (notice/awareRate/stamina for non-table species); this is the other
      // half — the strike flee-odds roll. A trivial animal barely registers
      // a strike; a very_hard one is already gone. "Dangerous" REDUCES the
      // bolt chance: dangerous animals stand their ground (their behaviors
      // never-bolt via encBehaviorStrikeReact before this roll; this is the
      // data backstop). Only the uncertainty band moves — a fully-aware
      // animal (>=0.9) always bolts: "it saw you move" is the stealth
      // lesson, and difficulty buys no forgiveness there.
      if (a.aware < 0.9) {
        try {
          var _adef = this.encAnimalDef ? this.encAnimalDef(a.id) : null;
          var _fd = _adef && _adef.fleeDifficulty;
          fleeP += _fd === 'trivial' ? -0.15 : _fd === 'easy' ? -0.08
                 : _fd === 'hard' ? 0.08 : _fd === 'very_hard' ? 0.15
                 : _fd === 'dangerous' ? -0.20 : 0;
        } catch (e) {}
      }
      let trackLvl = 0;
      try { trackLvl = this.abilityLevel ? this.abilityLevel('tracker') : 0; } catch (e) {}
      fleeP -= trackLvl * 0.12; // stalking skill matters
      fleeP -= this.modTarget('stealth.move_silent', 0, {}); // stalk passive (abilities.json): quiet movement in general
      // MONSTER-DIET NOISE (Steve 2026-10-08): a ribbiting gut or clanking
      // digestion is not stealth. Prey hears you coming.
      try {
        if (this.hasStatus && this.hasStatus('scholar', 'croakbelly')) fleeP += 0.15;
        if (this.hasStatus && this.hasStatus('scholar', 'shellgut')) fleeP += 0.08;
      } catch (e) {}
      const villager = (this.data.villagers || []).find(v => v.id === this.villagerId);
      if (villager && String(villager.formerOccupation || '').toLowerCase().includes('hunter')) fleeP -= 0.10;
      if (this.isNight && this.isNight()) fleeP -= 0.08; // dark hides you
      if (dist <= 1) fleeP -= 0.10; // point blank: less time to react
      // cornered: nowhere to run. Desperate, not gone.
      // same-tile strike: "away from you" is undefined — it panics past you
      // in a random direction instead of bolting in place (which burned
      // stamina and cost you 50 kcal for nothing). encBoltDir owns the
      // fiction (encounters.js); the fallback stays local if it's not loaded.
      let dx = Math.sign(a.mx - px), dy = Math.sign(a.my - py);
      let panicScatter = false;
      if (!dx && !dy) {
        panicScatter = true;
        let bd = null;
        try { bd = this.encBoltDir ? this.encBoltDir(a, px, py) : null; } catch (e) {}
        if (!bd) bd = [[1, 0], [-1, 0], [0, 1], [0, -1]][Math.floor(Math.random() * 4)];
        dx = bd[0]; dy = bd[1];
      }
      const detail = this.genDetail(this.map.px, this.map.py);
      const BLOCKS = { wall: 1, water: 1, bigtree: 1, tree: 1, tent: 1, fire: 1 };
      const canBolt = (() => {
        // panic scatter checks the whole ring — any open tile means it runs
        const opts = panicScatter
          ? [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]
          : [[dx, dy], [-dy, dx]];
        for (const [ox, oy] of opts) {
          const nx = Math.max(0, Math.min(8, a.mx + ox)), ny = Math.max(0, Math.min(8, a.my + oy));
          const cell = detail[ny] && detail[ny][nx];
          if (!BLOCKS[cell]) return true;
        }
        return false;
      })();
      if (!canBolt) fleeP = Math.min(fleeP, 0.08);
      if (Math.random() < fleeP) {
        // NO SILENT ACTIONS (Steve 2026-10-06): the lunge costs you 50 kcal —
        // name it in the bolt text, not just in the code comment. And when it
        // saw you coming (aware ≥ 0.9 before the strike), the game coaches
        // the lesson once per encounter: strikes need a calm animal — that's
        // what the approach and the tracking skill are FOR.
        var sawItComing = (a.aware >= 0.9);
        // it bolts — one tile, framework state
        const tryMove = (nx, ny) => {
          nx = Math.max(0, Math.min(8, nx)); ny = Math.max(0, Math.min(8, ny));
          // clamped back onto its own tile (board edge) is not a move
          if (nx === a.mx && ny === a.my) return false;
          const cell = detail[ny] && detail[ny][nx];
          if (!BLOCKS[cell]) { a.mx = nx; a.my = ny; return true; }
          return false;
        };
        tryMove(a.mx + dx, a.my + dy) || tryMove(a.mx - dy, a.my + dx) || tryMove(a.mx + dx, a.my);
        if (panicScatter && a.mx === px && a.my === py) {
          // first bolt pick hit a wall — shuffled ring: it finds ANY open
          // tile rather than bolting in place. A fully surrounded animal
          // stays put, which is honest (nowhere to run).
          const ring = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
          for (let i = ring.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [ring[i], ring[j]] = [ring[j], ring[i]];
          }
          for (const [ox, oy] of ring) { if (tryMove(a.mx + ox, a.my + oy)) break; }
        }
        a.aware = 1; a.pstate = 'bolt';
        a.stamina = Math.max(0, (a.stamina || 1) - 1);
        if (a.stamina <= 0) {
          a.pstate = 'winded';
          this.say(`${cap} explodes away — but it's winded already, sides heaving. (-50 kcal)`);
        } else {
          if (a.mx === 0 || a.mx === 8 || a.my === 0 || a.my === 8) {
            a.edgeTurns = (a.edgeTurns || 0) + 1;
            if (a.edgeTurns >= 2) { s.animal = null; this.say(`${cap} melts into the treeline. Gone. (-50 kcal)`); }
            else this.say(`${cap} catches your move and explodes away! (-50 kcal)`);
          } else {
            a.edgeTurns = 0;
            this.say(`${cap} catches your move and explodes away! (-50 kcal)`);
          }
        }
        if (sawItComing && !a._strikeCoached) {
          a._strikeCoached = true;
          this.say('It saw you coming — a calm animal is a hittable animal. Stalk it close while it grazes, or run it down until it tires.');
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
      if (it.burnt) return 0.45;                  // burnt is fuel, technically
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
            // (forager loop 2026-10-06, re-fixed 2026-10-07): kg is per-unit — see addUnknownToLump.
            target.kg = 0.1;
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
      const left = (it.spoilDay ?? 9999) + this.spoilBonusDays() - this.state.scholar.day;
      if (left < 0) return 'spoiled';
      if (left === 0) return 'SPOILING TODAY';
      if (left === 1) return 'spoils tomorrow';
      return `spoils in ${left}d`;
    },

    // isSpoiled: spoilDay <= today means spoiled. Matches the UI's ⚠ spoiled
    // marker and the giftable-count exclusion — one boundary everywhere.
    // Optional bonus: preservation_instinct grants +days before it turns.
    // The bonus DEFAULTS from the player's modifiers (break-it food
    // 2026-10-08): eat()/eatOne() passed it explicitly, but the dawn sweep,
    // the stash, the processing gates, and the UI badges all compared raw
    // spoilDay — the sweep threw away food the eater would still accept,
    // and labels cried rot on good food. One boundary, everywhere.
    isSpoiled(it, bonus) {
      if (bonus === undefined || bonus === null) bonus = this.spoilBonusDays();
      return !!it && it.spoilDay !== undefined && it.spoilDay !== null
        && (it.spoilDay + (bonus || 0)) <= this.state.scholar.day;
    },

    // spoilBonusDays: preservation_instinct grants +days before food turns
    // ("you store food right"). The engine and every label read this one.
    spoilBonusDays() {
      try { return Math.round(this.modTarget('food.spoilage_days', 0)); }
      catch (e) { return 0; }
    },

    // sweepSpoiled: overnight, rotten food leaves your pack (and the prep
    // counter). Announced, never silent — the hunter sees the cost of neglect.
    // Relics and keepsakes don't rot. The VILLAGE PANTRY rots too (forager
    // loop 2026-10-06): it's the village's business, so the village sweeps it
    // — announced in the village's voice, and pantryKcal re-derived so rotten
    // food never counts as security. Before this, expired pantry stacks sat
    // forever and villagers ate them at full value: phantom calories.
    sweepSpoiled() {
      const lost = [];
      const lostPantry = [];
      const conts = [this.state.scholar.inventory];
      try { const ps = this.prepStash(); if (ps && ps !== this.state.scholar.inventory) conts.push(ps); } catch (e) {}
      for (const cont of conts) {
        if (!cont) continue;
        for (let i = cont.length - 1; i >= 0; i--) {
          const it = cont[i];
          if (!it || it.bonded) continue;
          if (this.isKeepsake && this.isKeepsake(it)) continue;
          if (this.isSpoiled(it)) { lost.push(it.name || 'something'); cont.splice(i, 1); }
        }
      }
      // the village's pantry: the village throws out its own rot, not you.
      try {
        const v = this.state.village;
        if (v && v.pantry) {
          for (let i = v.pantry.length - 1; i >= 0; i--) {
            const it = v.pantry[i];
            if (!it || it.bonded) continue;
            if (this.isSpoiled(it)) { lostPantry.push(it.name || 'something'); v.pantry.splice(i, 1); }
          }
          v.pantryKcal = v.pantry.reduce((t, i) => t + (i.kcalEach || 0) * (i.units || 1), 0);
        }
      } catch (e) {}
      if (lost.length) {
        this.say(`Overnight, ${lost.join('; ')} went bad — beyond saving. You leave ${lost.length === 1 ? 'it' : 'them'} for the flies.`);
        // LEGIBILITY (food feel 2026-10-06): the loss teaches its own fix.
        // Fresh food keeps days, not weeks — smoking is the fiction's answer,
        // and it's named once, only until the player learns it.
        if (!this.knowsTechnique('preserve')) {
          this.say('Fresh food keeps days, not weeks. Smoke it over a fire to make it last.');
        }
      }
      if (lostPantry.length) {
        // LEGIBILITY: the village names the loss in its own voice AND the fix.
        // When the player already knows smoking, the village just mutters;
        // when they don't, Old Mara teaches it outright.
        const names = [...new Set(lostPantry)].join(', ');
        if (this.knowsTechnique('preserve')) {
          this.say(`The village threw out spoiled stores: ${names}. Someone mutters about the smoke rack going cold. (pantry)`);
        } else {
          this.say(`The village threw out spoiled stores: ${names}. Old Mara mutters: "Should've smoked that. Fresh stuff keeps a day or two on the shelf — the smoke rack is right there." (pantry)`);
        }
      }
      // CORPSE ROT (Steve 2026-10-06): meat left on a body rots there.
      // Unlooted doesn't mean preserved — the clock runs on corpse
      // inventories too. If you're on the same node you notice the loss;
      // otherwise you discover it when you come back. Consequence, not lecture.
      const lostCorpse = [];
      try {
        const corpses = (this.state.corpses || []).filter(c => !c.buried);
        for (const c of corpses) {
          if (!c.items) continue;
          for (let i = c.items.length - 1; i >= 0; i--) {
            const it = c.items[i];
            if (!it || it.bonded) continue;
            // CORPSE CLOCK: raw spoilDay, no storage-skill bonus — a carcass
            // in the woods isn't "stored right". The earth doesn't grade on
            // technique. (Pack/pantry use the bonus-aware boundary.)
            if (this.isSpoiled(it, 0)) {
              const here = c.node && c.node.x === this.map.px && c.node.y === this.map.py;
              lostCorpse.push({ name: it.name || 'something', here: !!here, kind: c.kind });
              c.items.splice(i, 1);
            }
          }
        }
        const seen = lostCorpse.filter(l => l.here);
        if (seen.length) {
          const names = [...new Set(seen.map(l => l.name))].join(', ');
          this.say(`On the ${seen[0].kind === 'monster' ? 'carcass' : 'body'} nearby, ${names} went bad — maggots, smell, the whole sad story. Leaving it had a cost.`);
        }
      } catch (e) {}
      return lost.length + lostPantry.length + lostCorpse.length;
    },

    // putAwayFinished: batch — finished food goes to the pantry.
    putAwayFinished() {
      const stash = this.prepStash();
      let n = 0, kcal = 0, blocked = 0;
      for (let i = stash.length - 1; i >= 0; i--) {
        const it = stash[i];
        // SPOILAGE (adversarial forager 2026-10-08): rot isn't pantry stock.
        // The dawn sweep normally clears it, but a mid-day counter can hold
        // today's casualties — they leave for the flies, never the shelves.
        if (this.isSpoiled && this.isSpoiled(it)) {
          this.say(`The ${it.name} went bad on the counter — beyond saving. You leave it for the flies.`);
          stash.splice(i, 1);
          continue;
        }
        if (!this.isFinishedFood(it)) continue;
        // PANTRY CAP (break-it food 2026-10-08): pantryAdd enforces the cap
        // and reports; a full pantry leaves the batch on the counter —
        // honestly, not silently vanished, not overfilled.
        if (!this.pantryAdd(it)) {
          this.say(`The pantry is full (${Math.round(this.pantryCapKcal()).toLocaleString()} kcal cap) — ${it.name} stays on the counter. Expand storage to take more.`);
          blocked++;
          continue;
        }
        kcal += (it.kcalEach || 0) * (it.units || 1);
        stash.splice(i, 1);
        n++;
      }
      if (n) this.say(`Put away: ${n} finished batch${n > 1 ? 'es' : ''} (${this.fmtKcal ? this.fmtKcal(kcal) : kcal + ' kcal'}) → pantry. The counter breathes.`);
      else if (!blocked) this.say('Nothing finished to put away — the counter is all work-in-progress.');
      return null;
    },

    // eatStashOne: eat a single unit from the stash — the "raw now" depth
    // option. Honest risk, honest feedback, one bite.
    eatStashOne(idx) {
      const stash = this.prepStash();
      const it = stash[idx];
      const day = this.state.scholar.day;
      // SPOILAGE: the counter's rot isn't food. The dawn sweep clears it; mid-day it's refused.
      if (!it || (it.kcalEach || 0) <= 0 || it.edible === false
          || this.isSpoiled(it)) { this.say('Nothing edible there.'); return null; }
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

    // stacksMatch(a, b): FUNGIBILITY GATE for stack merging (Steve 2026-10-08,
    // break-it food run). Name-only merging laundered kcalEach upward — taking
    // low-quality pantry units into a high-quality pack stack created calories
    // from nothing (measured +200 kcal on a 5-unit take); donating did the
    // reverse (destroyed value); spoilDay mismatches contaminated clocks
    // (spoilage bypass); diseaseRisk silently dropped (risk laundering). Two
    // stacks merge ONLY when every value-bearing field matches — otherwise
    // they ride as separate stacks. (Precedent: the 2026-10-06 villager-surplus
    // fix already gate-kept spoilDay; this generalizes the rule.)
    stacksMatch(a, b) {
      if (!a || !b) return false;
      if ((a.name || '') !== (b.name || '')) return false;
      const num = (v) => (v === undefined || v === null) ? null : Number(v);
      if (num(a.kcalEach) !== num(b.kcalEach)) return false;
      if (num(a.spoilDay) !== num(b.spoilDay)) return false;
      if (num(a.kg) !== num(b.kg)) return false;
      if (num(a.hiddenKcal) !== num(b.hiddenKcal)) return false;
      if (num(a.rawKcal) !== num(b.rawKcal)) return false;
      // safe/edible are only ever false when explicitly false.
      if ((a.safe === false) !== (b.safe === false)) return false;
      if ((a.edible === false) !== (b.edible === false)) return false;
      if ((a.foodKind || '') !== (b.foodKind || '')) return false;
      if ((a.foodState || '') !== (b.foodState || '')) return false;
      if (!!a.needsCooking !== !!b.needsCooking) return false;
      if (!!a.wellMade !== !!b.wellMade) return false;
      if ((a.plantId || '') !== (b.plantId || '')) return false;
      if ((a.unit || '') !== (b.unit || '')) return false;
      const dr = (r) => r ? `${r.p}|${r.dmg}|${r.note || ''}` : '';
      if (dr(a.diseaseRisk) !== dr(b.diseaseRisk)) return false;
      const pr = (r) => r ? `${r.p}|${r.dmg}|${r.note || ''}` : '';
      if (pr(a.poisonRisk) !== pr(b.poisonRisk)) return false;
      return true;
    },

    // pantryAdd: one finished item into the real pantry (shared shape).
    // Enforces the pantry cap — the single choke point (break-it food
    // 2026-10-08: putAwayFinished bypassed the donateToPantry cap check and
    // overfilled the pantry). Returns false when the item doesn't fit.
    pantryAdd(item) {
      const vv = this.state.village;
      vv.pantry = vv.pantry || [];
      const kcal = (item.kcalEach || 0) * (item.units || 1);
      const cap = this.pantryCapKcal();
      if (this.pantryKcal() + kcal > cap) return false;
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
      return true;
    },

    // howFarOptions(it): the depth decision — stated BEFORE committing.
    // Returns [{id, label, detail}] for the UI.
    howFarOptions(it) {
      const opts = [];
      const day = this.state.scholar.day;
      if (it.foodKind === 'meat' && it.foodState === 'cleaned') {
        // COOK PRESERVES (hunter loop 2026-10-08): the cleaned item's honest
        // total is kcalEach×units (the 40%-ish butcher yield). hiddenKcal is
        // the RAW gross — using it here promised 2.5× phantom calories and
        // erased the clean-technique gate (blind 30% vs skilled 40% cooked to
        // the same number). Cooking makes meat safe and keeps longer; it
        // doesn't resurrect the 60% the butchering discarded.
        const total = Math.round((it.kcalEach || 0) * (it.units || 1));
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
    // meat pipeline: cleaned -> cooked (safe; keeps ~5d).
    // COOK PRESERVES (hunter loop 2026-10-08): the cleaned total is
    // kcalEach×units (the honest 40%-ish butcher yield) — hiddenKcal is the
    // RAW gross, and using it here cooked every batch at 2.5× phantom
    // calories while erasing the clean-technique gate. Cooking makes meat
    // safe and keeps longer; it doesn't resurrect the butchered-away 60%.
    // UNKNOWN FLESH: the batch button must not bypass the cautious-test
    // gate — monster flesh you haven't cleared stays out of the batch, with
    // the reason said out loud. (The per-item cook path keeps it unknown
    // but never reveals it; the batch path shouldn't touch it at all.)
    let n = 0, nUnknown = 0;
    for (const item of (this.state.scholar.inventory || [])) {
      if (item.foodKind === 'meat' && item.foodState === 'cleaned') {
        const mId = (item.plantId || '').replace(/^meat_/, '');
        const isMon = (this.data.monsters || []).some(m => m.id === mId);
        if (isMon && !this.monsterFoodSafe(mId)) { nUnknown++; continue; }
        // DIGESTIBILITY: batch uses the shared math \u2014 one honest outcome
        // for the batch (the fire doesn't roll per portion).
        const rB = this.cookTransform(item, { knows: knowsCook });
        if (rB) {
          item.kcalEach = rB.kcalEach;
          if (rB.outcome.key === 'burnt') item.burnt = true;
          if (!rB.outcome.riskStays) item.diseaseRisk = null;
        }
        item.hiddenKcal = null;
        item.foodState = 'cooked'; item.safe = true;
        item.spoilDay = this.state.scholar.day + 5;
        item.name = item.name.replace(' (cleaned)', '') + ' (cooked)';
        item.prep = 'Cooked ' + (rB ? this.cookOutcomePhrase(rB.outcome, rB.cls) : 'through') + '. Better smoked for the long haul.';
        n++;
      } else if (item.needsCooking && item.diseaseRisk && item.foodKind === 'plant') {
        const rP2 = this.cookTransform(item, { knows: knowsCook });
        if (rP2) {
          item.kcalEach = rP2.kcalEach;
          if (rP2.outcome.key === 'burnt') item.burnt = true;
        }
        if (!rP2 || !rP2.outcome.riskStays) { item.diseaseRisk = null; item.safe = true; item.needsCooking = false; }
        item.prep = 'Cooked. Safe.';
        n++;
      }
    }

    // (orig already cooked them; find what changed this call.)
    if (nUnknown > 0) {
      captured.push(`Left ${nUnknown} unknown flesh out of the batch — you don't know it's food yet. Test it cautiously (per-item Cook) before trusting it.`);
    }
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
  // COOKING MODEL (Steve 2026-10-08): cooking is digestibility, not a
  // multiplier. Every food has GROSS kcal (chemical energy); net = gross x
  // digestibility(state). Raw digests worse and carries disease risk; cooked
  // digests better. Cooked can never exceed gross \u2014 energy is never created.
  // Outcomes are skill-gated: perfect / decent / undercooked (risk stays) /
  // burnt. Cooking costs fire fuel; a fire that dies mid-cook downgrades the
  // outcome. Curated cookedKcal (beans, rice) is respected as the designed
  // value, capped by gross all the same.
  G.cookClassFor = function (item) {
    const C = (this.data && this.data.cooking) || {};
    const classes = C.classes || {};
    if (!item) return null;
    if (item.foodKind === 'meat') {
      const mid = (item.plantId || '').replace(/^meat_/, '');
      const isMon = (this.data.monsters || []).some(m => m.id === mid);
      return { key: isMon ? 'monster' : 'meat', ...(classes[isMon ? 'monster' : 'meat'] || {}) };
    }
    if (item.plantId && C.plantClasses && C.plantClasses[item.plantId]) {
      const key = C.plantClasses[item.plantId];
      return { key, ...(classes[key] || {}) };
    }
    if (item.rawKcal) return { key: 'grain_legume', ...(classes.grain_legume || {}) };
    if (item.foodKind === 'plant') {
      const p = (this.data.plants || []).find(x => x.id === item.plantId) || {};
      const formMap = { shoots: 'greens', berries: 'fruit', roots: 'tuber', nuts: 'nut' };
      const key = formMap[p.form] || 'greens';
      return { key, ...(classes[key] || {}) };
    }
    return null;
  };
  G.cookOutcome = function (knows) {
    const r = Math.random();
    if (knows) {
      if (r < 0.70) return { key: 'perfect', mult: 1.0 };
      if (r < 0.95) return { key: 'decent', mult: 0.8 };
      return { key: 'burnt', mult: 0.4 };
    }
    if (r < 0.30) return { key: 'decent', mult: 0.8 };
    if (r < 0.70) return { key: 'undercooked', mult: 0.7, riskStays: true };
    return { key: 'burnt', mult: 0.4 };
  };
  G.cookOutcomePhrase = function (outcome, cls) {
    const b = (cls && cls.blurb) || '';
    switch (outcome.key) {
      case 'perfect': return 'perfect \u2014 ' + b;
      case 'decent': return 'a bit uneven, but good';
      case 'undercooked': return 'underdone in the middle \u2014 still risky';
      case 'burnt': return 'burnt at the edges \u2014 edible, technically';
      default: return 'cooked';
    }
  };
  G.consumeCookFire = function (ticks) {
    try {
      const s = this.state.scholar || {};
      const now = this._absTick();
      const px = s.insideTent ? s.insideTent.tx : (this.map || {}).px;
      const py = s.insideTent ? s.insideTent.ty : (this.map || {}).py;
      const f = (this.state.fires || []).find(f => f.tx === px && f.ty === py && f.till > now && f.burn0);
      if (!f) return 'ok';
      f.till -= ticks;
      return f.till <= now ? 'died' : 'ok';
    } catch (e) { return 'ok'; }
  };
  G.cookTransform = function (item, opts) {
    opts = opts || {};
    const cls = this.cookClassFor(item);
    if (!cls || !cls.raw || !cls.cooked) return null;
    const outcome = opts.outcome || this.cookOutcome(!!opts.knows);
    const units = item.units || 1;
    const rawPer = item.rawKcal || item.kcalEach || 0;
    const rawTotal = Math.round(rawPer * units);
    if (rawTotal <= 0) return null;
    const gross = rawTotal / cls.raw;
    const effMult = outcome.mult * (opts.skillMult || 1) * (opts.relicMult || 1);
    let cookedTotal;
    if (item.cookedKcal) {
      cookedTotal = Math.min(gross, item.cookedKcal * units * effMult);
    } else {
      cookedTotal = Math.min(gross, gross * cls.cooked * effMult);
    }
    return {
      kcalEach: Math.max(1, Math.round(cookedTotal / units)),
      outcome, cls, rawTotal, cookedTotal: Math.round(cookedTotal),
    };
  };
  G.downgradeOutcome = function (outcome) {
    const order = ['perfect', 'decent', 'undercooked', 'burnt'];
    const i = order.indexOf(outcome.key);
    if (i < 0 || i >= order.length - 1) return outcome;
    const next = order[i + 1];
    return { key: next, mult: next === 'decent' ? 0.8 : next === 'undercooked' ? 0.7 : 0.4, riskStays: next === 'undercooked' };
  };
  const origCookFood = G.cookFood;
  G.cookFood = function (idx, container) {
    const inv = container || this.state.scholar.inventory;
    const item = inv[idx];
    // SPOILAGE (adversarial forager 2026-10-08): rot can't be cooked back
    // into food. cleanCarcass/preserveFood/askSpecialist-butcher all refuse
    // rot honestly; the cook paths were missed and resurrected it (spoilDay
    // rewrite to day+5). Same voice, same loss.
    const day0 = this.state.scholar.day;
    if (item && this.isSpoiled(item)) {
      this.say(`The ${item.name} went bad — cooking won't save it. You leave it for the flies.`);
      inv.splice(idx, 1);
      return null;
    }
    if (item && item.foodKind === 'meat' && item.foodState === 'cleaned') {
      if (!this.nearFire()) { this.say('Need a fire to cook.'); return null; }
      const units = item.units || 1;
      const knows = this.knowsTechnique('cook');
      // MONSTER FOOD SAFETY: cooking doesn't teach. Unknown flesh stays
      // unknown — no kcal reveal, no "Safe." claim — until tested.
      const cMeatId = (item.plantId || '').replace(/^meat_/, '');
      const cIsMonster = (this.data.monsters || []).some(m => m.id === cMeatId);
      const cFoodSafe = !cIsMonster || this.monsterFoodSafe(cMeatId);
      // DIGESTIBILITY (Steve 2026-10-08): the cleaned total is the honest
      // raw net; cooking unlocks more of the gross via the food's class \u2014
      // never more than gross. Unknown flesh (kcalEach 0) keeps its gross in
      // hiddenKcal for the later cautious-test reveal math.
      const cls = this.cookClassFor(item) || {};
      const cookTime = cls.time || 32;
      const fireState = this.consumeCookFire(cookTime);
      let outcome = this.cookOutcome(knows);
      if (fireState === 'died') outcome = this.downgradeOutcome(outcome);
      const r = cFoodSafe ? this.cookTransform(item, { knows, outcome }) : null;
      if (cFoodSafe && r) {
        item.kcalEach = r.kcalEach;
        item.hiddenKcal = null;
        if (r.outcome.key === 'burnt') item.burnt = true;
        // Undercooked: the normal parasites survive. Cooked through: dead.
        // (Monster weirdness is NOT cured by fire \u2014 that's an eat-time roll.)
        if (!r.outcome.riskStays) item.diseaseRisk = null;
        item.foodState = 'cooked'; item.safe = cFoodSafe;
        item.spoilDay = this.state.scholar.day + 5;
        item.name = item.name.replace(' (cleaned)', '') + ' (cooked)';
        item.prep = 'Cooked ' + this.cookOutcomePhrase(r.outcome, r.cls) + '.';
      } else {
        item.hiddenKcal = item.hiddenKcal || Math.round(item.kcalEach * 2.5 * units);
        item.kcalEach = 0;
        item.foodState = 'cooked'; item.diseaseRisk = null; item.safe = false;
        item.spoilDay = this.state.scholar.day + 5;
        item.name = item.name.replace(' (cleaned)', '') + ' (cooked)';
        item.prep = '\u26A0\uFE0F Cooked, but still unknown flesh. Test it cautiously before trusting it.';
      }
      if (!knows) this.learnTechnique('cook', 'trial');
      // CODEX MEMORY: if this flesh taught you a weird lesson before, the
      // fire reminds you before you commit.
      let memWarn = '';
      try {
        const me = (this.state.codex.monsters || {})[cMeatId];
        if (cIsMonster && me && me.meatDisease) {
          const dz = ((this.data.cooking || {}).monsterDiseases || []).find(d => d.id === me.meatDisease);
          if (dz) memWarn = ` Last time, the ${dz.name.toLowerCase()} lasted ${dz.days} days. You do it anyway.`;
        }
      } catch (e) {}
      if (cFoodSafe && r) {
        this.say(`Cooked ${item.name}: ${r.rawTotal} \u2192 ${r.cookedTotal} kcal, ${this.cookOutcomePhrase(r.outcome, r.cls)}.${fireState === 'died' ? ' The fire died halfway \u2014 it cost you.' : ''}${memWarn} (${cookTime} ticks)`);
      } else {
        this.say(`Cooked ${item.name}. Smells like meat. Whether it IS food \u2014 you still don't know. Test it cautiously.${memWarn}`);
      }
      this.tickAction(cookTime);
      return null;
    }
    if (item && item.needsCooking && item.diseaseRisk) {
      if (!this.nearFire()) { this.say('Need a fire to cook.'); return null; }
      const knowsP = this.knowsTechnique('cook');
      const clsP = this.cookClassFor(item) || {};
      const timeP = clsP.time || 16;
      const fireP = this.consumeCookFire(timeP);
      let outP = this.cookOutcome(knowsP);
      if (fireP === 'died') outP = this.downgradeOutcome(outP);
      // DIGESTIBILITY: must-cook plants gain real net kcal via their class \u2014
      // tubers transform, greens barely. Undercooked keeps the risk.
      const rP = this.cookTransform(item, { knows: knowsP, outcome: outP });
      if (rP) {
        item.kcalEach = rP.kcalEach;
        if (rP.outcome.key === 'burnt') item.burnt = true;
      }
      if (!outP.riskStays) { item.diseaseRisk = null; item.safe = true; item.needsCooking = false; }
      item.foodState = 'cooked';
      item.prep = 'Cooked ' + this.cookOutcomePhrase(outP, clsP) + '.';
      item.spoilDay = this.state.scholar.day + 5;
      if (!knowsP) this.learnTechnique('cook', 'trial');
      if (rP) {
        this.say(`Cooked ${item.name}: ${rP.rawTotal} \u2192 ${rP.cookedTotal} kcal, ${this.cookOutcomePhrase(outP, clsP)}.${fireP === 'died' ? ' The fire died halfway \u2014 it cost you.' : ''}${outP.riskStays ? ' Still risky inside.' : ' Safe now.'} (${timeP} ticks)`);
      } else {
        this.say(`Cooked ${item.name}. Safe now. (${timeP} ticks)`);
      }
      this.tickAction(timeP);
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
    // SPOILAGE (adversarial forager 2026-10-08): you can't donate rot to the
    // village — no trust for garbage, and the pantry never stocks it.
    if (item && this.isSpoiled(item)) {
      this.say(`The ${item.name} went bad — you can't feed the village rot. You leave it for the flies.`);
      this.state.scholar.inventory.splice(idx, 1);
      return null;
    }
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
