import { requestTeleport } from './socket.js';

const TELEPORT_NEAR_RADIUS_SQUARES = 1;
const _stairControls = new Map();

function logExistingStairs() {
  const stairs = canvas.scene.walls.filter(w => w.flags?.oot?.isStair);
  console.log(`OOT | Stairs on scene "${canvas.scene.name}": ${stairs.length} found`);
  for (const w of stairs) {
    const f = w.flags.oot;
    console.log(`OOT |   id=${w.id} paired=${f.pairedId ?? "none"} scene=${f.pairedSceneId ?? "none"} coords=[${w.c}]`);
  }
}

class StairControl extends PIXI.Container {
  constructor(wallDoc) {
    super();
    this.wallDoc = wallDoc;
    this.eventMode = 'static';
    this.interactiveChildren = false;
    this._build();
  }

  _build() {
    this.removeChildren();

    const isPaired = !!this.wallDoc.flags?.oot?.pairedId;
    const r = canvas.grid.size * 0.25;
    const s = r * 0.35;

    const bg = new PIXI.Graphics();
    bg.beginFill(isPaired ? 0x2196f3 : 0xff8c00, 0.75);
    bg.lineStyle(2, 0xffffff, 0.9);
    bg.drawCircle(0, 0, r);
    bg.endFill();
    this._bg = bg;
    this.addChild(bg);

    const g = new PIXI.Graphics();
    g.beginFill(0xffffff, 0.95);
    g.drawRect(-s * 1.5,  s * 0.4,  s * 3, s * 0.75);
    g.drawRect(-s * 1.0, -s * 0.35, s * 2, s * 0.75);
    g.drawRect(-s * 0.5, -s * 1.1,  s * 1, s * 0.75);
    g.endFill();
    this.addChild(g);

    const [x1, y1, x2, y2] = this.wallDoc.c;
    this.x = (x1 + x2) / 2;
    this.y = (y1 + y2) / 2;
    this.hitArea = new PIXI.Circle(0, 0, r);

    this.removeAllListeners();
    this.on('mousedown',   this._onMouseDown.bind(this));
    this.on('rightdown',   this._onRightDown.bind(this));
    this.on('pointerover', () => { bg.alpha = 1.0; });
    this.on('pointerout',  () => { bg.alpha = 0.75; });
  }

  refresh(wallDoc) {
    this.wallDoc = wallDoc;
    this._build();
  }

  async _onMouseDown(event) {
    event.stopPropagation();
    if (game.oot?.stairController?.active) return;

    if (game.user.isGM) {
      const pos = event.getLocalPosition(canvas.stage);
      this._dragOrigin = { x: pos.x, y: pos.y };
      this._posAtDragStart = { x: this.x, y: this.y };
      this._dragging = false;

      this._onMoveBound = this._onDragMove.bind(this);
      this._onUpBound   = this._onDragEnd.bind(this);
      canvas.stage.on('pointermove',     this._onMoveBound);
      canvas.stage.on('pointerup',       this._onUpBound);
      canvas.stage.on('pointerupoutside', this._onUpBound);
    } else {
      await this._teleport();
    }
  }

  _onDragMove(event) {
    const pos = event.getLocalPosition(canvas.stage);
    const dx = pos.x - this._dragOrigin.x;
    const dy = pos.y - this._dragOrigin.y;
    if (!this._dragging && Math.hypot(dx, dy) > 8) this._dragging = true;
    if (this._dragging) {
      this.x = this._posAtDragStart.x + dx;
      this.y = this._posAtDragStart.y + dy;
    }
  }

  async _onDragEnd() {
    canvas.stage.off('pointermove',      this._onMoveBound);
    canvas.stage.off('pointerup',        this._onUpBound);
    canvas.stage.off('pointerupoutside', this._onUpBound);

    if (this._dragging) {
      this._dragging = false;
      const { x, y } = canvas.grid.getSnappedPoint({ x: this.x, y: this.y });
      this.x = x;
      this.y = y;
      const half = canvas.grid.size / 4;
      await this.wallDoc.update({ c: [x - half, y, x + half, y] }, { ootInternal: true });
    } else {
      await this._teleport();
    }
  }

  async _teleport() {
    const wallDoc = this.wallDoc;
    const [x1, y1, x2, y2] = wallDoc.c;
    const midX = (x1 + x2) / 2;
    const midY = (y1 + y2) / 2;

    const nearRadius = canvas.grid.size * TELEPORT_NEAR_RADIUS_SQUARES;
    const token = canvas.tokens.controlled.find(t => {
      const cx = t.x + t.w / 2;
      const cy = t.y + t.h / 2;
      return Math.hypot(cx - midX, cy - midY) <= nearRadius;
    });

    if (!token) {
      ui.notifications.warn("Stand next to the staircase with a controlled token to use it.");
      return;
    }

    const flags = wallDoc.flags.oot;
    if (!flags?.pairedId) {
      ui.notifications.warn("This staircase is not yet connected to another.");
      return;
    }

    const destScene = game.scenes.get(flags.pairedSceneId);
    const pairedWall = destScene?.walls.get(flags.pairedId);
    if (!pairedWall) {
      ui.notifications.error("Could not find the destination staircase.");
      return;
    }

    const [px1, py1, px2, py2] = pairedWall.c;
    const destX = (px1 + px2) / 2 - token.w / 2;
    const destY = (py1 + py2) / 2 - token.h / 2;

    await requestTeleport({
      tokenId: token.id,
      srcSceneId: canvas.scene.id,
      destSceneId: flags.pairedSceneId,
      destX,
      destY
    });
  }

  async _onRightDown(event) {
    event.stopPropagation();
    if (!game.user.isGM) return;
    const wallDoc = canvas.scene.walls.get(this.wallDoc.id);
    if (wallDoc) await wallDoc.delete();
  }
}

function _addStairControl(wallDoc) {
  if (!canvas?.controls || _stairControls.has(wallDoc.id)) return;
  const ctrl = new StairControl(wallDoc);
  canvas.controls.addChild(ctrl);
  _stairControls.set(wallDoc.id, ctrl);
}

function _removeStairControl(wallId) {
  const ctrl = _stairControls.get(wallId);
  if (!ctrl) return;
  canvas.controls.removeChild(ctrl);
  ctrl.destroy({ children: true });
  _stairControls.delete(wallId);
}

function _refreshAllStairControls() {
  _stairControls.clear();
  if (!canvas?.scene) return;
  for (const wall of canvas.scene.walls) {
    if (wall.flags?.oot?.isStair) _addStairControl(wall);
  }
}

async function addStair(x, y) {
  if (!game.user.isGM) return null;
  const half = canvas.grid.size / 4;
  const [doc] = await canvas.scene.createEmbeddedDocuments("Wall", [{
    c: [x - half, y, x + half, y],
    move:  CONST.WALL_MOVEMENT_TYPES.NONE,
    light: CONST.WALL_SENSE_TYPES.NONE,
    sight: CONST.WALL_SENSE_TYPES.NONE,
    sound: CONST.WALL_SENSE_TYPES.NONE,
    flags: { oot: { isStair: true, pairedId: null, pairedSceneId: null } }
  }]);
  console.log(`OOT | Stair placed id=${doc?.id} at (${x}, ${y}) on scene "${canvas.scene.name}"`);
  return doc?.id ?? null;
}

async function pairStairs(id1, sceneId1, id2, sceneId2) {
  const w1 = game.scenes.get(sceneId1)?.walls.get(id1);
  const w2 = game.scenes.get(sceneId2)?.walls.get(id2);
  if (!w1 || !w2) return;
  await w1.update({ 'flags.oot.pairedId': id2, 'flags.oot.pairedSceneId': sceneId2 }, { ootInternal: true });
  await w2.update({ 'flags.oot.pairedId': id1, 'flags.oot.pairedSceneId': sceneId1 }, { ootInternal: true });
}

export function initStairInteraction() {
  Hooks.on("canvasTearDown", () => {
    _stairControls.clear();
    game.oot?.stairController?._reset();
  });

  Hooks.on("canvasReady", () => {
    logExistingStairs();
    _refreshAllStairControls();
    game.oot?.stairController?._reactivateIfPending();
  });

  Hooks.on("createWall", (wallDoc) => {
    if (wallDoc.flags?.oot?.isStair) _addStairControl(wallDoc);
  });

  Hooks.on("updateWall", (wallDoc) => {
    if (!wallDoc.flags?.oot?.isStair) return;
    const ctrl = _stairControls.get(wallDoc.id);
    if (ctrl) ctrl.refresh(wallDoc);
    else _addStairControl(wallDoc);
  });

  Hooks.on("deleteWall", async (wallDoc) => {
    if (!wallDoc.flags?.oot?.isStair) return;
    _removeStairControl(wallDoc.id);
    if (!game.user.isGM) return;
    const flags = wallDoc.flags.oot;
    if (!flags.pairedId) return;
    const partner = game.scenes.get(flags.pairedSceneId)?.walls.get(flags.pairedId);
    if (partner) {
      await partner.update(
        { 'flags.oot.pairedId': null, 'flags.oot.pairedSceneId': null },
        { ootInternal: true }
      );
    }
  });
}

export class StairController {
  constructor() {
    this._active = false;
    this._pending = null;
    this._handler = this._onCanvasPointerDown.bind(this);
  }

  get active() { return this._active; }

  activate() {
    if (this._active) return;
    this._active = true;
    this._pending = null;
    canvas.stage.on("pointerdown", this._handler);
    ui.notifications.info("Stair mode: left-click to place stairs. Right-click a stair to delete it.");
  }

  deactivate() {
    if (!this._active) return;
    this._active = false;
    this._pending = null;
    canvas?.stage?.off("pointerdown", this._handler);
    ui.notifications.info("Stair mode deactivated.");
  }

  _reset() {
    this._active = false;
  }

  _reactivateIfPending() {
    if (!this._pending) return;
    this._active = true;
    canvas.stage.on("pointerdown", this._handler);
    const sceneName = game.scenes.get(this._pending.sceneId)?.name ?? "unknown";
    ui.notifications.info(`Stair mode: place the second stair to connect to "${sceneName}".`);
  }

  toggle() {
    this._active ? this.deactivate() : this.activate();
    return this._active;
  }

  async _onCanvasPointerDown(event) {
    if ((event.data?.button ?? event.button) !== 0) return;

    const { x, y } = canvas.mousePosition;
    const id = await addStair(x, y);
    if (!id) return;

    if (this._pending) {
      await pairStairs(this._pending.id, this._pending.sceneId, id, canvas.scene.id);
      this._pending = null;
      ui.notifications.info("Stairs paired! Click again to place more, or exit stair mode.");
    } else {
      this._pending = { id, sceneId: canvas.scene.id };
      ui.notifications.info("First stair placed. Switch scenes and click to place the second stair.");
    }
  }
}
