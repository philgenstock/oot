import {
  setPartyInventorySocket,
  _gmAddItem,
  _gmRemoveItem,
  _gmUpdateItem,
  _gmRemoveFromParty
} from './party-inventory-data.js';

let _socket = null;

export function registerSocket() {
  console.debug("OOT", "registering sockets");
  Hooks.once("socketlib.ready", () => {
    _socket = socketlib.registerModule("oot");
    setPartyInventorySocket(_socket);

    // Party inventory
    _socket.register("addItem", _gmAddItem);
    _socket.register("removeItem", _gmRemoveItem);
    _socket.register("updateItem", ({ itemId, updates }) => _gmUpdateItem(itemId, updates));
    _socket.register("removeFromParty", _gmRemoveFromParty);
    _socket.register("notifyChanged", (payload) => {
      Hooks.callAll("oot.partyInventoryChanged", payload);
    });

    // Stairs
    _socket.register("teleportToken", _gmTeleportToken);
    _socket.register("switchScene", ({ userId, destSceneId }) => {
      if (userId !== game.user.id) return;
      game.scenes.get(destSceneId)?.view();
    });
  });
}

export async function requestTeleport(payload) {
  const fullPayload = { ...payload, requestingUserId: game.user.id };
  if (game.user.isGM) {
    await _gmTeleportToken(fullPayload);
  } else {
    await _socket.executeAsGM("teleportToken", fullPayload);
  }
}

async function _gmTeleportToken({ tokenId, srcSceneId, destSceneId, destX, destY, requestingUserId }) {
  const srcScene = game.scenes.get(srcSceneId);
  const tokenDoc = srcScene?.tokens.get(tokenId);
  if (!tokenDoc) {
    console.warn("OOT | Teleport: token not found", tokenId);
    return;
  }

  if (srcSceneId === destSceneId) {
    await tokenDoc.update({ x: destX, y: destY });
  } else {
    const destScene = game.scenes.get(destSceneId);
    if (!destScene) {
      console.warn("OOT | Teleport: destination scene not found", destSceneId);
      return;
    }

    const tokenData = tokenDoc.toObject();
    tokenData.x = destX;
    tokenData.y = destY;
    delete tokenData._id;

    await destScene.createEmbeddedDocuments("Token", [tokenData], { isUndo: true });
    await tokenDoc.delete({ isUndo: true });

    // Pull the requesting user's view to the destination scene
    await _socket.executeForEveryone("switchScene", { userId: requestingUserId, destSceneId });
  }
}
