import { CRAFTING_CONFIG, rollFlaw } from './crafting-data.js';

export class CraftingApplication extends Application {
  constructor(options = {}) {
    super(options);

    this.selectedItem = null;
    this.selectedRarity = "uncommon";
    this.selectedItemType = "weapon";
    this.creationSkill = "smith";
    this.enchantingSkill = "arc";
    this.creationDC = CRAFTING_CONFIG.rarityDC["uncommon"];
    this.enchantingDC = CRAFTING_CONFIG.rarityDC["uncommon"];

    this.creationResult = null;
    this.enchantingResult = null;
    this.craftingComplete = false;
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "oot-crafting",
      title: "OOT Crafting System",
      template: "modules/oot/templates/crafting-app.hbs",
      classes: ["oot-crafting-window"],
      width: 600,
      height: "auto",
      resizable: true
    });
  }

  get craftingActor() {
    return game.user.character;
  }

  getData(options = {}) {
    const actor = this.craftingActor;

    const allFlaws = this._getAllFlawsWithSource();

    return {
      actor: actor,
      hasActor: !!actor,
      selectedItem: this.selectedItem,
      selectedRarity: this.selectedRarity,
      selectedItemType: this.selectedItemType,
      creationSkill: this.creationSkill,
      enchantingSkill: this.enchantingSkill,
      rarities: CRAFTING_CONFIG.rarityLabels,
      rarityDCs: CRAFTING_CONFIG.rarityDC,
      itemTypes: this._getItemTypeOptions(),
      craftingAbilities: CRAFTING_CONFIG.craftingAbilities,
      maxBoons: CRAFTING_CONFIG.maxEnchantingBoons[this.selectedRarity],
      essenceType: CRAFTING_CONFIG.essenceTypes[this.selectedRarity],
      creationResult: this.creationResult,
      enchantingResult: this.enchantingResult,
      craftingComplete: this.craftingComplete,
      creationDC: this.creationDC,
      enchantingDC: this.enchantingDC,
      suggestedDC: CRAFTING_CONFIG.rarityDC[this.selectedRarity],
      allFlaws: allFlaws
    };
  }

  _getAllFlawsWithSource() {
    const flaws = [];
    if (this.creationResult?.flaws) {
      for (let i = 0; i < this.creationResult.flaws.length; i++) {
        flaws.push({ ...this.creationResult.flaws[i], source: "creation", sourceIndex: i });
      }
    }
    if (this.enchantingResult?.flaws) {
      for (let i = 0; i < this.enchantingResult.flaws.length; i++) {
        flaws.push({ ...this.enchantingResult.flaws[i], source: "enchanting", sourceIndex: i });
      }
    }
    return flaws;
  }

  _getItemTypeOptions() {
    return [
      { id: "weapon", name: "Weapon" },
      { id: "armor", name: "Armour" },
      { id: "shield", name: "Shield" },
      { id: "clothing", name: "Clothing" },
      { id: "ammunition", name: "Ammunition" },
      { id: "thrownWeapon", name: "Thrown Weapon" },
      { id: "heldItem", name: "Held Item" }
    ];
  }

  activateListeners(html) {
    super.activateListeners(html);

    html.find('.item-select').on('click', this._onSelectItem.bind(this));
    html.find('.item-clear').on('click', this._onClearItem.bind(this));

    html.find('select[name="rarity"]').on('change', this._onRarityChange.bind(this));
    html.find('input[name="creationDC"]').on('change', this._onCreationDCChange.bind(this));
    html.find('input[name="enchantingDC"]').on('change', this._onEnchantingDCChange.bind(this));
    html.find('select[name="itemType"]').on('change', this._onItemTypeChange.bind(this));
    html.find('select[name="creationSkill"]').on('change', this._onCreationSkillChange.bind(this));
    html.find('select[name="enchantingSkill"]').on('change', this._onEnchantingSkillChange.bind(this));

    html.find('.roll-creation').on('click', this._onRollCreation.bind(this));
    html.find('.roll-enchanting').on('click', this._onRollEnchanting.bind(this));

    html.find('.create-item').on('click', this._onCreateItem.bind(this));
    html.find('.reset-crafting').on('click', this._onReset.bind(this));

    html.find('.reroll-flaw').on('click', this._onRerollFlaw.bind(this));
    html.find('.remove-flaw').on('click', this._onRemoveFlaw.bind(this));

    html[0].addEventListener('drop', this._onDrop.bind(this));
  }

  async _onSelectItem(event) {
    event.preventDefault();

    const items = await this._getAvailableItems();

    const content = await renderTemplate("modules/oot/templates/item-picker.hbs", {
      items: items
    });

    new Dialog({
      title: "Select Item to Craft",
      content: content,
      buttons: {
        cancel: {
          icon: '<i class="fas fa-times"></i>',
          label: "Cancel"
        }
      },
      render: (html) => {
        html.find('.item-pick').on('click', async (ev) => {
          const itemId = ev.currentTarget.dataset.itemId;
          const itemSource = ev.currentTarget.dataset.itemSource;
          await this._selectItemById(itemId, itemSource);
          html.closest('.dialog').find('.header-button.close').trigger('click');
        });
      },
      default: "cancel"
    }, { width: 400, height: 500 }).render(true);
  }

  async _getAvailableItems() {
    const items = [];

    if (this.craftingActor) {
      const actorItems = this.craftingActor.items.filter(i =>
        ["weapon", "equipment", "consumable", "tool", "loot"].includes(i.type)
      );
      actorItems.forEach(item => {
        items.push({
          id: item.id,
          name: item.name,
          img: item.img,
          type: item.type,
          source: "actor"
        });
      });
    }

    const worldItems = game.items.filter(i =>
      ["weapon", "equipment", "consumable", "tool", "loot"].includes(i.type)
    );
    worldItems.forEach(item => {
      items.push({
        id: item.id,
        name: item.name,
        img: item.img,
        type: item.type,
        source: "world"
      });
    });

    return items;
  }

  async _selectItemById(itemId, source) {
    let item;
    if (source === "actor" && this.craftingActor) {
      item = this.craftingActor.items.get(itemId);
    } else if (source === "world") {
      item = game.items.get(itemId);
    }

    if (item) {
      this.selectedItem = {
        id: item.id,
        uuid: item.uuid,
        name: item.name,
        img: item.img,
        type: item.type,
        source: source,
        data: item.toObject()
      };

      this._detectItemType(item);
    }

    this.render();
  }

  _detectItemType(item) {
    if (item.type === "weapon") {
      const properties = item.system.properties;
      if (properties?.has?.("thr") || properties?.thr) {
        this.selectedItemType = "thrownWeapon";
      } else {
        this.selectedItemType = "weapon";
      }
    } else if (item.type === "equipment") {
      const armorType = item.system.type?.value || item.system.armor?.type;
      if (armorType === "shield") {
        this.selectedItemType = "shield";
      } else if (["light", "medium", "heavy"].includes(armorType)) {
        this.selectedItemType = "armor";
      } else if (armorType === "clothing") {
        this.selectedItemType = "clothing";
      } else {
        this.selectedItemType = "heldItem";
      }
    } else if (item.type === "consumable") {
      const consumableType = item.system.type?.value || item.system.consumableType;
      if (consumableType === "ammo") {
        this.selectedItemType = "ammunition";
      } else {
        this.selectedItemType = "heldItem";
      }
    } else {
      this.selectedItemType = "heldItem";
    }
  }

  async _onDrop(event) {
    event.preventDefault();

    let data;
    try {
      data = JSON.parse(event.dataTransfer.getData('text/plain'));
    } catch (e) {
      return;
    }

    if (data.type !== "Item") return;

    const item = await fromUuid(data.uuid);
    if (!item) return;

    this.selectedItem = {
      id: item.id,
      uuid: item.uuid,
      name: item.name,
      img: item.img,
      type: item.type,
      source: data.uuid.includes("Actor") ? "actor" : "world",
      data: item.toObject()
    };

    this._detectItemType(item);
    this.render();
  }

  _onClearItem(event) {
    event.preventDefault();
    this.selectedItem = null;
    this.render();
  }

  _onRarityChange(event) {
    this.selectedRarity = event.currentTarget.value;
    this.creationDC = CRAFTING_CONFIG.rarityDC[this.selectedRarity];
    this.enchantingDC = CRAFTING_CONFIG.rarityDC[this.selectedRarity];
    this.render();
  }

  _onCreationDCChange(event) {
    const value = parseInt(event.currentTarget.value);
    if (!isNaN(value) && value > 0) {
      this.creationDC = value;
    }
  }

  _onEnchantingDCChange(event) {
    const value = parseInt(event.currentTarget.value);
    if (!isNaN(value) && value > 0) {
      this.enchantingDC = value;
    }
  }

  _onItemTypeChange(event) {
    this.selectedItemType = event.currentTarget.value;
    this.render();
  }

  _onCreationSkillChange(event) {
    this.creationSkill = event.currentTarget.value;
  }

  _onEnchantingSkillChange(event) {
    this.enchantingSkill = event.currentTarget.value;
  }

  async _onRollCreation(event) {
    event.preventDefault();

    if (!this.selectedItem) {
      ui.notifications.error("Please select an item to craft first.");
      return;
    }

    const skillConfig = CRAFTING_CONFIG.craftingAbilities.find(a => a.id === this.creationSkill);
    await this._postCheckRequest("creation", skillConfig, 0);
  }

  async _onRollEnchanting(event) {
    event.preventDefault();

    if (!this.creationResult) {
      ui.notifications.error("Please complete the creation check first.");
      return;
    }

    if (this.creationResult.destroyed) {
      ui.notifications.error("The item was destroyed during creation.");
      return;
    }

    const skillConfig = CRAFTING_CONFIG.craftingAbilities.find(a => a.id === this.enchantingSkill);
    const existingBoons = this.creationResult.boons?.length || 0;
    await this._postCheckRequest("enchanting", skillConfig, existingBoons);
  }

  async _postCheckRequest(checkType, skillConfig, existingBoons) {
    const checkName = checkType === "creation" ? "Creation Check" : "Enchanting Check";
    const dc = checkType === "creation" ? this.creationDC : this.enchantingDC;
    const itemName = this.selectedItem?.name || "Unknown Item";
    const rarity = CRAFTING_CONFIG.rarityLabels[this.selectedRarity];

    const checkId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    game.oot.pendingChecks = game.oot.pendingChecks || {};
    game.oot.pendingChecks[checkId] = {
      visibleToGm: true,
      visibleToOwner: true,
      checkType: checkType,
      checkName: checkName,
      skillConfig: skillConfig,
      dc: dc,
      existingBoons: existingBoons,
      itemName: itemName,
      itemType: this.selectedItemType,
      rarity: this.selectedRarity,
      craftingAppId: this.appId,
      requesterId: game.user.id
    };

    const content = `
      <div class="oot-check-request">
        <h3>Crafting Help Needed: ${checkName}</h3>
        <p><strong>Item:</strong> ${itemName} (${rarity})</p>
        <p><strong>Required Skill:</strong> ${skillConfig.name}</p>
        <p><strong>DC:</strong> ${dc}</p>
        <p class="request-hint">Any player can help by clicking the button below!</p>
        <button type="button" class="oot-perform-check" data-check-id="${checkId}">
          <i class="fas fa-dice-d20"></i> Perform ${checkName}
        </button>
      </div>
    `;

    await ChatMessage.create({
      content: content,
      speaker: { alias: "Crafting System" },
      flags: {
        oot: {
          checkRequest: true,
          checkId: checkId
        }
      }
    });

    ui.notifications.info(`${checkName} request posted to chat. Any player can now perform the check!`);
  }

  async _onCreateItem(event) {
    event.preventDefault();

    if (!this.craftingComplete) {
      ui.notifications.error("Please complete both crafting checks first.");
      return;
    }

    if (this.creationResult?.destroyed || this.enchantingResult?.destroyed) {
      ui.notifications.error("The item was destroyed during crafting.");
      return;
    }

    if (!this.craftingActor) {
      ui.notifications.error("No assigned character found.");
      return;
    }

    const allFlaws = [
      ...(this.creationResult?.flaws || []),
      ...(this.enchantingResult?.flaws || [])
    ];
    const allBoons = [
      ...(this.creationResult?.boons || []),
      ...(this.enchantingResult?.boons || [])
    ];

    const itemData = foundry.utils.deepClone(this.selectedItem.data);

    itemData.name = `${itemData.name} (Crafted)`;

    itemData.system.rarity = this.selectedRarity;

    let weightMultiplier = 1;
    for (const flaw of allFlaws) {
      if (flaw.weightMultiplier) weightMultiplier *= flaw.weightMultiplier;
    }
    for (const boon of allBoons) {
      if (boon.weightMultiplier) weightMultiplier *= boon.weightMultiplier;
    }
    if (itemData.system.weight) {
      itemData.system.weight = itemData.system.weight * weightMultiplier;
    }

    let valueMultiplier = 1;
    for (const flaw of allFlaws) {
      if (flaw.valueMultiplier) valueMultiplier *= flaw.valueMultiplier;
    }
    for (const boon of allBoons) {
      if (boon.valueMultiplier) valueMultiplier *= boon.valueMultiplier;
    }
    if (itemData.system.price?.value) {
      itemData.system.price.value = Math.floor(itemData.system.price.value * valueMultiplier);
    }

    let descAddition = "<hr><h3>Crafting Quirks</h3>";

    if (allFlaws.length > 0) {
      descAddition += "<p><strong>Flaws:</strong></p><ul>";
      for (const flaw of allFlaws) {
        descAddition += `<li><strong>${flaw.name}:</strong> ${flaw.description}</li>`;
      }
      descAddition += "</ul>";
    }

    if (allBoons.length > 0) {
      descAddition += "<p><strong>Boons:</strong></p><ul>";
      for (const boon of allBoons) {
        descAddition += `<li><strong>${boon.name}:</strong> ${boon.description}</li>`;
      }
      descAddition += "</ul>";
    }

    if (allFlaws.length === 0 && allBoons.length === 0) {
      descAddition += "<p>No quirks.</p>";
    }

    itemData.system.description = itemData.system.description || {};
    itemData.system.description.value = (itemData.system.description.value || "") + descAddition;

    const effects = this._generateActiveEffects(allFlaws, allBoons, itemData.name);
    itemData.effects = effects;

    itemData.flags = itemData.flags || {};
    itemData.flags.oot = {
      crafted: true,
      flaws: allFlaws.map(f => ({ id: f.id, name: f.name, roll: f.roll })),
      boons: allBoons.map(b => ({ id: b.id, name: b.name, roll: b.roll })),
      creationRoll: this.creationResult.roll.total,
      enchantingRoll: this.enchantingResult.roll.total,
      rarity: this.selectedRarity
    };

    const createdItems = await this.craftingActor.createEmbeddedDocuments("Item", [itemData]);
    const createdItem = createdItems[0];

    await this._postCraftingResultToChat(createdItem, allFlaws, allBoons);

    ui.notifications.info(`Successfully crafted ${createdItem.name}!`);

    this._onReset();
  }

  _generateActiveEffects(flaws, boons, itemName) {
    const effects = [];

    for (const flaw of flaws) {
      const effectData = this._createEffectFromQuirk(flaw, "flaw", itemName);
      if (effectData) {
        effects.push(effectData);
      }
    }

    for (const boon of boons) {
      const effectData = this._createEffectFromQuirk(boon, "boon", itemName);
      if (effectData) {
        effects.push(effectData);
      }
    }

    return effects;
  }

  _createEffectFromQuirk(quirk, type, itemName) {
    const effectsConfig = quirk.effects?.[this.selectedItemType] || quirk.effects?.all;

    if (!effectsConfig || effectsConfig.length === 0) {
      return {
        name: `${quirk.name} (${type === "flaw" ? "Flaw" : "Boon"})`,
        icon: type === "flaw" ? "icons/svg/downgrade.svg" : "icons/svg/upgrade.svg",
        origin: null,
        disabled: false,
        transfer: true,
        flags: {
          oot: {
            quirkId: quirk.id,
            quirkType: type
          }
        },
        description: quirk.description,
        changes: []
      };
    }

    const changes = effectsConfig.map(effect => ({
      key: effect.key,
      mode: effect.mode,
      value: effect.value,
      priority: 20
    }));

    return {
      name: `${quirk.name} (${type === "flaw" ? "Flaw" : "Boon"})`,
      icon: type === "flaw" ? "icons/svg/downgrade.svg" : "icons/svg/upgrade.svg",
      origin: null,
      disabled: false,
      transfer: true,
      flags: {
        oot: {
          quirkId: quirk.id,
          quirkType: type
        }
      },
      description: quirk.description,
      changes: changes
    };
  }

  async _postCraftingResultToChat(item, flaws, boons) {
    const actor = this.craftingActor;

    let content = `
      <div class="oot-crafting-result">
        <h3>Crafting Complete!</h3>
        <div class="item-info">
          <img src="${item.img}" width="36" height="36" />
          <span class="item-name">${item.name}</span>
        </div>
        <p><strong>Rarity:</strong> ${CRAFTING_CONFIG.rarityLabels[this.selectedRarity]}</p>
        <p><strong>Creation Roll:</strong> ${this.creationResult.roll.total} vs DC ${this.creationResult.dc} (${this.creationResult.outcome.label})</p>
        <p><strong>Enchanting Roll:</strong> ${this.enchantingResult.roll.total} vs DC ${this.enchantingResult.dc} (${this.enchantingResult.outcome.label})</p>
    `;

    if (flaws.length > 0) {
      content += `<h4>Flaws (${flaws.length})</h4><ul>`;
      for (const flaw of flaws) {
        content += `<li><strong>${flaw.name}</strong> (d20: ${flaw.roll})</li>`;
      }
      content += `</ul>`;
    }

    if (boons.length > 0) {
      content += `<h4>Boons (${boons.length})</h4><ul>`;
      for (const boon of boons) {
        content += `<li><strong>${boon.name}</strong> (d20: ${boon.roll})</li>`;
      }
      content += `</ul>`;
    }

    if (flaws.length === 0 && boons.length === 0) {
      content += `<p><em>No quirks rolled.</em></p>`;
    }

    content += `</div>`;

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: content,
      flags: {
        oot: {
          craftingResult: true,
          itemId: item.id
        }
      }
    });
  }

  _onReset(event) {
    if (event) event.preventDefault();

    this.selectedItem = null;
    this.creationResult = null;
    this.enchantingResult = null;
    this.craftingComplete = false;

    this.render();
  }

  _onRerollFlaw(event) {
    event.preventDefault();

    if (!game.user.isGM) {
      ui.notifications.error("Only the GM can reroll flaws.");
      return;
    }

    const flawItem = event.currentTarget.closest('.flaw-item');
    const index = parseInt(flawItem.dataset.flawIndex);

    const allFlaws = this._getAllFlawsWithSource();
    const flawData = allFlaws[index];

    if (!flawData) return;

    const existingIds = new Set();
    allFlaws.forEach(f => {
      if (f.id !== flawData.id) existingIds.add(f.id);
    });

    const newFlaw = rollFlaw(this.selectedItemType, existingIds);

    if (!newFlaw) {
      ui.notifications.warn("Could not reroll flaw - no valid replacement found.");
      return;
    }

    if (flawData.source === "creation" && this.creationResult?.flaws) {
      this.creationResult.flaws[flawData.sourceIndex] = newFlaw;
    } else if (flawData.source === "enchanting" && this.enchantingResult?.flaws) {
      this.enchantingResult.flaws[flawData.sourceIndex] = newFlaw;
    }

    ui.notifications.info(`Rerolled ${flawData.name} → ${newFlaw.name} (d20: ${newFlaw.roll})`);
    this.render();
  }

  _onRemoveFlaw(event) {
    event.preventDefault();

    if (!game.user.isGM) {
      ui.notifications.error("Only the GM can remove flaws.");
      return;
    }

    const flawItem = event.currentTarget.closest('.flaw-item');
    const index = parseInt(flawItem.dataset.flawIndex);

    const allFlaws = this._getAllFlawsWithSource();
    const flawData = allFlaws[index];

    if (!flawData) return;

    if (flawData.source === "creation" && this.creationResult?.flaws) {
      this.creationResult.flaws.splice(flawData.sourceIndex, 1);
    } else if (flawData.source === "enchanting" && this.enchantingResult?.flaws) {
      this.enchantingResult.flaws.splice(flawData.sourceIndex, 1);
    }

    ui.notifications.info(`Removed flaw: ${flawData.name}`);
    this.render();
  }

}
