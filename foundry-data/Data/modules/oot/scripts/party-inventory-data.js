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

export async function addItemToPartyInventory(itemData) {
  const items = getPartyInventoryItems();
  const quantityToAdd = itemData.system?.quantity || 1;

  const existingItem = findStackablePartyItem(itemData);

  if (existingItem) {
    existingItem.quantity = (existingItem.quantity || 1) + quantityToAdd;
    existingItem.system.quantity = existingItem.quantity;

    await game.settings.set("oot", PARTY_INVENTORY_SETTING_KEY, { items });
    Hooks.callAll("oot.partyInventoryChanged", { action: "update", item: existingItem });
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
  const items = getPartyInventoryItems();
  const partyItem = items.find(i => i.id === partyItemId);

  if (!partyItem) {
    ui.notifications.error("Item not found in party inventory.");
    return null;
  }

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
    await removeItemFromPartyInventory(partyItemId);
    itemData.system.quantity = currentQuantity;
  } else {
    const newQuantity = currentQuantity - transferQuantity;
    await updatePartyInventoryItem(partyItemId, {
      quantity: newQuantity,
      "system.quantity": newQuantity
    });
    itemData.system.quantity = transferQuantity;
  }

  const existingActorItem = findStackableActorItem(actor, itemData);

  if (existingActorItem) {
    const existingQuantity = existingActorItem.system?.quantity || 1;
    await existingActorItem.update({ "system.quantity": existingQuantity + itemData.system.quantity });
    return existingActorItem;
  }

  const createdItems = await actor.createEmbeddedDocuments("Item", [itemData]);
  return createdItems[0];
}
