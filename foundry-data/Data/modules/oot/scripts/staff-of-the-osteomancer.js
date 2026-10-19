// Staff of the Osteomancer (requires attunement). While attuned and equipped:
//   - +1 to hit / +1 save DC on osteomancy spells and abilities
//   - Brittle Bone Armor: +1 charge, a short rest recovers 1 charge (not all), 3 temp HP per level
//   - While Brittle Bone Armor is active, other friendly tokens within 10 ft get +1 AC
// The osteomancy spell list is the "Osteomancy*" list from the Osteomantic Adept feat
// (Steinhardt's Guide to the Eldritch Hunt), plus Brittle Bone Throw and the Bone Puppetry features.

const STAFF = "staff-of-the-osteomancer";
const BBA = "brittle-bone-armor";
const AURA_RANGE_FT = 10;

const OSTEOMANCY = new Set([
  "bone-claws", "bone-shield", "fractured-shell", "phalangeal-shot", "arm-cannon", "bone-cocoon",
  "calcified-memories", "rolling-bones", "rupturing-curse", "skeletal-tail", "displacing-maw", "osseous-cage",
  "osseous-impalement", "rubber-bones", "dread-scarecrow", "graveyard-shuffle", "maiden-of-bones", "chisel-skull",
  "forest-of-dread", "wall-of-bones", "amputate", "boneyard", "aspect-of-death",
  "brittle-bone-throw",                      // the cantrip isn't on the feat's list, but it is a bone spell
  "bone-puppetry", "improved-bone-puppetry"  // abilities that use the spell save DC
]);

const slug = name => String(name ?? "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

export function staffActive(actor) {
  return !!actor?.items?.some(i => slug(i.name) === STAFF && i.system?.equipped && i.system?.attuned);
}

function boosted(activity) {
  const item = activity?.item;
  return !!item && OSTEOMANCY.has(slug(item.name)) && staffActive(activity.actor);
}

// ---- +1 to hit and +1 save DC: dnd5e adds `attack.bonus` / `save.dc.bonus` itself when preparing activities.

function wrapActivities() {
  for (const type of ["attack", "save"]) {
    const cls = CONFIG.DND5E.activityTypes?.[type]?.documentClass;
    if (!cls) continue;
    const original = cls.prototype.prepareData;
    cls.prototype.prepareData = function (...args) {
      const result = original.apply(this, args);
      try {
        if (boosted(this)) {
          if (type === "attack") this.attack.bonus = this.attack.bonus ? `${this.attack.bonus} + 1` : "1";
          else this.save.dc.bonus = "1";
        }
      } catch (err) {
        console.error("OOT | Staff of the Osteomancer | bonus failed", err);
      }
      return result;
    };
  }
}

// ---- Brittle Bone Armor changes, as a dnd5e enchantment effect on the feature while the staff is active.
// ponytail: uses.max is hard-coded to 2 (base 1 + 1). Change it here if the base charges ever change.

function enchantmentData(staff) {
  return {
    name: staff.name,
    img: staff.img,
    type: "enchantment",
    origin: staff.uuid,
    disabled: false,
    flags: { oot: { staffEnchant: true } },
    changes: [
      { key: "system.uses.max", mode: CONST.ACTIVE_EFFECT_MODES.OVERRIDE, value: "2" },
      {
        key: "system.uses.recovery", mode: CONST.ACTIVE_EFFECT_MODES.OVERRIDE,
        value: JSON.stringify([{ period: "sr", type: "formula", formula: "1" }, { period: "lr", type: "recoverAll" }])
      },
      { key: "activities[heal].healing.custom.formula", mode: CONST.ACTIVE_EFFECT_MODES.OVERRIDE, value: "3 * @classes.wizard.levels" }
    ]
  };
}

async function syncArmor(actor) {
  const armor = actor?.items?.find(i => slug(i.name) === BBA);
  if (!armor) return;
  const existing = armor.effects.filter(e => e.getFlag("oot", "staffEnchant"));
  const staff = actor.items.find(i => slug(i.name) === STAFF && i.system?.equipped && i.system?.attuned);
  if (staff && !existing.length) {
    await armor.createEmbeddedDocuments("ActiveEffect", [enchantmentData(staff)]);
  } else if (!staff && existing.length) {
    await armor.deleteEmbeddedDocuments("ActiveEffect", existing.map(e => e.id));
  }
}

// ---- Aura: "armor active" is a flag set when Brittle Bone Armor is used and cleared when its temp HP is gone.

const armorActive = actor => !!actor?.getFlag("oot", "bbaActive");

function inRange(a, b) {
  const limit = AURA_RANGE_FT + 5 * ((a.document.width - 1 + b.document.width - 1) / 2);
  return canvas.grid.measurePath([a.center, b.center]).distance <= limit;
}

let auraTimer = null;
function queueAuraSync() {
  if (!game.users.activeGM?.isSelf || !canvas?.ready) return;
  clearTimeout(auraTimer);
  auraTimer = setTimeout(syncAura, 250);
}

async function syncAura() {
  const wanted = new Map();                 // ally token id -> source actor id
  for (const source of canvas.tokens.placeables) {
    if (!source.actor || !armorActive(source.actor) || !staffActive(source.actor)) continue;
    for (const ally of canvas.tokens.placeables) {
      if (ally === source || !ally.actor || ally.document.disposition !== CONST.TOKEN_DISPOSITIONS.FRIENDLY) continue;
      if (inRange(source, ally)) wanted.set(ally.id, source.actor.id);
    }
  }
  for (const token of canvas.tokens.placeables) {
    const actor = token.actor;
    if (!actor) continue;
    const current = actor.effects.filter(e => e.getFlag("oot", "boneAura"));
    const source = wanted.get(token.id);
    if (source && !current.length) {
      await actor.createEmbeddedDocuments("ActiveEffect", [{
        name: "Brittle Bone Armor (aura)",
        img: "icons/magic/defensive/shield-barrier-deflect-teal.webp",
        flags: { oot: { boneAura: source } },
        changes: [{ key: "system.attributes.ac.bonus", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: "1" }]
      }]);
    } else if (!source && current.length) {
      await actor.deleteEmbeddedDocuments("ActiveEffect", current.map(e => e.id));
    }
  }
}

export function initStaffOfTheOsteomancer() {
  wrapActivities();

  // armor goes active when Brittle Bone Armor is used
  Hooks.on("dnd5e.postUseActivity", (activity) => {
    if (slug(activity?.item?.name) === BBA && activity.type === "heal") activity.actor?.setFlag("oot", "bbaActive", true);
  });
  // ...and ends when its temp HP is gone, or on a rest
  Hooks.on("updateActor", (actor, changes, _options, userId) => {
    if (userId === game.user.id && armorActive(actor) && "temp" in (changes.system?.attributes?.hp ?? {}) && !changes.system.attributes.hp.temp) {
      actor.unsetFlag("oot", "bbaActive");
    }
    if ("oot" in (changes.flags ?? {}) || "-=oot" in (changes.flags ?? {}) || changes.system?.attributes?.hp) queueAuraSync();
  });
  Hooks.on("dnd5e.restCompleted", (actor) => { if (armorActive(actor) && game.user.isGM) actor.unsetFlag("oot", "bbaActive"); });

  // staff attuned / equipped / added / removed -> refresh Brittle Bone Armor changes and the aura
  const onStaffChange = (item, _a, _b, userId) => {
    if (slug(item?.name) !== STAFF || userId !== game.user.id) return;
    syncArmor(item.parent);
    queueAuraSync();
  };
  Hooks.on("updateItem", (item, _changes, _options, userId) => onStaffChange(item, 0, 0, userId));
  Hooks.on("createItem", (item, _options, userId) => onStaffChange(item, 0, 0, userId));
  Hooks.on("deleteItem", (item, _options, userId) => onStaffChange(item, 0, 0, userId));
  Hooks.on("updateItem", (item, _changes, _options, userId) => {
    if (item?.parent && userId === game.user.id && slug(item.name) === BBA) queueAuraSync();
  });

  Hooks.on("updateToken", (_doc, changes) => { if ("x" in changes || "y" in changes || "disposition" in changes) queueAuraSync(); });
  Hooks.on("createToken", queueAuraSync);
  Hooks.on("deleteToken", queueAuraSync);
  Hooks.on("canvasReady", queueAuraSync);

  Hooks.once("ready", () => {
    if (!game.user.isGM) return;
    for (const actor of game.actors) if (actor.items.some(i => slug(i.name) === STAFF)) syncArmor(actor);
  });
}
