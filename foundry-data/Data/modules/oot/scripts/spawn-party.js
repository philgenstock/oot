const MAX_SEARCH_RADIUS = 15;

// Relative grid offsets within radius, nearest-first, so party members land
// as close to the click point as possible. Ignores walls/LoS.
function _buildCandidateOffsets(maxRadius) {
  const offsets = [];
  for (let di = -maxRadius; di <= maxRadius; di++) {
    for (let dj = -maxRadius; dj <= maxRadius; dj++) {
      const distSq = di * di + dj * dj;
      if (distSq > maxRadius * maxRadius) continue;
      offsets.push({ di, dj, distSq });
    }
  }
  offsets.sort((a, b) => a.distSq - b.distSq);
  return offsets;
}

async function _spawnPartyAt(x, y) {
  if (!game.user.isGM) return;

  const partyActors = game.actors.filter(a => a.type === "character" && a.hasPlayerOwner);
  if (!partyActors.length) {
    ui.notifications.warn("No player characters found to spawn.");
    return;
  }

  const grid = canvas.grid;
  const originOffset = grid.getOffset({ x, y });
  const occupiedRects = canvas.tokens.placeables.map(t => new PIXI.Rectangle(
    t.document.x, t.document.y, t.document.width * grid.size, t.document.height * grid.size
  ));

  const relativeOffsets = _buildCandidateOffsets(MAX_SEARCH_RADIUS);
  const claimedRects = [];
  const assignments = [];

  // Place larger tokens first so they don't get boxed out by smaller ones
  // claiming the tight spots near the click point.
  const sortedActors = [...partyActors].sort((a, b) =>
    (b.prototypeToken.width * b.prototypeToken.height) - (a.prototypeToken.width * a.prototypeToken.height)
  );

  for (const actor of sortedActors) {
    const w = actor.prototypeToken.width;
    const h = actor.prototypeToken.height;
    let placed = false;

    for (const { di, dj } of relativeOffsets) {
      const offset = { i: originOffset.i + di, j: originOffset.j + dj };
      const topLeft = grid.getTopLeftPoint(offset);
      const rect = new PIXI.Rectangle(topLeft.x, topLeft.y, w * grid.size, h * grid.size);

      if (occupiedRects.some(r => r.intersects(rect))) continue;
      if (claimedRects.some(r => r.intersects(rect))) continue;

      claimedRects.push(rect);
      assignments.push({ actor, x: topLeft.x, y: topLeft.y });
      placed = true;
      break;
    }

    if (!placed) ui.notifications.warn(`No space found to place ${actor.name}.`);
  }

  if (!assignments.length) return;

  const tokenDocs = [];
  for (const { actor, x: tx, y: ty } of assignments) {
    tokenDocs.push(await actor.getTokenDocument({ x: tx, y: ty }));
  }

  await canvas.scene.createEmbeddedDocuments("Token", tokenDocs);
  ui.notifications.info(`Spawned ${tokenDocs.length} party member(s).`);
}

export class SpawnPartyController {
  constructor() {
    this._active = false;
    this._handler = this._onCanvasPointerDown.bind(this);
  }

  get active() { return this._active; }

  activate() {
    if (this._active) return;
    this._active = true;
    canvas.stage.on("pointerdown", this._handler);
    ui.notifications.info("Spawn Party mode: left-click a location to spawn the party.");
  }

  deactivate() {
    if (!this._active) return;
    this._active = false;
    canvas?.stage?.off("pointerdown", this._handler);
  }

  toggle() {
    this._active ? this.deactivate() : this.activate();
    return this._active;
  }

  _reset() {
    this._active = false;
  }

  async _onCanvasPointerDown(event) {
    if ((event.data?.button ?? event.button) !== 0) return;

    // Deactivate immediately so this is a one-shot action, not a repeatable stamp.
    this.deactivate();

    const { x, y } = canvas.mousePosition;
    await _spawnPartyAt(x, y);
  }
}

export function initSpawnParty() {
  Hooks.on("canvasTearDown", () => {
    game.oot?.spawnPartyController?._reset();
  });
}
