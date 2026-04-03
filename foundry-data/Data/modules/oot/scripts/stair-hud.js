import { requestTeleport } from './socket.js';

const STAIRS_SETTING = "stairs";
const NEAR_RADIUS_SQUARES = 1;

let _hud = null;

export function initStairHUD() {
  _hud = new StairHUD();
  _hud.mount();

  Hooks.on("controlToken", () => _hud.refresh());
  Hooks.on("refreshToken", () => _hud.refresh());
  Hooks.on("canvasPan", () => _hud.refresh());
  Hooks.on("oot.stairsChanged", () => _hud.refresh());
}

class StairHUD {
  constructor() {
    this._el = null;
  }

  mount() {
    this._el?.remove();
    this._el = document.createElement("div");
    this._el.id = "oot-stair-hud";
    document.getElementById("interface")?.appendChild(this._el);
  }

  unmount() {
    this._el?.remove();
    this._el = null;
  }

  refresh() {
    if (!this._el) return;
    this._el.innerHTML = "";

    const sceneId = canvas.scene?.id;
    if (!sceneId) return;
    if (game.oot?.stairController?.active) return;

    const stairs = game.settings.get("oot", STAIRS_SETTING) ?? [];
    const pairedStairs = stairs.filter(s => s.sceneId === sceneId && s.pairedId);
    if (!pairedStairs.length) return;

    const nearRadius = canvas.grid.size * NEAR_RADIUS_SQUARES;

    for (const token of canvas.tokens.controlled) {
      const cx = token.x + token.w / 2;
      const cy = token.y + token.h / 2;

      const stair = pairedStairs.find(s => {
        const dx = cx - s.x;
        const dy = cy - s.y;
        return Math.sqrt(dx * dx + dy * dy) <= nearRadius;
      });
      if (!stair) continue;

      const dest = stairs.find(s => s.id === stair.pairedId);
      if (!dest) continue;

      const btn = this._createButton(token, dest);
      this._el.appendChild(btn);
    }
  }

  _createButton(token, dest) {
    const btn = document.createElement("button");
    btn.className = "oot-teleport-btn";
    btn.innerHTML = '<i class="fas fa-dungeon"></i> Teleport';

    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const destX = dest.x - token.w / 2;
      const destY = dest.y - token.h / 2;
      await requestTeleport({
        tokenId: token.id,
        srcSceneId: canvas.scene.id,
        destSceneId: dest.sceneId,
        destX,
        destY
      });
    });

    // Position above the token's top center
    const pos = this._worldToScreen(token.x + token.w / 2, token.y);
    btn.style.left = pos.x + "px";
    btn.style.top = pos.y + "px";

    return btn;
  }

  _worldToScreen(worldX, worldY) {
    const t = canvas.primary.worldTransform;
    const rect = canvas.app.view.getBoundingClientRect();
    const interfaceRect = document.getElementById("interface").getBoundingClientRect();
    return {
      x: (t.a * worldX + t.tx + rect.left - interfaceRect.left),
      y: (t.d * worldY + t.ty + rect.top - interfaceRect.top)
    };
  }
}
