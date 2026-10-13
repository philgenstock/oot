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

    // Vigil Custodis inventory
    _socket.register("vigilGiveItem", _gmVigilGiveItem);
    _socket.register("vigilTakeItem", _gmVigilTakeItem);

    // Wild Shape
    _socket.register("wildShapeTransform", _gmWildShapeTransform);
    _socket.register("revertWildShape", _gmRevertWildShape);
  });
}

// Scene switches leave the previous wild shape's beast actor (and its token)
// behind instead of reverting it, so they'd otherwise pile up in the world
// every time the player wild shapes again. Sweep them before transforming.
async function _cleanupStaleWildShapeActors(actorId) {
  const staleActors = game.actors.filter(a => a.getFlag("dnd5e", "originalActor") === actorId);
  if (!staleActors.length) return;

  console.log("OOT | WildShape | Cleaning up stale beast actors:", staleActors.map(a => a.name));
  const staleIds = new Set(staleActors.map(a => a.id));

  for (const scene of game.scenes) {
    const staleTokens = scene.tokens.filter(t => staleIds.has(t.actorId));
    if (staleTokens.length) await scene.deleteEmbeddedDocuments("Token", staleTokens.map(t => t.id));
  }

  await Actor.deleteDocuments([...staleIds]);
}

async function _gmWildShapeTransform({ actorUuid, beastUuid, magicWeapons = false, radiantDamage = false }) {
  console.log("OOT | WildShape | _gmWildShapeTransform called", { actorUuid, beastUuid, magicWeapons, radiantDamage });

  const actor = await fromUuid(actorUuid);
  if (!actor) { console.error("OOT | WildShape | Actor not found for uuid", actorUuid); throw new Error("Actor not found"); }
  console.log("OOT | WildShape | Actor resolved:", actor.name, actor.id);

  const beast = await fromUuid(beastUuid);
  if (!beast) { console.error("OOT | WildShape | Beast not found for uuid", beastUuid); throw new Error("Beast not found in compendium"); }

  const actorId = actor.id;

  await _cleanupStaleWildShapeActors(actorId);

  // dnd5e's Wild Shape preset implements the 2024 rules: keep HP/HD, Int/Wis/Cha, type and
  // languages; merge save/skill proficiencies (higher modifier wins); AC 13 + Wis and
  // 3x druid level temp HP for Moon druids.
  const { TransformationSetting } = dnd5e.dataModels.settings;
  const settings = new TransformationSetting({
    ...CONFIG.DND5E.transformation.presets.wildshape.settings,
    preset: "wildshape"
  });

  let transformResult;
  try {
    transformResult = await actor.transformInto(beast, settings);
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
      .filter(i => i.type === "weapon" && _isAttackItem(i))
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
