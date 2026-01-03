export const CRAFTING_CONFIG = {
  rarityDC: {
    common: 10,
    uncommon: 15,
    rare: 18,
    veryRare: 21,
    legendary: 25,
    artifact: 30
  },

  rarityLabels: {
    common: "Common",
    uncommon: "Uncommon",
    rare: "Rare",
    veryRare: "Very Rare",
    legendary: "Legendary",
    artifact: "Artifact"
  },

  maxEnchantingBoons: {
    common: 0,
    uncommon: 1,
    rare: 2,
    veryRare: 3,
    legendary: 3,
    artifact: 3
  },

  essenceTypes: {
    common: "None",
    uncommon: "Frail",
    rare: "Robust",
    veryRare: "Potent",
    legendary: "Mythic",
    artifact: "Deific"
  },

  itemTypes: {
    weapon: "weapon",
    armour: "armor",
    armor: "armor",
    shield: "shield",
    clothing: "clothing",
    ammunition: "ammunition",
    thrownWeapon: "thrownWeapon",
    heldItem: "heldItem"
  },

  craftingAbilities: [
    { id: "arc", name: "Arcana", type: "skill" },
    { id: "nat", name: "Nature", type: "skill" },
    { id: "rel", name: "Religion", type: "skill" },
    { id: "smith", name: "Smith's Tools", type: "tool" },
    { id: "alchemist", name: "Alchemist's Supplies", type: "tool" },
    { id: "jeweler", name: "Jeweler's Tools", type: "tool" },
    { id: "leatherworker", name: "Leatherworker's Tools", type: "tool" },
    { id: "tinker", name: "Tinker's Tools", type: "tool" },
    { id: "weaver", name: "Weaver's Tools", type: "tool" },
    { id: "woodcarver", name: "Woodcarver's Tools", type: "tool" },
    { id: "carpenter", name: "Carpenter's Tools", type: "tool" }
  ],

  quirkThresholds: [
    { min: -Infinity, max: -13, flaws: Infinity, boons: 0, destroyed: true, label: "Total failure, item destroyed" },
    { min: -12, max: -9, flaws: 3, boons: 0, destroyed: false, label: "Three flaws" },
    { min: -8, max: -5, flaws: 2, boons: 0, destroyed: false, label: "Two flaws" },
    { min: -4, max: -1, flaws: 1, boons: 0, destroyed: false, label: "One flaw" },
    { min: 0, max: 4, flaws: 0, boons: 0, destroyed: false, label: "Nothing" },
    { min: 5, max: 8, flaws: 0, boons: 1, destroyed: false, label: "One boon" },
    { min: 9, max: 12, flaws: 0, boons: 2, destroyed: false, label: "Two boons" },
    { min: 13, max: Infinity, flaws: 0, boons: 3, destroyed: false, label: "Three boons" }
  ]
};

export const MANUFACTURING_FLAWS = [
  {
    id: "poorHandiwork",
    name: "Poor/Shoddy/Abysmal Handiwork",
    description: "This item is not well made. If this item is a weapon, it has a -1 penalty to its attack and damage rolls. If it is armour, it has a -1 penalty to its base AC. If it is neither armour nor weapon, it gains the Fragile quirk instead.",
    d20Range: [1, 6],
    itemTypes: ["armor", "weapon"],
    effects: {
      weapon: [
        { key: "system.magicalBonus", mode: 2, value: "-1" }
      ],
      armor: [
        { key: "system.armor.magicalBonus", mode: 2, value: "-1" }
      ]
    }
  },
  {
    id: "fragile",
    name: "Fragile",
    description: "This item is prone to breaking. If the item is a weapon, when you roll a 1 on the d20 for an attack roll using the item, the weapon breaks. If the item isn't a weapon, whenever you suffer a critical hit, roll a d20 for each fragile item you wear, hold, or carry. On a 1, the item breaks and is no longer usable.",
    d20Range: [7, 8],
    itemTypes: ["all"],
    effects: {}
  },
  {
    id: "unwieldy",
    name: "Unwieldy",
    description: "This item is poorly balanced or interferes with your movement. Whenever you make an attack with this weapon, or make a Dexterity saving throw or Dexterity (Acrobatics) check while wearing or carrying it, and roll a 1 on the d20, there are consequences. If the item is a weapon, it flies 10 feet in a random direction. If the item isn't a weapon, you fall prone.",
    d20Range: [9, 10],
    itemTypes: ["all"],
    effects: {}
  },
  {
    id: "degradable",
    name: "Degradable",
    description: "Spending time in water or other reactive environments causes this item to degrade. Roll a d20 each time it emerges after being submerged in water, or each hour it spends in a corrosive environment. On a 1, the item breaks and is no longer usable.",
    d20Range: [11, 12],
    itemTypes: ["all"],
    effects: {}
  },
  {
    id: "noisy",
    name: "Noisy",
    description: "Something about this item squeaks or rustles. You have disadvantage on Dexterity (Stealth) checks while wearing or carrying the item, even if the item is stowed away.",
    d20Range: [13, 14],
    itemTypes: ["all"],
    effects: {
      all: [
        { key: "flags.midi-qol.disadvantage.skill.check.ste", mode: 0, value: "1" }
      ]
    }
  },
  {
    id: "pungent",
    name: "Pungent",
    description: "This item has a distinctly off-putting odour. While wearing or carrying the item, you have disadvantage on Charisma checks against creatures that don't like bad smells, and creatures have advantage on Wisdom (Perception) checks made to detect you by smell.",
    d20Range: [15, 15],
    itemTypes: ["all"],
    effects: {}
  },
  {
    id: "heavy",
    name: "Heavy",
    description: "This item weighs twice as much as normal.",
    d20Range: [16, 16],
    itemTypes: ["all"],
    effects: {},
    weightMultiplier: 2
  },
  {
    id: "garish",
    name: "Garish",
    description: "The designs and colours in this item are all wrong. While you wear or hold the item, you have disadvantage on Charisma (Intimidation) checks against creatures that can see the item.",
    d20Range: [17, 17],
    itemTypes: ["all"],
    effects: {
      all: [
        { key: "flags.midi-qol.disadvantage.skill.check.itm", mode: 0, value: "1" }
      ]
    }
  },
  {
    id: "mediocreFinish",
    name: "Mediocre Finish",
    description: "This item looks like crap and is worth half its normal value.",
    d20Range: [18, 18],
    itemTypes: ["all"],
    effects: {},
    valueMultiplier: 0.5
  },
  {
    id: "underInsulated",
    name: "Under Insulated",
    description: "Something about this item conducts heat or is under-insulated. While wearing or carrying the item, whenever you take cold or fire damage, you take an additional 1d8 damage of the same type.",
    d20Range: [19, 19],
    itemTypes: ["all"],
    effects: {}
  },
  {
    id: "dangerous",
    name: "Dangerous",
    description: "When you make an attack with this item, while wearing this clothing or armour, or while holding this held item, the range of values that result in a critical fail increases by 1 (e.g. from a result of 1, to a result of 1-2 on the d20).",
    d20Range: [20, 20],
    itemTypes: ["all"],
    effects: {
      all: [
        { key: "flags.midi-qol.fumbleThreshold", mode: 2, value: "1" }
      ]
    }
  }
];

export const MANUFACTURING_BOONS = [
  {
    id: "durable",
    name: "Durable",
    description: "The hit points of this item are tripled.",
    d20Range: [1, 2],
    itemTypes: ["all"],
    effects: {},
    hpMultiplier: 3
  },
  {
    id: "unreactive",
    name: "Unreactive",
    description: "This item resists corrosion and rot. If an environmental effect or creature would cause an item to become damaged (such as a gray ooze's Corrode Metal), roll a d20. On an 11 or higher, the item is unaffected.",
    d20Range: [3, 4],
    itemTypes: ["all"],
    effects: {}
  },
  {
    id: "lightweight",
    name: "Lightweight",
    description: "This item weighs half as much as normal at no detriment to its strength or potential to do damage. If it is a weapon with the heavy property, it loses this property. If it doesn't have the heavy property, it gains the light property.",
    d20Range: [5, 6],
    itemTypes: ["all"],
    effects: {},
    weightMultiplier: 0.5
  },
  {
    id: "magnificentFinish",
    name: "Magnificent Finish",
    description: "This item's finish is on point and it is worth twice its normal value.",
    d20Range: [7, 8],
    itemTypes: ["all"],
    effects: {},
    valueMultiplier: 2
  },
  {
    id: "flashy",
    name: "Flashy",
    description: "This item looks really cool. While you wear or hold the item, you have advantage on Charisma (Persuasion) checks against creatures that can see the item.",
    d20Range: [9, 10],
    itemTypes: ["all"],
    effects: {
      all: [
        { key: "flags.midi-qol.advantage.skill.check.per", mode: 0, value: "1" }
      ]
    }
  },
  {
    id: "insulated",
    name: "Insulated",
    description: "If this item is clothing or armour, you have advantage on Constitution saving throws against environmental effects caused by cold weather. If it is a weapon or held item, you have advantage on saving throws against the heat metal spell while holding it.",
    d20Range: [11, 12],
    itemTypes: ["armor", "clothing", "heldItem", "weapon"],
    effects: {}
  },
  {
    id: "grippy",
    name: "Grippy",
    description: "You have advantage on ability checks and saving throws made to resist being disarmed of this item, or having it taken from you against your will.",
    d20Range: [13, 14],
    itemTypes: ["heldItem", "weapon"],
    effects: {}
  },
  {
    id: "quickRelease",
    name: "Quick Release",
    description: "If this item is armour or a shield, it is quick to equip or stow. The time to don or doff the item is ten times quicker (a shield takes either a bonus action or an action).",
    d20Range: [15, 16],
    itemTypes: ["armor", "shield"],
    effects: {}
  },
  {
    id: "aerodynamic",
    name: "Aerodynamic",
    description: "If the item has the thrown property or is ammunition, its normal and long ranges increase by 50% (rounded down; if the item is ammunition it increases the range of the weapon that fires it by 50% instead).",
    d20Range: [17, 18],
    itemTypes: ["ammunition", "thrownWeapon"],
    effects: {}
  },
  {
    id: "perfectBalance",
    name: "Perfect Balance",
    description: "If this item is a weapon, whenever you roll a 1 on the d20 when you make an attack roll with it, you can reroll the d20 and must use the new result. If this item is armour or clothing, whenever you roll a 1 on the d20 when you make a Dexterity (Acrobatics) check or Dexterity saving throw, you can reroll the d20 and must use the new result.",
    d20Range: [19, 19],
    itemTypes: ["armor", "clothing", "weapon"],
    effects: {}
  },
  {
    id: "artisanalCraftsmanship",
    name: "Artisanal Craftsmanship",
    description: "If this item is a weapon, it has a +1 bonus to its damage rolls. If it is armour, bludgeoning, piercing, and slashing damage that you take from nonmagical attacks is reduced by 1.",
    d20Range: [20, 20],
    itemTypes: ["armor", "weapon"],
    effects: {
      weapon: [
        { key: "system.damage.bonus", mode: 2, value: "1" }
      ],
      armor: [
        { key: "system.traits.dm.amount.physical", mode: 2, value: "-1" }
      ]
    }
  }
];

export function getQuirkOutcome(checkResult, dc) {
  const difference = checkResult - dc;

  for (const threshold of CRAFTING_CONFIG.quirkThresholds) {
    if (difference >= threshold.min && difference <= threshold.max) {
      return {
        difference,
        flaws: threshold.flaws,
        boons: threshold.boons,
        destroyed: threshold.destroyed,
        label: threshold.label
      };
    }
  }

  return { difference, flaws: 0, boons: 0, destroyed: false, label: "Unknown" };
}

export function rollFlaw(itemType, excludeIds = new Set()) {
  const d20 = Math.floor(Math.random() * 20) + 1;

  let flaw = MANUFACTURING_FLAWS.find(f =>
    d20 >= f.d20Range[0] &&
    d20 <= f.d20Range[1] &&
    !excludeIds.has(f.id)
  );

  if (!flaw) return null;

  const appliesToItem = flaw.itemTypes.includes("all") ||
    flaw.itemTypes.includes(itemType);

  if (!appliesToItem) {
    return null;
  }

  return { ...flaw, roll: d20 };
}

export function rollBoon(itemType, excludeIds = new Set()) {
  const d20 = Math.floor(Math.random() * 20) + 1;

  let boon = MANUFACTURING_BOONS.find(b =>
    d20 >= b.d20Range[0] &&
    d20 <= b.d20Range[1] &&
    !excludeIds.has(b.id)
  );

  if (!boon) return null;

  const appliesToItem = boon.itemTypes.includes("all") ||
    boon.itemTypes.includes(itemType);

  if (!appliesToItem) {
    return null;
  }

  return { ...boon, roll: d20 };
}

export function rollFlaws(count, itemType) {
  const flaws = [];
  const usedIds = new Set();

  for (let i = 0; i < count; i++) {
    const flaw = rollFlaw(itemType, usedIds);
    if (flaw) {
      flaws.push(flaw);
      usedIds.add(flaw.id);
    }
  }

  return flaws;
}

export function rollBoons(count, itemType, maxBoons = 3) {
  const actualCount = Math.min(count, maxBoons);
  const boons = [];
  const usedIds = new Set();

  for (let i = 0; i < actualCount; i++) {
    const boon = rollBoon(itemType, usedIds);
    if (boon) {
      boons.push(boon);
      usedIds.add(boon.id);
    }
  }

  return boons;
}
