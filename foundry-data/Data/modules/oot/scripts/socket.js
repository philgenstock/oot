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

    // Wild Shape
    _socket.register("wildShapeTransform", _gmWildShapeTransform);
    _socket.register("revertWildShape", _gmRevertWildShape);
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

async function _gmWildShapeTransform({ actorUuid, beastUuid }) {
  const actor = await fromUuid(actorUuid);
  if (!actor) throw new Error("Actor not found");

  const beast = await fromUuid(beastUuid);
  if (!beast) throw new Error("Beast not found in compendium");

  // dnd5e 3.3+ changed transformInto to (target, settings, options)
  // where settings must be a DataModel. Older versions used (target, options).
  const isNewAPI = foundry.utils.isNewerVersion(game.system.version, "3.2.9");
  if (isNewAPI) {
    await actor.transformInto(beast, undefined, { wildShape: true });
  } else {
    await actor.transformInto(beast, { wildShape: true });
  }
}

export async function requestWildShape(actorUuid, beastUuid) {
  if (game.user.isGM) {
    await _gmWildShapeTransform({ actorUuid, beastUuid });
  } else {
    if (!game.users.activeGM) throw new Error("No GM is currently online.");
    await _socket.executeAsGM("wildShapeTransform", { actorUuid, beastUuid });
  }
}

async function _gmRevertWildShape({ actorUuid }) {
  const actor = await fromUuid(actorUuid);
  if (!actor) throw new Error("Actor not found");
  await actor.revertOriginalForm();
}

export async function requestRevertWildShape(actorUuid) {
  if (game.user.isGM) {
    await _gmRevertWildShape({ actorUuid });
  } else {
    if (!game.users.activeGM) throw new Error("No GM is currently online.");
    await _socket.executeAsGM("revertWildShape", { actorUuid });
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
