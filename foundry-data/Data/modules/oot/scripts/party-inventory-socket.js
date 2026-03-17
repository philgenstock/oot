import {
  setPartyInventorySocket,
  _gmAddItem,
  _gmRemoveItem,
  _gmUpdateItem,
  _gmRemoveFromParty
} from './party-inventory-data.js';

export function registerPartyInventorySocket() {
  Hooks.once("socketlib.ready", () => {
    const socket = socketlib.registerModule("oot");
    setPartyInventorySocket(socket);

    socket.register("addItem", _gmAddItem);
    socket.register("removeItem", _gmRemoveItem);
    socket.register("updateItem", ({ itemId, updates }) => _gmUpdateItem(itemId, updates));
    socket.register("removeFromParty", _gmRemoveFromParty);
    socket.register("notifyChanged", (payload) => {
      Hooks.callAll("oot.partyInventoryChanged", payload);
    });
  });
}
