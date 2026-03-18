const PARTY_INVENTORY_SETTING_KEY = "partyInventoryData";

let _socket = null;

export function setPartyInventorySocket(socket) {
  _socket = socket;
}

export function registerPartyInventorySettings() {
  game.settings.register("oot", PARTY_INVENTORY_SETTING_KEY, {
    name: "Party Inventory Data",
    hint: "Stores the party inventory items",
    scope: "world",
    config: false,
    type: Object,
    default: {
      items: []
    }
  });
}

export function getPartyInventoryItems() {
  const data = game.settings.get("oot", PARTY_INVENTORY_SETTING_KEY);
  return data?.items || [];
}

function findStackablePartyItem(itemData) {
  const items = getPartyInventoryItems();
  return items.find(existing =>
    existing.name === itemData.name &&
    existing.type === itemData.type &&
    existing.img === itemData.img
  );
}

function findStackableActorItem(actor, itemData) {
  return actor.items.find(existing =>
    existing.name === itemData.name &&
    existing.type === itemData.type &&
    existing.img === itemData.img
  );
}

function _broadcast(payload) {
  if (_socket) {
    _socket.executeForEveryone("notifyChanged", payload);
  } else {
    Hooks.callAll("oot.partyInventoryChanged", payload);
  }
}

function _requireActiveGM() {
  if (!game.users.activeGM) {
    ui.notifications.warn("A GM must be online to modify the party inventory.");
    return false;
  }
  return true;
}

// --- GM-only implementations (exported for socket registration) ---

export async function _gmAddItem(itemData) {
  const items = getPartyInventoryItems();
  const quantityToAdd = itemData.system?.quantity || 1;
  const existingItem = findStackablePartyItem(itemData);

  if (existingItem) {
    existingItem.quantity = (existingItem.quantity || 1) + quantityToAdd;
    existingItem.system.quantity = existingItem.quantity;
    await game.settings.set("oot", PARTY_INVENTORY_SETTING_KEY, { items });
    _broadcast({ action: "update", item: existingItem });
    return existingItem;
  }

  const partyItem = {
    id: foundry.utils.randomID(),
    name: itemData.name,
    img: itemData.img,
    type: itemData.type,
    system: foundry.utils.deepClone(itemData.system),
    flags: foundry.utils.deepClone(itemData.flags || {}),
    quantity: quantityToAdd,
    addedBy: itemData._userName || game.user.name,
    addedAt: Date.now()
  };

  items.push(partyItem);
  await game.settings.set("oot", PARTY_INVENTORY_SETTING_KEY, { items });
  _broadcast({ action: "add", item: partyItem });
  return partyItem;
}

export async function _gmRemoveItem(itemId) {
  const items = getPartyInventoryItems();
  const index = items.findIndex(i => i.id === itemId);
  if (index === -1) return null;

  const [removedItem] = items.splice(index, 1);
  await game.settings.set("oot", PARTY_INVENTORY_SETTING_KEY, { items });
  _broadcast({ action: "remove", item: removedItem });
  return removedItem;
}

export async function _gmUpdateItem(itemId, updates) {
  const items = getPartyInventoryItems();
  const item = items.find(i => i.id === itemId);
  if (!item) return null;

  Object.assign(item, updates);
  await game.settings.set("oot", PARTY_INVENTORY_SETTING_KEY, { items });
  _broadcast({ action: "update", item });
  return item;
}

export async function _gmRemoveFromParty({ partyItemId, quantity }) {
  const items = getPartyInventoryItems();
  const partyItem = items.find(i => i.id === partyItemId);
  if (!partyItem) return null;

  const currentQuantity = partyItem.quantity || partyItem.system?.quantity || 1;
  const transferQuantity = quantity ?? currentQuantity;

  const itemData = {
    name: partyItem.name,
    img: partyItem.img,
    type: partyItem.type,
    system: foundry.utils.deepClone(partyItem.system),
    flags: foundry.utils.deepClone(partyItem.flags || {})
  };

  if (transferQuantity >= currentQuantity) {
    await _gmRemoveItem(partyItemId);
    itemData.system.quantity = currentQuantity;
  } else {
    const newQuantity = currentQuantity - transferQuantity;
    await _gmUpdateItem(partyItemId, { quantity: newQuantity });
    itemData.system.quantity = transferQuantity;
  }

  return { itemData };
}

export async function addItemToPartyInventory(itemData) {
  const data = { ...itemData, _userName: game.user.name };
  if (game.user.isGM) return _gmAddItem(data);
  if (!_requireActiveGM()) return null;
  return _socket.executeAsGM("addItem", data);
}

export async function removeItemFromPartyInventory(itemId) {
  if (game.user.isGM) return _gmRemoveItem(itemId);
  if (!_requireActiveGM()) return null;
  return _socket.executeAsGM("removeItem", itemId);
}

export async function updatePartyInventoryItem(itemId, updates) {
  if (game.user.isGM) return _gmUpdateItem(itemId, updates);
  if (!_requireActiveGM()) return null;
  return _socket.executeAsGM("updateItem", { itemId, updates });
}

export async function transferToPartyInventory(actor, itemId, quantity = null) {
  const item = actor.items.get(itemId);
  if (!item) {
    ui.notifications.error("Item not found in character inventory.");
    return null;
  }

  const itemData = item.toObject();
  const currentQuantity = itemData.system?.quantity || 1;
  const transferQuantity = quantity ?? currentQuantity;

  if (transferQuantity >= currentQuantity) {
    await item.delete();
    itemData.system.quantity = currentQuantity;
  } else {
    await item.update({ "system.quantity": currentQuantity - transferQuantity });
    itemData.system.quantity = transferQuantity;
  }

  return await addItemToPartyInventory(itemData);
}

export async function transferFromPartyInventory(partyItemId, actor, quantity = null) {
  let result;

  if (game.user.isGM) {
    result = await _gmRemoveFromParty({ partyItemId, quantity });
  } else {
    if (!_requireActiveGM()) return null;
    result = await _socket.executeAsGM("removeFromParty", { partyItemId, quantity });
  }

  if (!result) {
    ui.notifications.error("Item not found in party inventory.");
    return null;
  }

  const { itemData } = result;
  const existingActorItem = findStackableActorItem(actor, itemData);

  if (existingActorItem) {
    const existingQuantity = existingActorItem.system?.quantity || 1;
    await existingActorItem.update({ "system.quantity": existingQuantity + itemData.system.quantity });
    return existingActorItem;
  }

  const createdItems = await actor.createEmbeddedDocuments("Item", [itemData]);
  return createdItems[0];
}
