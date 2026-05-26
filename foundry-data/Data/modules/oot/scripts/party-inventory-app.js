import {
  getPartyInventoryItems,
  transferToPartyInventory,
  transferFromPartyInventory,
  addItemToPartyInventory,
  transferToVigilInventory,
  transferFromVigilInventory,
  VIGIL_ACTOR_NAME
} from './party-inventory-data.js';

export class PartyInventoryApplication extends Application {
  constructor(options = {}) {
    super(options);
    this._onPartyInventoryChanged = this._onPartyInventoryChanged.bind(this);
    this._activePartyTab = "potions";
    this._transferring = false;
    this._vigilMode = false;
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "oot-party-inventory",
      title: "Party Inventory",
      template: "modules/oot/templates/party-inventory.hbs",
      classes: ["oot-party-inventory-window"],
      width: 500,
      height: 600,
      resizable: true,
      scrollY: [".party-items-list", ".character-items-list", ".party-tab-pane"]
    });
  }

  get currentActor() {
    return game.user.character;
  }

  getData() {
    const actor = this.currentActor;
    const characterItems = actor ? this._getCharacterItems(actor) : [];

    const rawItems = this._vigilMode
      ? this._getVigilItems()
      : getPartyInventoryItems();

    const partyCategories = { potions: [], scrolls: [], weapons: [], misc: [] };
    for (const item of rawItems) {
      partyCategories[this._categorizePartyItem(item)].push(item);
    }

    return {
      actor,
      hasActor: !!actor,
      partyCategories,
      activePartyTab: this._activePartyTab,
      characterItems,
      hasCharacterItems: characterItems.length > 0,
      isGM: game.user.isGM,
      vigilMode: this._vigilMode,
      vigilActorName: VIGIL_ACTOR_NAME
    };
  }

  _getVigilItems() {
    const vigilActor = game.actors.getName(VIGIL_ACTOR_NAME);
    if (!vigilActor) return [];
    const validTypes = ["weapon", "equipment", "consumable", "tool", "loot", "container"];
    return vigilActor.items
      .filter(i => validTypes.includes(i.type))
      .map(i => ({
        id: i.id,
        name: i.name,
        img: i.img,
        type: i.type,
        quantity: i.system?.quantity || 1,
        system: i.system,
        flags: i.flags ?? {}
      }));
  }

  _categorizePartyItem(item) {
    const name = item.name.toLowerCase();
    if (item.type === "weapon") return "weapons";
    if (item.type === "consumable") {
      const subtype = item.system?.type?.value;
      if (subtype === "potion" || name.includes("potion")) return "potions";
      if (subtype === "scroll" || name.includes("scroll")) return "scrolls";
    }
    return "misc";
  }

  _getCharacterItems(actor) {
    const validTypes = ["weapon", "equipment", "consumable", "tool", "loot", "container"];

    return actor.items
      .filter(i => validTypes.includes(i.type))
      .map(item => ({
        id: item.id,
        uuid: item.uuid,
        name: item.name,
        img: item.img,
        type: item.type,
        quantity: item.system?.quantity || 1,
        weight: item.system?.weight || 0
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  activateListeners(html) {
    super.activateListeners(html);

    Hooks.on("oot.partyInventoryChanged", this._onPartyInventoryChanged);

    const partyDropZone = html.find('.party-inventory-section')[0];
    if (partyDropZone) {
      partyDropZone.addEventListener('dragover', this._onDragOver.bind(this));
      partyDropZone.addEventListener('drop', this._onDropToParty.bind(this));
    }

    const characterDropZone = html.find('.character-inventory-section')[0];
    if (characterDropZone) {
      characterDropZone.addEventListener('dragover', this._onDragOver.bind(this));
      characterDropZone.addEventListener('drop', this._onDropToCharacter.bind(this));
    }

    html.find('.party-item').each((i, el) => {
      el.setAttribute('draggable', true);
      el.addEventListener('dragstart', this._onDragStartPartyItem.bind(this));
    });

    html.find('.character-item').each((i, el) => {
      el.setAttribute('draggable', true);
      el.addEventListener('dragstart', this._onDragStartCharacterItem.bind(this));
    });

    html.find('.party-tab-btn').on('click', (event) => {
      const tab = event.currentTarget.dataset.tab;
      this._activePartyTab = tab;
      html.find('.party-tab-btn').removeClass('active');
      $(event.currentTarget).addClass('active');
      html.find('.party-tab-pane').hide();
      html.find(`.party-tab-pane[data-tab="${tab}"]`).show();
    });

    html.find('.item-to-party-qty').on('click', this._onMoveQtyToParty.bind(this));
    html.find('.item-to-party-all').on('click', this._onMoveAllToParty.bind(this));
    html.find('.item-to-character-qty').on('click', this._onMoveQtyToCharacter.bind(this));
    html.find('.item-to-character-all').on('click', this._onMoveAllToCharacter.bind(this));

    html.find('.party-item').on('mouseenter', async (event) => {
      const itemId = event.currentTarget.dataset.itemId;
      const itemData = getPartyInventoryItems().find(i => i.id === itemId);
      if (!itemData) return;
      game.tooltip.activate(event.currentTarget, { cssClass: "oot-item-tooltip", direction: "RIGHT" });
      game.tooltip.tooltip.innerHTML = await this._buildItemTooltip(itemData);
    }).on('mouseleave', () => game.tooltip.deactivate());

    html.find('.character-item').on('mouseenter', async (event) => {
      const itemId = event.currentTarget.dataset.itemId;
      const itemData = this.currentActor?.items.get(itemId)?.toObject();
      if (!itemData) return;
      game.tooltip.activate(event.currentTarget, { cssClass: "oot-item-tooltip", direction: "LEFT" });
      game.tooltip.tooltip.innerHTML = await this._buildItemTooltip(itemData);
    }).on('mouseleave', () => game.tooltip.deactivate());

    html.find('.vigil-toggle').on('click', () => {
      this._vigilMode = !this._vigilMode;
      this.render(false);
    });

    html.find('.quick-add-item').on('click', this._onQuickAddItem.bind(this));
  }

  close(options) {
    Hooks.off("oot.partyInventoryChanged", this._onPartyInventoryChanged);
    return super.close(options);
  }

  _onPartyInventoryChanged(data) {
    this.render(false);
  }

  _onDragOver(event) {
    event.preventDefault();
    event.currentTarget.classList.add('drag-hover');
  }

  _onDragStartPartyItem(event) {
    const itemId = event.currentTarget.dataset.itemId;
    event.dataTransfer.setData('text/plain', JSON.stringify({
      type: "PartyInventoryItem",
      itemId: itemId
    }));
  }

  _onDragStartCharacterItem(event) {
    const itemId = event.currentTarget.dataset.itemId;
    const actor = this.currentActor;
    if (!actor) return;

    const item = actor.items.get(itemId);
    if (!item) return;

    event.dataTransfer.setData('text/plain', JSON.stringify({
      type: "Item",
      uuid: item.uuid
    }));
  }

  async _onDropToParty(event) {
    event.preventDefault();
    event.currentTarget.classList.remove('drag-hover');
    if (this._transferring) return;

    let data;
    try {
      data = JSON.parse(event.dataTransfer.getData('text/plain'));
    } catch (e) {
      return;
    }

    if (data.type === "Item" && data.uuid) {
      const item = await fromUuid(data.uuid);
      if (!item) return;

      const actor = item.parent;
      if (!actor || !(actor instanceof Actor)) {
        ui.notifications.warn("Can only transfer items from character inventories to the party inventory.");
        return;
      }

      await this._transferToInventory(actor, item.id, null);
      ui.notifications.info(`Moved ${item.name} to ${this._vigilMode ? VIGIL_ACTOR_NAME : "party inventory"}.`);
      this.render(false);
    }
  }

  async _onDropToCharacter(event) {
    event.preventDefault();
    event.currentTarget.classList.remove('drag-hover');
    if (this._transferring) return;

    const actor = this.currentActor;
    if (!actor) {
      ui.notifications.error("You need an assigned character to receive items.");
      return;
    }

    let data;
    try {
      data = JSON.parse(event.dataTransfer.getData('text/plain'));
    } catch (e) {
      return;
    }

    if (data.type === "PartyInventoryItem" && data.itemId) {
      await this._transferFromInventory(data.itemId, actor, null);
      ui.notifications.info(`Received item from ${this._vigilMode ? VIGIL_ACTOR_NAME : "party inventory"}.`);
      this.render(false);
    }
  }

  async _transferToInventory(actor, itemId, qty) {
    if (this._vigilMode) return transferToVigilInventory(actor, itemId, qty);
    return transferToPartyInventory(actor, itemId, qty);
  }

  async _transferFromInventory(itemId, actor, qty) {
    if (this._vigilMode) return transferFromVigilInventory(itemId, actor, qty);
    return transferFromPartyInventory(itemId, actor, qty);
  }

  async _withTransferLock(event, fn) {
    if (this._transferring) return;
    this._transferring = true;

    const icon = event.currentTarget.querySelector('i');
    const savedClass = icon?.className;
    if (icon) icon.className = 'fas fa-spinner fa-spin';
    this.element.find('.item-actions button, .item-actions input').prop('disabled', true);

    try {
      await fn();
    } catch (e) {
      ui.notifications.error(`Transfer failed: ${e.message}`);
    } finally {
      this._transferring = false;
      if (icon && savedClass) icon.className = savedClass;
      this.element.find('.item-actions button, .item-actions input').prop('disabled', false);
    }
  }

  async _onMoveQtyToParty(event) {
    event.preventDefault();
    const row = event.currentTarget.closest('.character-item');
    const itemId = row.dataset.itemId;
    const qty = Math.max(1, parseInt(row.querySelector('.item-share-qty')?.value) || 1);
    await this._withTransferLock(event, async () => {
      const actor = this.currentActor;
      if (!actor) return;
      const item = actor.items.get(itemId);
      if (!item) return;
      await this._transferToInventory(actor, itemId, qty);
      ui.notifications.info(`Moved ${qty} ${item.name} to ${this._vigilMode ? VIGIL_ACTOR_NAME : "party inventory"}.`);
      this.render(false);
    });
  }

  async _onMoveAllToParty(event) {
    event.preventDefault();
    const itemId = event.currentTarget.closest('.character-item').dataset.itemId;
    await this._withTransferLock(event, async () => {
      const actor = this.currentActor;
      if (!actor) return;
      const item = actor.items.get(itemId);
      if (!item) return;
      await this._transferToInventory(actor, itemId, null);
      ui.notifications.info(`Moved ${item.name} to ${this._vigilMode ? VIGIL_ACTOR_NAME : "party inventory"}.`);
      this.render(false);
    });
  }

  async _onMoveQtyToCharacter(event) {
    event.preventDefault();
    const row = event.currentTarget.closest('.party-item');
    const itemId = row.dataset.itemId;
    const qty = Math.max(1, parseInt(row.querySelector('.item-take-qty')?.value) || 1);
    await this._withTransferLock(event, async () => {
      const actor = this.currentActor;
      if (!actor) { ui.notifications.error("You need an assigned character to receive items."); return; }
      const item = await this._transferFromInventory(itemId, actor, qty);
      if (item) ui.notifications.info(`Received ${qty} ${item.name} from ${this._vigilMode ? VIGIL_ACTOR_NAME : "party inventory"}.`);
      this.render(false);
    });
  }

  async _onMoveAllToCharacter(event) {
    event.preventDefault();
    const itemId = event.currentTarget.closest('.party-item').dataset.itemId;
    await this._withTransferLock(event, async () => {
      const actor = this.currentActor;
      if (!actor) { ui.notifications.error("You need an assigned character to receive items."); return; }
      const item = await this._transferFromInventory(itemId, actor, null);
      if (item) ui.notifications.info(`Received ${item.name} from ${this._vigilMode ? VIGIL_ACTOR_NAME : "party inventory"}.`);
      this.render(false);
    });
  }

  async _onQuickAddItem(event) {
    event.preventDefault();
    if (this._transferring) return;
    const itemKey = event.currentTarget.dataset.item;
    const itemData = await this._getQuickAddItemData(itemKey);

    if (!itemData) {
      ui.notifications.error("Item not found in compendiums.");
      return;
    }

    await addItemToPartyInventory(itemData);
    ui.notifications.info(`Added ${itemData.name} to party inventory.`);
    this.render(false);
  }

  async _buildItemTooltip(itemData) {
    const typeLabel = game.i18n.localize(CONFIG.Item.typeLabels?.[itemData.type] ?? itemData.type);
    const quantity = itemData.quantity ?? itemData.system?.quantity ?? 1;
    const rawDescription = (itemData.system?.description?.value ?? "")
      .replace(/@variantrule\[([^\[\]]*(?:\[[^\[\]]*\][^\[\]]*)*)\]/g, (_, content) => {
        const parts = content.split("|");
        return parts[parts.length - 1];
      });
    const description = rawDescription ? await TextEditor.enrichHTML(rawDescription, { async: true }) : "";

    return `
      <div class="oot-tooltip-header">
        <img src="${itemData.img}" width="36" height="36" />
        <div>
          <div class="oot-tooltip-name">${itemData.name}</div>
          <div class="oot-tooltip-meta">${typeLabel}${quantity > 1 ? ` &middot; x${quantity}` : ""}</div>
        </div>
      </div>
      ${description ? `<div class="oot-tooltip-description">${description}</div>` : ""}
    `;
  }

  async _getQuickAddItemData(itemKey) {
    const searchTerms = {
      "rations": ["rations"],
      "potion-healing": ["potion of healing"],
      "potion-growth": ["potion of growth"]
    };

    const terms = searchTerms[itemKey];
    if (!terms) return null;

    // Search in world items first (case-insensitive partial match)
    let item = game.items.find(i =>
      terms.some(term => i.name.toLowerCase().includes(term))
    );

    // Search in compendiums if not found in world
    if (!item) {
      for (const pack of game.packs.filter(p => p.documentName === "Item")) {
        const index = await pack.getIndex();
        const entry = index.find(i =>
          terms.some(term => i.name.toLowerCase().includes(term))
        );
        if (entry) {
          item = await pack.getDocument(entry._id);
          break;
        }
      }
    }

    if (!item) return null;

    const itemData = item.toObject();
    itemData.system.quantity = 1;
    return itemData;
  }
}
