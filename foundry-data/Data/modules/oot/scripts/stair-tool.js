const REGION_NAME = "OOT Teleport";
const TELEPORT_BEHAVIOR_TYPE = "teleportToken";

let _pending = null; // { id, sceneId } — first region of a pair placed, waiting for its partner

function _logExistingStairRegions() {
  const regions = canvas.scene.regions.filter(r => r.flags?.oot?.isStairRegion);
  console.log(`OOT | Teleport regions on scene "${canvas.scene.name}": ${regions.length} found`);
  for (const r of regions) {
    const dest = r.behaviors.find(b => b.type === TELEPORT_BEHAVIOR_TYPE)?.system?.destination ?? "none";
    console.log(`OOT |   id=${r.id} destination=${dest}`);
  }
}

function _normalizeRect(a, b) {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(b.x - a.x),
    height: Math.abs(b.y - a.y)
  };
}

async function _createRegion(rect) {
  if (!game.user.isGM) return null;

  const [doc] = await canvas.scene.createEmbeddedDocuments("Region", [{
    name: REGION_NAME,
    shapes: [{ type: "rectangle", x: rect.x, y: rect.y, width: rect.width, height: rect.height }],
    flags: { oot: { isStairRegion: true } },
    behaviors: [{
      type: TELEPORT_BEHAVIOR_TYPE,
      system: { destination: null, choice: true }
    }]
  }]);

  console.log(`OOT | Teleport region placed id=${doc?.id} at (${rect.x}, ${rect.y}) on scene "${canvas.scene.name}"`);
  return doc?.id ?? null;
}

async function _linkRegions(id1, sceneId1, id2, sceneId2) {
  const region1 = game.scenes.get(sceneId1)?.regions.get(id1);
  const region2 = game.scenes.get(sceneId2)?.regions.get(id2);
  if (!region1 || !region2) return;

  const behavior1 = region1.behaviors.find(b => b.type === TELEPORT_BEHAVIOR_TYPE);
  const behavior2 = region2.behaviors.find(b => b.type === TELEPORT_BEHAVIOR_TYPE);
  if (!behavior1 || !behavior2) return;

  await behavior1.update({ "system.destination": region2.uuid });
  await behavior2.update({ "system.destination": region1.uuid });
}

export function initStairInteraction() {
  Hooks.on("canvasTearDown", () => {
    game.oot?.stairController?._reset();
  });

  Hooks.on("canvasReady", () => {
    _logExistingStairRegions();
    game.oot?.stairController?._reactivateIfPending();
  });

  // A stair region's partner lives on its own scene (possibly a different one)
  // and isn't cleaned up automatically, so cascade the delete ourselves.
  Hooks.on("deleteRegion", async (regionDoc, options) => {
    if (!regionDoc.flags?.oot?.isStairRegion) return;
    if (options?.ootCascade) return;
    if (!game.user.isGM) return;

    const destUuid = regionDoc.behaviors?.find(b => b.type === TELEPORT_BEHAVIOR_TYPE)?.system?.destination;
    if (!destUuid) return;

    const pairedRegion = await fromUuid(destUuid);
    if (pairedRegion) await pairedRegion.delete({ ootCascade: true });
  });
}

export class StairController {
  constructor() {
    this._active = false;
    this._dragging = false;
    this._dragStart = null;
    this._preview = null;
    this._onDown = this._onPointerDown.bind(this);
    this._onMove = this._onPointerMove.bind(this);
    this._onUp = this._onPointerUp.bind(this);
  }

  get active() { return this._active; }

  activate() {
    if (this._active) return;
    this._active = true;
    canvas.stage.on("pointerdown", this._onDown);
    ui.notifications.info("Stair mode: drag a rectangle to place a teleport region. Drag a second region (same or a different scene) to pair them.");
  }

  deactivate() {
    if (!this._active) return;
    this._active = false;
    this._cancelDrag();
    canvas?.stage?.off("pointerdown", this._onDown);
    ui.notifications.info("Stair mode deactivated.");
  }

  toggle() {
    this._active ? this.deactivate() : this.activate();
    return this._active;
  }

  _reset() {
    this._active = false;
    this._cancelDrag();
  }

  _reactivateIfPending() {
    if (!_pending) return;
    this._active = true;
    canvas.stage.on("pointerdown", this._onDown);
    const sceneName = game.scenes.get(_pending.sceneId)?.name ?? "unknown";
    ui.notifications.info(`Stair mode: drag the second region to connect to "${sceneName}".`);
  }

  _onPointerDown(event) {
    if ((event.data?.button ?? event.button) !== 0) return;
    if (this._dragging) return;

    const pos = event.getLocalPosition(canvas.stage);
    this._dragStart = canvas.grid.getSnappedPoint({ x: pos.x, y: pos.y });
    this._dragging = true;

    this._preview = new PIXI.Graphics();
    canvas.controls.addChild(this._preview);

    canvas.stage.on("pointermove", this._onMove);
    canvas.stage.on("pointerup", this._onUp);
    canvas.stage.on("pointerupoutside", this._onUp);
  }

  _onPointerMove(event) {
    if (!this._dragging) return;
    const pos = event.getLocalPosition(canvas.stage);
    const snapped = canvas.grid.getSnappedPoint({ x: pos.x, y: pos.y });
    const rect = _normalizeRect(this._dragStart, snapped);

    this._preview.clear();
    this._preview.lineStyle(2, 0x22ccff, 1);
    this._preview.beginFill(0x22ccff, 0.15);
    this._preview.drawRect(rect.x, rect.y, rect.width, rect.height);
    this._preview.endFill();
  }

  async _onPointerUp(event) {
    canvas.stage.off("pointermove", this._onMove);
    canvas.stage.off("pointerup", this._onUp);
    canvas.stage.off("pointerupoutside", this._onUp);
    this._dragging = false;
    this._preview?.destroy();
    this._preview = null;

    const pos = event.getLocalPosition(canvas.stage);
    const snapped = canvas.grid.getSnappedPoint({ x: pos.x, y: pos.y });
    const rect = _normalizeRect(this._dragStart, snapped);

    const minSize = canvas.grid.size / 2;
    if (rect.width < minSize || rect.height < minSize) {
      ui.notifications.warn("Drag a larger area to place a teleport region.");
      return;
    }

    const id = await _createRegion(rect);
    if (!id) return;

    if (_pending) {
      await _linkRegions(_pending.id, _pending.sceneId, id, canvas.scene.id);
      _pending = null;
      ui.notifications.info("Teleport regions paired! Drag again to place more, or exit stair mode.");
    } else {
      _pending = { id, sceneId: canvas.scene.id };
      ui.notifications.info("First region placed. Switch scenes (or stay here) and drag to place the second region.");
    }
  }

  _cancelDrag() {
    canvas.stage?.off("pointermove", this._onMove);
    canvas.stage?.off("pointerup", this._onUp);
    canvas.stage?.off("pointerupoutside", this._onUp);
    this._dragging = false;
    this._preview?.destroy();
    this._preview = null;
  }
}
