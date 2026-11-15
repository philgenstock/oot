// Candyland, arena: the lair action "Heizplatten" lights one quarter of the floor.
//
// Active on scenes with the flag `flags.oot.heatPlates`. The four glow tiles carry
// `flags.oot.heatPlate` = "nord" | "ost" | "sued" | "west" and start hidden.
// GM tool "Heizplatten" (token controls): pick a quarter, its tile is shown and the others hidden;
// "Aus" hides all. A new combat round switches the plates off by itself (the same lair action
// never comes twice in a row). Nothing is posted to chat: the DM calls the fire damage.

const KEY = "heatPlates";
const QUARTERS = [["nord", "Nord"], ["ost", "Ost"], ["sued", "Süd"], ["west", "West"]];
const isPrimaryGM = () => !!game.users.activeGM?.isSelf;
const active = scene => !!scene?.getFlag("oot", KEY);
const plates = scene => scene.tiles.filter(t => t.getFlag("oot", "heatPlate"));

async function light(scene, quarter) {
  const updates = plates(scene).map(t => ({ _id: t.id, hidden: t.getFlag("oot", "heatPlate") !== quarter }))
    .filter(u => scene.tiles.get(u._id).hidden !== u.hidden);
  if (updates.length) await scene.updateEmbeddedDocuments("Tile", updates);
}

async function controlDialog() {
  const scene = canvas.scene;
  if (!active(scene)) return ui.notifications.warn("Diese Szene hat keine Heizplatten.");
  const lit = plates(scene).find(t => !t.hidden)?.getFlag("oot", "heatPlate");
  const name = QUARTERS.find(([q]) => q === lit)?.[1];
  const choice = await foundry.applications.api.DialogV2.wait({
    window: { title: `Heizplatten · ${name ? `${name} glüht` : "aus"}` },
    buttons: [
      ...QUARTERS.map(([q, label]) => ({ action: q, label, icon: "fa-solid fa-fire" })),
      { action: "off", label: "Aus", icon: "fa-solid fa-snowflake" }
    ],
    rejectClose: false
  });
  if (choice) await light(scene, choice === "off" ? null : choice);
}

async function onTurnChange(combat, previous, current) {
  if (!isPrimaryGM() || !previous || !current || current.round <= previous.round) return;
  const scene = combat.scene;
  if (active(scene)) await light(scene, null);
}

export function initHeatPlates() {
  Hooks.on("combatTurnChange", onTurnChange);
  Hooks.on("getSceneControlButtons", controls => {
    const tools = (controls.tokens || controls.token)?.tools;
    if (!tools) return;
    tools["oot-heat-plates"] = {
      name: "oot-heat-plates",
      title: "Heizplatten",
      icon: "fas fa-fire",
      button: true,
      visible: game.user.isGM && active(canvas.scene),
      onChange: () => controlDialog()
    };
  });
}
