const PARTY_INVENTORY_SETTING_KEY = "partyInventoryData";

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

export async function addItemToPartyInventory(itemData) {
  const items = getPartyInventoryItems();

  const partyItem = {
    id: foundry.utils.randomID(),
    name: itemData.name,
    img: itemData.img,
    type: itemData.type,
    system: foundry.utils.deepClone(itemData.system),
    flags: foundry.utils.deepClone(itemData.flags || {}),
    quantity: itemData.system?.quantity || 1,
    addedBy: game.user.name,
    addedAt: Date.now()
  };

  items.push(partyItem);

  await game.settings.set("oot", PARTY_INVENTORY_SETTING_KEY, { items });

  Hooks.callAll("oot.partyInventoryChanged", { action: "add", item: partyItem });

  return partyItem;
}

export async function removeItemFromPartyInventory(itemId) {
  const items = getPartyInventoryItems();
  const index = items.findIndex(i => i.id === itemId);

  if (index === -1) return null;

  const [removedItem] = items.splice(index, 1);

  await game.settings.set("oot", PARTY_INVENTORY_SETTING_KEY, { items });

  Hooks.callAll("oot.partyInventoryChanged", { action: "remove", item: removedItem });

  return removedItem;
}

export async function updatePartyInventoryItem(itemId, updates) {
  const items = getPartyInventoryItems();
  const item = items.find(i => i.id === itemId);

  if (!item) return null;

  Object.assign(item, updates);

  await game.settings.set("oot", PARTY_INVENTORY_SETTING_KEY, { items });

  Hooks.callAll("oot.partyInventoryChanged", { action: "update", item });

  return item;
}

export async function clearPartyInventory() {
  if (!game.user.isGM) {
    ui.notifications.error("Only the GM can clear the party inventory.");
    return;
  }

  await game.settings.set("oot", PARTY_INVENTORY_SETTING_KEY, { items: [] });

  Hooks.callAll("oot.partyInventoryChanged", { action: "clear" });
}

export async function transferToPartyInventory(actor, itemId, quantity = 1) {
  const item = actor.items.get(itemId);
  if (!item) {
    ui.notifications.error("Item not found in character inventory.");
    return null;
  }

  const itemData = item.toObject();
  const currentQuantity = itemData.system?.quantity || 1;

  if (quantity >= currentQuantity) {
    await item.delete();
    itemData.system.quantity = currentQuantity;
  } else {
    await item.update({ "system.quantity": currentQuantity - quantity });
    itemData.system.quantity = quantity;
  }

  return await addItemToPartyInventory(itemData);
}

export async function transferFromPartyInventory(partyItemId, actor, quantity = 1) {
  const items = getPartyInventoryItems();
  const partyItem = items.find(i => i.id === partyItemId);

  if (!partyItem) {
    ui.notifications.error("Item not found in party inventory.");
    return null;
  }

  const currentQuantity = partyItem.quantity || partyItem.system?.quantity || 1;

  const itemData = {
    name: partyItem.name,
    img: partyItem.img,
    type: partyItem.type,
    system: foundry.utils.deepClone(partyItem.system),
    flags: foundry.utils.deepClone(partyItem.flags || {})
  };

  if (quantity >= currentQuantity) {
    await removeItemFromPartyInventory(partyItemId);
    itemData.system.quantity = currentQuantity;
  } else {
    await updatePartyInventoryItem(partyItemId, {
      quantity: currentQuantity - quantity,
      "system.quantity": currentQuantity - quantity
    });
    itemData.system.quantity = quantity;
  }

  const createdItems = await actor.createEmbeddedDocuments("Item", [itemData]);
  return createdItems[0];
}
