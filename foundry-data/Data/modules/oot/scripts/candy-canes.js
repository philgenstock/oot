// Candyland, cotton candy spinnery: falling candy canes follow the player characters.
//
// Rule: wherever a player character ends their turn, a cane falls there at the end of their NEXT turn
// (small radius). A fallen cane stays as impassable terrain.
//
// Active on any scene with the flag `flags.oot.candyCanes` (an object, may be empty):
//   { caneImg: "path/to/cane.png", radiusFt: 5 }
// At the end of a character's turn (forward steps only, active GM only):
//   1. the marker placed for them last round falls: it becomes impassable terrain,
//      four movement-only walls around the square plus a cane tile;
//   2. a new marker (red circle region, visible to everyone) is placed on the square they ended on.
// Nothing is posted to chat: the DM calls the saves for whoever stands in the marker.
// game.oot.candyCanesReset() removes all markers, canes and cane tiles from the current scene.

const KEY = "candyCanes";
const isPrimaryGM = () => !!game.users.activeGM?.isSelf;
const ours = doc => doc.flags?.oot?.[KEY];

function squareOf(tokenDoc) {
  const g = tokenDoc.parent.grid.size;
  const cx = tokenDoc.x + (tokenDoc.width * g) / 2;
  const cy = tokenDoc.y + (tokenDoc.height * g) / 2;
  return { x: Math.floor(cx / g) * g, y: Math.floor(cy / g) * g, g };
}

async function placeMarker(scene, combatant, round, cfg) {
  const sq = squareOf(combatant.token);
  const radius = ((cfg.radiusFt ?? 5) / scene.grid.distance) * sq.g;
  await scene.createEmbeddedDocuments("Region", [{
    name: `Zuckerstock über ${combatant.name}`,
    color: "#c0304a",
    visibility: CONST.REGION_VISIBILITY.ALWAYS,
    shapes: [{ type: "circle", x: sq.x + sq.g / 2, y: sq.y + sq.g / 2, radius }],
    flags: { oot: { [KEY]: { marker: true, combatantId: combatant.id, round, level: combatant.token.level } } }
  }]);
}

async function dropCane(scene, marker, cfg) {
  const { x, y } = marker.shapes[0];
  const g = scene.grid.size;

  // the cane blocks the square it lands on: four movement-only walls (sight and light pass).
  // A region "restriction" does not block anything in v14, it only clips the region to walls.
  const x0 = Math.floor(x / g) * g, y0 = Math.floor(y / g) * g;
  const level = ours(marker).level ?? scene.initialLevel?.id;
  const NONE = CONST.EDGE_SENSE_TYPES.NONE;
  const corners = [[x0, y0], [x0 + g, y0], [x0 + g, y0 + g], [x0, y0 + g]];
  await scene.createEmbeddedDocuments("Wall", corners.map((p, i) => ({
    c: [...p, ...corners[(i + 1) % 4]],
    move: CONST.WALL_MOVEMENT_TYPES.NORMAL, sight: NONE, light: NONE, sound: NONE,
    levels: level ? [level] : [],
    flags: { oot: { [KEY]: { cane: true } } }
  })));
  if (cfg.caneImg) {
    await scene.createEmbeddedDocuments("Tile", [{
      texture: { src: cfg.caneImg },
      x: x0 + g / 2, y: y0 + g / 2,                       // v14: tile x/y is its centre (anchor 0.5)
      width: Math.round(g * 1.2), height: Math.round(g * 1.2),
      rotation: Math.floor(Math.random() * 360),
      flags: { oot: { [KEY]: { cane: true } } }
    }]);
  }
  await marker.delete();
}

async function onTurnChange(combat, previous, current) {
  if (!isPrimaryGM() || !previous?.combatantId || !current) return;
  // only when the tracker moves forward, not when the GM steps back
  if (current.round < previous.round || (current.round === previous.round && current.turn <= previous.turn)) return;

  const combatant = combat.combatants.get(previous.combatantId);
  const scene = combatant?.token?.parent;
  const cfg = scene?.getFlag("oot", KEY);
  if (!cfg || combatant.actor?.type !== "character") return;

  const due = scene.regions.filter(r => ours(r)?.marker
    && ours(r).combatantId === combatant.id && ours(r).round < previous.round);
  for (const marker of due) await dropCane(scene, marker, cfg);
  await placeMarker(scene, combatant, previous.round, cfg);
}

async function reset() {
  const scene = canvas.scene;
  if (!game.user.isGM || !scene) return;
  const ids = coll => coll.filter(ours).map(d => d.id);
  await scene.deleteEmbeddedDocuments("Region", ids(scene.regions));
  await scene.deleteEmbeddedDocuments("Tile", ids(scene.tiles));
  await scene.deleteEmbeddedDocuments("Wall", ids(scene.walls));
  ui.notifications.info("Zuckerstöcke entfernt.");
}

export function initCandyCanes() {
  Hooks.on("combatTurnChange", onTurnChange);
  Hooks.once("ready", () => { game.oot.candyCanesReset = reset; });
}
