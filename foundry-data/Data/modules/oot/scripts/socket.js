import {
  setPartyInventorySocket,
  _gmAddItem,
  _gmRemoveItem,
  _gmUpdateItem,
  _gmRemoveFromParty,
  _gmVigilGiveItem,
  _gmVigilTakeItem
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

    // Vigil Custodis inventory
    _socket.register("vigilGiveItem", _gmVigilGiveItem);
    _socket.register("vigilTakeItem", _gmVigilTakeItem);

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

async function _gmWildShapeTransform({ actorUuid, beastUuid, magicWeapons = false, radiantDamage = false }) {
  console.log("OOT | WildShape | _gmWildShapeTransform called", { actorUuid, beastUuid, magicWeapons, radiantDamage });

  const actor = await fromUuid(actorUuid);
  if (!actor) { console.error("OOT | WildShape | Actor not found for uuid", actorUuid); throw new Error("Actor not found"); }
  console.log("OOT | WildShape | Actor resolved:", actor.name, actor.id);

  const beast = await fromUuid(beastUuid);
  if (!beast) { console.error("OOT | WildShape | Beast not found for uuid", beastUuid); throw new Error("Beast not found in compendium"); }

  const wisMod = actor.system?.abilities?.wis?.mod ?? 0;
  const druidLevel = actor.classes?.druid?.system?.levels ?? 0;
  const actorId = actor.id;


  const isNewAPI = foundry.utils.isNewerVersion(game.system.version, "3.2.9");

  let transformResult;
  try {
    if (isNewAPI) {
      transformResult = await actor.transformInto(beast, undefined, { wildShape: true });
    } else {
      transformResult = await actor.transformInto(beast, { wildShape: true });
    }
  } catch (err) {
    console.error("OOT | WildShape | transformInto threw:", err);
    throw err;
  }

  console.log("OOT | WildShape | transformInto result:", transformResult);

  // Prefer the actor returned by transformInto; fall back to searching game.actors
  let newBeastActor = transformResult instanceof Actor ? transformResult : null;
  if (!newBeastActor) {
    newBeastActor = game.actors.find(a => a.getFlag("dnd5e", "originalActor") === actorId);
  }
  console.log("OOT | WildShape | Post-transform beastActor:", newBeastActor ? newBeastActor.name : "STILL NOT FOUND");
  if (!newBeastActor) {
    console.error("OOT | WildShape | Could not locate beast actor after transform, aborting stat overrides.");
    return;
  }

  const updates = {};

  const druidAC = 13 + wisMod;
  console.log("OOT | WildShape | druidAC:", druidAC, "beastAC:", newBeastActor.system.attributes.ac.value);
  if (druidAC > newBeastActor.system.attributes.ac.value) {
    updates["system.attributes.ac.flat"] = druidAC;
    updates["system.attributes.ac.calc"] = "flat";
  }

  if (druidLevel > 0) {
    updates["system.attributes.hp.temp"] = 3 * druidLevel;
  }

  for (const key of ["int", "wis", "cha"]) {
    const druidScore = actor.system.abilities[key]?.value ?? 10;
    const beastScore = newBeastActor.system.abilities[key]?.value ?? 10;
    updates[`system.abilities.${key}.value`] = Math.max(druidScore, beastScore);
  }

  if (actor.system.attributes.prof) {
    updates["system.attributes.prof"] = actor.system.attributes.prof;
  }

  for (const [key, ability] of Object.entries(actor.system.abilities ?? {})) {
    const druidProf = ability.proficient ?? 0;
    const beastProf = newBeastActor.system.abilities[key]?.proficient ?? 0;
    if (druidProf > beastProf) {
      updates[`system.abilities.${key}.proficient`] = druidProf;
    }
  }

  for (const [key, skill] of Object.entries(actor.system.skills ?? {})) {
    const druidProf = skill.value ?? 0;
    const beastProf = newBeastActor.system.skills[key]?.value ?? 0;
    if (druidProf > beastProf) {
      updates[`system.skills.${key}.value`] = druidProf;
    }
  }

  console.log("OOT | WildShape | Applying post-transform updates:", updates);
  if (Object.keys(updates).length) {
    try {
      await newBeastActor.update(updates);
    } catch (err) {
      console.error("OOT | WildShape | update() failed:", err);
      throw err;
    }
  }

  if (magicWeapons) {
    console.log("OOT | WildShape | Applying magic weapons (+1 atk/dmg) via global bonuses");
    await newBeastActor.update({
      "system.bonuses.mwak.attack": "1",
      "system.bonuses.mwak.damage": "1",
      "system.bonuses.rwak.attack": "1",
      "system.bonuses.rwak.damage": "1",
    });
  }

  if (radiantDamage) {
    const variants = newBeastActor.items
      .filter(_isAttackItem)
      .map(_makeRadiantVariant);
    console.log("OOT | WildShape | Creating radiant attack variants:", variants.map(v => v.name));
    if (variants.length) await newBeastActor.createEmbeddedDocuments("Item", variants);
  }

  console.log("OOT | WildShape | Done.");
}

function _isAttackItem(item) {
  // legacy schema (dnd5e <= 3.x)
  if (["mwak", "rwak", "msak", "rsak"].includes(item.system?.actionType)) return true;
  // modern schema (dnd5e >= 4.x): items carry activities
  for (const activity of item.system?.activities ?? []) {
    if (activity.type === "attack") return true;
  }
  return false;
}

function _makeRadiantVariant(item) {
  const data = item.toObject();
  delete data._id;
  data.name = `${data.name} (R)`;

  // legacy schema: parts are [formula, type] tuples
  if (Array.isArray(data.system?.damage?.parts)) {
    data.system.damage.parts = data.system.damage.parts.map(([formula]) => [formula, "radiant"]);
  }

  // modern schema: base/versatile damage on the item, extra parts on activities
  if (data.system?.damage?.base?.types) data.system.damage.base.types = ["radiant"];
  if (data.system?.damage?.versatile?.types?.length) data.system.damage.versatile.types = ["radiant"];
  for (const activity of Object.values(data.system?.activities ?? {})) {
    for (const part of activity.damage?.parts ?? []) {
      if (part.types) part.types = ["radiant"];
    }
  }

  return data;
}

export async function requestWildShape(actorUuid, beastUuid, magicWeapons = false, radiantDamage = false) {
  if (game.user.isGM) {
    await _gmWildShapeTransform({ actorUuid, beastUuid, magicWeapons, radiantDamage });
  } else {
    if (!game.users.activeGM) throw new Error("No GM is currently online.");
    await _socket.executeAsGM("wildShapeTransform", { actorUuid, beastUuid, magicWeapons, radiantDamage });
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
