import {
  getPartyInventoryItems,
  transferToPartyInventory,
  transferFromPartyInventory
} from './party-inventory-data.js';

export class PartyInventoryApplication extends Application {
  constructor(options = {}) {
    super(options);
    this._onPartyInventoryChanged = this._onPartyInventoryChanged.bind(this);
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
      scrollY: [".party-items-list", ".character-items-list"]
    });
  }

  get currentActor() {
    return game.user.character;
  }

  getData(options = {}) {
    const actor = this.currentActor;
    const partyItems = getPartyInventoryItems();
    const characterItems = actor ? this._getCharacterItems(actor) : [];

    return {
      actor: actor,
      hasActor: !!actor,
      partyItems: partyItems,
      characterItems: characterItems,
      hasPartyItems: partyItems.length > 0,
      hasCharacterItems: characterItems.length > 0
    };
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

    html.find('.item-to-party-one').on('click', this._onMoveOneToParty.bind(this));
    html.find('.item-to-party-all').on('click', this._onMoveAllToParty.bind(this));
    html.find('.item-to-character-one').on('click', this._onMoveOneToCharacter.bind(this));
    html.find('.item-to-character-all').on('click', this._onMoveAllToCharacter.bind(this));
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

      await transferToPartyInventory(actor, item.id);
      ui.notifications.info(`Moved ${item.name} to party inventory.`);
      this.render(false);
    }
  }

  async _onDropToCharacter(event) {
    event.preventDefault();
    event.currentTarget.classList.remove('drag-hover');

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
      await transferFromPartyInventory(data.itemId, actor);
      ui.notifications.info(`Received item from party inventory.`);
      this.render(false);
    }
  }

  async _onMoveOneToParty(event) {
    event.preventDefault();
    const itemId = event.currentTarget.closest('.character-item').dataset.itemId;
    const actor = this.currentActor;

    if (!actor) return;

    const item = actor.items.get(itemId);
    if (!item) return;

    await transferToPartyInventory(actor, itemId, 1);
    ui.notifications.info(`Moved 1 ${item.name} to party inventory.`);
    this.render(false);
  }

  async _onMoveAllToParty(event) {
    event.preventDefault();
    const itemId = event.currentTarget.closest('.character-item').dataset.itemId;
    const actor = this.currentActor;

    if (!actor) return;

    const item = actor.items.get(itemId);
    if (!item) return;

    await transferToPartyInventory(actor, itemId);
    ui.notifications.info(`Moved ${item.name} to party inventory.`);
    this.render(false);
  }

  async _onMoveOneToCharacter(event) {
    event.preventDefault();
    const itemId = event.currentTarget.closest('.party-item').dataset.itemId;
    const actor = this.currentActor;

    if (!actor) {
      ui.notifications.error("You need an assigned character to receive items.");
      return;
    }

    const item = await transferFromPartyInventory(itemId, actor, 1);
    if (item) {
      ui.notifications.info(`Received 1 ${item.name} from party inventory.`);
    }
    this.render(false);
  }

  async _onMoveAllToCharacter(event) {
    event.preventDefault();
    const itemId = event.currentTarget.closest('.party-item').dataset.itemId;
    const actor = this.currentActor;

    if (!actor) {
      ui.notifications.error("You need an assigned character to receive items.");
      return;
    }

    const item = await transferFromPartyInventory(itemId, actor);
    if (item) {
      ui.notifications.info(`Received ${item.name} from party inventory.`);
    }
    this.render(false);
  }
}
